const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname,'../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ROOT = path.join(__dirname,'..');
const PENDING_PATH = path.join(ROOT,'second_brain/pending_ideas.json');
const OUT_PATH1 = path.join(ROOT,'dashboard/data/agents_output.json');
const OUT_PATH2 = path.join(ROOT,'dashboard/agents_output.json');
const DATA_PATH = path.join(ROOT,'dashboard/data/data.json');

const customFlag = process.argv.indexOf('--custom');
const customIdeaText = customFlag !== -1 ? process.argv[customFlag + 1] : null;
const rawIndex = customIdeaText ? null : parseInt(process.argv[2]);
if (!customIdeaText && (isNaN(rawIndex) || rawIndex < 1 || rawIndex > 50)) {
  console.error('❌ Usage: node scripts/generate_script.js <1-50>  OR  node scripts/generate_script.js --custom "your idea"'); process.exit(1);
}
const ideaIndex = rawIndex ? rawIndex - 1 : -1;

async function gemini(prompt) {
  const models=['gemini-3.7-flash','gemini-3.8-flash','gemini-3.1-flash-lite'];
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
        if (text&&text.length>50) { console.log('✅ Generated ('+model+', '+text.length+' chars)'); return text; }
      }
      if (statusCode===503||statusCode===429) continue;
    } catch(e) { console.log('⚠️ '+model+': '+e.message); }
  }
  return '[Script generation failed]';
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

function sendTelegram(text) {
  return new Promise((resolve) => {
    const body=JSON.stringify({chat_id:CHAT_ID,text:text,parse_mode:'HTML',disable_web_page_preview:true});
    const options={hostname:'api.telegram.org',path:'/bot'+BOT_TOKEN+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}};
    const req=https.request(options,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve());});
    req.on('error',()=>resolve());req.write(body);req.end();
  });
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
    if (fs.existsSync(OUT_PATH1)) {
      try {
        const outData = JSON.parse(fs.readFileSync(OUT_PATH1, 'utf8'));
        ideatorIdeas = outData.ideator?.ideas || (Array.isArray(outData.ideator) ? outData.ideator : []);
      } catch(e) {}
    }
    if (!ideatorIdeas.length && fs.existsSync(OUT_PATH2)) {
      try {
        const outData = JSON.parse(fs.readFileSync(OUT_PATH2, 'utf8'));
        ideatorIdeas = outData.ideator?.ideas || (Array.isArray(outData.ideator) ? outData.ideator : []);
      } catch(e) {}
    }
    idea = ideatorIdeas[ideaIndex];
    if (idea && !idea.niche) idea.niche = 'AI & Growth';
    if (idea && !idea.score) idea.score = 'MEDIUM';
  }

  if (!idea) { console.error('❌ No idea at index '+ideaIndex); process.exit(1); }

  console.log('🎣 Generating script for: "'+idea.title+'"');

  const data=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
  const myFollowers=(data.your_account||{}).followers||5845;

  const patternsPath = path.join(ROOT, 'second_brain/patterns.json');
  const patterns = fs.existsSync(patternsPath) ? JSON.parse(fs.readFileSync(patternsPath, 'utf8')) : {};
  const patternInsight = patterns.summary || "Not enough data yet. Need at least 5 posts with 48h performance data.";

  const hookBankPath = path.join(ROOT, 'second_brain/hook_bank.json');
  let topHooksStr = "";
  if (fs.existsSync(hookBankPath)) {
    try {
      const bankRaw = JSON.parse(fs.readFileSync(hookBankPath, 'utf8'));
      const hooksArr = Array.isArray(bankRaw) ? bankRaw : (bankRaw.hooks || []);
      topHooksStr = hooksArr
        .slice()
        .sort((a,b) => (b.likes||0) - (a.likes||0))
        .slice(0, 3)
        .map(h => `"${h.text}" (${h.type || 'hook'}, ${h.likes || 0} likes)`)
        .join('\n');
    } catch(e) {}
  }

  const bestFormats = (patterns.best_formats && patterns.best_formats.length) ? patterns.best_formats.map(f=>f.format).join(', ') : 'Reels';

  const sourceNote = idea.sourceUrl 
    ? `\nThis idea was inspired by: ${idea.sourceUrl} — reference this style but make it original.`
    : '';

  const script = await gemini(`
You are a viral Instagram Reel scriptwriter for @garvit.irl (${myFollowers} followers, AI/automation/entrepreneurship, Indian audience).

PERFORMANCE DATA FOR @garvit.irl:
${patternInsight}

TOP PERFORMING HOOKS FROM YOUR NICHE (use these as style reference):
${topHooksStr || "No hook data yet — use best judgment."}

Write the script using the best performing hook type above if data is available.

Best performing formats for this account: ${bestFormats}

SELECTED IDEA:
Title: ${idea.title}
Original Hook: ${idea.hook}
Format: ${idea.format}
Niche: ${idea.niche || 'AI'}
Why it works: ${idea.reasoning || idea.why || ''}${sourceNote}

Generate a complete content package:

## HOOK VARIATIONS
3 alternative hooks (first 3 seconds each):
1. [CURIOSITY] ...
2. [FEAR/LOSS AVERSION] ...
3. [ASPIRATION] ...

## FULL SCRIPT
${idea.format==='Carousel'?
'Write each slide:\n**Slide 1 (Hook):**\n**Slide 2:**\n**Slide 3:**\n**Slide 4:**\n**Slide 5:**\n**Slide 6 (CTA):**':
'Full word-for-word script with [action notes] in brackets:\n[0-3s]: hook\n[3-10s]: problem/setup\n[10-25s]: main value\n[25-40s]: proof/example\n[38-45s]: CTA'}

## CAPTION
150 words max. Opens with the hook. Ends with hashtags.

## CTA OPTIONS
Two trigger word options with the exact script (e.g. "Comment LINK and I'll DM you...")
`);

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
    execSync('git add -A && git commit -m "script generated: '+idea.title.replace(/"/g,"'").substring(0,50)+'" --allow-empty && git push',{cwd:ROOT,stdio:'inherit'});
    console.log('✅ Pushed to GitHub');
  } catch(e) { console.log('⚠️ Git push failed: '+e.message); }

  // Send full script via Telegram
  const scoreColor={'HIGH':'🟢','MEDIUM':'🟡','LOW':'🔴'};
  const badge=(scoreColor[idea.score]||'🔵')+' '+(idea.score || 'MEDIUM');
  const preview=cleanForTelegram(script).substring(0,3500)+(script.length>3500?'\n\n<i>...view full script on dashboard</i>':'');
  let msg='🎬 <b>Script Ready!</b>\n\n'+'💡 <b>'+idea.title+'</b>\n'+'🏅 Score: '+badge+'\n\n'+preview;
  if (idea.sourceUrl) {
    msg += '\n\n📎 Inspired by: '+idea.sourceUrl;
  }
  msg += '\n\n🌐 <a href="https://garvitb7856.github.io/content-agent/dashboard/">View on Dashboard</a>';
  await sendTelegram(msg);
  console.log('✅ Script sent via Telegram!');
}
main().catch(e=>{console.error('❌ generate_script failed:',e);process.exit(1);});
