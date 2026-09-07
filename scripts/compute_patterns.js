const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function safeRead(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch(e) { return fallback; }
}

function asArray(val, key) {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val[key])) return val[key];
  return [];
}

function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function groupBy(arr, keyFn, valueFn) {
  const map = {};
  arr.forEach(item => {
    const k = keyFn(item) || 'unknown';
    if (!map[k]) map[k] = [];
    map[k].push(valueFn(item) || 0);
  });
  return Object.entries(map)
    .map(([k, vals]) => ({ type: k, avg: Math.round(avg(vals)*100)/100, count: vals.length }))
    .sort((a,b) => b.avg - a.avg);
}

// Load all data
const rawArchive   = safeRead(path.join(ROOT,'second_brain/performance_archive.json'), []);
const rawLog       = safeRead(path.join(ROOT,'second_brain/content_log.json'), []);
const rawHookBank  = safeRead(path.join(ROOT,'second_brain/hook_bank.json'), {});
const rawScripts   = safeRead(path.join(ROOT,'second_brain/competitor_scripts.json'), {});
const rawData      = safeRead(path.join(ROOT,'dashboard/data/data.json'), {});

const archive      = asArray(rawArchive, 'posts');
const contentLog   = asArray(rawLog, 'posts');
const hookBank     = asArray(rawHookBank, 'hooks');
const compScripts  = asArray(rawScripts, 'scripts');
const followers    = (rawData.your_account && rawData.your_account.followers) || 5845;

// ============================================================
// SIGNAL 1: YOUR OWN PERFORMANCE — from performance_archive
// ============================================================
function getLikes(p) { return p.finalLikes || p.likes_at_48h || p.likes || 0; }
function getEng(p)   { return p.engagementRate || p.engagement_rate_48h || 0; }
function getHook(p)  { return p.hook_type || p.hookType || 'unknown'; }
function getFormat(p){ return p.format || 'reel'; }

const yourByHook   = groupBy(archive, getHook,   getLikes);
const yourByFormat = groupBy(archive, getFormat, getLikes);
const yourTopHooks = [...archive].sort((a,b)=>getLikes(b)-getLikes(a)).slice(0,5);

// ============================================================
// SIGNAL 2: DIFF LEARNING — what edits you make → performance
// ============================================================
const diffInsights = [];
const diffPosts = contentLog.filter(c => c.diffAnalysis && c.archived);

// Join with archive for performance
for (const logEntry of diffPosts) {
  const archEntry = archive.find(a => a.id === logEntry.id);
  if (!archEntry) continue;
  const eng = getEng(archEntry) || ((getLikes(archEntry) + (archEntry.finalComments||archEntry.comments_at_48h||0)) / followers * 100);
  diffPosts._enriched = diffPosts._enriched || [];
  diffInsights.push({
    type: logEntry.diffAnalysis.type,
    keptPercent: logEntry.diffAnalysis.keptPercent || 0,
    wordsAdded: (logEntry.diffAnalysis.wordsAdded || []).length,
    wordsRemoved: (logEntry.diffAnalysis.wordsRemoved || []).length,
    likes: getLikes(archEntry),
    eng: Math.round(eng*100)/100
  });
}

