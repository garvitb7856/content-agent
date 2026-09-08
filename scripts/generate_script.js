const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname,'../.env') });

const BRIEF_FILE = path.join(__dirname, '../second_brain/pending_brief.json');
const fromBrief = process.argv.includes('--from-brief');

let arg = process.argv[2];
let isCustom = process.argv.includes('--custom');

if (fromBrief) {
  try {
    const brief = JSON.parse(fs.readFileSync(BRIEF_FILE, 'utf8'));
    process.env.TELEGRAM_CHAT_ID = brief.chat_id;
    const msg = (brief.brief || '').trim();
    if (/^\d+$/.test(msg)) {
      arg = msg;
      isCustom = false;
    } else {
      arg = '--custom';
      isCustom = true;
      // Write brief text to a temp file so it's read fresh, not from env
      const fs2 = require('fs');
      const briefTextFile = path.join(__dirname, '../second_brain/pending_brief_text.txt');
      fs2.writeFileSync(briefTextFile, msg, 'utf8');
    }
  } catch(e) {
    console.error('Could not read pending_brief.json:', e.message);
    process.exit(1);
  }
}

const GEMINI_KEY = process.env.GEMINI_SCRIPT_KEY || process.env.GEMINI_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ROOT = path.join(__dirname,'..');
const PENDING_PATH = path.join(ROOT,'second_brain/pending_ideas.json');
const OUT_PATH1 = path.join(ROOT,'dashboard/data/agents_output.json');
const OUT_PATH2 = path.join(ROOT,'dashboard/agents_output.json');
const DATA_PATH = path.join(ROOT,'dashboard/data/data.json');

const briefTextFile = path.join(__dirname, '../second_brain/pending_brief_text.txt');
let customIdea = process.env.CUSTOM_IDEA || '';
if (!customIdea && fs.existsSync(briefTextFile)) {
  customIdea = fs.readFileSync(briefTextFile, 'utf8').trim();
}
const customIdeaText = isCustom ? (customIdea || (process.argv.indexOf('--custom') !== -1 ? process.argv[process.argv.indexOf('--custom') + 1] : null) || null) : null;
const rawIndex = customIdeaText ? null : parseInt(arg);
if (!customIdeaText && (isNaN(rawIndex) || rawIndex < 1 || rawIndex > 50)) {
  console.error('❌ Usage: node scripts/generate_script.js <1-50>  OR  --custom "your idea"'); process.exit(1);
}
const ideaIndex = rawIndex ? rawIndex - 1 : -1;

async function gemini(prompt) {
  const models=['gemini-3.7-flash','gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.0-flash','gemini-2.5-flash','gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemini-3.1-flash-lite'];
  for (const model of models) {
    const postData=JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.8,maxOutputTokens:8192}});
    const options={hostname:'generativelanguage.googleapis.com',port:443,path:'/v1beta/models/'+model+':generateContent?key='+GEMINI_KEY,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(postData)}};
    try {
      const {statusCode,body}=await new Promise((resolve,reject)=>{
        const req=https.request(options,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({statusCode:res.statusCode,body:d}));});
        req.on('error',reject);req.write(postData);req.end();
      });
      if (statusCode>=200&&statusCode<300) {
        const text=JSON.parse(body).candidates[0]?.content?.parts[0]?.text?.trim();
        if (text&&text.length>50) { console.log('✅ Generated ('+model+', '+text.length+' chars)'); return { text, modelUsed: model }; }
      }
      if (statusCode===503||statusCode===429) {
        console.log('⚠️ ' + model + ' returned HTTP ' + statusCode + ' — waiting 30s then retrying...');
        await new Promise(r => setTimeout(r, 30000));
        // retry same model once
        try {
          const retry = await new Promise((resolve,reject)=>{
            const req2=https.request(options,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({statusCode:res.statusCode,body:d}));});
            req2.on('error',reject);req2.write(postData);req2.end();
          });
          if (retry.statusCode>=200&&retry.statusCode<300) {
            const text=JSON.parse(retry.body).candidates[0]?.content?.parts[0]?.text?.trim();
            if (text&&text.length>50) { console.log('✅ Generated ('+model+' retry, '+text.length+' chars)'); return { text, modelUsed: model }; }
          }
        } catch(e) {}
        console.log('⚠️ ' + model + ' retry failed — trying next model...');
        continue;
      }
    } catch(e) { console.log('⚠️ '+model+': '+e.message); }
  }
  return { text: '[Script generation failed]', modelUsed: 'unknown' };
}

