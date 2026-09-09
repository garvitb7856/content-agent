const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
function safeRead(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch(e) { return fallback; }
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

const rawTrends = safeRead(path.join(ROOT, 'second_brain/trends.json'), {});
const trendContext = rawTrends.ideator_context || '';

let agentContext = { instruction_for_agents: '' };
try {
  agentContext = JSON.parse(fs.readFileSync(path.join(ROOT, 'second_brain/agent_context.json'), 'utf8'));
} catch(e) {}

const PERFORMANCE_BLOCK = agentContext.instruction_for_agents
  ? `\n\n═══════════════════════════════\nINTELLIGENCE BRIEFING — READ BEFORE WRITING:\n${agentContext.instruction_for_agents}\n═══════════════════════════════\n`
  : '';

function loadRecentTranscripts(limitPerHandle = 3) {
  const transcriptsDir = path.join(__dirname, '../second_brain/transcripts');
  if (!fs.existsSync(transcriptsDir)) return '';
  try {
    const files = fs.readdirSync(transcriptsDir)
      .filter(f => f.endsWith('.json') && f !== 'transcribed_ids.json')
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(transcriptsDir, f), 'utf8')); } catch(e) { return null; } })
      .filter(Boolean)
      .filter(t => t.transcript && t.transcript !== 'NO_SPEECH')
      .sort((a, b) => new Date(b.transcribedAt) - new Date(a.transcribedAt));
    const byHandle = {};
    for (const t of files) {
      if (!byHandle[t.handle]) byHandle[t.handle] = [];
      if (byHandle[t.handle].length < limitPerHandle) byHandle[t.handle].push(t);
    }
    let out = '\n\n--- REAL VIDEO TRANSCRIPTS (what creators actually said in their videos) ---\n';
    for (const [handle, transcripts] of Object.entries(byHandle)) {
      for (const t of transcripts) {
        out += `\n@${handle} (${t.likes} likes):\nSpoken: "${t.transcript.substring(0, 400)}"\nPost: ${t.postUrl}\n`;
      }
    }
    return out;
  } catch (e) { return ''; }
}

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
// ── DYNAMIC TOPIC CLUSTER ENGINE ────────────────────────────
// Reads clusters from topic_clusters.json (self-expanding over time).
// Groups all idea history into compact topic buckets so the Ideator
// prompt never grows beyond ~20 lines regardless of history size.
function clusterHistory(history) {
  const clustersPath = path.join(__dirname, '../second_brain/topic_clusters.json');
  let CLUSTERS = [];
  try { CLUSTERS = JSON.parse(fs.readFileSync(clustersPath, 'utf8')); } catch(e) {}

  const allTitles = [
    ...(history.generated_topics || []).map(t => (t.title || t).toLowerCase()),
    ...(history.posted_topics    || []).map(t => (t.title || t).toLowerCase()),
  ];

  if (!allTitles.length) return 'No history yet — all topics are fresh.';

  const counts = {};
  CLUSTERS.forEach(c => { counts[c.name] = 0; });
  const uncategorized = [];

  allTitles.forEach(title => {
    let matched = false;
    for (const cluster of CLUSTERS) {
      if (cluster.keywords.some(kw => title.includes(kw))) {
        counts[cluster.name]++;
        matched = true;
        break;
      }
    }
    if (!matched) uncategorized.push(title);
  });

  const lines = CLUSTERS
    .filter(c => counts[c.name] > 0)
    .sort((a, b) => counts[b.name] - counts[a.name])
    .map(c => `- ${c.name} — ${counts[c.name]}x covered, avoid for now`);

  if (uncategorized.length) {
    lines.push(`- Uncategorized topics (${uncategorized.length} total) — avoid: ${uncategorized.slice(-8).join(' | ')}`);
  }

  return lines.length ? lines.join('\n') : 'No history yet — all topics are fresh.';
}
// ─────────────────────────────────────────────────────────────

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return { generated_topics:[], posted_topics:[] };
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH,'utf8')); } catch(e) { return {generated_topics:[],posted_topics:[]}; }
}

