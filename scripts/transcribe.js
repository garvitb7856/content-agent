const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TRANSCRIBE_KEY = process.env.GEMINI_TRANSCRIBE_KEY || process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(__dirname, '../dashboard/data/data.json');
const TRANSCRIPTS_DIR = path.join(__dirname, '../second_brain/transcripts');
const TRANSCRIBED_IDS_FILE = path.join(TRANSCRIPTS_DIR, 'transcribed_ids.json');
const SCRIPT_LIBRARY_FILE = path.join(__dirname, '../second_brain/script_library.json');
const PERFORMANCE_ARCHIVE_FILE = path.join(__dirname, '../second_brain/performance_archive.json');
const TEMP_DIR = path.join(__dirname, '../second_brain/temp_videos');
const SUMMARY_FILE = path.join(__dirname, '../second_brain/transcription_summary.json');

const MY_HANDLE = 'garvit.irl';
const MODELS = ['gemini-3.7-flash','gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.0-flash','gemini-2.5-flash','gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemini-3.1-flash-lite'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function loadJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  return fallback;
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function stringSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return Math.round((overlap / Math.max(wordsA.size, wordsB.size)) * 100);
}

async function downloadVideo(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, { timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlink(destPath, () => {});
        downloadVideo(res.headers.location, destPath).then(resolve).catch(reject); return;
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlink(destPath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`)); return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    });
    req.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

async function transcribeWithGemini(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = 'video/mp4';
  const prompt = 'Transcribe exactly what is spoken in this video. Return ONLY the spoken words as plain text. No timestamps, no labels, no descriptions. If no speech detected, return exactly: NO_SPEECH';

  // Step 1: Start resumable upload
  console.log('  Uploading to Gemini Files API...');
  const initRes = await axios.post(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${GEMINI_TRANSCRIBE_KEY}`,
    { file: { display_name: path.basename(filePath), mime_type: mimeType } },
    { headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(fileBuffer.length), 'X-Goog-Upload-Header-Content-Type': mimeType, 'Content-Type': 'application/json' } }
  );
  const uploadUrl = initRes.headers['x-goog-upload-url'];
  if (!uploadUrl) throw new Error('No upload URL from Gemini');

  // Step 2: Upload bytes
  const uploadRes = await axios.post(uploadUrl, fileBuffer, {
    headers: { 'Content-Length': String(fileBuffer.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Type': mimeType },
    maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 120000
  });
  const fileUri = uploadRes.data?.file?.uri;
  const fileName = uploadRes.data?.file?.name;
  if (!fileUri || !fileName) throw new Error(`No file URI. Response: ${JSON.stringify(uploadRes.data)}`);
  console.log(`  Uploaded. File: ${fileName}`);

  // Step 3: Poll for ACTIVE status
  console.log('  Waiting for Gemini to process...');
  let state = 'PROCESSING';
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const statusRes = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_TRANSCRIBE_KEY}`
      );
      state = statusRes.data?.state;
      console.log(`  Status check ${i+1}: ${state}`);
      if (state === 'ACTIVE') break;
      if (state === 'FAILED') throw new Error('Gemini file processing failed');
    } catch (e) {
      console.log(`  Status check ${i+1} error: ${e.response?.status} ${e.response?.data?.error?.message || e.message}`);
    }
  }
  if (state !== 'ACTIVE') throw new Error(`File never became ACTIVE (last state: ${state})`);

  // Step 4: Transcribe with retry on 429/503
  console.log('  Transcribing...');
  let res, lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const apiKey = attempt % 2 === 0 ? (process.env.GEMINI_API_KEY || GEMINI_TRANSCRIBE_KEY) : GEMINI_TRANSCRIBE_KEY;
      res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[Math.min(attempt-1, MODELS.length-1)]}:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ file_data: { mime_type: mimeType, file_uri: fileUri } }, { text: prompt }] }], generationConfig: { maxOutputTokens: 4096, temperature: 0.1 } },
        { timeout: 150000 }
      );
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const status = e.response?.status;
      if (status === 429 || status === 503) {
        const retryWaits = [60000, 90000, 120000, 150000, 180000];
        const wait = retryWaits[attempt - 1];
        console.log(`  Rate limited (attempt ${attempt}/5) — waiting ${wait/1000}s before retry...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
  if (lastErr) throw lastErr;
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty transcript response');

  // Step 5: Delete from Gemini server
  try { await axios.delete(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_TRANSCRIBE_KEY}`); } catch(e) {}

  return text;
}

async function run() {
  console.log('\n=== TRANSCRIPTION ENGINE ===');
  ensureDir(TRANSCRIPTS_DIR); ensureDir(TEMP_DIR);
  if (!fs.existsSync(DATA_FILE)) { console.log('No data.json. Skipping.'); return { transcribed: 0, skipped: 0, byHandle: {}, items: [] }; }

  const data = loadJSON(DATA_FILE, {});
  const transcribedIds = loadJSON(TRANSCRIBED_IDS_FILE, []);
  const transcribedSet = new Set(transcribedIds);
  const handlePosts = [];
  if (data.your_account) {
    const h = data.your_account.username || MY_HANDLE;
    handlePosts.push({ handle: h, posts: data.your_account.posts || [] });
  }
  if (data.competitors && typeof data.competitors === 'object' && !Array.isArray(data.competitors)) {
    for (const [h, acc] of Object.entries(data.competitors)) {
      handlePosts.push({ handle: h, posts: acc.posts || [] });
    }
  }
  if (Array.isArray(data.accounts)) {
    for (const acc of data.accounts) {
      handlePosts.push({ handle: acc.username, posts: acc.posts || [] });
    }
  }
  // Fallback for flat handle keys
  if (handlePosts.length === 0) {
    const allHandles = Object.keys(data).filter(k => !['fetched_at', 'generated_at', 'sample_data'].includes(k));
    for (const h of allHandles) {
      const pList = Array.isArray(data[h]) ? data[h] : (data[h]?.posts || []);
      handlePosts.push({ handle: h, posts: pList });
    }
  }

  const newlyTranscribed = [];
  const TEST_LIMIT = 10;
  let transcribedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errorLog = [];
  let skipped = 0, noVideoUrl = 0;
  const pendingVideos = handlePosts.flatMap(h => h.posts || []);

  for (const { handle, posts } of handlePosts) {
    for (const post of posts) {
      const postId = String(post.id || post.shortCode || '');
      if (!postId) continue;
      if (transcribedSet.has(postId)) { skipped++; skippedCount++; continue; }

      const isVideoType = (post.type === 'Video' || post.type === 'Reel' || post.isVideo);
      const videoUrl = post.videoUrl || post.video_url || post.videoSrc || post.video_src || post.videoPlaybackUrl || (isVideoType ? post.url : '');
      if (!videoUrl) { transcribedSet.add(postId); noVideoUrl++; continue; }

      const shortCode = post.shortCode || postId;
      console.log(`\nNew video: @${handle} — https://www.instagram.com/p/${shortCode}/`);
      const tempFile = path.join(TEMP_DIR, `${postId}.mp4`);
      let fileUri = null;

      try {
        process.stdout.write('  Downloading... ');
        await downloadVideo(videoUrl, tempFile);
        const fileSizeMB = fs.statSync(tempFile).size / 1024 / 1024;
        console.log(`${fileSizeMB.toFixed(1)}MB`);
        // Validate it's actually a video (MP4 magic bytes: 00 00 00 xx 66 74 79 70)
        const buf = Buffer.alloc(12);
        const fd = fs.openSync(tempFile, 'r');
        fs.readSync(fd, buf, 0, 12, 0);
        fs.closeSync(fd);
        const isMp4 = buf.slice(4,8).toString('ascii') === 'ftyp';
        if (!isMp4 || fileSizeMB < 0.5) {
          fs.unlinkSync(tempFile);
          console.log('  Expired/invalid URL — skipping (will retry after next fetch)');
          continue; // don't mark as done, will retry next run
        }

        const transcript = await transcribeWithGemini(tempFile);
        console.log(`  Done: "${transcript.substring(0, 60)}..."`);

        const transcriptData = { postId, handle, postUrl: `https://www.instagram.com/p/${shortCode}/`, transcript, caption: post.caption || '', timestamp: post.timestamp || '', transcribedAt: new Date().toISOString(), likes: post.likesCount || post.likes_count || 0, comments: post.commentsCount || post.comments_count || 0 };
        saveJSON(path.join(TRANSCRIPTS_DIR, `${postId}.json`), transcriptData);

        if (handle === MY_HANDLE && transcript !== 'NO_SPEECH') {
          const scriptLib = loadJSON(SCRIPT_LIBRARY_FILE, { scripts: [] });
          let bestScore = 0, bestMatch = null;
          for (const entry of (scriptLib.scripts || [])) {
            const score = stringSimilarity(transcript, entry.script || '');
            if (score > bestScore) { bestScore = score; bestMatch = entry; }
          }
          if (bestScore > 15 && bestMatch) {
            console.log(`  MY POST — matched script at ${bestScore}% similarity`);
            const perf = loadJSON(PERFORMANCE_ARCHIVE_FILE, { posts: [] });
            if (!perf.posts) perf.posts = [];
            const existing = perf.posts.find(p => p.postId === postId);
            if (existing) { existing.scriptSimilarity = bestScore; existing.transcript = transcript; }
            else perf.posts.push({ postId, handle, postUrl: `https://www.instagram.com/p/${shortCode}/`, scriptSimilarity: bestScore, matchedScriptId: bestMatch.id || '', transcript, likes: post.likesCount || 0, comments: post.commentsCount || 0, transcribedAt: new Date().toISOString() });
            saveJSON(PERFORMANCE_ARCHIVE_FILE, perf);
          } else { console.log(`  MY POST — no script match (best: ${bestScore}%)`); }
        }

        newlyTranscribed.push({ handle, postId, postUrl: `https://www.instagram.com/p/${shortCode}/`, transcriptPreview: transcript === 'NO_SPEECH' ? 'No speech' : transcript.substring(0, 80) });
        transcribedSet.add(postId);
        saveJSON(TRANSCRIBED_IDS_FILE, [...transcribedSet]);
        transcribedCount++;
        // Add 20s delay between videos to avoid quota burst
        await new Promise(r => setTimeout(r, 20000));
        if (transcribedCount >= TEST_LIMIT) { console.log(`\nDaily limit of ${TEST_LIMIT} reached — remaining videos retry tomorrow.`); break; }

      } catch (err) {
        if (err.message && err.message.includes('ENETUNREACH')) {
          console.log(`  FAILED: ${err.message} — Skipped permanently (IPv6 unreachable)`);
          transcribedSet.add(postId);
          saveJSON(TRANSCRIBED_IDS_FILE, [...transcribedSet]);
          failedCount++;
          errorLog.push({ id: postId, url: videoUrl, reason: err.message });
        } else {
          console.log(`  FAILED: ${err.message} — will retry next run`);
          failedCount++;
          errorLog.push({ id: postId, url: videoUrl, reason: err.message });
          // DO NOT mark as done — video will be retried tomorrow
        }
      } finally {
        if (fs.existsSync(tempFile)) { fs.unlinkSync(tempFile); console.log('  Temp file deleted.'); }
      }
    }
    if (transcribedCount >= TEST_LIMIT) break;
  }

  saveJSON(TRANSCRIBED_IDS_FILE, [...transcribedSet]);
  try { fs.rmdirSync(TEMP_DIR); } catch (e) {}
  const byHandle = {};
  for (const item of newlyTranscribed) byHandle[item.handle] = (byHandle[item.handle] || 0) + 1;

  // Always write summary even if no videos processed
  const transcriptsDir = path.join(__dirname, '../second_brain/transcripts');
  const allTranscriptFiles = fs.existsSync(transcriptsDir)
    ? fs.readdirSync(transcriptsDir).filter(f => f.endsWith('.json') && f !== 'transcribed_ids.json')
    : [];
  const transcribedIdsArr = loadJSON(TRANSCRIBED_IDS_FILE, []);
  const allPosts = [];
  try {
    const dataJson = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const allAccounts = [dataJson.your_account, ...Object.values(dataJson.competitors || {})];
    allAccounts.forEach(acc => (acc?.posts || []).forEach(p => { if (p.videoUrl || p.video_url) allPosts.push(p.id); }));
  } catch(e) {}
  const summary = {
    updated_at: new Date().toISOString(),
    total_videos_in_data: allPosts.length,
    transcribed_done: allTranscriptFiles.length,
    pending_queue: Math.max(0, allPosts.length - transcribedIdsArr.length),
    stored_transcripts: allTranscriptFiles.length,
    transcribed_ids_count: transcribedIdsArr.length,
    succeeded: transcribedCount,
    failed: failedCount,
    skipped: skippedCount,
    errors: errorLog
  };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log('📊 Transcription summary written:', summary);

  return { transcribed: newlyTranscribed.length, skipped, noVideoUrl, byHandle, items: newlyTranscribed };
}

module.exports = { run };
if (require.main === module) { run().catch(e => { console.error(e.message); process.exit(1); }); }
