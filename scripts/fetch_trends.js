const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'second_brain/trends.json');
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchReddit() {
  const subreddits = ['artificial', 'ChatGPT', 'india', 'startups', 'MachineLearning'];
  const results = [];
  for (const sub of subreddits) {
    try {
      const data = await fetchUrl(`https://www.reddit.com/r/${sub}/hot.json?limit=10&raw_json=1`);
      if (!data?.data?.children) { console.log(`Reddit ${sub}: no children`); continue; }
      for (const post of data.data.children) {
        const p = post.data;
        if (!p.title || p.stickied) continue;
        results.push({
          source: 'reddit',
          subreddit: sub,
          title: p.title,
          score: p.score || 0,
          comments: p.num_comments || 0,
          url: `https://reddit.com${p.permalink}`
        });
      }
    } catch(e) { console.log(`Reddit ${sub} failed:`, e.message); }
  }
  return results.sort((a,b) => b.score - a.score).slice(0, 10);
}

async function fetchHackerNews() {
  try {
    const ids = await fetchUrl('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!ids) return [];
    const stories = await Promise.all(ids.slice(0,10).map(id =>
      fetchUrl(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    ));
    return stories.filter(Boolean).map(s => ({
      source: 'hackernews',
      title: s.title,
      score: s.score,
      comments: s.descendants || 0,
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`
    }));
  } catch(e) { console.log('HN failed:', e.message); return []; }
}

async function fetchYouTube() {
  if (!YOUTUBE_KEY) { console.log('No YOUTUBE_API_KEY'); return []; }
  try {
    const categories = [{ id: '28', name: 'Science & Tech' }, { id: '22', name: 'People & Blogs' }, { id: '0', name: 'All' }];
    const results = [];
    for (const cat of categories) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=IN&videoCategoryId=${cat.id}&maxResults=5&key=${YOUTUBE_KEY}`;
      const data = await fetchUrl(url);
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
          tags: (video.snippet.tags || []).slice(0,5)
        });
      }
    }
    const seen = new Set();
    return results.filter(v => { if(seen.has(v.url)) return false; seen.add(v.url); return true; })
                  .sort((a,b) => b.views - a.views).slice(0,15);
  } catch(e) { console.log('YouTube failed:', e.message); return []; }
}

async function fetchGoogleTrends() {
  try {
    const googleTrends = require('google-trends-api');
    const keywords = ['AI tools', 'artificial intelligence', 'ChatGPT', 'automation', 'content creator'];
    const results = [];
    for (const kw of keywords) {
      try {
        const raw = await googleTrends.interestOverTime({
          keyword: kw, geo: 'IN',
          startTime: new Date(Date.now() - 7*24*60*60*1000)
        });
        const parsed = JSON.parse(raw);
        const timelineData = parsed?.default?.timelineData || [];
        const recent = timelineData.slice(-3);
        const avgValue = recent.length
          ? Math.round(recent.reduce((a,b) => a+(b.value?.[0]||0), 0)/recent.length)
          : 0;
        results.push({ keyword: kw, trend_score: avgValue, geo: 'IN' });
      } catch(e) { console.log(`Trends "${kw}" skipped:`, e.message?.substring(0,50)); }
    }
    let dailyTrending = [];
    try {
      const yesterday = new Date(Date.now() - 24*60*60*1000);
      const raw = await googleTrends.dailyTrends({ geo: 'IN', trendDate: yesterday });
      const parsed = JSON.parse(raw);
      const days = parsed?.default?.trendingSearchesDays || [];
      if (days.length) {
        dailyTrending = (days[0].trendingSearches || []).slice(0,10)
          .map(t => ({ query: t.title?.query||'', traffic: t.formattedTraffic||'' }))
          .filter(t => t.query);
      }
    } catch(e) { console.log('Google daily trends skipped:', e.message?.substring(0,60)); }
    return { keyword_trends: results.sort((a,b)=>b.trend_score-a.trend_score), daily_trending: dailyTrending };
  } catch(e) { console.log('Google Trends failed:', e.message); return { keyword_trends:[], daily_trending:[] }; }
}

function buildIdeatorContext(reddit, hn, youtube, googleTrends) {
  const redditSummary = reddit.slice(0,5).map(r=>`• [Reddit r/${r.subreddit}] "${r.title}" — ${r.score} upvotes`).join('\n');
  const hnSummary = hn.slice(0,5).map(h=>`• [HackerNews] "${h.title}" — ${h.score} pts`).join('\n');
  const ytSummary = youtube.slice(0,5).map(v=>`• [YouTube Trending IN] "${v.title}" by ${v.channel} — ${(v.views/1000).toFixed(0)}k views`).join('\n');
  const gtKeywords = googleTrends.keyword_trends.map(k=>`${k.keyword} (${k.trend_score})`).join(', ');
  const gtDaily = googleTrends.daily_trending.slice(0,5).map(t=>`• "${t.query}" — ${t.traffic}`).join('\n');
  return `REAL-TIME TREND INTELLIGENCE (fetched ${new Date().toISOString()}):

REDDIT HOT (AI/tech/India):
${redditSummary||'No data'}

HACKER NEWS TOP:
${hnSummary||'No data'}

YOUTUBE TRENDING INDIA:
${ytSummary||'No data'}

GOOGLE TRENDS INDIA — KEYWORD INTEREST (7 days):
${gtKeywords||'No data'}

GOOGLE DAILY TRENDING SEARCHES INDIA:
${gtDaily||'No data'}

Use these trends to make ideas timely and relevant. If a YouTube video is trending on a topic, a reel covering the same topic from a creator's angle will ride that wave.`;
}

async function main() {
  console.log('Fetching trends...');
  const [reddit, hn, youtube, googleTrends] = await Promise.all([
    fetchReddit(), fetchHackerNews(), fetchYouTube(), fetchGoogleTrends()
  ]);
  console.log(`Reddit: ${reddit.length} posts | HN: ${hn.length} stories | YouTube: ${youtube.length} videos`);
  console.log(`Google Trends: ${googleTrends.keyword_trends.length} keywords | ${googleTrends.daily_trending.length} daily trending`);
  const ideatorContext = buildIdeatorContext(reddit, hn, youtube, googleTrends);
  fs.writeFileSync(OUT, JSON.stringify({ fetched_at: new Date().toISOString(), reddit, hackernews: hn, youtube, google_trends: googleTrends, ideator_context: ideatorContext }, null, 2));
  console.log('✅ Trends saved');
  console.log('\n--- PREVIEW ---');
  console.log(ideatorContext.substring(0, 600));
}
main().catch(console.error);
