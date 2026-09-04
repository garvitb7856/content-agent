require('dotenv').config({ path: '.env' });
const https = require('https');
const k = process.env.GEMINI_API_KEY;

const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

async function test(m) {
  return new Promise((resolve) => {
    const d = JSON.stringify({
      contents: [{ parts: [{ text: 'Say hello in 5 words' }] }],
      generationConfig: { maxOutputTokens: 50 }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${m}:generateContent?key=${k}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) },
      timeout: 15000
    }, (r) => {
      let b = '';
      r.on('data', c => b += c);
      r.on('end', () => {
        console.log(`${m}: HTTP ${r.statusCode} ${r.statusCode === 200 ? '✅' : '❌'}`);
        if (r.statusCode !== 200) console.log('  ', b.substring(0, 200));
        resolve();
      });
    });
    req.on('timeout', () => { console.log(`${m}: TIMEOUT ❌`); req.destroy(); resolve(); });
    req.on('error', (e) => { console.log(`${m}: ERR ${e.message}`); resolve(); });
    req.write(d);
    req.end();
  });
}

(async () => {
  for (const m of models) await test(m);
  console.log('Done.');
})();
