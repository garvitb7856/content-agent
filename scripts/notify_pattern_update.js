const fs = require('fs');
const https = require('https');
require('dotenv').config();

function sendTelegram(msg) {
  return new Promise(resolve => {
    const body = JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); resolve(); });
    req.on('error', resolve);
    req.write(body); req.end();
  });
}

async function main() {
  const ctx = JSON.parse(fs.readFileSync('second_brain/agent_context.json', 'utf8'));
  const yourPosts = ctx.your_performance.posts_analyzed;
  const nicheHooks = ctx.niche_performance.total_hooks;
  const nicheScripts = ctx.niche_performance.total_scripts;
  const viralBlueprints = ctx.competitor_script_blueprints.length;

  const msg = `🧠 <b>Second Brain Updated</b>

<b>Your Data:</b> ${yourPosts} posts with 48h performance data
<b>Niche Data:</b> ${nicheHooks} competitor hooks | ${nicheScripts} scripts | ${viralBlueprints} viral blueprints active

<b>Best hook type for you:</b> ${ctx.your_performance.best_hook_type || 'still building...'}
<b>Best hook type in niche:</b> ${ctx.niche_performance.best_hook_type || 'still building...'}

Today's agents are calibrated with this intelligence.`;

  await sendTelegram(msg);
  console.log('Pattern update notification sent.');
}
main().catch(console.error);
