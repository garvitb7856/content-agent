const fs = require('fs');
const path = require('path');

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

const ROOT = path.join(__dirname, '..');
const TRANSCRIPTS_DIR = path.join(ROOT, 'second_brain/transcripts');

function getTranscript(postId, ownerId) {
  for (const filename of [`${postId}_${ownerId}.json`, `${postId}.json`]) {
    const fp = path.join(TRANSCRIPTS_DIR, filename);
    if (!fs.existsSync(fp)) continue;
    try {
      const t = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (t.transcript && t.transcript !== 'NO_SPEECH' && t.transcript.length > 20)
        return { transcript: t.transcript, transcribedAt: t.transcribedAt };
    } catch(e) {}
  }
  return null;
}

function classifyTopic(text) {
  const t = (text || '').toLowerCase();
  if (/claude|anthropic/.test(t)) return 'Claude/AI Tools';
  if (/money|income|revenue|business/.test(t)) return 'Monetization';
  if (/productivity|automate|workflow/.test(t)) return 'Productivity';
  if (/ai agent|n8n|make\.com/.test(t)) return 'AI Automation';
  if (/career|job|hire/.test(t)) return 'Career';
  return 'General Tech';
}

function classifyPattern(text) {
  const p = [];
  if (/step \d|\d\.\s|\d\)/im.test(text)) p.push('numbered_steps');
  if (/comment|dm me/i.test(text)) p.push('comment_CTA');
  if (/i was|i started|when i|i used to/i.test(text)) p.push('narrative');
  if (/before|after|used to|now i/i.test(text)) p.push('transformation');
  if (/\n[-•]\s|\n\d+\./m.test(text)) p.push('listicle');
  return p.length ? p.join(' + ') : 'unknown';
}

const dataPath = fs.existsSync(path.join(ROOT, 'dashboard/data.json'))
  ? path.join(ROOT, 'dashboard/data.json')
  : path.join(ROOT, 'dashboard/data/data.json');
const storePath = path.join(ROOT, 'second_brain/competitor_scripts.json');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
let store = { updated_at: '', scripts: [] };
if (fs.existsSync(storePath)) {
  try { const r = JSON.parse(fs.readFileSync(storePath, 'utf8')); if (Array.isArray(r.scripts)) store = r; } catch(e) {}
}

const storeIndex = {};
store.scripts.forEach((s, i) => { storeIndex[s.id] = i; });

let added = 0, upgraded = 0;
const comps = data.competitors || {};

Object.entries(comps).forEach(([handle, comp]) => {
  const followers = comp.followers || 10000;
  (comp.posts || []).forEach(post => {
    if ((post.likes || 0) < 200) return;
    const transcriptData = getTranscript(post.id, post.ownerId || post.userId || '');
    if (!transcriptData) return; // No transcript — skip. Transcripts ARE the scripts.

    const eng = ((post.likes + (post.comments || 0)) / followers) * 100;
    const verdict = eng > 5 ? 'viral' : eng > 3 ? 'high' : eng > 1 ? 'medium' : 'low';
    if (verdict === 'low') return;

    const sentences = transcriptData.transcript.match(/[^.!?]+[.!?]+/g) || [];
    const spokenHook = sentences.slice(0, 3).join(' ').trim() || transcriptData.transcript.substring(0, 200);

    const entry = {
      id: post.id,
      account: '@' + handle,
      url: post.url || `https://www.instagram.com/p/${post.shortCode || post.id}/`,
      topic: classifyTopic(transcriptData.transcript),
      format: post.type || (post.isVideo ? 'Reel' : 'Carousel'),
      spoken_hook: spokenHook,
      full_script: transcriptData.transcript,      // TRANSCRIPT = the real script
      full_caption: (post.caption || '').substring(0, 1500), // metadata only
      script_source: 'transcript',
      script_pattern: classifyPattern(transcriptData.transcript),
      likes: post.likes || 0,
      comments: post.comments || 0,
      engagement_rate: Math.round(eng * 100) / 100,
      verdict,
      transcribed_at: transcriptData.transcribedAt,
      scraped_at: new Date().toISOString()
    };

    const idx = storeIndex[post.id];
    if (idx !== undefined) {
      if (store.scripts[idx].script_source !== 'transcript') {
        store.scripts[idx] = entry; upgraded++;
      }
    } else {
      store.scripts.push(entry);
      storeIndex[post.id] = store.scripts.length - 1;
      added++;
    }
  });
});

store.updated_at = new Date().toISOString();
store.total = store.scripts.length;
store.transcript_based = store.scripts.filter(s => s.script_source === 'transcript').length;
atomicWrite(storePath, store);
console.log(`Competitor scripts: ${added} new, ${upgraded} upgraded to transcript. Total: ${store.scripts.length} (${store.transcript_based} transcript-based). Viral: ${store.scripts.filter(s=>s.verdict==='viral').length}`);
