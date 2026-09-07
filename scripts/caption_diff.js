const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
const CONTENT_LOG    = path.join(ROOT, 'second_brain/content_log.json');
const SCRIPT_LIBRARY = path.join(ROOT, 'second_brain/script_library.json');
const TRANSCRIPTS_DIR = path.join(ROOT, 'second_brain/transcripts');
const IDEAS_HISTORY  = path.join(ROOT, 'second_brain/ideas_history.json');
const GEMINI_KEY     = process.env.GEMINI_API_KEY;

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// Jaccard fallback (no API call needed)
function jaccard(a, b) {
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w=>w.length>2));
  const setB = new Set(b.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w=>w.length>2));
  if (!setA.size || !setB.size) return 0;
  const intersection = [...setA].filter(w=>setB.has(w)).length;
  return intersection / new Set([...setA,...setB]).size;
}

// Cosine similarity between two embedding vectors
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; magA += a[i]*a[i]; magB += b[i]*b[i]; }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10);
}

// Get Gemini embedding for a text string
async function embed(text) {
  if (!GEMINI_KEY || !text || text.length < 10) return null;
  const postData = JSON.stringify({
    model: 'models/text-embedding-004',
    content: { parts: [{ text: text.substring(0, 2000) }] }
  });
  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          resolve(parsed?.embedding?.values || null);
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(postData); req.end();
  });
}

// Smart similarity: try embeddings first, fall back to Jaccard
async function similarity(a, b) {
  try {
    const [embA, embB] = await Promise.all([embed(a), embed(b)]);
    if (embA && embB) return cosine(embA, embB);
  } catch(e) {}
  return jaccard(a, b); // fallback
}

function computeDiff(generated, actual) {
  const genWords = new Set(generated.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w=>w.length>2));
  const actWords = new Set(actual.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w=>w.length>2));
  const kept = [...genWords].filter(w=>actWords.has(w));
  const removed = [...genWords].filter(w=>!actWords.has(w));
  const added = [...actWords].filter(w=>!genWords.has(w));
  const keptPct = genWords.size ? Math.round(kept.length/genWords.size*100) : 0;
  return { keptPct, removedWords: removed.slice(0,10), addedWords: added.slice(0,10) };
}

async function run() {
  const now = new Date();
  const rawLog = fs.existsSync(CONTENT_LOG) ? JSON.parse(fs.readFileSync(CONTENT_LOG,'utf8')) : [];
  const contentLog = Array.isArray(rawLog) ? rawLog : (rawLog.posts || []);

  let scripts = [];
  if (fs.existsSync(SCRIPT_LIBRARY)) {
    try { const r = JSON.parse(fs.readFileSync(SCRIPT_LIBRARY,'utf8')); scripts = Array.isArray(r)?r:(r.scripts||[]); } catch(e) {}
  }

  let ideasHistory = [];
  if (fs.existsSync(IDEAS_HISTORY)) {
    try { const r = JSON.parse(fs.readFileSync(IDEAS_HISTORY,'utf8')); ideasHistory = Array.isArray(r)?r:(r.ideas||[]); } catch(e) {}
  }

  let processed = 0;

  for (const entry of contentLog) {
    if (entry.diffAnalysis) continue;
    const transcriptPath = path.join(TRANSCRIPTS_DIR, entry.id + '.json');
    if (!fs.existsSync(transcriptPath)) continue;
    let transcript = '';
    try { const t = JSON.parse(fs.readFileSync(transcriptPath,'utf8')); transcript = t.transcript||t.text||''; } catch(e) { continue; }
    if (!transcript || transcript.length < 20) continue;

    let bestMatch = null, bestScore = 0;
    for (const script of scripts) {
      const fullText = (script.full_script||'') + ' ' + (script.caption||'');
      const s = await similarity(transcript, fullText);
      if (s > bestScore) { bestScore = s; bestMatch = script; }
    }

    const HIGH = 0.55, LOW = 0.28;

    if (bestScore >= HIGH && bestMatch) {
      const diff = computeDiff(bestMatch.full_script||'', transcript);
      entry.diffAnalysis = {
        type: 'agent_script_used',
        method: 'embedding',
        matchedScriptId: bestMatch.id,
        matchedIdeaTitle: bestMatch.idea_title,
        similarityScore: Math.round(bestScore*100),
        keptPercent: diff.keptPct,
        wordsRemoved: diff.removedWords,
        wordsAdded: diff.addedWords,
        summary: `Used agent script "${bestMatch.idea_title}" with ${diff.keptPct}% kept.`,
        analysedAt: now.toISOString()
      };
      console.log(`✅ Post ${entry.id}: agent_script_used "${bestMatch.idea_title}" (${Math.round(bestScore*100)}% semantic similarity)`);
    } else if (bestScore >= LOW && bestMatch) {
      entry.diffAnalysis = {
        type: 'agent_idea_own_script',
        method: 'embedding',
        closestIdeaTitle: bestMatch.idea_title,
        similarityScore: Math.round(bestScore*100),
        summary: `Self-scripted. Closest agent idea: "${bestMatch.idea_title}" (${Math.round(bestScore*100)}% semantic match).`,
        analysedAt: now.toISOString()
      };
      console.log(`📝 Post ${entry.id}: agent_idea_own_script, closest "${bestMatch.idea_title}" (${Math.round(bestScore*100)}%)`);
    } else {
      entry.diffAnalysis = {
        type: 'original_content',
        method: 'embedding',
        similarityScore: Math.round(bestScore*100),
        summary: 'Original content — no significant match to any generated script.',
        analysedAt: now.toISOString()
      };
      console.log(`🆕 Post ${entry.id}: original_content (best match ${Math.round(bestScore*100)}%)`);
    }
    processed++;
  }

  atomicWrite(CONTENT_LOG, contentLog);

  const archivePath = path.join(ROOT, 'second_brain/performance_archive.json');
  if (fs.existsSync(archivePath)) {
    try {
      const rawArch = JSON.parse(fs.readFileSync(archivePath,'utf8'));
      const archive = Array.isArray(rawArch) ? rawArch : (rawArch.posts||[]);
      let updated = false;
      for (const arch of archive) {
        if (arch.diffAnalysis) continue;
        const logEntry = contentLog.find(c => c.id === arch.id);
        if (logEntry?.diffAnalysis) { arch.diffAnalysis = logEntry.diffAnalysis; updated = true; }
      }
      if (updated) atomicWrite(archivePath, Array.isArray(rawArch) ? archive : { ...rawArch, posts: archive });
    } catch(e) {}
  }

  console.log(`\n📊 Caption diff complete — ${processed} posts analysed (embedding-based).`);
}

run();
