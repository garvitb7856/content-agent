const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DATA_PATH = path.join(__dirname, '../dashboard/data/data.json');
const OUT_PATH1 = path.join(__dirname, '../dashboard/data/agents_output.json');
const OUT_PATH2 = path.join(__dirname, '../dashboard/agents_output.json');

function checkEnv() {
  if (!GEMINI_KEY || GEMINI_KEY.includes('your_')) {
    console.error("❌ ERROR: GEMINI_API_KEY not set in .env file.");
    process.exit(1);
  }
}

function loadData() {
  const p = fs.existsSync(DATA_PATH) ? DATA_PATH : path.join(__dirname, '../dashboard/data.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function gemini(prompt, label = "") {
  process.stdout.write(`Calling Gemini for ${label}... `);

  const model = "gemini-3.5-flash";
  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 8192 }
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

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const { statusCode, body } = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
      });

      if (statusCode >= 200 && statusCode < 300) {
        const parsed = JSON.parse(body);
        const text = parsed.candidates[0].content.parts[0].text.trim();
        if (text && text.length > 50) {
          console.log(`done (${text.length} chars, attempt ${attempt}).`);
          return text;
        }
      }

      // Handle 429 rate limit — parse retryDelay from response
      if (statusCode === 429) {
        let waitSec = 15; // default
        try {
          const err = JSON.parse(body);
          const retryInfo = (err.error?.details || []).find(d => d['@type']?.includes('RetryInfo'));
          if (retryInfo?.retryDelay) {
            const parsed = parseInt(retryInfo.retryDelay);
            if (parsed > 0) waitSec = parsed + 3; // add buffer
          }
        } catch(e) {}
        waitSec = Math.max(waitSec, 15);
        process.stdout.write(`rate limited, waiting ${waitSec}s (attempt ${attempt}/5)... `);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }

      throw new Error(`HTTP ${statusCode}: ${body.substring(0, 200)}`);
    } catch (err) {
      if (attempt < 5) {
        const wait = Math.min(10 * attempt, 60);
        process.stdout.write(`error, retrying in ${wait}s... `);
        await new Promise(r => setTimeout(r, wait * 1000));
      } else {
        console.log(`failed after 5 attempts.`);
        return `[Agent Error: ${err.message}]`;
      }
    }
  }
  console.log(`failed.`);
  return `[Agent Error: all attempts exhausted]`;
}

function buildSummaries(data) {
  const me = data.your_account || {};
  const myHandle = me.username || 'garvit.irl';
  const myFollowers = me.followers || 5845;
  const myAvgLikes = me.stats?.avg_likes || me.avg_likes || 334;
  const myAvgComments = me.stats?.avg_comments || me.avg_comments || 12;
  const myPosts = me.posts || me.recent_posts || [];

  const rawComps = data.competitors || {};
  const competitors = Array.isArray(rawComps) 
    ? rawComps 
    : Object.entries(rawComps).map(([k, v]) => ({ username: k, ...v }));

  let compSummary = "";
  competitors.forEach(c => {
    const handle = c.username || c.handle || 'unknown';
    const followers = c.followers || 0;
    const avgLikes = c.stats?.avg_likes || c.avg_likes || 0;
    const avgComments = c.stats?.avg_comments || c.avg_comments || 0;
    const posts = c.posts || c.recent_posts || [];

    let postsText = "";
    posts.slice(0, 3).forEach(p => {
      const cap = (p.caption || '').slice(0, 150).replace(/\n/g, ' ');
      const likes = p.likes || p.likesCount || 0;
      if (cap) postsText += `    - [${likes} likes] ${cap}\n`;
    });

    compSummary += `\n@${handle}: ${followers} followers | avg ${avgLikes} likes | avg ${avgComments} comments\n  Top recent posts:\n${postsText}`;
  });

  let myPostsText = "";
  myPosts.slice(0, 5).forEach(p => {
    const cap = (p.caption || '').slice(0, 150).replace(/\n/g, ' ');
    const likes = p.likes || 0;
    const comments = p.comments || 0;
    myPostsText += `  - [${likes} likes, ${comments} comments] ${cap}\n`;
  });

  return { myHandle, myFollowers, myAvgLikes, myAvgComments, myPostsText, compSummary };
}

