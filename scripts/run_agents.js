const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DATA_PATH = path.join(__dirname, '../dashboard/data/data.json');
const OUT_PATH1 = path.join(__dirname, '../dashboard/data/agents_output.json');
const OUT_PATH2 = path.join(__dirname, '../dashboard/agents_output.json');
const TRENDS_PATH = path.join(__dirname, '../second_brain/trends.json');
const PENDING_PATH = path.join(__dirname, '../second_brain/pending_ideas.json');
const HISTORY_PATH = path.join(__dirname, '../second_brain/ideas_history.json');
const PLAN_PATH = path.join(__dirname, '../second_brain/active_plan.json');

function checkEnv() {
  if (!GEMINI_KEY || GEMINI_KEY.includes('your_')) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }
}
function loadData() {
  const p = fs.existsSync(DATA_PATH) ? DATA_PATH : path.join(__dirname,'../dashboard/data.json');
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
function loadTrends() {
  if (!fs.existsSync(TRENDS_PATH)) return { trends:[] };
  try { return JSON.parse(fs.readFileSync(TRENDS_PATH,'utf8')); } catch(e) { return {trends:[]}; }
}
function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return { generated_topics:[], posted_topics:[] };
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH,'utf8')); } catch(e) { return {generated_topics:[],posted_topics:[]}; }
}

async function gemini(prompt, label, temperature) {
  temperature = temperature || 0.7;
  process.stdout.write('Calling Gemini for '+label+'... ');
  const models = ['gemini-3.7-flash','gemini-3.8-flash','gemini-3.1-flash-lite','gemini-3.1-pro-preview'];
  for (const model of models) {
    const postData = JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature, maxOutputTokens:8192} });
    const options = { hostname:'generativelanguage.googleapis.com', port:443, path:'/v1beta/models/'+model+':generateContent?key='+GEMINI_KEY, method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(postData)} };
    for (let attempt=1; attempt<=3; attempt++) {
      try {
        const {statusCode, body} = await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({statusCode:res.statusCode,body:d})); });
          req.on('error', reject); req.write(postData); req.end();
        });
        if (statusCode>=200 && statusCode<300) {
          const text = JSON.parse(body).candidates[0]?.content?.parts[0]?.text?.trim();
          if (text && text.length>20) { console.log('done ('+model+', '+text.length+' chars)'); return text; }
        }
        if (statusCode===503||statusCode===429) { process.stdout.write('['+model+' '+statusCode+', fallback]... '); break; }
        throw new Error('HTTP '+statusCode);
      } catch(err) {
        if (attempt<3) await new Promise(r=>setTimeout(r,2000));
        else process.stdout.write('['+model+' failed]... ');
      }
    }
  }
  console.log('all models failed.'); return '[Agent Error: all model fallbacks exhausted]';
}

function parseJSONArray(raw, label) {
  if (!raw || typeof raw !== 'string') return [];
  try {
    let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) {
      let jsonStr = m[0]
        .replace(/,\s*([\]\}])/g, '$1');
      return JSON.parse(jsonStr);
    }
  } catch(e) {
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) return eval('(' + m[0] + ')');
    } catch(err) {}
  }
  console.log('⚠️ ' + label + ': JSON parse failed');
  return [];
}

