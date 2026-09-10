const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── MODEL POOL ────────────────────────────────────────────────
const MODEL_POOL = [
  'gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash',
  'gemini-3.5-flash','gemini-3.0-flash','gemini-2.5-flash',
  'gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemini-3.1-flash-lite'
];

async function callGemini(prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const key = process.env.GEMINI_SCRIPT_KEY || process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(key);
  for (const modelId of MODEL_POOL) {
    try {
      console.log(`  Trying [${modelId}]...`);
      const model = genAI.getGenerativeModel({ model: modelId, generationConfig: { maxOutputTokens: 8192, temperature: 0.9 } });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`  Done with ${modelId} (${text.length} chars)`);
      return { text, modelUsed: modelId };
    } catch(e) {
      const msg = e.message || '';
      if (msg.includes('429') || msg.includes('503')) {
        console.log(`  [${modelId} rate limited — trying next]`);
        await new Promise(r => setTimeout(r, 30000));
      } else {
        console.log(`  [${modelId} failed: ${msg.slice(0,60)}]`);
      }
    }
  }
  throw new Error('All models exhausted');
}

// ── LOAD INTELLIGENCE ─────────────────────────────────────────
function loadIntelligence() {
  const cutoff60 = Date.now() - (60 * 24 * 60 * 60 * 1000);
  const safeRead = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return d; } };

  const hookBankRaw = safeRead(path.join(ROOT, 'second_brain/hook_bank.json'), []);
  const hookBank = Array.isArray(hookBankRaw) ? hookBankRaw : (hookBankRaw.hooks || []);

  const compScriptsRaw = safeRead(path.join(ROOT, 'second_brain/competitor_scripts.json'), []);
  const compScripts = Array.isArray(compScriptsRaw) ? compScriptsRaw : (compScriptsRaw.scripts || []);

  const patterns = safeRead(path.join(ROOT, 'second_brain/patterns.json'), {});
  const agentCtx = safeRead(path.join(ROOT, 'second_brain/agent_context.json'), {});
  const trends = safeRead(path.join(ROOT, 'second_brain/trends.json'), {});

  // Load transcripts
  const transcriptsDir = path.join(ROOT, 'second_brain/transcripts');
  let transcripts = [];
  if (fs.existsSync(transcriptsDir)) {
    transcripts = fs.readdirSync(transcriptsDir)
      .filter(f => f.endsWith('.json') && f !== 'transcribed_ids.json')
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(transcriptsDir, f), 'utf8')); } catch(e) { return null; } })
      .filter(t => t && t.transcript && t.transcript !== 'NO_SPEECH')
      .filter(t => {
        if (!t.transcribedAt) return true; // include if no date
        return new Date(t.transcribedAt).getTime() >= cutoff60;
      });
  }

  // Load my own data for CTA patterns
  const dataRaw = safeRead(path.join(ROOT, 'dashboard/data.json'), {});
  const me = dataRaw.your_account || {};
  const myTopPosts = (me.posts || me.recent_posts || [])
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 5);

  // Competitor top posts for CTA patterns
  const rawComps = dataRaw.competitors || {};
  const competitors = Array.isArray(rawComps)
    ? rawComps
    : Object.entries(rawComps).map(([k, v]) => ({ username: k, ...v }));
  const compTopPosts = competitors.flatMap(c =>
    (c.posts || c.recent_posts || [])
      .filter(p => {
        const ts = p.timestamp ? p.timestamp * 1000 : (p.taken_at ? p.taken_at * 1000 : 0);
        return ts === 0 || ts >= cutoff60;
      })
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 2)
      .map(p => ({ ...p, handle: c.username }))
  ).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 10);

  let competitorCaptions = [];
  try {
    const ccPath = path.join(ROOT, 'second_brain/competitor_captions.json');
    if (fs.existsSync(ccPath)) {
      const cc = JSON.parse(fs.readFileSync(ccPath, 'utf8'));
      competitorCaptions = (cc.captions || []).slice(0, 10);
    }
  } catch(e) {}

  return { hookBank, compScripts, patterns, agentCtx, trends, transcripts, myTopPosts, compTopPosts, competitorCaptions };
}

