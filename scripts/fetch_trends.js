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

async function main() {
  console.log('🔍 Fetching trends from Reddit + HackerNews...');
  const subreddits = ['artificial','ChatGPT','entrepreneur','selfimprovement','AIToolsTech','IndiaStartups'];
  const results = await Promise.allSettled([...subreddits.map(sr => fetchReddit(sr)), fetchHackerNews()]);
  const allTrends = results.flatMap(r => r.status==='fulfilled' ? r.value : []).filter(Boolean);
  allTrends.sort((a,b) => (b.score + b.comments*2) - (a.score + a.comments*2));
  const output = { fetched_at: new Date().toISOString(), total: allTrends.length, trends: allTrends.slice(0,80) };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log('✅ Fetched '+allTrends.length+' trend signals → second_brain/trends.json');
}
main().catch(e => { console.error('❌ fetch_trends failed:', e.message); process.exit(1); });
