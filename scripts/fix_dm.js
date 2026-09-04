const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const KEY = process.env.GEMINI_API_KEY;
const file = 'dashboard/data/agents_output.json';
const file2 = 'dashboard/agents_output.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

async function fetchDM() {
  const prompt = `You are a DM strategy expert for Instagram creators in the AI/tech niche.
CREATOR: @garvit.irl | Indian AI & automation creator | 5845 followers
Write 8 ready-to-send DM reply templates for:
1. New follower who says "bro great content keep it up"
2. Someone asking "which AI tools do you use?"
3. Someone asking "how do I start with AI/automation?"
4. Collab request from another creator
5. Someone asking "can you make a video on [topic]?"
6. Brand/sponsor reaching out for paid partnership
7. Someone who says "your content helped me a lot, thank you"
8. Someone asking "are you available for 1-on-1 consulting?"

For each: Under 3 sentences, conversational, warm, Indian creator tone, include soft CTA where appropriate.`;

  const models = ['gemini-3.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
  for (const m of models) {
    try {
      const postData = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: '/v1beta/models/' + m + ':generateContent?key=' + KEY,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      };

      const resText = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      const parsed = JSON.parse(resText);
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.length > 200) {
        console.log('✅ Generated DM manager output (' + text.length + ' chars)');
        data.dm_manager = text.trim();
        if (data.agents) data.agents.dm_manager = text.trim();
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        fs.writeFileSync(file2, JSON.stringify(data, null, 2));
        return;
      }
    } catch(e) {}
  }
}

fetchDM();