async function main() {
  console.log("==================================================");
  console.log("Content Agent — Running All 5 AI Agents (Gemini API)");
  console.log("==================================================");
  checkEnv();
  const data = loadData();
  const { myHandle, myFollowers, myAvgLikes, myAvgComments, myPostsText, compSummary } = buildSummaries(data);

  console.log("\nRunning Agent 1: Ideator...");
  const ideator = await gemini(`
You are a viral content strategist for Instagram creators in the Indian AI/tech/automation niche.

CREATOR PROFILE:
- Handle: @${myHandle}
- Followers: ${myFollowers}
- Avg likes/post: ${myAvgLikes}
- Avg comments/post: ${myAvgComments}
- Niche: AI tools, automation, productivity for Indian creators

MY RECENT POSTS:
${myPostsText}

COMPETITOR DATA (what is working RIGHT NOW):
${compSummary}

YOUR TASK:
1. Identify the TOP 3 content patterns/hooks that are getting the most engagement across competitors this week
2. Explain WHY each pattern works psychologically
3. Generate 5 specific, ready-to-use content ideas for @${myHandle} based on these patterns
4. For each idea, write: the exact video title, why it will work for Garvit's audience, and the content angle

Be extremely specific. Use real competitor post data. Give ideas that are unique to Garvit's voice — AI tools + automation + Indian creator perspective.
Format clearly with headers and numbered lists.
`, "Ideator");

  console.log("\nRunning Agent 2: Hook & Script...");
  const hook_script = await gemini(`
You are a viral short-form video scriptwriter specialising in Indian tech/AI creators on Instagram Reels.

CREATOR: @${myHandle} — Indian creator in AI tools & automation niche, ${myFollowers} followers
AUDIENCE: Indian creators, students, and professionals interested in AI and productivity

BEST PERFORMING COMPETITOR CONTENT THIS WEEK:
${compSummary}

YOUR TASK:
Write 3 complete, ready-to-film Instagram Reel scripts for @${myHandle}.

For each script provide:
1. HOOK (exact words for first 3 seconds — must stop the scroll)
2. FULL SCRIPT (word-for-word, conversational, 45-60 seconds when spoken)
3. CAPTION (with call to action)
4. HASHTAGS (15 relevant hashtags)
5. B-ROLL suggestions (what to show on screen)

Make the scripts sound like Garvit is speaking naturally — not corporate, not robotic. Indian creator energy. Reference real AI tools. Be specific, not vague.
`, "Hook & Script");

  console.log("\nRunning Agent 3: Planner...");
  const planner = await gemini(`
You are a data-driven Instagram content strategist.

CREATOR: @${myHandle} | ${myFollowers} followers | Niche: AI tools & automation

COMPETITOR POSTING ANALYSIS:
${compSummary}

CURRENT PERFORMANCE:
- My avg likes: ${myAvgLikes}
- My avg comments: ${myAvgComments}

YOUR TASK:
1. Analyse when competitors post and when they get peak engagement
2. Create a specific 7-day content calendar for @${myHandle} for the coming week
3. For each day provide:
   - Best posting time (IST) with reason
   - Content format (Reel/Carousel/Story)
   - Specific topic/title
   - Content goal (reach/engagement/saves/followers)
4. Give a weekly strategy note — what is the ONE thing Garvit should focus on this week to grow fastest

Be specific with times. Base posting times on when competitor content peaks. Format as a clear day-by-day table then add strategy notes.
`, "Planner");

  console.log("\nRunning Agent 4: Analyst...");
  const er = myFollowers ? ((myAvgLikes + myAvgComments) / myFollowers * 100).toFixed(2) : 0;
  const analyst = await gemini(`
You are an Instagram growth analyst specialising in the Indian tech/AI creator niche.

GARVIT'S STATS (@${myHandle}):
- Followers: ${myFollowers}
- Avg likes per post: ${myAvgLikes}
- Avg comments per post: ${myAvgComments}
- Engagement rate: ${er}%

COMPETITOR BENCHMARKS:
${compSummary}

YOUR TASK — Write a detailed competitor analysis report:

1. RANKING: Rank @${myHandle} vs all 8 competitors on: followers, engagement rate, avg likes, avg comments

2. WHERE GARVIT IS WINNING: List specific metrics where @${myHandle} outperforms competitors. Be honest — even small wins count.

3. WHERE GARVIT IS FALLING BEHIND: List specific gaps with exact numbers comparing Garvit to the nearest competitor above him.

4. GROWTH OPPORTUNITY: What is the single biggest lever Garvit can pull RIGHT NOW to close the gap? Give a specific, actionable recommendation with expected outcome.

5. WEEKLY PRIORITY ACTION: One concrete thing to do this week based on the data.

Be direct, honest, and data-driven. No fluff.
`, "Analyst");

  console.log("\nRunning Agent 5: DM Manager...");
  const dm_manager = await gemini(`
You are a DM strategy expert for Instagram creators in the AI/tech niche.

CREATOR: @${myHandle} | Indian AI & automation creator | ${myFollowers} followers
NICHE: AI tools, automation, productivity, content creation with AI

YOUR TASK:
Write 8 ready-to-send DM reply templates for the most common situations @${myHandle} will face:

1. New follower who says "bro great content keep it up"
2. Someone asking "which AI tools do you use?"
3. Someone asking "how do I start with AI/automation?"
4. Collab request from another creator
5. Someone asking "can you make a video on [topic]?"
6. Brand/sponsor reaching out for paid partnership
7. Someone who says "your content helped me a lot, thank you"
8. Someone asking "are you available for 1-on-1 consulting?"

For each:
- Write the exact DM reply (conversational, warm, sounds like a real person not a bot)
- Keep it under 3 sentences — short replies get read
- Include a soft CTA where appropriate (follow, save, watch a video)
- Sound like Garvit — Indian creator, AI-focused, friendly but professional

Label each template clearly.
`, "DM Manager");

  const output = {
    ideator,
    hook_script,
    planner,
    analyst,
    dm_manager,
    agents: { ideator, hook_script, planner, analyst, dm_manager },
    generated_at: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(OUT_PATH1), { recursive: true });
  fs.writeFileSync(OUT_PATH1, JSON.stringify(output, null, 2), 'utf8');
  fs.writeFileSync(OUT_PATH2, JSON.stringify(output, null, 2), 'utf8');

  console.log("\n✅ All 5 agents complete!");
  console.log(`Ideator: ${ideator.length} chars`);
  console.log(`Hook & Script: ${hook_script.length} chars`);
  console.log(`Planner: ${planner.length} chars`);
  console.log(`Analyst: ${analyst.length} chars`);
  console.log(`DM Manager: ${dm_manager.length} chars`);
}

main();
