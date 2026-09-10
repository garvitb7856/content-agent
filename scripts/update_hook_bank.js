const fs = require('fs');
const path = require('path');

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

const ROOT = path.join(__dirname, '..');
const HOOK_BANK_PATH = path.join(ROOT, 'second_brain/hook_bank.json');
const TRANSCRIPTS_DIR = path.join(ROOT, 'second_brain/transcripts');

function getTranscriptHook(postId, ownerId) {
  const patterns = [`${postId}_${ownerId}.json`, `${postId}.json`];
  for (const filename of patterns) {
    const fp = path.join(TRANSCRIPTS_DIR, filename);
    if (!fs.existsSync(fp)) continue;
    try {
      const t = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (!t.transcript || t.transcript === 'NO_SPEECH' || t.transcript.length < 20) continue;
      const sentences = t.transcript.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length > 0) return sentences.slice(0, 3).join(' ').trim();
      return t.transcript.substring(0, 150).trim();
    } catch(e) {}
  }
  return null;
}

function classifyHook(h) {
  h = (h || '').trim();
  if (/^(Stop|Nobody|You're doing)/i.test(h)) return 'pattern_interrupt';
  if (h.includes('?')) return 'question';
  if (/\b(I was|I started|When I)\b/i.test(h)) return 'relatability';
  if (/\b(Comment|DM)\b/i.test(h)) return 'bold_claim';
  if (/\b(here is|here's|how to)\b/i.test(h)) return 'curiosity_gap';
  return 'story';
}

function updateHookBank() {
  const dataPath = fs.existsSync(path.join(ROOT, 'dashboard/data.json'))
    ? path.join(ROOT, 'dashboard/data.json')
    : path.join(ROOT, 'dashboard/data/data.json');
  if (!fs.existsSync(dataPath)) { console.log('⚠️ data.json not found'); return; }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const myHandle = 'garvit.irl';
  const competitorPosts = [];

  if (rawData.competitors && !Array.isArray(rawData.competitors)) {
    for (const [username, acc] of Object.entries(rawData.competitors)) {
      if (username === myHandle) continue;
      for (const p of (acc.posts || [])) competitorPosts.push({ ...p, username });
    }
  } else if (Array.isArray(rawData.accounts)) {
    for (const acc of rawData.accounts) {
      if (acc.username === myHandle) continue;
      for (const p of (acc.posts || [])) competitorPosts.push({ ...p, username: acc.username });
    }
  }

  // Rebuild entirely from transcripts — no captions, no fallback
  const hooks = [];
  for (const post of competitorPosts) {
    const hookText = getTranscriptHook(post.id, post.ownerId || post.userId || '');
    if (!hookText) continue; // no transcript = skip entirely
    const shortCode = post.shortCode || post.id;
    const postUrl = post.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : '');
    hooks.push({
      id: String(post.id || shortCode),
      text: hookText,
      source: 'transcript',
      type: classifyHook(hookText),
      format: (post.type === 'Sidecar' || post.format === 'Carousel') ? 'Carousel' : 'Reel',
      account: post.username ? (post.username.startsWith('@') ? post.username : `@${post.username}`) : '@competitor',
      postUrl,
      likes: post.likes || 0,
      comments: post.comments || 0,
      added_at: new Date().toISOString()
    });
  }

  atomicWrite(HOOK_BANK_PATH, {
    updated_at: new Date().toISOString(),
    total: hooks.length,
    note: 'All hooks are spoken transcript hooks (first 1-3 sentences of video). No captions used.',
    hooks
  });
  console.log(`Hook bank rebuilt: ${hooks.length} transcript-only hooks. All old caption-based hooks removed.`);
}

updateHookBank();
