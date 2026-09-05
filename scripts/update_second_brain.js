const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'dashboard/data/data.json');
const LOG_PATH = path.join(ROOT, 'second_brain/content_log.json');
const ARCHIVE_PATH = path.join(ROOT, 'second_brain/performance_archive.json');
const PATTERNS_PATH = path.join(ROOT, 'second_brain/patterns.json');
const HOOK_BANK_PATH = path.join(ROOT, 'second_brain/hook_bank.json');

function loadJson(filepath, fallback) {
  if (!fs.existsSync(filepath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch(e) { return fallback; }
}

function saveJson(filepath, data) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function getShortCode(url) {
  if (!url) return '';
  const m = url.match(/\/p\/([^\/]+)/);
  return m ? m[1] : '';
}

function categorizeCaption(caption, type) {
  const cap = (caption || '').toLowerCase();
  if (cap.includes('how to') || cap.includes('guide') || cap.includes('tutorial') || cap.includes('step')) return 'howto';
  if (cap.includes('story') || cap.includes('lesson') || cap.includes('when i') || cap.includes('my ')) return 'story';
  if (cap.includes('top') || cap.includes('list') || cap.includes('best') || cap.includes('tools') || cap.includes('ways')) return 'list';
  if ((type || '').toLowerCase().includes('carousel') || cap.includes('carousel') || cap.includes('slide')) return 'carousel';
  return 'reel';
}

function main() {
  const data = loadJson(DATA_PATH, {});
  const me = data.your_account || {};
  const followers = me.followers || 5898;
  const rawPosts = Array.isArray(me.posts) ? me.posts : [];

  let contentLog = loadJson(LOG_PATH, []);
  let performanceArchive = loadJson(ARCHIVE_PATH, []);
  let patterns = loadJson(PATTERNS_PATH, { bestFormats: [], bestPostTimes: [], bestHooks: [], avgEngByFormat: {} });
  let hookBank = loadJson(HOOK_BANK_PATH, []);

  const existingLogIds = new Set(contentLog.map(p => p.id));
  let newPostsLogged = 0;
  let newHooksAdded = 0;

  // A & B: DETECT & LOG NEW POSTS
  rawPosts.forEach(p => {
    const pid = p.id || p.shortCode || p.url;
    if (!pid) return;

    const likesCount = p.likesCount !== undefined ? p.likesCount : (p.likes || 0);
    const commentsCount = p.commentsCount !== undefined ? p.commentsCount : (p.comments || 0);
    const shortCode = p.shortCode || getShortCode(p.url);
    const url = p.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : '');
    const caption = p.caption || '';
    const timestamp = p.timestamp || new Date().toISOString();

    if (!existingLogIds.has(pid)) {
      contentLog.push({
        id: pid,
        shortCode,
        caption,
        timestamp,
        likesCount,
        commentsCount,
        url,
        type: p.type || 'Post',
        archived: false
      });
      existingLogIds.add(pid);
      newPostsLogged++;
    }

    // E: UPDATE HOOK BANK (first 80 chars of caption)
    const hookText = caption.substring(0, 80).replace(/\n/g, ' ').trim();
    if (hookText && !hookBank.some(h => h.postId === pid)) {
      hookBank.push({
        hook: hookText,
        postId: pid,
        likes: likesCount,
        comments: commentsCount,
        addedAt: new Date().toISOString()
      });
      newHooksAdded++;
    }
  });

  // C: UPDATE PERFORMANCE ARCHIVE (posts 48+ hours old)
  let newlyArchived = 0;
  const now = Date.now();
  const existingArchiveIds = new Set(performanceArchive.map(a => a.id));

  contentLog.forEach(post => {
    const postAgeHours = (now - new Date(post.timestamp).getTime()) / (1000 * 60 * 60);
    if (postAgeHours >= 48 && !existingArchiveIds.has(post.id)) {
      const engRate = followers ? parseFloat((((post.likesCount + post.commentsCount) / followers) * 100).toFixed(2)) : 0;
      performanceArchive.push({
        id: post.id,
        shortCode: post.shortCode,
        caption: post.caption,
        timestamp: post.timestamp,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        engagementRate: engRate,
        url: post.url,
        archivedAt: new Date().toISOString()
      });
      existingArchiveIds.add(post.id);
      post.archived = true;
      newlyArchived++;
    }
  });

  // D: UPDATE PATTERNS
  const archiveSource = performanceArchive.length ? performanceArchive : contentLog;
  const formatStats = {};

  archiveSource.forEach(post => {
    const cat = categorizeCaption(post.caption, post.type);
    const eng = post.engagementRate !== undefined
      ? post.engagementRate
      : (followers ? parseFloat((((post.likesCount + post.commentsCount) / followers) * 100).toFixed(2)) : 0);
    
    if (!formatStats[cat]) formatStats[cat] = { totalEng: 0, count: 0 };
    formatStats[cat].totalEng += eng;
    formatStats[cat].count += 1;
  });

  const avgEngByFormat = {};
  Object.keys(formatStats).forEach(cat => {
    avgEngByFormat[cat] = parseFloat((formatStats[cat].totalEng / formatStats[cat].count).toFixed(2));
  });

  const sortedFormats = Object.keys(avgEngByFormat).sort((a, b) => avgEngByFormat[b] - avgEngByFormat[a]);
  const bestFormats = sortedFormats.slice(0, 2);

  const sortedPostsByLikes = [...archiveSource].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  const bestHooks = sortedPostsByLikes
    .map(p => (p.caption || '').substring(0, 80).replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);

  patterns = {
    bestFormats,
    bestPostTimes: [],
    bestHooks,
    avgEngByFormat
  };

  // Save updated JSON files
  saveJson(LOG_PATH, contentLog);
  saveJson(ARCHIVE_PATH, performanceArchive);
  saveJson(PATTERNS_PATH, patterns);
  saveJson(HOOK_BANK_PATH, hookBank);

  console.log(`Second Brain updated: ${newPostsLogged} new posts logged, ${newlyArchived} archived, ${newHooksAdded} hooks added`);
}

main();