function buildSummaries(data) {
  const me = data.your_account || {};
  const myHandle = me.username||'garvit.irl';
  const myFollowers = me.followers||5845;
  const myAvgLikes = me.stats?.avg_likes||me.avg_likes||334;
  const myAvgComments = me.stats?.avg_comments||me.avg_comments||12;
  const myPosts = me.posts||me.recent_posts||[];
  const rawComps = data.competitors||{};
  const competitors = Array.isArray(rawComps)?rawComps:Object.entries(rawComps).map(([k,v])=>({username:k,...v}));
  let compSummary='';
  competitors.forEach(c => {
    const handle=c.username||'unknown', followers=c.followers||0, avgLikes=c.stats?.avg_likes||c.avg_likes||0;
    const posts=(c.posts||c.recent_posts||[]).slice(0,3);
    let postsText='';
    posts.forEach(p => {
      const cap=(p.caption||'').slice(0,100).replace(/\n/g,' ');
      const url=p.url||(p.shortCode?'https://www.instagram.com/p/'+p.shortCode+'/':'');
      if(cap) postsText+='    - '+url+' | '+(p.likes||0)+' likes | '+cap+'\n';
    });
    compSummary+='\n@'+handle+': '+followers+' followers | avg '+avgLikes+' likes\n'+postsText;
  });
  let myPostsText='';
  myPosts.slice(0,5).forEach(p => {
    const cap=(p.caption||'').slice(0,100).replace(/\n/g,' ');
    const url=p.url||(p.shortCode?'https://www.instagram.com/p/'+p.shortCode+'/':'');
    if(cap) myPostsText+='  - '+url+' | '+(p.likes||0)+' likes | '+cap+'\n';
  });
  return {myHandle,myFollowers,myAvgLikes,myAvgComments,myPostsText,compSummary};
}

function buildTrendSummary(trendsData) {
  if (!trendsData.trends||!trendsData.trends.length) return 'No trend data available.';
  return trendsData.trends.slice(0,60).map(t=>'['+t.source+'] '+t.title+' (score:'+t.score+', comments:'+t.comments+')').join('\n');
}

