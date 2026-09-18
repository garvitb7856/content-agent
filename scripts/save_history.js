const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'second_brain/history');

function atomicWrite(p, data) {
  const t = p + '.tmp';
  fs.writeFileSync(t, JSON.stringify(data, null, 2));
  fs.renameSync(t, p);
}

function safeRead(p, d) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return d; }
}

function median(arr) {
  if (!arr || !arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function accountStats(account) {
  const posts = account.posts || account.recent_posts || [];
  const likes = posts.map(p => p.likes || 0);
  const comments = posts.map(p => p.comments || 0);
  const mLikes = median(likes);
  const mComments = median(comments);
  const followers = account.followers || 0;
  const engRate = followers > 0
    ? ((mLikes + mComments) / followers * 100).toFixed(2)
    : '0.00';
  return {
    followers,
    median_likes: mLikes,
    median_comments: mComments,
    engagement_rate: engRate,
    post_count: posts.length
  };
}

function run() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
  const outPath = path.join(HISTORY_DIR, `${today}.json`);

  if (fs.existsSync(outPath)) {
    console.log(`⏭ History for ${today} already saved — skipping.`);
    return;
  }

  // Read fresh data.json for follower stats
  const data = safeRead(path.join(ROOT, 'dashboard/data.json'), null);
  if (!data) {
    console.log('❌ dashboard/data.json not found — skipping history save.');
    return;
  }

  const myStats = accountStats(data.your_account || {});
  const myHandle = (data.your_account || {}).handle ||
    (process.env.MY_INSTAGRAM_HANDLE || '').replace('@', '').toLowerCase();

  const rawComp = data.competitors || [];
  const competitorList = Array.isArray(rawComp)
    ? rawComp
    : Object.entries(rawComp).map(([handle, c]) => ({ handle: c.handle || handle, ...c }));

  const competitorStats = competitorList.map(c => ({
    handle: c.handle,
    ...accountStats(c)
  }));

  const snapshot = {
    date: today,
    saved_at: new Date().toISOString(),
    fetched_at: data.fetched_at || null,
    your_account: {
      handle: myHandle,
      ...myStats
    },
    competitors: competitorStats
  };

  atomicWrite(outPath, snapshot);
  console.log(`✅ History saved for ${today}`);
  console.log(`   @${myHandle}: ${myStats.followers} followers, ${myStats.median_likes} med likes, ${myStats.engagement_rate}% eng`);
  console.log(`   ${competitorStats.length} competitors recorded`);

  // Clean up history files older than 30 days
  const files = fs.readdirSync(HISTORY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  files.forEach(f => {
    const fp = path.join(HISTORY_DIR, f);
    if (fs.statSync(fp).mtimeMs < cutoff) {
      fs.unlinkSync(fp);
      console.log(`🗑 Deleted old history: ${f}`);
    }
  });
}

run();
