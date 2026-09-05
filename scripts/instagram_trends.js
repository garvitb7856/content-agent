const fs = require('fs');
const path = require('path');

function analyzeInstagramTrends() {
  let raw = {};
  const p1 = path.join(__dirname, '../dashboard/data/data.json');
  const p2 = path.join(__dirname, '../dashboard/data.json');
  try {
    raw = JSON.parse(fs.readFileSync(fs.existsSync(p1) ? p1 : p2, 'utf8'));
  } catch(e) {
    console.error('❌ Failed to read data.json:', e.message);
    return;
  }

  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  let accounts = [];
  if (Array.isArray(raw.accounts)) {
    accounts = raw.accounts;
  } else {
    if (raw.your_account) accounts.push(raw.your_account);
    if (raw.competitors) {
      if (Array.isArray(raw.competitors)) {
        accounts.push(...raw.competitors);
      } else {
        Object.entries(raw.competitors).forEach(([k, v]) => {
          accounts.push({ username: k, ...v });
        });
      }
    }
  }

  const myHandle = 'garvit.irl';

  // Collect all competitor posts (exclude own)
  const allPosts = [];
  for (const acc of accounts) {
    const uname = acc.username || acc.handle || '';
    if (uname.toLowerCase() === myHandle.toLowerCase()) continue;
    const followers = acc.followersCount || acc.followers || 0;
    for (const post of (acc.posts || [])) {
      const likesCount = post.likesCount !== undefined ? post.likesCount : (post.likes || 0);
      const commentsCount = post.commentsCount !== undefined ? post.commentsCount : (post.comments || 0);
      allPosts.push({
        ...post,
        likesCount,
        commentsCount,
        username: uname,
        followers
      });
    }
  }

  // 1. HOT RIGHT NOW — posts from last 24hrs sorted by engagement
  let recentFilter = allPosts.filter(p => p.timestamp && new Date(p.timestamp) > oneDayAgo);
  if (recentFilter.length === 0) {
    recentFilter = allPosts.filter(p => p.timestamp && new Date(p.timestamp) > sevenDaysAgo);
  }

  const recentPosts = recentFilter
    .map(p => ({
      username: p.username,
      caption: (p.caption || '').slice(0, 100),
      likes: p.likesCount || 0,
      comments: p.commentsCount || 0,
      engagement: ((p.likesCount || 0) + (p.commentsCount || 0)),
      engRate: p.followers ? (((p.likesCount||0)+(p.commentsCount||0))/p.followers*100).toFixed(2) : '0',
      timestamp: p.timestamp,
      url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
      type: p.type || 'Post'
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);

  // 2. RISING FORMAT — Reel vs Carousel vs Post this week
  let weekPosts = allPosts.filter(p => p.timestamp && new Date(p.timestamp) > sevenDaysAgo);
  if (weekPosts.length === 0) weekPosts = allPosts;

  const formatStats = {};
  for (const p of weekPosts) {
    const fmt = (p.type || 'Post').toLowerCase();
    if (!formatStats[fmt]) formatStats[fmt] = { count: 0, totalEng: 0 };
    formatStats[fmt].count++;
    formatStats[fmt].totalEng += (p.likesCount || 0) + (p.commentsCount || 0);
  }
  const formatRanking = Object.entries(formatStats)
    .map(([fmt, s]) => ({ format: fmt, avgEng: s.count ? Math.round(s.totalEng / s.count) : 0, count: s.count }))
    .sort((a, b) => b.avgEng - a.avgEng);

  // 3. TRENDING TOPICS — keywords appearing in multiple top posts
  const topPosts = [...allPosts]
    .sort((a, b) => ((b.likesCount||0)+(b.commentsCount||0)) - ((a.likesCount||0)+(a.commentsCount||0)))
    .slice(0, 20);

  const keywords = ['ai', 'chatgpt', 'gpt', 'claude', 'gemini', 'automation', 
                    'coding', 'free', 'tool', 'hack', 'secret', 'nobody', 
                    'stop', 'never', 'how to', 'mistake', 'earn', 'money',
                    'openai', 'agent', 'prompt', 'workflow'];
  const topicCount = {};
  for (const p of topPosts) {
    const cap = (p.caption || '').toLowerCase();
    for (const kw of keywords) {
      if (cap.includes(kw)) {
        topicCount[kw] = (topicCount[kw] || 0) + 1;
      }
    }
  }
  const trendingTopics = Object.entries(topicCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, appearsIn: count + ' top posts' }));

  // 4. BEST POSTING WINDOW — what hour did top posts go live
  const hourCount = {};
  for (const p of topPosts) {
    if (!p.timestamp) continue;
    const hour = new Date(p.timestamp).getUTCHours() + 5; // IST offset
    const h = hour >= 24 ? hour - 24 : hour;
    hourCount[h] = (hourCount[h] || 0) + 1;
  }
  const bestHours = Object.entries(hourCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h, count]) => `${h}:00 IST (${count} top posts)`);

  // 5. TOP HOOK PATTERNS — first 80 chars of top posts
  const topHookPatterns = topPosts
    .filter(p => p.caption && p.caption.length > 10)
    .slice(0, 5)
    .map(p => ({
      hook: p.caption.slice(0, 80),
      username: p.username,
      likes: p.likesCount || 0,
      url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '')
    }));

  const result = {
    generated_at: now.toISOString(),
    hotRightNow: recentPosts,
    risingFormat: formatRanking,
    trendingTopics,
    bestPostingWindow: bestHours,
    topHookPatterns
  };

  const outPath = path.join(__dirname, '../second_brain/instagram_trends.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`✅ Instagram trends analyzed:`);
  console.log(`   Hot posts (24hr): ${recentPosts.length}`);
  console.log(`   Top format: ${formatRanking[0]?.format || 'unknown'} (avg ${formatRanking[0]?.avgEng || 0} eng)`);
  console.log(`   Trending topics: ${trendingTopics.map(t=>t.topic).join(', ')}`);
  console.log(`   Best posting times: ${bestHours.join(', ')}`);
}

analyzeInstagramTrends();
