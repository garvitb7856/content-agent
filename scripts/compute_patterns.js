const fs = require('fs');

const archive = JSON.parse(fs.readFileSync('second_brain/performance_archive.json', 'utf8'));
const hookBank = JSON.parse(fs.readFileSync('second_brain/hook_bank.json', 'utf8'));
const compScripts = JSON.parse(fs.readFileSync('second_brain/competitor_scripts.json', 'utf8'));
const contentLog = JSON.parse(fs.readFileSync('second_brain/content_log.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('dashboard/data/data.json', 'utf8'));
const followers = (data.your_account && data.your_account.followers) || 5845;

// --- SIGNAL 1: YOUR OWN ALL-TIME PERFORMANCE ---
const completedPosts = contentLog.posts.filter(p => p.performance_complete);

// Update archive with any newly completed posts
const archiveIds = new Set(archive.posts.map(p => p.id));
completedPosts.forEach(p => {
  if (archiveIds.has(p.id)) return;
  const eng = ((p.likes_at_48h + p.comments_at_48h) / followers) * 100;
  archive.posts.push({
    id: p.id, url: p.url, hook: p.caption_first_line,
    hook_type: p.hook_type, format: p.format,
    detected_at: p.detected_at,
    likes_48h: p.likes_at_48h, comments_48h: p.comments_at_48h,
    engagement_rate_48h: Math.round(eng * 100) / 100,
    verdict: eng > 3 ? 'high' : eng > 1 ? 'medium' : 'low'
  });
});
fs.writeFileSync('second_brain/performance_archive.json', JSON.stringify(archive, null, 2));

// Compute your own signals from ALL archive posts (all time)
function groupBy(arr, key, valueKey) {
  const map = {};
  arr.forEach(item => {
    const k = item[key] || 'unknown';
    if (!map[k]) map[k] = [];
    map[k].push(item[valueKey] || 0);
  });
  return Object.entries(map)
    .map(([k, vals]) => ({ type: k, avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length), count: vals.length }))
    .sort((a,b) => b.avg - a.avg);
}

const yourByHook = groupBy(archive.posts, 'hook_type', 'likes_48h');
const yourByFormat = groupBy(archive.posts, 'format', 'likes_48h');
const yourTopHooks = [...archive.posts].sort((a,b) => b.likes_48h - a.likes_48h).slice(0,5);

// --- SIGNAL 2: COMPETITOR NICHE PATTERNS (all accumulated data) ---
const nicheByHook = groupBy(hookBank.hooks, 'type', 'likes');
const nicheTopHooks = [...hookBank.hooks].sort((a,b) => b.likes - a.likes).slice(0,5);

// --- SIGNAL 3: VIRAL COMPETITOR SCRIPT BLUEPRINTS ---
const topBlueprints = [...compScripts.scripts]
  .filter(s => s.verdict === 'viral' || s.verdict === 'high')
  .sort((a,b) => b.engagement_rate - a.engagement_rate)
  .slice(0,3);

// --- COMBINE ---
const yourBest = yourByHook[0] ? yourByHook[0].type : null;
const nicheBest = nicheByHook[0] ? nicheByHook[0].type : null;
const agreedBest = yourBest === nicheBest && yourBest ? yourBest : yourBest || nicheBest || 'curiosity_gap';
const confidence = yourBest === nicheBest && yourBest ? 'HIGH CONFIDENCE — your data and niche data agree.' : 'Use your own data as primary, niche as validation.';

const blueprintText = topBlueprints.length
  ? topBlueprints.map(b =>
      `${b.account} | Topic: ${b.topic} | Pattern: ${b.script_pattern} | Eng: ${b.engagement_rate}%\nHook: "${b.hook}"\nOpening: "${b.full_caption.substring(0,200)}..."`
    ).join('\n\n')
  : 'No viral blueprints yet — accumulating data.';

const yourHookText = yourTopHooks.length
  ? yourTopHooks.map(h => `"${h.hook}" (${h.likes_48h} likes)`).join(' | ')
  : 'No personal performance data yet.';

const nicheHookText = nicheTopHooks.length
  ? nicheTopHooks.map(h => `"${h.text}" — ${h.account} (${h.likes} likes)`).join(' | ')
  : 'No niche hook data yet.';

const instruction = `
WHAT WORKS FOR @garvit.irl — YOUR OWN ALL-TIME DATA (${archive.posts.length} posts analyzed):
Best hook type: ${yourBest || 'not enough data yet'}
Best format: ${yourByFormat[0] ? yourByFormat[0].type : 'not enough data yet'}
Your top hooks that got real results: ${yourHookText}

WHAT WORKS IN YOUR NICHE — COMPETITOR ALL-TIME DATA (${hookBank.hooks.length} hooks, ${compScripts.scripts.length} scripts analyzed):
Best hook type in niche: ${nicheBest || 'not enough data'}
Top niche hooks by engagement: ${nicheHookText}

COMBINED RECOMMENDATION (${confidence}):
Prioritise "${agreedBest}" style hooks. Match niche patterns but keep content original for @garvit.irl.

TOP VIRAL SCRIPT BLUEPRINTS FROM YOUR NICHE — USE THESE AS STRUCTURAL REFERENCE:
${blueprintText}

When writing scripts: match the pattern and energy of the blueprints above. Make content original. Never copy — remix.
`.trim();

const agentContext = {
  updated_at: new Date().toISOString(),
  your_performance: {
    posts_analyzed: archive.posts.length,
    best_hook_type: yourBest,
    best_format: yourByFormat[0] ? yourByFormat[0].type : null,
    by_hook_type: yourByHook,
    top_hooks: yourTopHooks
  },
  niche_performance: {
    total_hooks: hookBank.hooks.length,
    total_scripts: compScripts.scripts.length,
    viral_scripts: compScripts.scripts.filter(s=>s.verdict==='viral').length,
    best_hook_type: nicheBest,
    by_hook_type: nicheByHook,
    top_hooks: nicheTopHooks
  },
  competitor_script_blueprints: topBlueprints,
  instruction_for_agents: instruction
};

fs.writeFileSync('second_brain/agent_context.json', JSON.stringify(agentContext, null, 2));

// Also update patterns.json summary
const patterns = {
  updated_at: new Date().toISOString(),
  total_posts_analyzed: archive.posts.length,
  best_hook_types: yourByHook.map(h=>h.type),
  best_formats: yourByFormat.map(f=>f.type),
  top_performing_hooks: yourTopHooks,
  summary: archive.posts.length >= 3
    ? `Based on ${archive.posts.length} posts for @garvit.irl: best hook = ${yourBest}, best format = ${yourByFormat[0]?.type}. Niche data: ${hookBank.hooks.length} hooks, ${compScripts.scripts.filter(s=>s.verdict==='viral').length} viral scripts stored.`
    : `Not enough personal data yet (${archive.posts.length}/3 posts). Using niche data from ${hookBank.hooks.length} competitor hooks.`
};
fs.writeFileSync('second_brain/patterns.json', JSON.stringify(patterns, null, 2));
console.log(`Patterns computed. Your data: ${archive.posts.length} posts. Niche: ${hookBank.hooks.length} hooks, ${compScripts.scripts.length} scripts (${topBlueprints.length} blueprints active).`);
