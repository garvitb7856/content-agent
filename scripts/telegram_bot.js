const fs = require('fs');
const path = require('path');
const https = require('https');

const TRANSCRIPTION_SUMMARY_FILE = path.join(__dirname, '../second_brain/transcription_summary.json');
const PIPELINE_STATUS_FILE = path.join(__dirname, '../second_brain/pipeline_status.json');

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

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function preview(text, max = 300) {
  if (!text || typeof text !== 'string') return 'No output yet';
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

function formatDate(date) {
  const day   = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:   'numeric' });
  const month = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long'    });
  const year  = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year:  'numeric' });
  const time  = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour:  'numeric', minute: '2-digit', hour12: true });
  return `${day} ${month} ${year}, ${time}`;
}

function loadJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  return fallback;
}

function getPipelineHealth() {
  try {
    const status = loadJSON(PIPELINE_STATUS_FILE, {});
    const transcription = loadJSON(TRANSCRIPTION_SUMMARY_FILE, null);
    const steps = status.steps || {};
    const lines = [];

    const icons = { success: '✅', failed: '❌', skipped: '⏭️', running: '🔄' };
    const stepNames = {
      fetch: 'Apify Fetch',
      transcribe: 'Transcription',
      trends: 'Trend Fetch',
      caption_diff: 'Caption Diff',
      performance: 'Performance Feedback',
      patterns: 'Pattern Engine',
      clusters: 'Topic Clusters',
      agents: 'AI Agents',
      history: 'History Save',
      second_brain: 'Second Brain',
      telegram: 'Telegram'
    };

    for (const [key, val] of Object.entries(steps)) {
      const icon = icons[val.status] || '❓';
      const label = stepNames[key] || key;
      let line = `${icon} ${label}`;
      if (val.status === 'failed' && val.error) line += ` — ${esc(val.error.slice(0,60))}`;
      if (val.status === 'skipped' && val.reason) line += ` (${val.reason})`;
      lines.push(line);
    }

    // Add transcription detail if available
    if (transcription && steps.transcribe?.status === 'success') {
      lines.push(`   └ ${transcription.succeeded} transcribed, ${transcription.failed} failed, ${transcription.pending} pending`);
    }

    const failed = Object.values(steps).filter(s => s.status === 'failed').length;
    const header = failed === 0 ? '🟢 All systems OK' : `🔴 ${failed} step(s) failed`;
    return `\n<b>Pipeline Health</b>\n${header}\n${lines.join('\n')}`;
  } catch(e) {
    return '\n<b>Pipeline Health</b>\n❓ Status unavailable';
  }
}

function sendSingleMessage(text, parseMode = 'HTML') {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
      return reject(new Error('Missing Telegram credentials'));
    }
    const bodyObj = {
      chat_id: CHAT_ID,
      text: text,
      disable_web_page_preview: true
    };
    if (parseMode) bodyObj.parse_mode = parseMode;
    const body = JSON.stringify(bodyObj);
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

async function sendMessage(text, parseMode = 'HTML') {
  if (text.length <= 4000) {
    return sendSingleMessage(text, parseMode);
  }
  const lines = text.split('\n');
  let currentChunk = '';
  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > 3900) {
      if (currentChunk.trim()) {
        await sendSingleMessage(currentChunk.trim(), parseMode);
      }
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  if (currentChunk.trim()) {
    await sendSingleMessage(currentChunk.trim(), parseMode);
  }
}