// ── BUILD SCRIPT PROMPT ───────────────────────────────────────
function buildScriptPrompt(idea, intel) {
  const { hookBank, compScripts, patterns, agentCtx, trends, transcripts, myTopPosts, compTopPosts, competitorCaptions = [] } = intel;

  const capContext = competitorCaptions.length
    ? `\nTOP COMPETITOR CAPTIONS (study their caption structure, hooks, CTAs, emojis):\n` +
      competitorCaptions.map(p=>`@${p.username} (${p.likes} likes):\n${p.caption.slice(0,350)}`).join('\n---\n')
    : '';

  // Top hooks sorted by likes (last 60 days)
  const cutoff60 = Date.now() - (60 * 24 * 60 * 60 * 1000);
  const recentHooks = hookBank.filter(h => {
    const ts = h.timestamp ? h.timestamp * 1000 : (h.postedAt ? new Date(h.postedAt).getTime() : 0);
    return ts === 0 || ts >= cutoff60; // fallback: include if no date field
  });
  const topHooks = recentHooks
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 15)
    .map(h => `  [${h.type || 'hook'}] [${h.source === 'transcript' ? 'SPOKEN' : 'caption'}] "${(h.hook || h.text || '').slice(0, 100)}" — @${h.handle || ''} (${h.likes || 0} likes)`)
    .join('\n');

  // Viral transcript structures (top 5 by likes)
  const viralTranscripts = transcripts
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 5)
    .map(t => `  @${t.handle} (${t.likes || 0} likes):\n  "${t.transcript.slice(0, 300)}..."`)
    .join('\n\n');

  // CTA patterns from my top posts
  const myCtaPatterns = myTopPosts
    .map(p => `  (${p.likes || 0} likes) "${(p.caption || '').slice(-100).replace(/\n/g,' ')}"`)
    .join('\n');

  // CTA patterns from competitor top posts
  const compCtaPatterns = compTopPosts
    .map(p => `  @${p.handle} (${p.likes || 0} likes) "${(p.caption || '').slice(-100).replace(/\n/g,' ')}"`)
    .join('\n');

  // Best format + time
  const bestFormats = (patterns.bestFormats || ['Reel']).join(', ');
  const bestTime = patterns.bestPostTimes?.[0] || '6:00 PM - 9:00 PM IST';

  // Relevant trends
  const trendLines = (trends.trends || []).slice(0, 8)
    .map(t => `  [${t.source}] ${t.title}`)
    .join('\n');

  return `
You are an expert viral content strategist for @garvit.irl on Instagram.
Niche: AI + Automation + Tech + Entrepreneurship. Indian audience.

YOUR TASK: Generate a complete, ready-to-film content package for this idea:
"${idea}"

═══════════════════════════════════════════════════════
ACCOUNT INTELLIGENCE BRIEFING — apply this to everything you write
═══════════════════════════════════════════════════════
${agentCtx.instruction_for_agents || 'No briefing available yet — use general best practices.'}

═══════════════════════════════════════════════════════
INTELLIGENCE DATABASE — study all of this before writing
═══════════════════════════════════════════════════════

TOP PERFORMING HOOKS (sorted by likes, [SPOKEN] = from actual video transcript):
${topHooks}

VIRAL VIDEO STRUCTURES — LAST 60 DAYS (recent top-performing reels only):
${viralTranscripts}

CTA PATTERNS — FROM MY TOP POSTS (what endings work for @garvit.irl):
${myCtaPatterns}

CTA PATTERNS — FROM COMPETITOR VIRAL POSTS (what endings work in this niche):
${compCtaPatterns}
${capContext}

CURRENT TRENDS (use for relevance):
${trendLines}

BEST FORMAT: ${bestFormats}
BEST POSTING TIME: ${bestTime}

═══════════════════════════════════════════════════════
YOUR JOB — INTELLIGENT DECISIONS:
═══════════════════════════════════════════════════════
Before writing, think through:
1. What emotion does this idea trigger? (curiosity / FOMO / surprise / inspiration)
2. What hook TYPE fits this topic best? (question / pattern_interrupt / story / list)
3. Which viral structure from the transcripts fits this idea?
4. Which CTA pattern (from my posts OR competitors) fits this content?
Use your own intelligence to pick the best combination. Do not just pick random hooks.

═══════════════════════════════════════════════════════
OUTPUT FORMAT — deliver ALL of the following:
═══════════════════════════════════════════════════════

## CONTENT STRATEGY
Topic category: [AI tool / tutorial / trend commentary / personal story / expose]
Target emotion: [what the viewer feels]
Hook type chosen: [question / pattern_interrupt / story / list / value]
Why this hook: [one sentence explaining your strategic choice]
Structure used: [inspired by which creator/transcript]

## SPOKEN SCRIPT

[0-3s — HOOK]
(Spoken words only — max 10 words — this is what you say first on camera)

[3-15s — LOOP / TENSION]
(Keep viewer watching — tease the payoff without revealing it)

[15-45s — BODY]
(Main content — step by step or story beats — natural spoken language)

[45-55s — PAYOFF]
(The promised value delivered)

[55-60s — CTA]
(Call to action — based on what works for this niche — casual and natural)

## PRODUCTION NOTES

[0-3s] On screen: | B-roll: | Text overlay:
[3-15s] On screen: | B-roll: | Text overlay:
[15-45s] On screen: | B-roll: | Text overlay:
[45-55s] On screen: | B-roll: | Text overlay:
[55-60s] On screen: | B-roll: | Text overlay:

## CAPTION
(Full Instagram caption — hook line, 3-4 body lines, CTA, line breaks)

## HASHTAGS
(20 relevant hashtags — mix of niche, trending, and broad)

## THUMBNAIL IDEA
(One sentence describing the thumbnail — text overlay + visual)

## HOOK ALTERNATIVES
Option A: [different hook for A/B testing]
Option B: [different hook for A/B testing]
Option C: [different hook for A/B testing]

═══════════════════════════════════════════════════════
RULES:
- Script must sound natural when SPOKEN, not read
- Hook must be under 10 words and create immediate curiosity
- No hashtags in the caption body
- Caption CTA must match the video CTA
- Total video should be 45-60 seconds
`.trim();
}

