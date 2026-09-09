const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'second_brain/trends.json');
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY;

const NICHE_KEYWORDS = [
  'ai', 'chatgpt', 'gpt', 'llm', 'automation', 'agent', 'artificial intelligence',
  'startup', 'founder', 'business', 'entrepreneur', 'solopreneur', 'saas',
  'productivity', 'workflow', 'self improvement', 'growth', 'habit', 'mindset',
  'money', 'content creator', 'software',
  'machine learning', 'deep learning', 'openai', 'gemini', 'claude',
  'passive income', 'side project', 'digital nomad', 'creator economy'
];

function isNiche(text) {
  const t = (text || '').toLowerCase();
  return NICHE_KEYWORDS.some(kw => t.includes(kw));
}

function fetchJSON(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...headers
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location, headers).then(resolve);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

// ── REDDIT (no auth, JSON endpoint) ──────────────────────────
async function fetchReddit() {
  const subreddits = [
    'artificial', 'ChatGPT', 'automation', 'entrepreneur',
    'startups', 'selfimprovement', 'productivity',
    'MachineLearning', 'AIAssistants', 'smallbusiness',
    'Futurology', 'technology', 'business', 'personalfinance',
    'learnprogramming', 'digitalnomad', 'SideProject'
  ];
  const results = [];
  for (const sub of subreddits) {
    try {
      const data = await fetchJSON(
        `https://www.reddit.com/r/${sub}/hot.json?limit=8&raw_json=1`,
        { 'User-Agent': 'ContentAgent/1.0 (personal research bot)' }
      );
      if (!data?.data?.children) continue;
      for (const post of data.data.children) {
        const p = post.data;
        if (!p.title || p.stickied || p.score < 50) continue;
        results.push({
          source: 'reddit',
          subreddit: sub,
          title: p.title,
          score: p.score || 0,
          comments: p.num_comments || 0,
          url: `https://reddit.com${p.permalink}`
        });
      }
      await new Promise(r => setTimeout(r, 400));
    } catch(e) { console.log(`Reddit r/${sub} skipped`); }
  }
  const filtered = results.filter(p => isNiche(p.title));
  const final = (filtered.length >= 5 ? filtered : results)
    .sort((a, b) => b.score - a.score).slice(0, 15);
  console.log(`  Reddit: ${results.length} raw → ${filtered.length} niche → ${final.length} top`);
  return final;
}

