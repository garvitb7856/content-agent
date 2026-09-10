const fs = require('fs');
const path = require('path');

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'dashboard/data/data.json');
const HOOK_BANK_PATH = path.join(ROOT, 'second_brain/hook_bank.json');

function classifyHook(hook) {
  const h = (hook || '').trim();
  if (/^(Stop|Nobody|You're doing)/i.test(h)) return "pattern_interrupt";
  if (h.includes("?")) return "question";
  if (/\b(I was|I started|When I)\b/i.test(h)) return "relatability";
  if (/\b(Comment|DM)\b/i.test(h)) return "bold_claim";
  if (/\b(here is|here's|how to)\b/i.test(h)) return "curiosity_gap";
  return "story";
}

function updateHookBank() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("⚠️ data.json not found, skipping update_hook_bank.");
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  let bankData = { updated_at: "", hooks: [] };
  if (fs.existsSync(HOOK_BANK_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(HOOK_BANK_PATH, 'utf8'));
      if (Array.isArray(existing)) {
        bankData.hooks = existing;
      } else if (existing && Array.isArray(existing.hooks)) {
        bankData = existing;
      }
    } catch (e) {}
  }

  const existingUrls = new Set(bankData.hooks.map(h => h.postUrl).filter(Boolean));
  const myHandle = 'garvit.irl';

  const competitorPosts = [];

  if (rawData.competitors && typeof rawData.competitors === 'object' && !Array.isArray(rawData.competitors)) {
    for (const [username, acc] of Object.entries(rawData.competitors)) {
      if (username === myHandle) continue;
      for (const p of (acc.posts || [])) {
        competitorPosts.push({ ...p, username });
      }
    }
  } else if (Array.isArray(rawData.accounts)) {
    for (const acc of rawData.accounts) {
      if (acc.username === myHandle) continue;
      for (const p of (acc.posts || [])) {
        competitorPosts.push({ ...p, username: acc.username });
      }
    }
  }

  let newCount = 0;
  for (const post of competitorPosts) {
    // Try to use transcript's first 2 sentences as the real spoken hook
    const transcriptPath = path.join(__dirname, '../second_brain/transcripts', `${post.id}_${post.ownerId || post.userId || ''}.json`);
    let hookText = post.caption ? post.caption.split('\n')[0].trim() : '';
    try {
      const t = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
      if (t.transcript) {
        const sentences = t.transcript.match(/[^.!?]+[.!?]+/g) || [];
        if (sentences.length > 0) hookText = sentences.slice(0, 2).join(' ').trim();
      }
    } catch(e) { /* no transcript yet, fall back to caption */ }

    if (!hookText) continue;

    const shortCode = post.shortCode || post.id;
    const postUrl = post.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : "");

    if (postUrl && existingUrls.has(postUrl)) continue;

    const format = (post.type === 'Sidecar' || post.format === 'Carousel') ? 'Carousel' : 'Reel';
    const account = post.username ? (post.username.startsWith('@') ? post.username : `@${post.username}`) : '@competitor';

    const hookObj = {
      id: String(post.id || shortCode || ('hook_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5))),
      text: hookText,
      type: classifyHook(hookText),
      format: format,
      account: account,
      postUrl: postUrl,
      likes: post.likes || 0,
      comments: post.comments || 0,
      added_at: new Date().toISOString()
    };

    bankData.hooks.push(hookObj);
    if (postUrl) existingUrls.add(postUrl);
    newCount++;
  }

  bankData.updated_at = new Date().toISOString();
  atomicWrite(HOOK_BANK_PATH, bankData);

  console.log(`Hook bank updated: ${newCount} new hooks added. Total: ${bankData.hooks.length} hooks.`);
}

updateHookBank();