function cleanForTelegram(text) {
  return text
    .replace(/#{1,4}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^(\d+)\.\s+/gm, '$1. ')
    .replace(/&/g, '&amp;')
    .replace(/</g, (m, offset, str) => {
      const after = str.substring(offset);
      if (/^<\/?(?:b|i|code|pre|a)[\s>]/.test(after)) return m;
      return '&lt;';
    })
    .trim();
}

async function sendTelegram(text) {
  const plain = text
    .replace(/#{1,4}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/<[^>]+>/g, '')
    .trim();
  const chunks = [];
  const lines = plain.split('\n');
  let chunk = '';
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 3900) {
      if (chunk) chunks.push(chunk.trim());
      chunk = line;
    } else {
      chunk += (chunk ? '\n' : '') + line;
    }
  }
  if (chunk) chunks.push(chunk.trim());
  console.log('Sending ' + chunks.length + ' chunk(s) to Telegram...');
  for (let i = 0; i < chunks.length; i++) {
    const body = JSON.stringify({ chat_id: CHAT_ID, text: chunks[i] });
    await new Promise((resolve, reject) => {
      const options = { hostname: 'api.telegram.org', path: '/bot' + BOT_TOKEN + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
      const req = https.request(options, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          let parsed; try { parsed = JSON.parse(d); } catch(e) { return reject(new Error('Bad JSON: ' + d)); }
          if (!parsed.ok) { console.error('Telegram chunk ' + (i+1) + ' FAILED: ' + parsed.description + ' (code: ' + parsed.error_code + ')'); reject(new Error(parsed.description)); }
          else { console.log('Chunk ' + (i+1) + '/' + chunks.length + ' sent (' + chunks[i].length + ' chars)'); resolve(); }
        });
      });
      req.on('error', reject); req.write(body); req.end();
    });
  }
}