async function main() {
  console.log('==================================================');
  console.log('Content Agent — Ideator + Scout + Analyst + Planner');
  console.log('==================================================');
  checkEnv();
  const data = loadData();
  const trendsData = loadTrends();
  const history = loadHistory();
  const {myHandle,myFollowers,myAvgLikes,myAvgComments,myPostsText,compSummary} = buildSummaries(data);
  const trendSummary = buildTrendSummary(trendsData);
  const googleSection = trendsData.google?.length 
    ? '\nGOOGLE TRENDS INDIA:\n' + trendsData.google.map(t=>`- ${t.title} (${t.traffic||'trending'})`).join('\n')
    : '';
  
  const youtubeSection = trendsData.youtube?.length
    ? '\nYOUTUBE TRENDING TECH INDIA:\n' + trendsData.youtube.map(t=>`- ${t.title}`).join('\n')
    : '';

  const historyTitles = (history.generated_topics||[]).slice(-60).map(t=>t.title);
  const postedTitles = (history.posted_topics||[]).map(t=>t.title);
  const engRate = myFollowers ? (((myAvgLikes+myAvgComments)/myFollowers)*100).toFixed(2) : '0.00';

  const hookBank = fs.existsSync(path.join(__dirname, '../second_brain/hook_bank.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, '../second_brain/hook_bank.json'), 'utf8')) : [];
  const patterns = fs.existsSync(path.join(__dirname, '../second_brain/patterns.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, '../second_brain/patterns.json'), 'utf8')) : { bestFormats: [] };
  const topHooks = hookBank.sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,5).map(h=>h.hook).filter(Boolean).join('\n') || 'No top hooks logged yet.';
  const bestFormats = (patterns.bestFormats && patterns.bestFormats.length) ? patterns.bestFormats.join(', ') : 'Reels';

  const igTrendsPath = path.join(__dirname, '../second_brain/instagram_trends.json');
  const igTrends = fs.existsSync(igTrendsPath) ? JSON.parse(fs.readFileSync(igTrendsPath, 'utf8')) : {};
  const hotPost = igTrends.hotRightNow?.[0];
  const topFormat = igTrends.risingFormat?.[0]?.format || 'Reel';
  const trendTopics = igTrends.trendingTopics?.map(t=>t.topic).join(', ') || '';
  const bestTimes = igTrends.bestPostingWindow?.join(', ') || '';
  const igContext = `
INSTAGRAM TREND SIGNALS (RIGHT NOW in your niche):
- Hottest post last 24hrs: ${hotPost ? `@${hotPost.username} got ${hotPost.likes} likes — "${hotPost.caption}" (${hotPost.url})` : 'No recent data'}
- Best performing format this week: ${topFormat}
- Trending topics across top creators: ${trendTopics}
- Best posting times: ${bestTimes}
- Top hook patterns from competitors:
${igTrends.topHookPatterns?.map(h=>`  "${h.hook}" — @${h.username} (${h.likes} likes)`).join('\n') || 'None'}
`;

  // ── AGENT 1: IDEATOR — 50 ideas ──────────────────────────────────────────
  console.log('\nAgent 1: Ideator (50 ideas from real trends)...');
  const ideatorRaw = await gemini(`
You are a viral content strategist for @${myHandle} (${myFollowers} followers, Indian AI/automation/entrepreneurship creator).

These hooks have performed best for @${myHandle} in the past:
${topHooks}
Use similar patterns.

${igContext}

WHAT IS TRENDING RIGHT NOW ON THE INTERNET (real data, last 24h):
${trendSummary}${googleSection}${youtubeSection}

WHAT COMPETITORS ARE POSTING ON INSTAGRAM:
${compSummary}

MY RECENT POSTS (do NOT repeat similar topics):
${myPostsText}

YOUR TASK: Generate exactly 50 content ideas for Instagram. Each must be specific, not generic. Rooted in actual trends above.

OUTPUT ONLY a valid JSON array of exactly 50 objects. No markdown. No explanation. No code fences. Start with [ and end with ].
Format for each:
{"title":"specific video title","hook":"first 3 seconds word for word","format":"Reel or Carousel","why":"one sentence citing which trend source and which competitor had success with this"}

Generate all 50. Mix AI tools (40%), entrepreneurship (30%), self-growth (30%). Every title must be specific enough to film tomorrow.
`, 'Ideator', 0.8);

  const ideas50 = parseJSONArray(ideatorRaw, 'Ideator');
  console.log('  → Parsed '+ideas50.length+' ideas');

  // ── AGENT 2: SCOUT — filter to top 5 ─────────────────────────────────────
  console.log('\nAgent 2: Scout (scoring 50 → top 5)...');
  const scoutRaw = await gemini(`
You are the Scout Agent. Score these content ideas ruthlessly and objectively. Your job is to protect the creator from wasting time on weak content.

SCORING RULES — be strict:
- HIGH: trending NOW (cited in trend data above) + creator has NOT done this topic before + strong competitor proof (500+ likes)
- MEDIUM: trending but creator touched similar topic, OR competitor results were average (200-500 likes)
- LOW: topic saturated, creator already posted this, OR no trend signal to back it up

50 IDEAS TO EVALUATE:
${JSON.stringify(ideas50)}

TOPICS ALREADY GENERATED IN LAST 30 DAYS (penalize similar ones):
${JSON.stringify(historyTitles.slice(-30))}

TOPICS CREATOR ALREADY POSTED (mark LOW if similar):
${JSON.stringify(postedTitles)}

TREND DATA CONTEXT (same data Ideator used):
${trendSummary.substring(0,1500)}

OUTPUT ONLY a valid JSON array of exactly 5 objects. Your top 5 ranked 1 to 5. No markdown. No explanation. Start with [ end with ].
[{"rank":1,"title":"...","hook":"...","format":"Reel or Carousel","score":"HIGH or MEDIUM or LOW","reasoning":"2 sentences: what trend signal backs this, what competitor evidence exists, why you ranked it here","niche":"AI or Entrepreneurship or Self-growth"}]
`, 'Scout', 0.3);

  const top5 = parseJSONArray(scoutRaw, 'Scout');
  console.log('  → Scout selected '+top5.length+' ideas');

  // Save pending_ideas.json
  fs.mkdirSync(path.dirname(PENDING_PATH), {recursive:true});
  fs.writeFileSync(PENDING_PATH, JSON.stringify(top5, null, 2));
  console.log('  ✅ Saved pending_ideas.json');

  // Update ideas_history.json
  const todayStr = new Date().toISOString().split('T')[0];
  history.generated_topics = history.generated_topics||[];
  ideas50.forEach(idea => history.generated_topics.push({date:todayStr,title:idea.title||''}));
  if (history.generated_topics.length>500) history.generated_topics = history.generated_topics.slice(-500);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log('  ✅ Updated ideas_history.json');

  // ── AGENT 3: ANALYST ─────────────────────────────────────────────────────
  console.log('\nAgent 3: Analyst...');
  const analyst = await gemini(`
IMPORTANT: Use these EXACT pre-computed stats for @${myHandle}:
- Followers: ${myFollowers}
- Avg Likes: ${myAvgLikes}
- Avg Comments: ${myAvgComments} (median)
- Engagement Rate: ${engRate}%

You are a data analyst for Instagram creator @${myHandle}.

COMPETITOR DATA:
${compSummary}

Write a complete analysis:
## COMPETITOR RANKING TABLE
Rank competitors by engagement rate. Columns: Handle | Followers | Avg Likes | Eng Rate | Top Content Type

## GROWTH GAPS
3 specific opportunities where competitors outperform @${myHandle}.

## RECOMMENDED ACTIONS
3 concrete data-driven actions for the next 7 days.
`, 'Analyst', 0.5);

  // ── AGENT 4: PLANNER ─────────────────────────────────────────────────────
  console.log('\nAgent 4: Planner...');
  let planner, planLocked=false;
  if (fs.existsSync(PLAN_PATH)) {
    try {
      const plan=JSON.parse(fs.readFileSync(PLAN_PATH,'utf8'));
      const daysSince=(Date.now()-new Date(plan.created_at))/(1000*60*60*24);
      if (daysSince<7) { planner=plan.content; planLocked=true; console.log('  → Using locked plan ('+Math.round(daysSince)+'d old)'); }
    } catch(e) {}
  }
  if (!planLocked) {
    const todayFormatted = new Date().toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'short'});
    planner = await gemini(`
You are a content planner for @${myHandle} (AI/automation/entrepreneurship, Indian audience, 6:30-8PM IST peak hours).

Start your 7-day plan from TODAY which is ${todayFormatted}. Label DAY 1 as today's actual day name. Do not start from Sunday or any fixed day.

Create a 7-day content calendar:
${dayNames.map((d,i)=>'Day '+(i+1)+': '+d).join('\n')}

For EACH day write exactly:
## DAY [n] — [Day Name]
**Format:** Reel or Carousel
**Topic:** specific topic
**Post Time:** exact IST time
**Hook:** opening line
**Trigger Word:** comment trigger (e.g. LINK, TOOL, FREE, SYSTEM)

Mix formats daily. Vary trigger words. Make every topic specific enough to film.
`, 'Planner', 0.7);
    fs.mkdirSync(path.dirname(PLAN_PATH),{recursive:true});
    fs.writeFileSync(PLAN_PATH, JSON.stringify({created_at:new Date().toISOString(),content:planner},null,2));
  }

  // ── SAVE OUTPUT ───────────────────────────────────────────────────────────
  const output = {
    generated_at: new Date().toISOString(),
    ideator: ideatorRaw,
    scout: scoutRaw,
    pending_ideas: top5,
    analyst,
    planner,
    hook_script: null,
    selected_idea: null
  };
  [OUT_PATH1, OUT_PATH2].forEach(p => {
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p, JSON.stringify(output,null,2));
  });
  console.log('\n✅ Done. '+top5.length+' ideas ready in pending_ideas.json');
  console.log('📱 Reply 1-5 on Telegram to generate a script for your chosen idea.');
}
main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
