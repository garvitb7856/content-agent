const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DATA_PATH = path.join(__dirname, '../dashboard/data/data.json');

function checkEnv() {
  const missing = [];
  if (!BOT_TOKEN || BOT_TOKEN.includes("your_")) missing.push("TELEGRAM_BOT_TOKEN");
  if (!CHAT_ID || CHAT_ID.includes("your_")) missing.push("TELEGRAM_CHAT_ID");
  if (missing.length > 0) {
    console.error(`ERROR: Missing or placeholder variables in .env: ${missing.join(', ')}`);
    console.error(`Please update TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env first.`);
    process.exit(1);
  }
}

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return null;
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function fmt(n) {
  try {
    const num = parseInt(n);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : num.toString();
  } catch (e) {
    return n.toString();
  }
}

function avg(lst) {
  if (!lst || lst.length === 0) return 0;
  return Math.round(lst.reduce((a, b) => a + b, 0) / lst.length);
}

function buildReport(data) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const mine = data?.your_account || {};
  const posts = mine.posts || [];
  const myAvg = avg(posts.map(p => p.likes));
  const maxLikes = posts.length ? Math.max(...posts.map(p => p.likes)) : '-';

  const comps = data?.competitors || {};
  const compArray = Object.keys(comps).map(h => ({
    handle: h,
    avgLikes: comps[h].stats?.avg_likes || 0
  })).sort((a, b) => b.avgLikes - a.avgLikes);

  const compLines = compArray.slice(0, 3).map(c => `  • @${c.handle}: ${fmt(Math.round(c.avgLikes))} avg likes`);

  let allCompPosts = [];
  Object.values(comps).forEach(c => {
    if (c.posts) allCompPosts = allCompPosts.concat(c.posts);
  });

  const topPost = allCompPosts.length ? allCompPosts.reduce((max, p) => (p.likes > max.likes ? p : max), allCompPosts[0]) : null;

  const dayTypes = ["Reel", "Carousel", "Reel", "Story", "Reel", "Carousel", "REST DAY"];
  const todayType = dayTypes[now.getDay()];
  const isLive = !data?.sample_data;
  const sampleNote = isLive ? "🟢 LIVE DATA (Apify Scrape)" : "⚠️ SAMPLE DATA";

  let aiSection = "";
  const aiPath = path.join(__dirname, '../dashboard/data/agents_output.json');
  if (fs.existsSync(aiPath)) {
    try {
      const aiData = JSON.parse(fs.readFileSync(aiPath, 'utf8'))?.agents || {};
      const ideatorSnippet = aiData.ideator ? aiData.ideator.slice(0, 180) + '...' : '';
      const hookSnippet = aiData.hook_script ? aiData.hook_script.slice(0, 180) + '...' : '';
      const analystSnippet = aiData.analyst ? aiData.analyst.slice(0, 180) + '...' : '';

      aiSection = `\n🤖 GEMINI AI AGENTS BRIEF:
💡 IDEATOR:
${ideatorSnippet}

✍️ HOOK & SCRIPT:
${hookSnippet}

📊 ANALYST VERDICT:
${analystSnippet}\n`;
    } catch (e) {}
  }

  return `🤖 CONTENT AGENT DAILY BRIEFING
📅 ${dateStr} - ${timeStr} IST
STATUS: ${sampleNote}

📊 YOUR STATS (@garvit.irl)
• Avg likes/post: ${fmt(myAvg)}
• Posts tracked: ${posts.length}
• Top post: ${fmt(maxLikes)} likes

🏆 TOP 3 COMPETITORS
${compLines.join('\n')}

🔥 TOP COMPETITOR POST
${topPost ? `@${topPost.username}: ${fmt(topPost.likes)} likes\n"${(topPost.caption || '').slice(0, 100)}..."` : 'No data'}

📌 TODAY'S STRATEGY
Post a ${todayType} at 7:00 PM IST
${aiSection}
🖥️ Live Dashboard: open dashboard/index.html`;
}

function sendMessage(text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      chat_id: CHAT_ID,
      text: text
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function run() {
  checkEnv();
  const data = loadData();
  const report = buildReport(data);
  console.log("📨 Sending briefing to Telegram...");
  try {
    const result = await sendMessage(report);
    if (result && result.ok) {
      console.log(`✅ SUCCESS — Message sent! Telegram Message ID: ${result.result.message_id}`);
    } else {
      console.error("❌ Telegram API returned failure:", result);
    }
  } catch (error) {
    console.error("❌ Error sending Telegram message:", error.message);
  }
}

run();
