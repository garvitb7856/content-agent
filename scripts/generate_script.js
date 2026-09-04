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

const rawIndex = parseInt(process.argv[2]);
if (isNaN(rawIndex)||rawIndex<1||rawIndex>5) {
  console.error('❌ Usage: node scripts/generate_script.js <1-5>'); process.exit(1);
}
const ideaIndex = rawIndex - 1;

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

function sendTelegram(text) {
  return new Promise((resolve) => {
    const body=JSON.stringify({chat_id:CHAT_ID,text:text,parse_mode:'HTML',disable_web_page_preview:true});
    const options={hostname:'api.telegram.org',path:'/bot'+BOT_TOKEN+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}};
    const req=https.request(options,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve());});
    req.on('error',()=>resolve());req.write(body);req.end();
  });
}

async function main() {
  const pending=JSON.parse(fs.readFileSync(PENDING_PATH,'utf8'));
  const idea=pending[ideaIndex];
  if (!idea) { console.error('❌ No idea at index '+ideaIndex); process.exit(1); }

  console.log('🎣 Generating script for: "'+idea.title+'"');

  const data=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
  const myFollowers=(data.your_account||{}).followers||5845;

  const script = await gemini(`
You are a viral Instagram Reel scriptwriter for @garvit.irl (${myFollowers} followers, AI/automation/entrepreneurship, Indian audience).

SELECTED IDEA:
Title: ${idea.title}
Original Hook: ${idea.hook}
Format: ${idea.format}
Niche: ${idea.niche}
Why it works: ${idea.reasoning}

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
  const badge=(scoreColor[idea.score]||'🔵')+' '+idea.score;
  const preview=script.substring(0,3800)+(script.length>3800?'\n\n<i>...view full script on dashboard</i>':'');
  const msg='🎬 <b>Script Ready!</b>\n\n'+'💡 <b>'+idea.title+'</b>\n'+'🏅 Score: '+badge+'\n\n'+preview+'\n\n🌐 <a href="https://garvitb7856.github.io/content-agent/dashboard/">View on Dashboard</a>';
  await sendTelegram(msg);
  console.log('✅ Script sent via Telegram!');
}
main().catch(e=>{console.error('❌ generate_script failed:',e);process.exit(1);});