async function main() {
  let idea = null;
  if (customIdeaText) {
    idea = {
      title: customIdeaText,
      hook: customIdeaText,
      format: 'Reel',
      niche: 'AI & Growth',
      reasoning: 'User-submitted custom idea via Telegram',
      sourceUrl: ''
    };
  } else if (rawIndex <= 5) {
    const pending = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
    idea = pending[ideaIndex];
  } else {
    let ideatorIdeas = [];
    const parseIdeator = (raw) => {
      if (Array.isArray(raw)) return raw;
      if (raw?.ideas && Array.isArray(raw.ideas)) return raw.ideas;
      if (typeof raw === 'string') { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : (p?.ideas || []); } catch(e) {} }
      return [];
    };
    if (fs.existsSync(OUT_PATH1)) {
      try { const outData = JSON.parse(fs.readFileSync(OUT_PATH1, 'utf8')); ideatorIdeas = parseIdeator(outData.ideator); } catch(e) {}
    }
    if (!ideatorIdeas.length && fs.existsSync(OUT_PATH2)) {
      try { const outData = JSON.parse(fs.readFileSync(OUT_PATH2, 'utf8')); ideatorIdeas = parseIdeator(outData.ideator); } catch(e) {}
    }
    idea = ideatorIdeas[ideaIndex];
    if (idea && !idea.niche) idea.niche = 'AI & Growth';
    if (idea && !idea.score) idea.score = 'MEDIUM';
  }

  if (!idea) { console.error('❌ No idea at index '+ideaIndex); process.exit(1); }

  console.log('🎣 Generating script for: "'+idea.title+'"');

  const data=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
  const myFollowers=(data.your_account||{}).followers||5845;

  // ── LOAD ALL INTELLIGENCE SOURCES ──
  const patternsPath = path.join(ROOT, 'second_brain/patterns.json');
  const patterns = fs.existsSync(patternsPath) ? JSON.parse(fs.readFileSync(patternsPath, 'utf8')) : {};
  const patternInsight = patterns.summary || "Not enough data yet.";
  const bestFormats = (patterns.best_formats && patterns.best_formats.length) ? patterns.best_formats.map(f=>f.format).join(', ') : 'Reels';

  // Agent context (full intelligence briefing)
  const agentCtxPath = path.join(ROOT, 'second_brain/agent_context.json');
  const agentCtx = fs.existsSync(agentCtxPath) ? JSON.parse(fs.readFileSync(agentCtxPath, 'utf8')) : {};
  const intelligenceBriefing = agentCtx.instruction_for_agents || '';
  const topOwnPosts = (agentCtx.your_performance?.top_hooks || []).slice(0, 3)
    .map(h => `- "${h.hookText}" → ${h.finalLikes} likes, ${h.finalComments} comments (${h.url})`).join('\n');

  // Hook bank — top 10 by likes
  const hookBankPath = path.join(ROOT, 'second_brain/hook_bank.json');
  let topHooksStr = "";
  if (fs.existsSync(hookBankPath)) {
    try {
      const bankRaw = JSON.parse(fs.readFileSync(hookBankPath, 'utf8'));
      const hooksArr = Array.isArray(bankRaw) ? bankRaw : (bankRaw.hooks || []);
      topHooksStr = hooksArr
        .slice().sort((a,b) => (b.likes||0) - (a.likes||0)).slice(0, 10)
        .map(h => `"${h.text}" (@${h.account||'competitor'}, ${h.likes||0} likes)`).join('\n');
    } catch(e) {}
  }

  // Competitor scripts — find ones matching this topic
  const compScriptsPath = path.join(ROOT, 'second_brain/competitor_scripts.json');
  let matchingCompetitorScripts = "";
  if (fs.existsSync(compScriptsPath)) {
    try {
      const cs = JSON.parse(fs.readFileSync(compScriptsPath, 'utf8'));
      const scripts = Array.isArray(cs) ? cs : (cs.scripts || []);
      const ideaWords = (idea.title + ' ' + (idea.niche||'')).toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matched = scripts.filter(s => {
        const text = ((s.hook||'') + ' ' + (s.topic||'') + ' ' + (s.full_caption||'')).toLowerCase();
        return ideaWords.some(w => text.includes(w));
      }).sort((a,b) => (b.likes||0)-(a.likes||0)).slice(0, 5);
      if (matched.length) {
        matchingCompetitorScripts = matched.map(s =>
          `${s.account} (${s.likes} likes) [${s.script_pattern}]\nHook: "${s.hook}"\nCaption: "${(s.full_caption||'').substring(0,200)}"\nURL: ${s.url}`
        ).join('\n\n');
      }
    } catch(e) {}
  }

  // Transcripts — find ones matching this topic
  const transcriptsDir = path.join(ROOT, 'second_brain/transcripts');
  let matchingTranscripts = "";
  if (fs.existsSync(transcriptsDir)) {
    try {
      const ideaWords = idea.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const tFiles = fs.readdirSync(transcriptsDir).filter(f => f.endsWith('.json') && f !== 'transcribed_ids.json');
      const matched = tFiles.map(f => { try { return JSON.parse(fs.readFileSync(path.join(transcriptsDir, f), 'utf8')); } catch(e) { return null; } })
        .filter(t => t && t.transcript && t.transcript !== 'NO_SPEECH')
        .filter(t => ideaWords.some(w => (t.transcript||'').toLowerCase().includes(w) || (t.caption||'').toLowerCase().includes(w)))
        .sort((a,b) => (b.likes||0)-(a.likes||0)).slice(0, 3);
      if (matched.length) {
        matchingTranscripts = matched.map(t =>
          `@${t.handle} (${t.likes} likes):\nSpoken: "${t.transcript.substring(0, 500)}"\nPost: ${t.postUrl}`
        ).join('\n\n');
      }
    } catch(e) {}
  }

  // Trends
  const trendsPath = path.join(ROOT, 'second_brain/trends.json');
  let trendsStr = "";
  if (fs.existsSync(trendsPath)) {
    try {
      const tr = JSON.parse(fs.readFileSync(trendsPath, 'utf8'));
      const items = (tr.trends || []).slice(0, 5).map(t => `- ${t.title || t.keyword || t}`).join('\n');
      if (items) trendsStr = items;
    } catch(e) {}
  }

  // Debug: show what intelligence was loaded
  console.log('\n══════════ INTELLIGENCE LOADED ══════════');
  console.log('✅ Own viral posts:', topOwnPosts ? topOwnPosts.split('\n').length + ' posts loaded' : '❌ none');
  console.log('✅ Intelligence briefing:', intelligenceBriefing ? intelligenceBriefing.length + ' chars' : '❌ none');
  console.log('✅ Hook bank:', topHooksStr ? topHooksStr.split('\n').length + ' hooks loaded' : '❌ none');
  console.log('✅ Matching competitor scripts:', matchingCompetitorScripts ? matchingCompetitorScripts.split('\n\n').length + ' scripts matched' : '❌ no matches for this topic');
  console.log('✅ Matching transcripts:', matchingTranscripts ? matchingTranscripts.split('\n\n').length + ' transcripts matched' : '❌ no matches for this topic');
  console.log('✅ Trends:', trendsStr ? trendsStr.split('\n').length + ' trends loaded' : '❌ none');
  console.log('═════════════════════════════════════════\n');
  const sourceNote = idea.sourceUrl
    ? `\nThis idea was inspired by: ${idea.sourceUrl} — reference this style but make it original.`
    : '';

  const geminiRes = await gemini(`
You are a viral Instagram Reel scriptwriter for @garvit.irl (${myFollowers} followers, AI/automation/entrepreneurship, Indian audience 18-30, Hinglish-friendly).

WHAT WORKS FOR @garvit.irl:
- Best format: ${bestFormats}
- Top viral hook: ${topOwnPosts ? topOwnPosts.split('\n')[0] : 'Pattern interrupt hooks perform best'}
${intelligenceBriefing ? '- ' + intelligenceBriefing.substring(0, 300) + '...' : ''}

TOP HOOKS IN THIS NICHE:
${topHooksStr ? topHooksStr.split('\n').slice(0,5).join('\n') : 'No data yet.'}

${matchingCompetitorScripts ? `COMPETITORS ALREADY COVERED THIS TOPIC — USE A DIFFERENT ANGLE:
${matchingCompetitorScripts.split('\n\n').slice(0,2).map(s => s.split('\n').slice(0,2).join(' | ')).join('\n')}
` : ''}${matchingTranscripts ? `COMPETITOR SPOKEN SCRIPT REFERENCE:
${matchingTranscripts.split('\n\n')[0].substring(0, 300)}
` : ''}${trendsStr ? `TRENDING NOW: ${trendsStr.split('\n').slice(0,3).join(', ')}
` : ''}
IDEA TO SCRIPT:
Title: ${idea.title}
Hook: ${idea.hook}
Format: ${idea.format}
Why it works: ${idea.reasoning || ''}${sourceNote}

Write a complete viral content package:

HOOK VARIATIONS
3 hooks (first 3 seconds):
1. [CURIOSITY] ...
2. [FEAR/LOSS] ...
3. [ASPIRATION] ...

FULL SCRIPT
${idea.format==='Carousel'?
'Slide 1 (Hook):\nSlide 2:\nSlide 3:\nSlide 4:\nSlide 5:\nSlide 6 (CTA):':
'Word-for-word with [action notes]:\n[0-3s]: hook\n[3-10s]: problem\n[10-25s]: value\n[25-40s]: proof\n[38-45s]: CTA'}

CAPTION
150 words max, opens with hook, ends with hashtags.

CTA
Two trigger word options (e.g. "Comment BUILD and I'll DM you...")
`);
  const script = geminiRes.text;
  const scriptModel = geminiRes.modelUsed || 'unknown';

  // Save to script_library.json
  const scriptLibraryPath = path.join(ROOT, 'second_brain/script_library.json');
  let scriptLibData = { scripts: [] };
  if (fs.existsSync(scriptLibraryPath)) {
    try {
      const rawLib = JSON.parse(fs.readFileSync(scriptLibraryPath, 'utf8'));
      if (Array.isArray(rawLib)) { scriptLibData = { scripts: rawLib }; }
      else if (rawLib && Array.isArray(rawLib.scripts)) { scriptLibData = rawLib; }
    } catch(e) {}
  }

  let captionExtract = "";
  const capMatch = script.match(/## CAPTION\n([\s\S]*?)(?=\n##|$)/i);
  if (capMatch) captionExtract = capMatch[1].trim();

  const scriptEntry = {
    id: Date.now().toString(),
    generated_at: new Date().toISOString(),
    idea_title: idea.title,
    hook: idea.hook,
    hook_type: "unknown",
    format: idea.format,
    full_script: script,
    caption: captionExtract,
    hashtags: [],
    source_url: idea.sourceUrl || "",
    posted: false
  };
  scriptLibData.scripts.push(scriptEntry);
  fs.writeFileSync(scriptLibraryPath, JSON.stringify(scriptLibData, null, 2));

  // Update agents_output.json with the script
  [OUT_PATH1, OUT_PATH2].forEach(p => {
    if (fs.existsSync(p)) {
      try {
        const existing=JSON.parse(fs.readFileSync(p,'utf8'));
        existing.hook_script=script;
        existing.selected_idea=idea;
        fs.writeFileSync(p,JSON.stringify(existing,null,2));
      } catch(e) {}
    }
  });

  // Push to GitHub
  try {
    execSync('git config user.email "garvitb.business@gmail.com" && git config user.name "Garvit" && git add -A && git commit -m "script generated: '+idea.title.replace(/"/g,"'").substring(0,50)+'" --allow-empty && git push',{cwd:ROOT,stdio:'inherit'});
    console.log('✅ Pushed to GitHub');
  } catch(e) { console.log('⚠️ Git push failed: '+e.message); }

  // Send full script via Telegram
  const scoreColor={'HIGH':'🟢','MEDIUM':'🟡','LOW':'🔴'};
  const badge=(scoreColor[idea.score]||'🔵')+' '+(idea.score || 'MEDIUM');
  const srcLine = idea.sourceUrl ? '\n🔗 Inspired by: ' + idea.sourceUrl + '\n' : '';
  const fullMsg = '🎬 Script Ready!\n\n💡 ' + idea.title + '\n🏅 Score: ' + badge + srcLine + '\n\n' + script + '\n\n🤖 Generated by: ' + scriptModel;

  try {
    await sendTelegram(fullMsg);
    console.log('✅ Script sent via Telegram!');
  } catch(e) {
    console.error('❌ Telegram delivery failed:', e.message);
    process.exit(1);
  }
}
main().catch(e=>{console.error('❌ generate_script failed:',e);process.exit(1);});