// ── SMART MODEL POOL ─────────────────────────────────────────
// Ordered best → acceptable for content writing
// Based on confirmed available models in Antigravity account
const MODEL_POOL = [
  { id: 'gemini-3.8-flash',      quality: 10, dailyLimit: 20 },
  { id: 'gemini-3.7-flash',      quality: 9,  dailyLimit: 20 },
  { id: 'gemini-3.6-flash',      quality: 8,  dailyLimit: 20 },
  { id: 'gemini-3.5-flash',      quality: 7,  dailyLimit: 20 },
  { id: 'gemini-3.0-flash',      quality: 6,  dailyLimit: 20 },
  { id: 'gemini-2.5-flash',      quality: 5,  dailyLimit: 20 },
  { id: 'gemini-3.5-flash-lite', quality: 4,  dailyLimit: 500 },
  { id: 'gemini-2.5-flash-lite', quality: 3,  dailyLimit: 20 },
  { id: 'gemini-3.1-flash-lite', quality: 2,  dailyLimit: 500 },
];

const modelState = {}; // id → { cooldownUntil, sessionFailed, useCount }

function getState(id) {
  if (!modelState[id]) modelState[id] = { cooldownUntil: 0, sessionFailed: false, useCount: 0 };
  return modelState[id];
}

function getBestAvailableModel(excludeIds = new Set()) {
  const now = Date.now();
  // Pick highest quality model that is not cooling down, not session-failed, not excluded
  const available = MODEL_POOL.filter(m =>
    !m.sessionFailed &&
    !getState(m.id).sessionFailed &&
    !excludeIds.has(m.id) &&
    now >= getState(m.id).cooldownUntil
  );
  if (available.length) return available[0].id; // already sorted best→worst

  // All cooling — pick the one whose cooldown expires soonest
  const notFailed = MODEL_POOL.filter(m => !getState(m.id).sessionFailed && !excludeIds.has(m.id));
  if (!notFailed.length) return MODEL_POOL[MODEL_POOL.length - 1].id;
  return notFailed.reduce((best, m) =>
    getState(m.id).cooldownUntil < getState(best.id).cooldownUntil ? m : best
  ).id;
}

function markCooling(id, code) {
  const coolMs = code === 429 ? 65000 : 35000; // 429=rate limit 65s | 503=overload 35s
  getState(id).cooldownUntil = Date.now() + coolMs;
  const next = getBestAvailableModel(new Set([id]));
  console.log(`\n  [${id} → ${code}, cooling ${coolMs/1000}s | next best: ${next}]`);
}

