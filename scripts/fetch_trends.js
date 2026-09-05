const fs = require('fs');
const path = require('path');
const https = require('https');
const OUT_PATH = path.join(__dirname, '../second_brain/trends.json');

function fetchJson(urlStr, label) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const options = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': 'ContentAgentResearcher/1.0', 'Accept': 'application/json' }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { console.log('⚠️ '+label+': parse failed'); resolve(null); } });
      });
      req.on('error', (e) => { console.log('⚠️ '+label+': '+e.message); resolve(null); });
      req.setTimeout(20000, () => { req.destroy(); resolve(null); });
      req.end();
    } catch(e) { console.log('⚠️ '+label+': '+e.message); resolve(null); }
  });
}

async function fetchReddit(subreddit) {
  const data = await fetchJson('https://www.reddit.com/r/'+subreddit+'/hot.json?limit=20&t=week', 'Reddit r/'+subreddit);
  if (!data?.data?.children) return [];
  return data.data.children.filter(p => !p.data.stickied && p.data.score > 30).map(p => ({
    source: 'Reddit r/'+subreddit,
    title: p.data.title,
    score: p.data.score,
    comments: p.data.num_comments,
    url: 'https://reddit.com'+p.data.permalink
  }));
}

async function fetchHackerNews() {
  const ids = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json', 'HN list');
  if (!Array.isArray(ids)) return [];
  const keywords = ['ai','gpt','llm','claude','gemini','openai','automation','startup','creator','growth','entrepreneur','tool'];
  const items = [];
  await Promise.all(ids.slice(0,50).map(async (id) => {
    const item = await fetchJson('https://hacker-news.firebaseio.com/v0/item/'+id+'.json', 'HN '+id);
    if (!item?.title) return;
    if (keywords.some(k => item.title.toLowerCase().includes(k))) {
      items.push({ source:'HackerNews', title:item.title, score:item.score||0, comments:item.descendants||0, url:item.url||'https://news.ycombinator.com/item?id='+id });
    }
  }));
  return items;
}

// GOOGLE TRENDS
async function fetchGoogleTrends() {
  try {
    const googleTrends = require('google-trends-api');
    const result = await googleTrends.dailyTrends({ geo: 'IN' });
    const data = JSON.parse(result);
    const trends = data.default.trendingSearchesDays[0].trendingSearches;
    const res = trends
      .filter(t => {
        const title = t.title.query.toLowerCase();
        return title.includes('ai') || title.includes('chatgpt') || 
               title.includes('gemini') || title.includes('tech') || 
               title.includes('openai') || title.includes('claude') ||
               title.includes('coding') || title.includes('startup');
      })
      .slice(0, 5)
      .map(t => ({
        title: t.title.query,
        traffic: t.formattedTraffic,
        source: 'Google Trends India'
      }));
    if (res.length) return res;
    throw new Error('empty or unfiltered');
  } catch(e) {
    try {
      const https = require('https');
      const url = 'https://trends.google.com/trending/rss?geo=IN';
      const xml = await new Promise((resolve, reject) => {
        https.get(url, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
          res.on('error', reject);
        });
      });
      const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<ht:approx_traffic>(.*?)<\/ht:approx_traffic>[\s\S]*?<\/item>/g)];
      const parsed = items.map(m => ({ title: m[1], traffic: m[2], source: 'Google Trends India' }));
      const techFiltered = parsed.filter(t => {
        const title = t.title.toLowerCase();
        return title.includes('ai') || title.includes('chatgpt') || 
               title.includes('gemini') || title.includes('tech') || 
               title.includes('openai') || title.includes('claude') ||
               title.includes('coding') || title.includes('startup') ||
               title.includes('google') || title.includes('apple') || title.includes('nvidia');
      });
      return (techFiltered.length ? techFiltered : parsed).slice(0, 5);
    } catch(err) {
      console.log('Google Trends fetch failed:', e.message);
      return [];
    }
  }
}

// YOUTUBE TRENDING (no API key needed — uses RSS feed)
async function fetchYouTubeTrending() {
  try {
    const https = require('https');
    // Fetch YouTube trending RSS for Science & Tech category in India
    const url = 'https://www.youtube.com/feeds/videos.xml?chart=mostpopular&regionCode=IN&categoryId=28&max-results=10';
    const xml = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); resolve(''); });
    });
    const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map(m => m[1])
      .filter(t => t !== 'YouTube' && t.length > 5 && !t.includes('Error 400'))
      .slice(0, 5);

    if (titles.length) {
      return titles.map(title => ({ title, source: 'YouTube Trending IN' }));
    }

    // Fallback: YouTube trending page
    const html = await new Promise((resolve) => {
      const options = {
        hostname: 'www.youtube.com',
        path: '/feed/trending',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9' }
      };
      const req = https.get(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(''));
      req.setTimeout(5000, () => { req.destroy(); resolve(''); });
    });
    const matches = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"\}/g)]
      .map(m => m[1])
      .filter(t => t.length > 5 && 
        !t.toLowerCase().includes('trending') && 
        !t.toLowerCase().includes('youtube') && 
        !t.toLowerCase().includes('keyboard') && 
        !t.toLowerCase().includes('search') && 
        !t.toLowerCase().includes('playback') && 
        !t.toLowerCase().includes('general') && 
        !t.toLowerCase().includes('caption') && 
        !t.toLowerCase().includes('subtitles') && 
        !t.toLowerCase().includes('report') &&
        !t.toLowerCase().includes('history') &&
        !t.toLowerCase().includes('library')
      )
      .slice(0, 5);
    return matches.map(title => ({ title, source: 'YouTube Trending IN' }));
  } catch(e) {
    console.log('YouTube trending fetch failed:', e.message);
    return [];
  }
}

async function main() {
  console.log('🔍 Fetching trends from Reddit + HackerNews + Google Trends + YouTube...');
  const subreddits = ['artificial','ChatGPT','entrepreneur','selfimprovement','AIToolsTech','IndiaStartups'];
  const results = await Promise.allSettled([...subreddits.map(sr => fetchReddit(sr)), fetchHackerNews()]);
  const allTrends = results.flatMap(r => r.status==='fulfilled' ? r.value : []).filter(Boolean);
  allTrends.sort((a,b) => (b.score + b.comments*2) - (a.score + a.comments*2));

  const googleTrends = await fetchGoogleTrends();
  const youtubeTrends = await fetchYouTubeTrending();

  const hackernews = allTrends.filter(t => t.source === 'HackerNews');
  const reddit = allTrends.filter(t => t.source.startsWith('Reddit'));

  const output = { 
    fetched_at: new Date().toISOString(), 
    total: allTrends.length, 
    trends: allTrends.slice(0,80),
    hackernews: hackernews,
    reddit: reddit,
    google: googleTrends,
    youtube: youtubeTrends
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log('✅ Fetched '+allTrends.length+' trend signals (plus Google & YouTube) → second_brain/trends.json');
}
main().catch(e => { console.error('❌ fetch_trends failed:', e.message); process.exit(1); });
