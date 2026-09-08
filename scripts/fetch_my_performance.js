const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DATA_FILE = path.join(__dirname, '../dashboard/data/data.json');
const CONTENT_LOG_FILE = path.join(__dirname, '../second_brain/content_log.json');
const PERFORMANCE_ARCHIVE_FILE = path.join(__dirname, '../second_brain/performance_archive.json');
const MY_HANDLE = process.env.MY_INSTAGRAM_HANDLE || 'garvit.irl';

function loadJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
  return fallback;
}
function saveJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

async function main() {
  const data = loadJSON(DATA_FILE, {});
  const contentLog = loadJSON(CONTENT_LOG_FILE, { posts: [] });
  const perfArchive = loadJSON(PERFORMANCE_ARCHIVE_FILE, { posts: [] });
  if (!perfArchive.posts) perfArchive.posts = [];

  // Get your current posts from already-fetched data.json (free - no Apify call needed)
  let myPosts = [];
  if (data.your_account?.posts) myPosts = data.your_account.posts;
  else if (Array.isArray(data[MY_HANDLE])) myPosts = data[MY_HANDLE];
  else if (data[MY_HANDLE]?.posts) myPosts = data[MY_HANDLE].posts;

  if (myPosts.length === 0) {
    console.log('No own posts found in data.json — skipping performance fetch.');
    return;
  }

  const now = Date.now();
  const logPosts = Array.isArray(contentLog) ? contentLog : (contentLog.posts || []);
  let newUpdates = 0;
  let newArchived = 0;

  for (const logPost of logPosts) {
    if (logPost.performance_complete) continue;
    const detectedAt = new Date(logPost.detected_at || logPost.timestamp || 0).getTime();
    const ageHours = (now - detectedAt) / 3600000;
    if (ageHours < 47) continue; // Not yet 48 hours old

    // Find this post in freshly fetched data
    const fresh = myPosts.find(p =>
      String(p.id) === String(logPost.id) ||
      String(p.id) === String(logPost.shortCode) ||
      p.shortCode === logPost.shortCode ||
      p.code === logPost.shortCode
    );
    if (!fresh) continue;

    const likes48 = fresh.likesCount || fresh.likes_count || fresh.likes || 0;
    const comments48 = fresh.commentsCount || fresh.comments_count || fresh.comments || 0;
    const engagement48 = logPost.followers_at_post > 0
      ? Math.round(((likes48 + comments48) / logPost.followers_at_post) * 10000) / 100
      : 0;

    // Update content_log
    logPost.likes_at_48h = likes48;
    logPost.comments_at_48h = comments48;
    logPost.engagement_at_48h = engagement48;
    logPost.performance_complete = true;
    newUpdates++;

    // Update or create performance_archive entry
    const existing = perfArchive.posts.find(p =>
      String(p.postId) === String(logPost.id) || p.shortCode === logPost.shortCode
    );
    const perfEntry = {
      postId: String(logPost.id || ''),
      shortCode: logPost.shortCode || '',
      postUrl: logPost.url || `https://www.instagram.com/p/${logPost.shortCode}/`,
      caption: logPost.caption || '',
      format: logPost.type || 'Reel',
      postedAt: logPost.timestamp || logPost.detected_at,
      likes_at_48h: likes48,
      comments_at_48h: comments48,
      engagement_at_48h: engagement48,
      followers_at_post: logPost.followers_at_post || 0,
      scriptSimilarity: logPost.scriptSimilarity || 0,
      diffAnalysis: logPost.diffAnalysis || null,
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, perfEntry);
    else { perfArchive.posts.push(perfEntry); newArchived++; }
  }

  const updatedLog = Array.isArray(contentLog) ? contentLog : (contentLog.posts || []);
  saveJSON(CONTENT_LOG_FILE, updatedLog);
  saveJSON(PERFORMANCE_ARCHIVE_FILE, perfArchive);
  console.log(`✅ Performance feedback: ${newUpdates} post(s) updated with 48h data, ${newArchived} new archive entries.`);
}
main().catch(e => { console.error('fetch_my_performance error:', e.message); process.exit(0); });
