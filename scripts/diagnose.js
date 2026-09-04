const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const results = [];

function ok(label, detail) { results.push({ status: '✅', label, detail: detail||'' }); }
function warn(label, detail) { results.push({ status: '⚠️', label, detail: detail||'' }); }
function fail(label, detail) { results.push({ status: '❌', label, detail: detail||'' }); }

// Load .env
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath,'utf8').split('\n').forEach(line => {
    line=line.trim();
    if(line&&line.includes('=')&&!line.startsWith('#')){const [k,...v]=line.split('=');process.env[k.trim()]=v.join('=').trim();}
  });
}

// 1. Node version
try {
  const v = process.version;
  const major = parseInt(v.replace('v','').split('.')[0]);
  if (major >= 16) ok('Node.js version', v);
  else fail('Node.js version', v + ' — need v16+');
} catch(e) { fail('Node.js version', e.message); }

// 2. .env keys
const keys = ['GEMINI_API_KEY','APIFY_TOKEN','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID'];
keys.forEach(k => {
  const v = process.env[k];
  if (!v || v.includes('your_') || v.length < 5) fail('.env: '+k, 'MISSING or placeholder');
  else ok('.env: '+k, '✓ set ('+v.length+' chars)');
});

// 3. Critical files
const files = [
  'scripts/run_all.js',
  'scripts/run_agents.js',
  'scripts/fetch_trends.js',
  'scripts/telegram_bot.js',
  'scripts/telegram_listener.js',
  'scripts/generate_script.js',
  'dashboard/index.html',
  'dashboard/data/data.json',
  'dashboard/data/agents_output.json',
  'second_brain/pending_ideas.json',
  'second_brain/trends.json',
];
files.forEach(f => {
  const full = path.join(ROOT, f);
  if (fs.existsSync(full)) {
    const size = fs.statSync(full).size;
    if (size < 10) warn('File: '+f, 'exists but nearly empty ('+size+' bytes)');
    else ok('File: '+f, size+' bytes');
  } else {
    fail('File: '+f, 'MISSING');
  }
});

// 4. data.json freshness
try {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT,'dashboard/data/data.json'),'utf8'));
  const hours = (Date.now() - new Date(data.fetched_at)) / 3600000;
  if (hours < 25) ok('Data freshness', Math.round(hours)+'h old — fresh');
  else warn('Data freshness', Math.round(hours)+'h old — run fetch_data.js');
} catch(e) { fail('Data freshness', 'Could not read data.json'); }

// 5. pending_ideas count
try {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT,'second_brain/pending_ideas.json'),'utf8'));
  if (Array.isArray(p) && p.length > 0) ok('Pending ideas', p.length+' ideas ready');
  else warn('Pending ideas', 'Empty — run run_agents.js');
} catch(e) { warn('Pending ideas', 'Could not read file'); }

// 6. agents_output.json has real content
try {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT,'dashboard/data/agents_output.json'),'utf8'));
  const keys2 = ['ideator','scout','analyst','planner'];
  keys2.forEach(k => {
    const v = a[k];
    if (!v || String(v).startsWith('[Agent Error')) fail('Agent output: '+k, 'Error or missing');
    else ok('Agent output: '+k, String(v).length+' chars');
  });
} catch(e) { fail('agents_output.json', 'Could not read'); }

// 7. Task Scheduler tasks
const tasks = ['ContentAgentDailyReport','ContentAgentTelegramListener'];
tasks.forEach(t => {
  try {
    const out = execSync('schtasks /query /tn "'+t+'" /fo LIST 2>&1', {encoding:'utf8'});
    if (out.includes('Status')) {
      const statusLine = out.split('\n').find(l => l.includes('Status'));
      ok('Task Scheduler: '+t, statusLine ? statusLine.trim() : 'registered');
    } else {
      warn('Task Scheduler: '+t, 'registered but check status');
    }
  } catch(e) {
    fail('Task Scheduler: '+t, 'NOT REGISTERED — run Step 9 from setup');
  }
});

// 8. GitHub Pages live check
https.get('https://garvitb7856.github.io/content-agent/dashboard/', (res) => {
  if (res.statusCode === 200) ok('GitHub Pages', 'Live and reachable (HTTP '+res.statusCode+')');
  else warn('GitHub Pages', 'HTTP '+res.statusCode);
}).on('error', () => fail('GitHub Pages', 'Could not reach'));

// 9. Telegram bot reachable
setTimeout(() => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.length < 10) { fail('Telegram bot', 'No token'); printResults(); return; }
  https.get('https://api.telegram.org/bot'+token+'/getMe', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const p = JSON.parse(d);
        if (p.ok) ok('Telegram bot', '@'+p.result.username+' — active');
        else fail('Telegram bot', 'API error: '+p.description);
      } catch(e) { fail('Telegram bot', 'Bad response'); }
      printResults();
    });
  }).on('error', () => { fail('Telegram bot', 'Network error'); printResults(); });
}, 500);

function printResults() {
  console.log('\n══════════════════════════════════════');
  console.log('   CONTENT AGENT — SYSTEM DIAGNOSTIC');
  console.log('══════════════════════════════════════\n');
  const passed = results.filter(r=>r.status==='✅').length;
  const warned = results.filter(r=>r.status==='⚠️').length;
  const failed = results.filter(r=>r.status==='❌').length;
  results.forEach(r => console.log(r.status+' '+r.label+(r.detail?' — '+r.detail:'')));
  console.log('\n──────────────────────────────────────');
  console.log('SCORE: '+passed+' passed, '+warned+' warnings, '+failed+' failed');
  if (failed === 0 && warned === 0) console.log('🎉 System fully operational!');
  else if (failed === 0) console.log('⚠️  System working but check warnings above.');
  else console.log('❌ Fix the failed items above before system can run correctly.');
  console.log('══════════════════════════════════════\n');
}
