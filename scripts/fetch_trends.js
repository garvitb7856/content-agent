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
    const keywords = ['ai','chatgpt','gemini','openai','claude','gpt','llm',
                      'coding','developer','tech','software','startup','automation',
                      'machine learning','neural','robot'];
    const filtered = trends.filter(t => {
      const title = (t.title?.query || '').toLowerCase();
      return keywords.some(k => title.includes(k));
    });
    // If no tech trends found in India today, return empty gracefully
    return filtered.slice(0, 5).map(t => ({
      title: t.title.query,
      traffic: t.formattedTraffic || 'trending',
      source: 'Google Trends India'
    }));
  } catch(e) {
    console.log('Google Trends fetch failed:', e.message);
    return [];
  }
}

async function fetchYouTubeTrending() {
  try {
    const https = require('https');
    
    const searches = [
      'artificial intelligence 2026',
      'ChatGPT new update',
      'OpenAI GPT',
      'Claude AI Anthropic',
      'Gemini Google AI',
      'AI agents automation',
      'large language model',
      'AI startup',
      'machine learning breakthrough',
      'AI vs human'
    ];

    async function searchYouTube(query) {
      const q = encodeURIComponent(query);
      return new Promise((resolve) => {
        const options = {
          hostname: 'www.youtube.com',
          path: `/results?search_query=${q}&sp=CAISAhAB`,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        };
        https.get(options, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const matches = [...data.matchAll(/"title":\{"runs":\[\{"text":"([^"]{10,80})"\}/g)]
              .map(m => m[1])
              .filter(t => !t.includes('\\u'))
              .slice(0, 2); // top 2 per query
            resolve(matches);
          });
          res.on('error', () => resolve([]));
        });
      });
    }

    // Run all searches with 300ms delay between each to avoid rate limiting
    const allTitles = [];
    for (const query of searches) {
      const results = await searchYouTube(query);
      allTitles.push(...results);
      await new Promise(r => setTimeout(r, 300));
    }

    // Deduplicate
    const seen = new Set();
    const unique = allTitles.filter(t => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });

    return unique.slice(0, 15).map(title => ({ title, source: 'YouTube AI Trending' }));

  } catch(e) {
    console.log('YouTube fetch failed:', e.message);
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