async function callGemini(prompt, maxTokens = 8192) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const triedThisCall = new Set();
  let lastError = null;

  for (let attempt = 0; attempt < MODEL_POOL.length; attempt++) {
    const modelId = getBestAvailableModel(triedThisCall);
    triedThisCall.add(modelId);
    const state = getState(modelId);

    // If cooling, wait it out (max 10s wait, then move on)
    const waitMs = Math.min(state.cooldownUntil - Date.now(), 10000);
    if (waitMs > 0) {
      process.stdout.write(`  [waiting ${Math.ceil(waitMs/1000)}s for ${modelId}]... `);
      await new Promise(r => setTimeout(r, waitMs));
    }

    try {
      process.stdout.write(`  Calling [${modelId}]... `);
      const model = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 }
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      state.useCount++;
      console.log(`✓ done (${text.length} chars, used ${state.useCount}x today)`);
      // Track which model served this call globally
      if (!global.modelsUsed) global.modelsUsed = [];
      global.modelsUsed.push(modelId);
      return { text, modelUsed: modelId };
    } catch(e) {
      lastError = e;
      const msg = e.message || '';
      const code = e.status || (msg.includes('429') ? 429 : msg.includes('503') ? 503 : msg.includes('404') ? 404 : 500);

      if (code === 404 || msg.includes('not found') || msg.includes('no longer available')) {
        // Model doesn't exist for this account — skip permanently this session
        state.sessionFailed = true;
        console.log(`\n  [${modelId} not available — removed from pool this session]`);
      } else if (code === 429) {
        // Rate limit — cool 65s
        markCooling(modelId, 429);
        await new Promise(r => setTimeout(r, 2000));
      } else if (code === 503) {
        // Overloaded — cool 35s
        markCooling(modelId, 503);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        // Any other error (500, timeout, network) — temporary, cool 45s and retry
        state.cooldownUntil = Date.now() + 45000;
        const next = getBestAvailableModel(new Set([modelId]));
        console.log(`\n  [${modelId} error ${code} — cooling 45s, trying ${next} meanwhile: ${msg.substring(0,60)}]`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw new Error(`All models exhausted. Last: ${lastError?.message}`);
}

async function gemini(prompt, label, temperature) {
  return callGemini(prompt);
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

function extractIdeatorJSON(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = raw.slice(start, end + 1);
    try { JSON.parse(candidate); return candidate; } catch(e) { return candidate; }
  }
  return raw
    .replace(/^[\s\S]*?(?=(?:\d+\.\s|#{1,3}\s|\*\s|•\s|Idea\s+\d+|Title:|hook:))/im, '')
    .trim();
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

  const historyTitles = clusterHistory(history);
  const engRate = myFollowers ? (((myAvgLikes+myAvgComments)/myFollowers)*100).toFixed(2) : '0.00';

  const rawHookBank = fs.existsSync(path.join(__dirname, '../second_brain/hook_bank.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, '../second_brain/hook_bank.json'), 'utf8')) : [];
  const hookBank = Array.isArray(rawHookBank) ? rawHookBank : (rawHookBank.hooks || []);
  const patterns = fs.existsSync(path.join(__dirname, '../second_brain/patterns.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, '../second_brain/patterns.json'), 'utf8')) : { bestFormats: [] };
  const topHooks = hookBank.slice().sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,5).map(h=>h.hook||h.text).filter(Boolean).join('\n') || 'No top hooks logged yet.';
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

  const archivePath = path.join(__dirname, '../second_brain/performance_archive.json');
  const archive = fs.existsSync(archivePath) ? JSON.parse(fs.readFileSync(archivePath, 'utf8')) : [];
  const topPerformers = Array.isArray(archive)
    ? [...archive].sort((a,b) => (b.finalLikes||0) - (a.finalLikes||0)).slice(0, 3)
    : [];
  
  const performanceContext = topPerformers.length > 0 ? `
YOUR BEST PERFORMING POSTS (learn from these):
${topPerformers.map(p => `- "${p.hookText}" → ${p.finalLikes} likes, ${p.finalComments} comments (${p.engagementRate}% eng) ${p.url}`).join('\n')}
Best formats for your account: ${patterns.bestFormats?.join(' > ') || 'not enough data yet'}
Best topics for your audience: ${patterns.bestTopics?.join(', ') || 'not enough data yet'}
` : '';

  const realTranscripts = loadRecentTranscripts(3);

  // ── AGENT 1: IDEATOR — 50 ideas ──────────────────────────────────────────
  console.log('\nAgent 1: Ideator (50 ideas from real trends)...');
  const ideatorResult = await gemini(`
${trendContext ? `\n${trendContext}\n` : ''}
You are a viral content strategist for @${myHandle} (${myFollowers} followers, Indian AI/automation/entrepreneurship creator).

${performanceContext}

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
${realTranscripts}

TOPICS ALREADY COVERED — DO NOT REPEAT THESE CLUSTERS:
${historyTitles}

YOUR TASK: Generate exactly 50 content ideas for Instagram. Each must be specific, not generic. Rooted in actual trends above.

CRITICAL: Your response must be a valid JSON array only. No markdown, no explanation, no code blocks. 
Start your response with [ and end with ].

Each object in the array MUST have exactly these fields:
{
  "title": "catchy idea title",
  "hook": "opening line for the reel",
  "format": "Reel or Carousel",
  "why": "why this will work for @garvit.irl",
  "sourceUrl": "https://www.instagram.com/p/SHORTCODE/ (exact URL from the data provided that inspired this idea, or empty string if trend-based)",
  "rating": "HIGH"
}

For EACH idea, also assign a rating based on these criteria:
- HIGH: strong trend signal OR proven viral format from competitors + unique angle for your niche
- MEDIUM: solid topic, decent competitor performance, somewhat covered territory
- LOW: generic, overdone, weak hook potential, or no trend backing

Return ONLY a valid JSON array of 50 objects with NO extra text:
[{"title":"...","hook":"...","format":"...","why":"...","sourceUrl":"...","rating":"HIGH"}]

rating must be "HIGH", "MEDIUM", or "LOW" for every single idea. No other values.

For sourceUrl: scan the topHookPatterns and hotRightNow arrays in the input data. 
When an idea copies or remixes a competitor post style, use that post's URL exactly as given in the data. 
If no specific post inspired it, use empty string.

Generate all 50. Mix AI tools (40%), entrepreneurship (30%), self-growth (30%). Every title must be specific enough to film tomorrow.${PERFORMANCE_BLOCK}
`, 'Ideator', 0.8);
  const ideatorRaw = ideatorResult.text;

  const ideas50 = parseJSONArray(ideatorRaw, 'Ideator');
  console.log('  → Parsed '+ideas50.length+' ideas');

  // ── AGENT 2: SCOUT — filter to top 5 ─────────────────────────────────────
  console.log('\nAgent 2: Scout (scoring 50 → top 5)...');
  const scoutResult = await gemini(`
You are the Scout Agent. Score these content ideas ruthlessly and objectively. Your job is to protect the creator from wasting time on weak content.

SCORING RULES — be strict:
- HIGH: trending NOW (cited in trend data above) + creator has NOT done this topic before + strong competitor proof (500+ likes)
- MEDIUM: trending but creator touched similar topic, OR competitor results were average (200-500 likes)
- LOW: topic saturated, creator already posted this, OR no trend signal to back it up

50 IDEAS TO EVALUATE:
${JSON.stringify(ideas50)}

TOPICS ALREADY COVERED — DO NOT REPEAT THESE CLUSTERS:
${historyTitles}

TREND DATA CONTEXT (same data Ideator used):
${trendSummary.substring(0,1500)}
${realTranscripts}

OUTPUT ONLY a valid JSON array of exactly 5 objects. Your top 5 ranked 1 to 5. No markdown. No explanation. Start with [ end with ].
[{"rank":1,"title":"...","hook":"...","format":"Reel or Carousel","score":"HIGH or MEDIUM or LOW","reasoning":"2 sentences: what trend signal backs this, what competitor evidence exists, why you ranked it here","niche":"AI or Entrepreneurship or Self-growth","sourceUrl":"Instagram URL if present in evaluated idea, else empty string"}]
`, 'Scout', 0.3);
  const scoutRaw = scoutResult.text;

  const top5 = parseJSONArray(scoutRaw, 'Scout');
  console.log('  → Scout selected '+top5.length+' ideas');

  // Save pending_ideas.json
  fs.mkdirSync(path.dirname(PENDING_PATH), {recursive:true});
  atomicWrite(PENDING_PATH, top5);
  console.log('  ✅ Saved pending_ideas.json');

  // Update ideas_history.json
  const todayStr = new Date().toISOString().split('T')[0];
  history.generated_topics = history.generated_topics||[];
  ideas50.forEach(idea => history.generated_topics.push({date:todayStr,title:idea.title||''}));
  if (history.generated_topics.length>500) history.generated_topics = history.generated_topics.slice(-500);
  atomicWrite(HISTORY_PATH, history);
  console.log('  ✅ Updated ideas_history.json');

  // ── AGENT 3: ANALYST ─────────────────────────────────────────────────────
  console.log('\nAgent 3: Analyst...');
  const analystResult = await gemini(`
IMPORTANT: Use these EXACT pre-computed stats for @${myHandle}:
- Followers: ${myFollowers}
- Avg Likes: ${myAvgLikes}
- Avg Comments: ${myAvgComments} (median)
- Engagement Rate: ${engRate}%

You are a data analyst for Instagram creator @${myHandle}.

COMPETITOR DATA:
${compSummary}
${realTranscripts}

Write a complete analysis:
## COMPETITOR RANKING TABLE
Rank competitors by engagement rate. Columns: Handle | Followers | Avg Likes | Eng Rate | Top Content Type

## GROWTH GAPS
3 specific opportunities where competitors outperform @${myHandle}.

## RECOMMENDED ACTIONS
3 concrete data-driven actions for the next 7 days.
`, 'Analyst', 0.5);
  const analyst = analystResult.text;

  // ── AGENT 4: PLANNER ─────────────────────────────────────────────────────
  console.log('\nAgent 4: Planner...');
  let planner, plannerResult = null, planLocked=false;
  if (fs.existsSync(PLAN_PATH)) {
    try {
      const plan=JSON.parse(fs.readFileSync(PLAN_PATH,'utf8'));
      const daysSince=(Date.now()-new Date(plan.created_at))/(1000*60*60*24);
      if (daysSince<7) { planner=plan.content; planLocked=true; console.log('  → Using locked plan ('+Math.round(daysSince)+'d old)'); }
    } catch(e) {}
  }
  if (!planLocked) {
    const todayFormatted = new Date().toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'short'});
    const dayNames = Array.from({length: 7}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('en-IN', { weekday: 'long' });
    });
    plannerResult = await gemini(`
You are a content planner for @${myHandle} (AI/automation/entrepreneurship, Indian audience, 6:30-8PM IST peak hours).

Start your 7-day plan from TODAY which is ${todayFormatted}. Label DAY 1 as today's actual day name. Do not start from Sunday or any fixed day.

Create a 7-day content calendar:
${dayNames.map((d,i)=>'Day '+(i+1)+': '+d).join('\n')}
${realTranscripts}

For EACH day write exactly:
## DAY [n] — [Day Name]
**Format:** Reel or Carousel
**Topic:** specific topic
**Post Time:** exact IST time
**Hook:** opening line
**Trigger Word:** comment trigger (e.g. LINK, TOOL, FREE, SYSTEM)

Mix formats daily. Vary trigger words. Make every topic specific enough to film.
`, 'Planner', 0.7);
    planner = plannerResult.text;
    fs.mkdirSync(path.dirname(PLAN_PATH),{recursive:true});
    atomicWrite(PLAN_PATH, {created_at:new Date().toISOString(),content:planner});
  }

  // ── SAVE OUTPUT ───────────────────────────────────────────────────────────
  const modelsUsedMap = {
    ideator: ideatorResult?.modelUsed || 'unknown',
    scout: scoutResult?.modelUsed || 'unknown',
    analyst: analystResult?.modelUsed || 'unknown'
  };
  if (plannerResult?.modelUsed) modelsUsedMap.planner = plannerResult.modelUsed;

  const output = {
    generated_at: new Date().toISOString(),
    ideator: extractIdeatorJSON(ideatorRaw),
    scout: scoutRaw,
    pending_ideas: top5,
    analyst,
    planner,
    hook_script: null,
    selected_idea: null,
    models_used: modelsUsedMap,
    primary_model: ideatorResult?.modelUsed || (global.modelsUsed || [])[0] || 'unknown'
  };
  [OUT_PATH1, OUT_PATH2].forEach(p => {
    fs.mkdirSync(path.dirname(p),{recursive:true});
    atomicWrite(p, output);
  });
  console.log('\n✅ Done. '+top5.length+' ideas ready in pending_ideas.json');
  console.log('📱 Reply 1-5 on Telegram to generate a script for your chosen idea.');
}

module.exports = { run: main };
if (require.main === module) {
  main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
}
