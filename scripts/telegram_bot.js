const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (line && line.includes('=') && !line.startsWith('#')) {
      const [k, ...v] = line.split('=');
      process.env[k.trim()] = v.join('=').trim();
    }
  });
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

// ── Load data.json ────────────────────────────────────────────────────────────
let data = {};
try {
  const dp = path.join(__dirname, '..', 'dashboard', 'data', 'data.json');
  data = JSON.parse(fs.readFileSync(dp, 'utf8'));
  console.log('✅ Loaded data.json');
} catch(e) {
  console.log('⚠️  No data.json found:', e.message);
}

// ── Load agents_output.json ───────────────────────────────────────────────────
let ai = {};
try {
  const ap = path.join(__dirname, '..', 'dashboard', 'data', 'agents_output.json');
  ai = JSON.parse(fs.readFileSync(ap, 'utf8'));
  console.log('✅ Loaded agents_output.json');
} catch(e) {
  console.log('⚠️  No agents_output.json found:', e.message);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Clean markdown, collapse whitespace, truncate to max chars
function preview(text, max = 300) {
  if (!text || typeof text !== 'string') return 'No output yet';
  // Detect error strings and hide them
  if (text.startsWith('[Agent Error')) return 'No output yet';
  const clean = text
    .replace(/\*\*?/g, '')
    .replace(/_+/g, '')
    .replace(/#+\s*/g, '')
    .replace(/`+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[<>&]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  if (!clean) return 'No output yet';
  return clean.length > max ? clean.substring(0, max) + '…' : clean;
}

// Format date as "4 September 2026, 9:09 AM"
function formatDate(date) {
  const day   = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:   'numeric' });
  const month = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long'    });
  const year  = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year:  'numeric' });
  const time  = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour:  'numeric', minute: '2-digit', hour12: true });
  return `${day} ${month} ${year}, ${time}`;
}

// ── STATS — your account only ─────────────────────────────────────────────────
const acc       = data.your_account || {};
const followers = acc.followers || 0;
const myPosts   = Array.isArray(acc.posts) ? acc.posts : [];

function getMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const likesList    = myPosts.map(p => p.likes || 0);
const commentsList = myPosts.map(p => p.comments || 0);

const medianLikes    = getMedian(likesList);
const medianComments = getMedian(commentsList);

const avgLikes    = myPosts.length
  ? Math.round(myPosts.reduce((s, p) => s + (p.likes    || 0), 0) / myPosts.length)
  : 0;
const avgComments = Math.round(medianComments);
const engRate = followers
  ? (((medianLikes + medianComments) / followers) * 100).toFixed(2)
  : '0.00';

const topPost = myPosts.length
  ? [...myPosts].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0]
  : null;
const topCaption = topPost
  ? esc((topPost.caption || '').replace(/\n/g, ' ').substring(0, 60))
  : '';

console.log(`📊 Stats — followers: ${followers}, avgLikes: ${avgLikes}, avgComments: ${avgComments}, engRate: ${engRate}%`);

// ── COMPETITORS — dynamic from data.json ─────────────────────────────────────
const compsRaw = data.competitors || {};
const compLines = Object.keys(compsRaw)
  .filter(k => k !== 'garvit.irl')
  .map(k => {
    const c = compsRaw[k];
    return `@${esc(k)}: ${(c.followers || 0).toLocaleString()} followers`;
  });

console.log(`🤝 Competitors loaded: ${compLines.length}`);

// ── AI AGENTS ─────────────────────────────────────────────────────────────────
const agentKeys = ['ideator', 'scout', 'planner', 'analyst'];
const agentLabels = {
  ideator: '💡 Ideator',
  scout:   '🔍 Scout',
  planner: '📅 Planner',
  analyst: '📊 Analyst'
};

const agentLines = agentKeys.map(key => {
  let out;
  if (key === 'scout') {
    try {
      const pending = ai.pending_ideas||[];
      out = pending.length ? pending.length+' ideas scored. Top: "'+pending[0].title+'" ('+pending[0].score+')' : 'Scoring pending';
    } catch(e) { out = preview(ai[key]); }
  } else {
    out = preview(ai[key]);
  }
  return '<b>'+agentLabels[key]+':</b>\n'+esc(out);
});

// ── Build message ─────────────────────────────────────────────────────────────
const now = formatDate(new Date());

const parts = [
  '🤖 <b>Content Agent Daily Report</b>',
  `📅 ${esc(now)}`,
  '',
  '━━━━━━━━━━━━━━━━━━━━',
  '📊 <b>YOUR STATS — @garvit.irl</b>',
  '━━━━━━━━━━━━━━━━━━━━',
  `👥 Followers: <b>${followers.toLocaleString()}</b>`,
  `❤️ Avg Likes: <b>${avgLikes}</b>`,
  `💬 Avg Comments: <b>${avgComments}</b>`,
  `📈 Engagement Rate: <b>${engRate}%</b>`,
  topPost
    ? `🏆 Best Post: <b>${(topPost.likes || 0).toLocaleString()} likes</b> — ${topCaption}…`
    : '',
  '',
  '━━━━━━━━━━━━━━━━━━━━',
  '🤝 <b>COMPETITORS</b>',
  '━━━━━━━━━━━━━━━━━━━━',
  compLines.join('\n'),
  '',
  '━━━━━━━━━━━━━━━━━━━━',
  '🤖 <b>AI AGENT INSIGHTS</b>',
  '━━━━━━━━━━━━━━━━━━━━',
  '',
  agentLines.join('\n\n'),
  '',
  '━━━━━━━━━━━━━━━━━━━━',
  '💡 <b>TODAY\'S TOP 5 IDEAS — Reply with a number to get your script!</b>',
  '━━━━━━━━━━━━━━━━━━━━',
  ...(() => {
    try {
      const pendingPath = path.join(__dirname, '..', 'second_brain', 'pending_ideas.json');
      if (!fs.existsSync(pendingPath)) return ['No ideas yet. Run daily report first.'];
      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
      if (!pending.length) return ['No ideas scored yet.'];
      const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
      const badge = s => s==='HIGH'?'🟢 HIGH':s==='MEDIUM'?'🟡 MEDIUM':'🔴 LOW';
      const lines = [];
      pending.forEach((idea, i) => {
        lines.push(emojis[i]+' ['+badge(idea.score)+'] <b>'+esc(idea.title||'')+'</b>');
        if (idea.reasoning) lines.push('   <i>'+esc((idea.reasoning||'').substring(0,100))+'</i>');
        lines.push('');
      });
      lines.push('<i>Reply with just the number (1–5) to generate a full script.</i>');
      return lines;
    } catch(e) { return ['Could not load ideas.']; }
  })(),
  '',
  '🌐 Dashboard: https://garvitb7856.github.io/content-agent/dashboard/'
];

const msg = parts.filter(l => l !== null && l !== undefined).join('\n').trim();

console.log(`📨 Message length: ${msg.length} chars`);

// ── Send via Telegram ─────────────────────────────────────────────────────────
function sendMessage(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(d); } catch(e) { return reject(new Error('Invalid JSON from Telegram')); }
        if (parsed.ok) {
          console.log('✅ Telegram message sent successfully!');
          resolve(parsed);
        } else {
          console.error('❌ Telegram API error:', parsed.description);
          reject(new Error(parsed.description));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

sendMessage(msg).catch(err => {
  console.error('❌ Failed to send:', err.message || err);
  process.exit(1);
});
