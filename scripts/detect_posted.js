const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const SECOND_BRAIN_DIR = path.join(__dirname, '../second_brain');
const DASHBOARD_SB_DIR = path.join(__dirname, '../dashboard/second_brain');
const ACTIVE_PLAN_PATH = path.join(SECOND_BRAIN_DIR, 'active_plan.json');
const DASHBOARD_PLAN_PATH = path.join(DASHBOARD_SB_DIR, 'active_plan.json');
const LAST_POSTS_PATH = path.join(SECOND_BRAIN_DIR, 'last_known_posts.json');
const UNPLANNED_PATH = path.join(SECOND_BRAIN_DIR, 'unplanned_posts.json');
const DATA_PATH = path.join(__dirname, '../dashboard/data/data.json');

function ensureDirs() {
  fs.mkdirSync(SECOND_BRAIN_DIR, { recursive: true });
  fs.mkdirSync(DASHBOARD_SB_DIR, { recursive: true });
}

async function askGeminiMatch(plannedText, actualCaption) {
  if (!GEMINI_KEY) return false;

  const prompt = `The user planned to post: ${plannedText}. They actually posted: ${actualCaption}. Does this post match the plan? Reply with only: YES or NO`;

  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 20 }
  });

  const candidateModels = ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite"];

  for (const model of candidateModels) {
    try {
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

      const { statusCode, body } = await new Promise((resolve, reject) => {
        const req = https.request(options, res => {
          let d = '';
          res.on('data', chunk => d += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, body: d }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      if (statusCode >= 200 && statusCode < 300) {
        const parsed = JSON.parse(body);
        const ans = parsed.candidates[0]?.content?.parts[0]?.text?.trim()?.toUpperCase() || "";
        return ans.includes("YES");
      }
    } catch (e) {
      // try fallback
    }
  }

  return false;
}

function getPostId(p) {
  return p.id || p.shortCode || p.url || p.caption || JSON.stringify(p);
}

async function main() {
  ensureDirs();

  if (!fs.existsSync(DATA_PATH)) {
    console.log("⚠️ data.json not found for post detection.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const currentPosts = (data.your_account && Array.isArray(data.your_account.posts))
    ? data.your_account.posts
    : [];

  let lastKnownPosts = [];
  if (fs.existsSync(LAST_POSTS_PATH)) {
    try {
      lastKnownPosts = JSON.parse(fs.readFileSync(LAST_POSTS_PATH, 'utf8'));
    } catch (e) {
      lastKnownPosts = [];
    }
  }

  const knownIds = new Set(lastKnownPosts.map(p => getPostId(p)));
  const newPosts = currentPosts.filter(p => !knownIds.has(getPostId(p)));

  if (newPosts.length === 0) {
    console.log("ℹ️ No new posts detected since last run.");
    fs.writeFileSync(LAST_POSTS_PATH, JSON.stringify(currentPosts, null, 2), 'utf8');
    return;
  }

  console.log(`🔍 Detected ${newPosts.length} new post(s)! Checking against active plan...`);

  let activePlan = null;
  if (fs.existsSync(ACTIVE_PLAN_PATH)) {
    try {
      activePlan = JSON.parse(fs.readFileSync(ACTIVE_PLAN_PATH, 'utf8'));
    } catch (e) {
      activePlan = null;
    }
  }

  let unplannedPosts = [];
  if (fs.existsSync(UNPLANNED_PATH)) {
    try {
      unplannedPosts = JSON.parse(fs.readFileSync(UNPLANNED_PATH, 'utf8'));
    } catch (e) {
      unplannedPosts = [];
    }
  }

  for (const post of newPosts) {
    const caption = (post.caption || "").substring(0, 300);
    let matched = false;

    if (activePlan && Array.isArray(activePlan.days)) {
      for (const dayItem of activePlan.days) {
        if (dayItem.status === "pending") {
          const plannedText = `Topic: ${dayItem.topic} | Hook: ${dayItem.hook}`;
          console.log(`Checking new post against Day ${dayItem.day} (${dayItem.date})...`);
          
          const isMatch = await askGeminiMatch(plannedText, caption);
          if (isMatch) {
            console.log(`  ✅ Matched Day ${dayItem.day}! Marking as posted.`);
            dayItem.status = "posted";
            dayItem.posted_caption = caption;
            dayItem.posted_date = new Date().toISOString().split('T')[0];
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      console.log(`  ℹ️ Post did not match any pending plan item. Logging as unplanned post.`);
      unplannedPosts.push({
        post_id: getPostId(post),
        caption: caption,
        detected_at: new Date().toISOString()
      });
    }
  }

  // Save updated active plan
  if (activePlan) {
    fs.writeFileSync(ACTIVE_PLAN_PATH, JSON.stringify(activePlan, null, 2), 'utf8');
    fs.writeFileSync(DASHBOARD_PLAN_PATH, JSON.stringify(activePlan, null, 2), 'utf8');
  }

  // Save unplanned posts & last known posts
  fs.writeFileSync(UNPLANNED_PATH, JSON.stringify(unplannedPosts, null, 2), 'utf8');
  fs.writeFileSync(LAST_POSTS_PATH, JSON.stringify(currentPosts, null, 2), 'utf8');

  console.log("✅ Post detection complete.");
}

main().catch(err => {
  console.error("❌ detect_posted failed:", err);
});
