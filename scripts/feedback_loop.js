const fs = require('fs');
const path = require('path');

function getShortCode(url) {
  if (!url) return '';
  const m = url.match(/\/p\/([^\/]+)/);
  return m ? m[1] : '';
}

function updateFeedbackLoop() {
  const root = path.join(__dirname, '..');
  const dataPath1 = path.join(root, 'dashboard/data/data.json');
  const dataPath2 = path.join(root, 'dashboard/data.json');
  const dataPath = fs.existsSync(dataPath1) ? dataPath1 : dataPath2;

  const contentLogPath = path.join(root, 'second_brain/content_log.json');
  const archivePath = path.join(root, 'second_brain/performance_archive.json');
  const patternsPath = path.join(root, 'second_brain/patterns.json');
  const hookBankPath = path.join(root, 'second_brain/hook_bank.json');

  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch(e) {}

  const contentLog = fs.existsSync(contentLogPath) ? JSON.parse(fs.readFileSync(contentLogPath, 'utf8')) : [];
  const archive = fs.existsSync(archivePath) ? JSON.parse(fs.readFileSync(archivePath, 'utf8')) : [];
  const patterns = fs.existsSync(patternsPath) ? JSON.parse(fs.readFileSync(patternsPath, 'utf8')) : { bestFormats: [], bestHooks: [], avgEngByFormat: {}, bestTopics: [] };
  const hookBank = fs.existsSync(hookBankPath) ? JSON.parse(fs.readFileSync(hookBankPath, 'utf8')) : [];

  const myHandle = 'garvit.irl';
  let myAccount = (raw.accounts || []).find(a => (a.username || a.handle || '').toLowerCase() === myHandle);
  if (!myAccount && raw.your_account) {
    myAccount = raw.your_account;
  }
  const myPosts = myAccount?.posts || [];
  const followersCount = myAccount?.followersCount || myAccount?.followers || 5961;
  const now = new Date();

  let newPostsLogged = 0;
  let newlyArchived = 0;
  let hooksAdded = 0;

  // 1. LOG NEW POSTS to content_log
  for (const post of myPosts) {
    const pid = post.id || post.shortCode || getShortCode(post.url);
    if (!pid) continue;
    const alreadyLogged = contentLog.find(c => c.id === pid);
    const likesCount = post.likesCount !== undefined ? post.likesCount : (post.likes || 0);
    const commentsCount = post.commentsCount !== undefined ? post.commentsCount : (post.comments || 0);
    const shortCode = post.shortCode || getShortCode(post.url);
    const url = post.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : '');

    if (!alreadyLogged) {
      contentLog.push({
        id: pid,
        shortCode,
        caption: post.caption || '',
        timestamp: post.timestamp || now.toISOString(),
        likesCount,
        commentsCount,
        url,
        type: post.type || 'Post',
        loggedAt: now.toISOString(),
        archived: false
      });
      newPostsLogged++;
    } else if (!alreadyLogged.caption && post.caption) {
      alreadyLogged.caption = post.caption;
    }
  }

  // 2. ARCHIVE posts that are 48hrs+ old using latest data
  for (const logEntry of contentLog) {
    if (logEntry.archived) continue;
    const postAge = (now - new Date(logEntry.timestamp)) / (1000 * 60 * 60);
    if (postAge < 48) continue;

    // Get latest stats from fresh data
    const freshPost = myPosts.find(p => (p.id || p.shortCode) === logEntry.id);
    const finalLikes = freshPost?.likesCount !== undefined ? freshPost.likesCount : (freshPost?.likes !== undefined ? freshPost.likes : logEntry.likesCount);
    const finalComments = freshPost?.commentsCount !== undefined ? freshPost.commentsCount : (freshPost?.comments !== undefined ? freshPost.comments : logEntry.commentsCount);
    const followers = followersCount || 1;
    const engRate = ((finalLikes + finalComments) / followers * 100).toFixed(2);

    // Detect format from caption keywords
    const cap = (logEntry.caption || '').toLowerCase();
    let format = 'reel';
    if (cap.includes('carousel') || cap.includes('swipe')) format = 'carousel';
    else if (cap.includes('photo') || cap.includes('picture')) format = 'photo';

    // Detect topic from caption
    const topicKeywords = ['ai', 'chatgpt', 'claude', 'gemini', 'openai', 'tool', 
                           'free', 'hack', 'automation', 'coding', 'agent', 'prompt'];
    const detectedTopics = topicKeywords.filter(k => cap.includes(k));

    archive.push({
      id: logEntry.id,
      shortCode: logEntry.shortCode,
      caption: logEntry.caption,
      url: logEntry.url,
      postedAt: logEntry.timestamp,
      archivedAt: now.toISOString(),
      format,
      topics: detectedTopics,
      finalLikes,
      finalComments,
      engagementRate: parseFloat(engRate),
      hookText: (logEntry.caption || '').slice(0, 80)
    });

    logEntry.archived = true;
    newlyArchived++;
  }

  // Enrich existing archive entries if missing caption or hookText
  for (const arch of archive) {
    const freshPost = myPosts.find(p => (p.id || p.shortCode) === arch.id || getShortCode(p.url) === arch.shortCode);
    if (freshPost) {
      if (!arch.caption && freshPost.caption) arch.caption = freshPost.caption;
      if (!arch.hookText && arch.caption) arch.hookText = arch.caption.slice(0, 80);
      if (arch.finalLikes === undefined) arch.finalLikes = freshPost.likesCount !== undefined ? freshPost.likesCount : (freshPost.likes || 0);
      if (arch.finalComments === undefined) arch.finalComments = freshPost.commentsCount !== undefined ? freshPost.commentsCount : (freshPost.comments || 0);
      if (arch.engagementRate === undefined) {
        arch.engagementRate = parseFloat((((arch.finalLikes + arch.finalComments) / followersCount) * 100).toFixed(2));
      }
      if (arch.caption && (!arch.topics || arch.topics.length === 0)) {
        const cap = arch.caption.toLowerCase();
        const topicKeywords = ['ai', 'chatgpt', 'claude', 'gemini', 'openai', 'tool', 
                               'free', 'hack', 'automation', 'coding', 'agent', 'prompt'];
        arch.topics = topicKeywords.filter(k => cap.includes(k));
      }
    }
  }

  // 3. UPDATE patterns.json from archive
  if (archive.length > 0) {
    // Best formats
    const fmtStats = {};
    for (const p of archive) {
      const f = p.format || 'reel';
      if (!fmtStats[f]) fmtStats[f] = { total: 0, count: 0 };
      fmtStats[f].total += p.engagementRate || 0;
      fmtStats[f].count++;
    }
    patterns.bestFormats = Object.entries(fmtStats)
      .map(([fmt, s]) => ({ format: fmt, avgEngRate: (s.total/s.count).toFixed(2), posts: s.count }))
      .sort((a, b) => b.avgEngRate - a.avgEngRate)
      .map(f => f.format);

    // Best hooks (top 5 by likes)
    patterns.bestHooks = [...archive]
      .filter(p => p.hookText && p.hookText.trim())
      .sort((a, b) => (b.finalLikes || 0) - (a.finalLikes || 0))
      .slice(0, 5)
      .map(p => ({ hook: p.hookText, likes: p.finalLikes, url: p.url }));

    // Avg engagement by format
    patterns.avgEngByFormat = {};
    for (const [fmt, s] of Object.entries(fmtStats)) {
      patterns.avgEngByFormat[fmt] = (s.total / s.count).toFixed(2) + '%';
    }

    // Best topics
    const topicCount = {};
    for (const p of archive) {
      for (const t of (p.topics || [])) {
        topicCount[t] = (topicCount[t] || 0) + 1;
      }
    }
    patterns.bestTopics = Object.entries(topicCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => topic);
  }

  // 4. UPDATE hook_bank with archived posts
  for (const p of archive) {
    const alreadyInBank = hookBank.find(h => h.postId === p.id);
    if (!alreadyInBank && p.hookText && p.hookText.length > 10) {
      hookBank.push({
        hook: p.hookText,
        postId: p.id,
        likes: p.finalLikes,
        comments: p.finalComments,
        engRate: p.engagementRate,
        addedAt: now.toISOString(),
        url: p.url
      });
      hooksAdded++;
    }
  }

  // Save all files
  fs.mkdirSync(path.dirname(contentLogPath), { recursive: true });
  fs.writeFileSync(contentLogPath, JSON.stringify(contentLog, null, 2));
  fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
  fs.writeFileSync(patternsPath, JSON.stringify(patterns, null, 2));
  fs.writeFileSync(hookBankPath, JSON.stringify(hookBank, null, 2));

  console.log(`✅ Feedback loop updated:`);
  console.log(`   New posts logged: ${newPostsLogged}`);
  console.log(`   Posts archived (48hr+): ${newlyArchived}`);
  console.log(`   Hooks added to bank: ${hooksAdded}`);
  console.log(`   Best formats: ${patterns.bestFormats?.join(', ') || 'none yet'}`);
  console.log(`   Best topics: ${patterns.bestTopics?.join(', ') || 'none yet'}`);
}

updateFeedbackLoop();