async function run(transcribeResult = {}) {
  let data = {};
  try {
    const dp = path.join(__dirname, '..', 'dashboard', 'data.json');
    data = JSON.parse(fs.readFileSync(dp, 'utf8'));
  } catch(e) {}

  let ai = {};
  try {
    const ap = path.join(__dirname, '..', 'dashboard', 'agents_output.json');
    ai = JSON.parse(fs.readFileSync(ap, 'utf8'));
  } catch(e) {}

  let pipelineStatus = null;
  try {
    const sp = path.join(__dirname, '..', 'second_brain', 'pipeline_status.json');
    pipelineStatus = JSON.parse(fs.readFileSync(sp, 'utf8'));
  } catch(e) {}

  const primaryModel = ai.primary_model || 'unknown';
  const modelsUsed = (ai.models_used || []);
  const uniqueModels = Array.isArray(modelsUsed) ? [...new Set(modelsUsed)] : [];
  const modelQuality = primaryModel.includes('lite') ? '⚠️ FALLBACK (lite model)' : '✅ Full quality';
  const modelsUsedMap = typeof ai.models_used === 'object' && !Array.isArray(ai.models_used) ? ai.models_used : {};
  const modelLine = Object.keys(modelsUsedMap).length
    ? '\n🤖 Models: ' + Object.entries(modelsUsedMap).map(([k,v]) => k+': '+v).join(' | ')
    : '';

  const acc       = data.your_account || {};
  const followers = acc.followers || 0;
  const myPosts   = Array.isArray(acc.posts) ? acc.posts : [];

  const median = arr => { if(!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };

  const likesList    = myPosts.map(p => p.likesCount || p.likes || 0);
  const commentsList = myPosts.map(p => p.commentsCount || p.comments || 0);
  const medianLikes    = median(likesList);
  const medianComments = median(commentsList);

  const avgLikes    = myPosts.length ? Math.round(myPosts.reduce((s, p) => s + (p.likesCount || p.likes || 0), 0) / myPosts.length) : 0;
  const avgComments = Math.round(medianComments);
  const engRate = followers ? (((medianLikes + medianComments) / followers) * 100).toFixed(2) : '0.00';

  const topPost = myPosts.length ? [...myPosts].sort((a, b) => (b.likesCount || b.likes || 0) - (a.likesCount || a.likes || 0))[0] : null;
  const topCaption = topPost ? esc((topPost.caption || '').replace(/\n/g, ' ').substring(0, 60)) : '';

  const compsRaw = data.competitors || {};
  const compLines = Object.keys(compsRaw)
    .filter(k => k !== 'garvit.irl')
    .map(k => {
      const c = compsRaw[k];
      return `@${esc(k)}: ${(c.followers || 0).toLocaleString()} followers`;
    });

  const agentKeys = ['ideator', 'scout', 'planner', 'analyst'];
  const agentLabels = { ideator: '💡 Ideator', scout: '🔍 Scout', planner: '📅 Planner', analyst: '📊 Analyst' };

  const agentLines = agentKeys.map(key => {
    let out;
    if (key === 'ideator') {
      try {
        let ideas = [];
        const raw = ai.ideator;
        if (typeof raw === 'string') {
          const m = raw.match(/\[[\s\S]*\]/);
          if (m) ideas = JSON.parse(m[0]);
        } else if (Array.isArray(raw)) ideas = raw;
        if (ideas && ideas.length && ideas[0]) {
          const idea = ideas[0];
          const ratingEmoji = (idea.rating || idea.score) === 'HIGH' ? '🟢' : (idea.rating || idea.score) === 'MEDIUM' ? '🟡' : '🔴';
          out = `Title: ${ratingEmoji} ${idea.title || ''}\nHook: ${idea.hook || ''}`;
        } else out = preview(ai[key], 200);
      } catch(e) { out = preview(ai[key], 200); }
    } else if (key === 'scout') {
      try {
        const pending = ai.pending_ideas||[];
        out = pending.length ? pending.length+' ideas scored. Top: "'+pending[0].title+'" ('+pending[0].score+')' : 'Scoring pending';
      } catch(e) { out = preview(ai[key]); }
    } else if (key === 'analyst') {
      try { out = `Engagement Rate: ${engRate}%\n` + preview(ai.analyst, 200); } catch(e) { out = preview(ai[key]); }
    } else out = preview(ai[key]);
    return '<b>'+agentLabels[key]+':</b>\n'+esc(out);
  });

  const trCount = transcribeResult.transcribed || 0;
  const trByHandle = transcribeResult.byHandle || {};
  const trLines = Object.entries(trByHandle).map(([h, n]) => `  ├ @${esc(h)} — ${n} reel${n > 1 ? 's' : ''}`).join('\n');
  const transcriptSection = trCount > 0
    ? `\n📹 <b>Transcribed Today: ${trCount} new video${trCount > 1 ? 's' : ''}</b>\n${trLines}\n`
    : `\n📹 <b>Transcribed Today:</b> 0 new (all up to date)\n`;

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
    `🤖 AI Model: <b>${primaryModel}</b> ${modelQuality}`,
    topPost ? `🏆 Best Post: <b>${(topPost.likes || 0).toLocaleString()} likes</b> — ${topCaption}…` : '',
    transcriptSection,
    '━━━━━━━━━━━━━━━━━━━━',
    '🤝 <b>COMPETITORS</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    compLines.join('\n'),
    ...(pipelineStatus ? [
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '⚙️ <b>PIPELINE STATUS</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `Overall: <b>${pipelineStatus.overall?.toUpperCase() || 'UNKNOWN'}</b>`,
      ...Object.entries(pipelineStatus.steps || {}).map(([k, v]) => {
        const icon = v.status === 'success' ? '✅' : v.status === 'failed' ? '❌' : v.status === 'skipped' ? '⏭' : '🔄';
        return `${icon} ${k.replace(/_/g,' ')}${v.error ? ' — ' + esc(v.error.substring(0,60)) : ''}`;
      }),
      '',
    ] : []),
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '🤖 <b>AI AGENT INSIGHTS</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    agentLines.join('\n\n') + (modelLine ? '\n' + modelLine : ''),
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
        const lines = [];
        pending.slice(0, 5).forEach((idea, i) => {
          const r = idea.rating || idea.score || 'MEDIUM';
          const ratingEmoji = r === 'HIGH' ? '🟢' : r === 'MEDIUM' ? '🟡' : '🔴';
          lines.push(emojis[i]+' '+ratingEmoji+' <b>'+esc(idea.title||'')+'</b>');
          if (idea.hook) lines.push('   🎙 Hook: '+esc(idea.hook));
          if (idea.reasoning) lines.push('   <i>'+esc((idea.reasoning||'').substring(0,100))+'</i>');
          if (idea.sourceUrl) lines.push('   🔗 <a href="'+idea.sourceUrl+'">View source reel ↗</a>');
          lines.push('');
        });
        lines.push('💡 Reply 1-5 for top picks, or reply any number 6-50 to get a script for other ideas from today\'s full list.');
        return lines;
      } catch(e) { return ['Could not load ideas.']; }
    })(),
    '',
    '🌐 Dashboard: https://garvitb7856.github.io/content-agent/dashboard/'
  ];

  let msg = parts.filter(l => l !== null && l !== undefined).join('\n').trim();
  msg += '\n' + getPipelineHealth();
  try {
    await sendMessage(msg);
  } catch (err) {
    console.error('⚠️ Telegram HTML send failed:', err.message, '— retrying as plain text');
    const plain = msg
      .replace(/<b>(.*?)<\/b>/g, '$1')
      .replace(/<i>(.*?)<\/i>/g, '$1')
      .replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    // send as plain text (no parse_mode)
    await new Promise((resolve, reject) => {
      const body = JSON.stringify({ chat_id: CHAT_ID, text: plain.substring(0, 4000), disable_web_page_preview: true });
      const opts = { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
      const req = require('https').request(opts, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => { try { const p=JSON.parse(d); p.ok ? resolve(p) : reject(new Error(p.description)); } catch(e) { reject(e); } }); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    console.log('✅ Plain text fallback sent.');
  }
}

module.exports = { run };
if (require.main === module) {
  run().catch(err => {
    console.error('❌ Telegram bot crashed with full error:');
    console.error(err);
    process.exit(1);
  });
}
