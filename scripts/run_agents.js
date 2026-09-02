const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DATA_PATH = path.join(__dirname, '../dashboard/data/data.json');
const OUT_PATH = path.join(__dirname, '../dashboard/data/agents_output.json');

function checkEnv() {
  if (!GEMINI_KEY || GEMINI_KEY.includes('your_')) {
    console.error("❌ ERROR: GEMINI_API_KEY not set in .env file.");
    process.exit(1);
  }
  if (!fs.existsSync(DATA_PATH)) {
    console.error("❌ ERROR: dashboard/data/data.json not found.");
    process.exit(1);
  }
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

async function gemini(prompt, label = "") {
  process.stdout.write(`  Calling Gemini for ${label}... `);

  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
  let lastError = null;

  for (const model of models) {
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 600 }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    try {
      const responseText = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
      });

      const parsed = JSON.parse(responseText);
      const text = parsed.candidates[0].content.parts[0].text.trim();
      console.log("done.");
      await new Promise(r => setTimeout(r, 2000));
      return text;
    } catch (err) {
      lastError = err;
    }
  }

  console.log(`failed: ${lastError?.message}`);
  return `[Agent Error: ${lastError?.message}]`;
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

async function runIdeator(data) {
  const mine = data.your_account || {};
  const comps = data.competitors || {};
  const posts = mine.posts || [];
  const myAvg = avg(posts.map(p => p.likes));

  let allCompPosts = [];
  Object.values(comps).forEach(c => {
    if (c.posts) allCompPosts = allCompPosts.concat(c.posts);
  });

  const topPosts = allCompPosts.sort((a, b) => b.likes - a.likes).slice(0, 5);
  const compSummary = topPosts.map(p => `- @${p.username} (${fmt(p.likes)} likes): "${(p.caption || '').slice(0, 120)}"`).join('\n');
  const myCaptions = posts.slice(0, 5).map(p => `- "${(p.caption || '').slice(0, 100)}"`).join('\n');

  const prompt = `You are an expert Instagram content strategist.
CREATOR: @garvit.irl — AI/content creator, ~18k followers, avg ${fmt(myAvg)} likes/post.
Their recent posts:
${myCaptions}
Top competitor posts this week (by likes):
${compSummary}
Generate 5 original, specific content IDEAS for @garvit.irl.
Each idea: adapted to their voice, clear angle, format (Reel/Carousel/Image).
Format: IDEA [N]: [Title] / Format: [type] / Angle: [one sentence]`;

  return await gemini(prompt, "Ideator");
}

async function runHookScript(data, ideatorOutput) {
  const prompt = `You are a viral Instagram hook and script writer.
CREATOR: @garvit.irl — AI/productivity content, Gen Z Indian audience.
Based on these ideas:
${(ideatorOutput || '').slice(0, 800)}
Write:
1. THREE punchy opening hooks (first Reel line, under 10 words each, create curiosity).
2. A SHORT script outline for the best hook (8-12 sentences): Hook, Problem, Insight, Proof, CTA.
Format: HOOK 1:, HOOK 2:, HOOK 3:, then SCRIPT OUTLINE:`;

  return await gemini(prompt, "Hook & Script");
}

async function runPlanner(data) {
  const mine = data.your_account || {};
  const posts = mine.posts || [];
  const dayLikes = {};

  posts.forEach(p => {
    try {
      const dt = new Date(p.timestamp);
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayLikes[dayName]) dayLikes[dayName] = [];
      dayLikes[dayName].push(p.likes);
    } catch (e) {}
  });

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const daySummary = days.map(d => `- ${d}: ${fmt(avg(dayLikes[d] || []))} avg likes (${(dayLikes[d] || []).length} posts)`).join('\n');

  const prompt = `You are a content calendar strategist for Instagram creators.
CREATOR: @garvit.irl — posts AI/productivity/creator content, Indian audience.
Their engagement by day of week:
${daySummary}
Create a specific 7-day content calendar for next week.
For each day: Post type (Reel/Carousel/Image/Story/Rest), Best time IST, Topic focus, Why.
Be specific and data-driven. Format as a clean day-by-day plan.`;

  return await gemini(prompt, "Planner");
}

async function runAnalyst(data) {
  const mine = data.your_account || {};
  const comps = data.competitors || {};
  const posts = mine.posts || [];

  const myAvgLikes = avg(posts.map(p => p.likes));
  const myAvgComments = avg(posts.map(p => p.comments));
  const videoLikes = avg(posts.filter(p => p.type === "Video").map(p => p.likes));
  const imageLikes = avg(posts.filter(p => p.type === "Image").map(p => p.likes));
  const sidecarLikes = avg(posts.filter(p => p.type === "Sidecar").map(p => p.likes));

  const compStats = Object.keys(comps).map(h => {
    const c = comps[h];
    return `@${h}: ${fmt(c.stats?.avg_likes || 0)} avg likes, ${(c.followers || 0).toLocaleString()} followers`;
  }).join('\n');

  const prompt = `You are a data-driven Instagram growth analyst.
@garvit.irl stats: avg ${fmt(myAvgLikes)} likes, ${fmt(myAvgComments)} comments, ${posts.length} posts.
Format performance: Video=${fmt(videoLikes)}, Image=${fmt(imageLikes)}, Carousel=${fmt(sidecarLikes)}.
Competitors (ranked):
${compStats}
Write: 1. PERFORMANCE GRADE (A-F + why). 2. TOP INSIGHT. 3. FORMAT VERDICT. 4. 3 SPECIFIC ACTIONS. 5. BENCHMARK GAP.
Be direct, honest, specific. No fluff.`;

  return await gemini(prompt, "Analyst");
}

async function runDmManager(data) {
  const prompt = `You are a DM manager for @garvit.irl, Indian AI/content creator, 18k followers.
Write 5 ready-to-use DM templates for: 1) Growth questions 2) Collab/brand enquiry 3) Mentorship requests 4) Spam deflection 5) Fan appreciation.
Each: warm but boundaried, real person tone, under 3 sentences, include [PLACEHOLDER] where needed.
Format: DM TYPE [N]: [name] / TEMPLATE: [response]`;

  return await gemini(prompt, "DM Manager");
}

async function main() {
  console.log("==================================================");
  console.log("Content Agent — Running All 5 AI Agents (Gemini API)");
  console.log("==================================================");
  checkEnv();
  const data = loadData();
  const results = {};

  console.log("\n[1/5] Ideator");
  results.ideator = await runIdeator(data);

  console.log("\n[2/5] Hook & Script");
  results.hook_script = await runHookScript(data, results.ideator);

  console.log("\n[3/5] Planner");
  try {
    results.planner = await runPlanner(data);
  } catch (e) {
    results.planner = `Planner needs more post history. Error: ${e.message}`;
  }

  console.log("\n[4/5] Analyst");
  results.analyst = await runAnalyst(data);

  console.log("\n[5/5] DM Manager");
  results.dm_manager = await runDmManager(data);

  const output = {
    generated_at: new Date().toISOString(),
    agents: results
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\n🎉 All 5 AI agents complete! Output saved to:`);
  console.log(`   ${OUT_PATH}`);
  console.log("Refresh dashboard/index.html to see live AI agent analysis.");
}

main();
