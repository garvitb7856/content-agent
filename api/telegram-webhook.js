const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_PAT;
const GITHUB_REPO = 'garvitb7856/content-agent';

function sendTelegram(chatId, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, resolve);
    req.on('error', () => {});
    req.write(body);
    req.end();
  });
}

function getFileSHA() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/second_brain/pending_brief.json`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'content-agent-webhook'
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data).sha || null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function writeGitHubFile(content, sha) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      message: 'update: pending brief',
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {})
    });
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/second_brain/pending_brief.json`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'content-agent-webhook'
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => res.statusCode < 300 ? resolve(true) : reject(new Error(`GitHub file: ${res.statusCode} ${data}`)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function triggerGitHubActions() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ ref: 'main' });
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/actions/workflows/generate-script.yml/dispatches`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'content-agent-webhook'
      }
    }, (res) => {
      if (res.statusCode === 204) resolve(true);
      else {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => reject(new Error(`GitHub Actions: ${res.statusCode} ${data}`)));
      }
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');
  try {
    const update = req.body;
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).send('OK');
    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    if (!text) return res.status(200).send('OK');

    // Write full message + chat_id to GitHub file (no character limit)
    const brief = JSON.stringify({ chat_id: String(chatId), brief: text, timestamp: new Date().toISOString() });
    const sha = await getFileSHA();
    await writeGitHubFile(brief, sha);

    await sendTelegram(chatId, '⏳ Generating your script... (~2 minutes)');
    await triggerGitHubActions();
  } catch(e) {
    console.error('Webhook error:', e.message);
  }
  res.status(200).send('OK');
};
