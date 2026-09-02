const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const key = process.env.GEMINI_API_KEY;
console.log("Checking Gemini API Key:", key ? `${key.slice(0, 8)}...` : "NONE");

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        console.log("Available Models:\n", parsed.models.map(m => m.name).join('\n'));
      } else {
        console.log("Response:", parsed);
      }
    } catch (e) {
      console.error(e.message, data);
    }
  });
}).on('error', e => console.error("Error:", e.message));