let diffLearning = 'Not enough diff data yet (need posted videos that used generated scripts).';
if (diffInsights.length >= 2) {
  const agentUsed    = diffInsights.filter(d => d.type === 'agent_script_used');
  const selfScripted = diffInsights.filter(d => d.type === 'agent_idea_own_script');
  const highKept     = agentUsed.filter(d => d.keptPercent >= 70);
  const lowKept      = agentUsed.filter(d => d.keptPercent < 70);
  const avgEngHighKept = highKept.length ? Math.round(avg(highKept.map(d=>d.eng))*100)/100 : null;
  const avgEngLowKept  = lowKept.length  ? Math.round(avg(lowKept.map(d=>d.eng))*100)/100  : null;
  const avgEngSelf     = selfScripted.length ? Math.round(avg(selfScripted.map(d=>d.eng))*100)/100 : null;

  const lines = [];
  if (avgEngHighKept !== null) lines.push(`Posts where you kept 70%+ of generated script: avg ${avgEngHighKept}% engagement (${highKept.length} posts)`);
  if (avgEngLowKept  !== null) lines.push(`Posts where you rewrote most of the script: avg ${avgEngLowKept}% engagement (${lowKept.length} posts)`);
  if (avgEngSelf     !== null) lines.push(`Posts where you used your own script on agent idea: avg ${avgEngSelf}% engagement (${selfScripted.length} posts)`);
  if (avgEngHighKept !== null && avgEngLowKept !== null) {
    const diff = avgEngHighKept - avgEngLowKept;
    lines.push(diff > 0
      ? `INSIGHT: Using the generated script closely gives +${diff.toFixed(2)}% more engagement. Stay closer to the script.`
      : `INSIGHT: Your rewrites outperform generated scripts by ${Math.abs(diff).toFixed(2)}%. The agent should match your rewriting style.`);
  }
  diffLearning = lines.join('\n');
}

// ============================================================
// SIGNAL 3: COMPETITOR HOOK PATTERNS — by type and length
// ============================================================
const nicheByHook    = groupBy(hookBank, h => h.type || h.hook_type || classifyHook(h.hook || h.text || ''), h => h.likes || h.likesCount || 0);
const nicheTopHooks  = [...hookBank].sort((a,b)=>(b.likes||b.likesCount||0)-(a.likes||a.likesCount||0)).slice(0,5);

// Classify hooks by opening pattern
function classifyHook(text) {
  if (!text) return 'unknown';
  const t = text.toLowerCase().trim();
  if (t.startsWith('i ') || t.startsWith("i'")) return 'personal_story';
  if (t.includes('?')) return 'question';
  if (/^\d+/.test(t)) return 'list_number';
  if (t.startsWith('how ') || t.startsWith('why ') || t.startsWith('what ')) return 'how_why_what';
  if (t.includes('nobody') || t.includes('stop') || t.includes('never')) return 'contrarian';
  if (t.includes('secret') || t.includes('hidden') || t.includes("don't tell")) return 'secret_reveal';
  return 'statement';
}

// Hook length analysis
const shortHooks = hookBank.filter(h => (h.hook||h.text||'').split(' ').length <= 8);
const longHooks  = hookBank.filter(h => (h.hook||h.text||'').split(' ').length > 8);
const avgLikesShort = shortHooks.length ? Math.round(avg(shortHooks.map(h=>h.likes||h.likesCount||0))) : 0;
const avgLikesLong  = longHooks.length  ? Math.round(avg(longHooks.map(h=>h.likes||h.likesCount||0)))  : 0;
const hookLengthInsight = shortHooks.length && longHooks.length
  ? (avgLikesShort > avgLikesLong
      ? `Short hooks (≤8 words) outperform long hooks by ${Math.round((avgLikesShort-avgLikesLong)/avgLikesLong*100)}% in your niche. Keep hooks concise.`
      : `Longer hooks (>8 words) outperform short hooks in your niche. Don't over-simplify.`)
  : 'Not enough hook length data yet.';

// ============================================================
// SIGNAL 4: VIRAL COMPETITOR SCRIPT BLUEPRINTS
// ============================================================
const topBlueprints = [...compScripts]
  .filter(s => s.verdict === 'viral' || s.verdict === 'high' || (s.engagement_rate||0) > 2)
  .sort((a,b) => (b.engagement_rate||0)-(a.engagement_rate||0))
  .slice(0, 3);

const blueprintText = topBlueprints.length
  ? topBlueprints.map(b =>
      `${b.account} | Topic: ${b.topic||'AI'} | Pattern: ${b.script_pattern||'story'} | Eng: ${b.engagement_rate||0}%\nHook: "${b.hook||''}"\nOpening: "${(b.full_caption||b.caption||'').substring(0,200)}..."`
    ).join('\n\n')
  : 'No viral blueprints yet — accumulating data.';