// ── HACKER NEWS ───────────────────────────────────────────────
async function fetchHackerNews() {
  try {
    const ids = await fetchJSON('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!ids) return [];
    const stories = await Promise.all(ids.slice(0, 30).map(id =>
      fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    ));
    const all = stories.filter(Boolean).map(s => ({
      source: 'hackernews',
      title: s.title,
      score: s.score,
      comments: s.descendants || 0,
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`
    }));
    const filtered = all.filter(s => isNiche(s.title));
    const final = filtered.slice(0, 10);
    console.log(`  HackerNews: ${all.length} raw → ${filtered.length} niche → ${final.length} top`);
    return final;
  } catch(e) { console.log('HN failed:', e.message); return []; }
}

// ── YOUTUBE TRENDING (global) ─────────────────────────────────
async function fetchYouTube() {
  if (!YOUTUBE_KEY) { console.log('No YOUTUBE_API_KEY'); return []; }
  try {
    const categories = [
      { id: '28', name: 'Science & Tech' },
      { id: '22', name: 'People & Blogs' }
    ];
    const results = [];
    for (const cat of categories) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&videoCategoryId=${cat.id}&maxResults=10&key=${YOUTUBE_KEY}`;
      const data = await fetchJSON(url);
      if (!data?.items) continue;
      for (const video of data.items) {
        results.push({
          source: 'youtube',
          category: cat.name,
          title: video.snippet.title,
          channel: video.snippet.channelTitle,
          views: parseInt(video.statistics?.viewCount || 0),
          likes: parseInt(video.statistics?.likeCount || 0),
          publishedAt: video.snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${video.id}`,
          tags: (video.snippet.tags || []).slice(0, 5),
          description: (video.snippet.description || '').substring(0, 150)
        });
      }
    }
    const seen = new Set();
    const unique = results.filter(v => { if(seen.has(v.url)) return false; seen.add(v.url); return true; });
    const filtered = unique.filter(v => isNiche(v.title + ' ' + v.tags.join(' ') + ' ' + v.description));
    const final = (filtered.length >= 3 ? filtered : unique)
      .sort((a, b) => b.views - a.views).slice(0, 15);
    console.log(`  YouTube: ${unique.length} raw → ${filtered.length} niche → ${final.length} top`);
    return final;
  } catch(e) { console.log('YouTube failed:', e.message); return []; }
}

// ── GOOGLE TRENDS (global) ────────────────────────────────────
async function fetchGoogleTrends() {
  try {
    const googleTrends = require('google-trends-api');
    const keywords = [
      'AI tools', 'ChatGPT', 'AI for business',
      'productivity tools', 'self improvement',
      'AI workflow', 'solopreneur', 'automation tools'
    ];
    const results = [];
    for (const kw of keywords) {
      try {
        const raw = await googleTrends.interestOverTime({
          keyword: kw,
          geo: '',
          startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        });
        const parsed = JSON.parse(raw);
        const timelineData = parsed?.default?.timelineData || [];
        const recent = timelineData.slice(-3);
        const avgValue = recent.length
          ? Math.round(recent.reduce((a, b) => a + (b.value?.[0] || 0), 0) / recent.length)
          : 0;
        results.push({ keyword: kw, trend_score: avgValue });
      } catch(e) { /* skip */ }
    }
    let dailyTrending = [];
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const raw = await googleTrends.dailyTrends({ geo: 'US', trendDate: yesterday });
      const parsed = JSON.parse(raw);
      const days = parsed?.default?.trendingSearchesDays || [];
      if (days.length) {
        dailyTrending = (days[0].trendingSearches || []).slice(0, 15)
          .map(t => ({ query: t.title?.query || '', traffic: t.formattedTraffic || '' }))
          .filter(t => t.query && isNiche(t.query));
      }
    } catch(e) { console.log('Google daily trends skipped:', e.message?.substring(0, 60)); }
    console.log(`  Google Trends: ${results.length} keywords | ${dailyTrending.length} daily trending`);
    return { keyword_trends: results.sort((a, b) => b.trend_score - a.trend_score), daily_trending: dailyTrending };
  } catch(e) { console.log('Google Trends failed:', e.message); return { keyword_trends: [], daily_trending: [] }; }
}

// ── IDEATOR CONTEXT ───────────────────────────────────────────
function buildIdeatorContext(reddit, hn, youtube, googleTrends) {
  const redditSummary = reddit.slice(0, 6).map(r =>
    `• [Reddit r/${r.subreddit}] "${r.title}" — ${r.score} upvotes`).join('\n');
  const hnSummary = hn.slice(0, 5).map(h =>
    `• [HackerNews] "${h.title}" — ${h.score} pts`).join('\n');
  const ytSummary = youtube.slice(0, 6).map(v =>
    `• [YouTube Global] "${v.title}" by ${v.channel} — ${(v.views/1000).toFixed(0)}k views`).join('\n');
  const gtKeywords = googleTrends.keyword_trends.map(k =>
    `${k.keyword} (score: ${k.trend_score})`).join(', ');
  const gtDaily = googleTrends.daily_trending.slice(0, 5).map(t =>
    `• "${t.query}" — ${t.traffic}`).join('\n');

  return `REAL-TIME GLOBAL TREND INTELLIGENCE (fetched ${new Date().toISOString()}):
Niche: AI + Automation + Tech + Entrepreneurship + Self-Growth + AI for Professionals & Businesses

REDDIT TRENDING (global communities):
${redditSummary || 'No data'}

HACKER NEWS TOP (niche-filtered):
${hnSummary || 'No data'}

YOUTUBE GLOBAL TRENDING (Science & Tech + People & Blogs):
${ytSummary || 'No data'}

GOOGLE TRENDS GLOBAL — KEYWORD INTEREST (7 days):
${gtKeywords || 'No data'}

GOOGLE DAILY TRENDING (US — niche-filtered):
${gtDaily || 'No data'}

Use these trends to generate timely, globally-aware ideas that you can present to your Indian audience first. You are the bridge between global AI/tech/entrepreneurship trends and Indian creators.`;
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('Fetching global trends...');
  const [reddit, hn, youtube, googleTrends] = await Promise.all([
    fetchReddit(), fetchHackerNews(), fetchYouTube(), fetchGoogleTrends()
  ]);
  console.log(`\nFinal: Reddit ${reddit.length} | HN ${hn.length} | YouTube ${youtube.length} | Google keywords ${googleTrends.keyword_trends.length} | Daily ${googleTrends.daily_trending.length}`);
  const ideatorContext = buildIdeatorContext(reddit, hn, youtube, googleTrends);
  fs.writeFileSync(OUT, JSON.stringify({
    fetched_at: new Date().toISOString(),
    reddit, hackernews: hn, youtube,
    google_trends: googleTrends,
    ideator_context: ideatorContext
  }, null, 2));
  console.log('✅ Trends saved to second_brain/trends.json');
  console.log('\n--- IDEATOR CONTEXT PREVIEW ---');
  console.log(ideatorContext.substring(0, 800) + '...');
}
main().catch(console.error);