// ── SEND TO TELEGRAM ─────────────────────────────────────────
async function sendTelegram(text, chatId) {
  const chunks = [];
  const stripped = text.replace(/[*_`#]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const lines = stripped.split('\n');
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > 3900) {
      chunks.push(current.trim());
      current = line;
    } else {
      current += '\n' + line;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  for (const chunk of chunks) {
    await new Promise((resolve, reject) => {
      const body = JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true });
      const opts = {
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      };
      const req = require('https').request(opts, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const p = JSON.parse(d);
            p.ok ? resolve(p) : reject(new Error(p.description));
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── MAIN ─────────────────────────────────────────────────────
async function main() {
  // Get idea from args or pending brief
  let idea = '';
  let chatId = CHAT_ID;

  const ideaIndex = process.argv.indexOf('--idea');
  const customIndex = process.argv.indexOf('--custom');
  const briefIndex = process.argv.indexOf('--from-brief');

  if (ideaIndex !== -1) {
    idea = process.argv[ideaIndex + 1];
  } else if (customIndex !== -1) {
    idea = process.env.CUSTOM_IDEA || process.argv[customIndex + 1] || '';
  } else if (briefIndex !== -1) {
    const briefPath = path.join(ROOT, 'second_brain/pending_brief.json');
    if (fs.existsSync(briefPath)) {
      const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
      idea = brief.idea || brief.text || '';
      chatId = brief.chat_id || CHAT_ID;
    }
  }

  // Also check pending_brief_text.txt for long ideas
  const briefTextPath = path.join(ROOT, 'second_brain/pending_brief_text.txt');
  if (!idea && fs.existsSync(briefTextPath)) {
    idea = fs.readFileSync(briefTextPath, 'utf8').trim();
  }

  // Load from pending_ideas if numeric index
  if (!idea || /^\d+$/.test(idea.trim())) {
    const idx = parseInt(idea) - 1;
    const pending = JSON.parse(fs.readFileSync(path.join(ROOT, 'second_brain/pending_ideas.json'), 'utf8'));
    const ideas = Array.isArray(pending) ? pending : (pending.ideas || []);
    
    // Also try ideator output for numbers > 5
    if (isNaN(idx) || idx < 0) {
      console.error('No idea provided');
      process.exit(1);
    }
    
    if (idx < ideas.length) {
      const selected = ideas[idx];
      idea = selected.title || selected.idea || JSON.stringify(selected);
    } else {
      // Try full ideator list
      const agentsOut = JSON.parse(fs.readFileSync(path.join(ROOT, 'dashboard/agents_output.json'), 'utf8'));
      let allIdeas = agentsOut.ideator;
      if (typeof allIdeas === 'string') { try { allIdeas = JSON.parse(allIdeas); } catch(e) {} }
      if (Array.isArray(allIdeas) && allIdeas[idx]) {
        const sel = allIdeas[idx];
        idea = sel.title || sel.idea || JSON.stringify(sel);
      }
    }
  }

  if (!idea) {
    console.error('No idea found');
    process.exit(1);
  }

  console.log(`\n🎬 Generating script for: "${idea.slice(0, 80)}..."`);
  console.log('Loading intelligence database...');

  const intel = loadIntelligence();
  console.log(`  Hooks loaded: ${intel.hookBank.length}`);
  console.log(`  Transcripts loaded: ${intel.transcripts.length}`);
  console.log(`  Competitor scripts: ${intel.compScripts.length}`);

  const prompt = buildScriptPrompt(idea, intel);
  console.log('Calling Gemini...');

  const { text, modelUsed } = await callGemini(prompt);

  const output = `🎬 CONTENT PACKAGE\n📌 Idea: "${idea}"\n🤖 Generated by: ${modelUsed}\n\n${text}`;

  console.log('\nSending to Telegram...');
  await sendTelegram(output, chatId);
  console.log('✅ Script sent to Telegram!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
