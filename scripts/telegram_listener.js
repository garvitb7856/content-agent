const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname,'..');
const envPath = path.join(ROOT,'.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath,'utf8').split('\n').forEach(line=>{
    line=line.trim();
    if(line&&line.includes('=')&&!line.startsWith('#')){const [k,...v]=line.split('=');process.env[k.trim()]=v.join('=').trim();}
  });
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const OFFSET_FILE = path.join(ROOT,'second_brain/.telegram_offset');

let lastUpdateId = 0;
if (fs.existsSync(OFFSET_FILE)) {
  lastUpdateId = parseInt(fs.readFileSync(OFFSET_FILE,'utf8').trim())||0;
}

function getUpdates(offset) {
  return new Promise((resolve) => {
    const options={
      hostname:'api.telegram.org',
      path:'/bot'+BOT_TOKEN+'/getUpdates?offset='+offset+'&timeout=30&allowed_updates=["message"]',
      method:'GET'
    };
    const req=https.request(options,(res)=>{
      let d='';
      res.on('data',chunk=>d+=chunk);
      res.on('end',()=>{
        try { const p=JSON.parse(d); resolve(p.ok?(p.result||[]):[]);}
        catch(e){resolve([]);}
      });
    });
    req.on('error',()=>resolve([]));
    req.setTimeout(35000,()=>{req.destroy();resolve([]);});
    req.end();
  });
}

function sendMessage(text) {
  return new Promise((resolve)=>{
    const body=JSON.stringify({chat_id:CHAT_ID,text:text,parse_mode:'HTML',disable_web_page_preview:true});
    const options={hostname:'api.telegram.org',path:'/bot'+BOT_TOKEN+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}};
    const req=https.request(options,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve());});
    req.on('error',()=>resolve());req.write(body);req.end();
  });
}

async function processUpdate(update) {
  const msg=update.message;
  if(!msg||String(msg.chat.id)!==String(CHAT_ID))return;
  const text=(msg.text||'').trim();
  if(!/^[1-5]$/.test(text))return;

  const num=parseInt(text);
  console.log(new Date().toLocaleString('en-IN')+' — User selected idea #'+num);

  const pendingPath=path.join(ROOT,'second_brain/pending_ideas.json');
  if(!fs.existsSync(pendingPath)){await sendMessage('⚠️ No pending ideas. Run the daily report first (node scripts/run_all.js).');return;}

  let pending=[];
  try{pending=JSON.parse(fs.readFileSync(pendingPath,'utf8'));}catch(e){await sendMessage('⚠️ Could not read pending ideas.');return;}
  if(!pending.length){await sendMessage('⚠️ Ideas list is empty. Run the daily report first.');return;}

  const idea=pending[num-1];
  if(!idea){await sendMessage('⚠️ Idea #'+num+' not found.');return;}

  await sendMessage('⏳ Generating script for idea #'+num+':\n\n<b>'+idea.title+'</b>\n\nAbout 30 seconds...');

  try{
    execSync('node scripts/generate_script.js '+num,{cwd:ROOT,stdio:'inherit'});
  }catch(e){
    console.error('❌ generate_script failed:',e.message);
    await sendMessage('❌ Script generation failed. Run manually:\n<code>node scripts/generate_script.js '+num+'</code>');
  }
}

async function listen() {
  console.log('🎧 Telegram Listener started — '+new Date().toLocaleString('en-IN'));
  console.log('   Polling every ~30s for replies 1-5 from chat ID '+CHAT_ID);
  while(true){
    try{
      const updates=await getUpdates(lastUpdateId+1);
      for(const update of updates){
        lastUpdateId=update.update_id;
        await processUpdate(update);
      }
      fs.mkdirSync(path.dirname(OFFSET_FILE),{recursive:true});
      fs.writeFileSync(OFFSET_FILE,String(lastUpdateId));
    }catch(e){
      console.log('⚠️ Poll error: '+e.message+' — retrying in 10s');
      await new Promise(r=>setTimeout(r,10000));
    }
  }
}
listen();
