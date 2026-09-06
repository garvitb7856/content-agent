const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'dashboard/data/data.json');
const CONTENT_LOG_PATH = path.join(ROOT, 'second_brain/content_log.json');

function classifyHook(hook) {
  const h = (hook || '').trim();
  if (/^(Stop|Nobody|You're doing)/i.test(h)) return "pattern_interrupt";
  if (h.includes("?")) return "question";
  if (/\b(I was|I started|When I)\b/i.test(h)) return "relatability";
  if (/\b(Comment|DM)\b/i.test(h)) return "bold_claim";
  if (/\b(here is|here's|how to)\b/i.test(h)) return "curiosity_gap";
  return "story";
}

function detectNewPosts() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("⚠️ data.json not found, skipping detect_new_posts.");
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  let contentLog = { posts: [] };

  if (fs.existsSync(CONTENT_LOG_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CONTENT_LOG_PATH, 'utf8'));
      if (Array.isArray(existing)) {
        contentLog.posts = existing;
      } else if (existing && Array.isArray(existing.posts)) {
        contentLog = existing;
      }
    } catch (e) {}
  }

  const myAccount = rawData.your_account || {};
  const myPosts = myAccount.posts || [];
  const now = new Date();

  let newCount = 0;
  let updatedCount = 0;

  for (const post of myPosts) {
    const postId = String(post.id);
    const existingIndex = contentLog.posts.findIndex(p => String(p.id) === postId || String(p.shortCode) === String(post.shortCode || post.id));

    if (existingIndex === -1) {
      const firstLine = (post.caption || "").split('\n')[0].substring(0, 150).trim();
      const format = (post.type === 'Sidecar' || post.format === 'Carousel') ? 'Carousel' : 'Reel';
      const shortCode = post.shortCode || post.id;
      const url = post.url || `https://www.instagram.com/p/${shortCode}/`;

      const newPost = {
        id: postId,
        shortCode: String(shortCode),
        url: url,
        caption_first_line: firstLine,
        hook_type: classifyHook(firstLine),
        format: format,
        detected_at: now.toISOString(),
        likes_at_detection: post.likes || 0,
        comments_at_detection: post.comments || 0,
        likes_at_24h: null,
        likes_at_48h: null,
        comments_at_48h: null,
        performance_complete: false
      };

      contentLog.posts.push(newPost);
      newCount++;
    } else {
      const entry = contentLog.posts[existingIndex];
      const hoursSinceDetection = (now.getTime() - new Date(entry.detected_at).getTime()) / 3600000;
      let modified = false;

      if (hoursSinceDetection >= 24 && entry.likes_at_24h === null) {
        entry.likes_at_24h = post.likes || 0;
        modified = true;
      }

      if (hoursSinceDetection >= 48 && entry.likes_at_48h === null) {
        entry.likes_at_48h = post.likes || 0;
        entry.comments_at_48h = post.comments || 0;
        entry.performance_complete = true;
        modified = true;
      }

      if (modified) {
        updatedCount++;
      }
    }
  }

  fs.writeFileSync(CONTENT_LOG_PATH, JSON.stringify(contentLog, null, 2));

  console.log(`${newCount} new posts detected. ${updatedCount} posts updated with performance data.`);
}

detectNewPosts();