// ============================================================
// COMBINE — build instruction string for agents
// ============================================================
const yourBest  = yourByHook[0]?.type || null;
const nicheBest = nicheByHook[0]?.type || null;
const agreedBest = (yourBest === nicheBest && yourBest) ? yourBest : yourBest || nicheBest || 'curiosity_gap';
const confidence = (yourBest === nicheBest && yourBest)
  ? 'HIGH CONFIDENCE — your data and niche data agree.'
  : 'Use your own data as primary, niche as validation.';

const instruction = `
WHAT WORKS FOR @garvit.irl — YOUR OWN DATA (${archive.length} posts analyzed):
Best hook type: ${yourBest || 'not enough data yet'}
Best format: ${yourByFormat[0]?.type || 'not enough data yet'}
Your top hooks by performance: ${yourTopHooks.map(h=>`"${h.hook||h.hookText||''}"`).join(' | ') || 'none yet'}

SCRIPT DIFF LEARNING — WHAT YOUR EDITS REVEAL:
${diffLearning}

WHAT WORKS IN YOUR NICHE — COMPETITOR DATA (${hookBank.length} hooks, ${compScripts.length} scripts):
Best hook type in niche: ${nicheBest || 'not enough data'}
Hook length insight: ${hookLengthInsight}
Top niche hooks: ${nicheTopHooks.map(h=>`"${h.hook||h.text||''}" (${h.likes||h.likesCount||0} likes)`).join(' | ') || 'none yet'}

COMBINED RECOMMENDATION (${confidence}):
Prioritise "${agreedBest}" style hooks. ${hookLengthInsight}

TOP VIRAL SCRIPT BLUEPRINTS FROM YOUR NICHE:
${blueprintText}

When writing scripts: match the pattern and energy of the blueprints above. Make content original. Never copy — remix.
`.trim();

// ============================================================
// WRITE OUTPUTS
// ============================================================
const agentContext = {
  updated_at: new Date().toISOString(),
  your_performance: {
    posts_analyzed: archive.length,
    best_hook_type: yourBest,
    best_format: yourByFormat[0]?.type || null,
    by_hook_type: yourByHook,
    by_format: yourByFormat,
    top_hooks: yourTopHooks
  },
  diff_learning: {
    posts_with_diff: diffInsights.length,
    insights: diffLearning
  },
  niche_performance: {
    total_hooks: hookBank.length,
    total_scripts: compScripts.length,
    viral_scripts: compScripts.filter(s=>s.verdict==='viral').length,
    best_hook_type: nicheBest,
    hook_length_insight: hookLengthInsight,
    by_hook_type: nicheByHook,
    top_hooks: nicheTopHooks
  },
  competitor_script_blueprints: topBlueprints,
  instruction_for_agents: instruction
};

fs.writeFileSync(path.join(ROOT,'second_brain/agent_context.json'), JSON.stringify(agentContext, null, 2));

const patterns = {
  updated_at: new Date().toISOString(),
  total_posts_analyzed: archive.length,
  best_hook_types: yourByHook.map(h=>h.type),
  best_formats: yourByFormat.map(f=>({format:f.type, avgLikes:f.avg, posts:f.count})),
  top_performing_hooks: yourTopHooks,
  diff_learning: diffLearning,
  hook_length_insight: hookLengthInsight,
  summary: `@garvit.irl (${archive.length} posts): best hook = ${yourBest||'TBD'}, best format = ${yourByFormat[0]?.type||'TBD'}. DIFF: ${diffLearning.split('\n')[0]}. NICHE (${hookBank.length} hooks): ${hookLengthInsight} Best niche hook type: ${nicheBest||'TBD'}. ${topBlueprints.length} viral blueprints active.`
};

fs.writeFileSync(path.join(ROOT,'second_brain/patterns.json'), JSON.stringify(patterns, null, 2));

console.log(`✅ Patterns computed.`);
console.log(`   Your data: ${archive.length} posts | Diff insights: ${diffInsights.length} posts`);
console.log(`   Niche: ${hookBank.length} hooks | ${compScripts.length} scripts | ${topBlueprints.length} blueprints active`);
console.log(`   Hook length: ${hookLengthInsight}`);
