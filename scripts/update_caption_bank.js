const fs = require('fs');
const path = require('path');

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

const ROOT = path.join(__dirname, '..');
const CAPTION_BANK_PATH = path.join(ROOT, 'second_brain/caption_bank.json');

function updateCaptionBank() {
  const dataPath = fs.existsSync(path.join(ROOT, 'dashboard/data.json'))
    ? path.join(ROOT, 'dashboard/data.json')
    : path.join(ROOT, 'dashboard/data/data.json');
  if (!fs.existsSync(dataPath)) { console.log('⚠️ data.json not found'); return; }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let bank = { updated_at: '', total: 0, captions: [] };
  if (fs.existsSync(CAPTION_BANK_PATH)) {
    try { const e = JSON.parse(fs.readFileSync(CAPTION_BANK_PATH, 'utf8')); if (Array.isArray(e.captions)) bank = e; } catch(err) {}
  }

  const existingUrls = new Set(bank.captions.map(c => c.postUrl).filter(Boolean));
  const myHandle = 'garvit.irl';
  const competitorPosts = [];

  if (rawData.competitors && !Array.isArray(rawData.competitors)) {
    for (const [username, acc] of Object.entries(rawData.competitors)) {
      if (username === myHandle) continue;
      for (const p of (acc.posts || [])) competitorPosts.push({ ...p, username, followers: acc.followers || 10000 });
    }
  }

  let newCount = 0;
  for (const post of competitorPosts) {
    const caption = (post.caption || '').trim();
    if (!caption) continue;
    const shortCode = post.shortCode || post.id;
    const postUrl = post.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : '');
    if (postUrl && existingUrls.has(postUrl)) continue;

    const lines = caption.split('\n').filter(l => l.trim());
    const engRate = Math.round(((post.likes || 0) + (post.comments || 0)) / post.followers * 100 * 100) / 100;

    bank.captions.push({
      id: String(post.id || shortCode),
      handle: post.username.startsWith('@') ? post.username : `@${post.username}`,
      postUrl,
      hook_line: (lines[0] || '').substring(0, 200),
      opening_lines: lines.slice(0, 3).join('\n').substring(0, 500),
      full_caption: caption.substring(0, 2000),
      format: (post.type === 'Sidecar' || post.format === 'Carousel') ? 'Carousel' : 'Reel',
      likes: post.likes || 0,
      comments: post.comments || 0,
      engagement_rate: engRate,
      added_at: new Date().toISOString()
    });
    if (postUrl) existingUrls.add(postUrl);
    newCount++;
  }

  bank.updated_at = new Date().toISOString();
  bank.total = bank.captions.length;
  atomicWrite(CAPTION_BANK_PATH, bank);
  console.log(`Caption bank updated: ${newCount} new. Total: ${bank.captions.length} captions.`);
}

updateCaptionBank();
