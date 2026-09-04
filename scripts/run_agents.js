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

  const candidateModels = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.1-flash-lite"];

  for (const model of candidateModels) {
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

    for (let attempt = 1; attempt <= 3; attempt++) {
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
          const text = parsed.candidates[0]?.content?.parts[0]?.text?.trim();
          if (text && text.length > 50) {
            console.log(`done using ${model} (${text.length} chars).`);
            return text;
          }
        }

        if (statusCode === 503 || statusCode === 429) {
          process.stdout.write(`[${model} ${statusCode}, trying fallback]... `);
          break; // move to next candidate model immediately
        }

        throw new Error(`HTTP ${statusCode}: ${body.substring(0, 150)}`);
      } catch (err) {
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 2000));
        } else {
          process.stdout.write(`[${model} failed: ${err.message}]... `);
        }
      }
    }
  }

  console.log(`failed across all fallback models.`);
  return `[Agent Error: all model fallbacks exhausted]`;
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

  // Build competitor summary WITH post URLs
  let compSummary = "";
  competitors.forEach(c => {
    const handle = c.username || c.handle || 'unknown';
    const followers = c.followers || 0;
    const avgLikes = c.stats?.avg_likes || c.avg_likes || 0;
    const avgComments = c.stats?.avg_comments || c.avg_comments || 0;
    const posts = c.posts || c.recent_posts || [];

    let postsText = "";
    posts.slice(0, 5).forEach(p => {
      const cap = (p.caption || '').slice(0, 180).replace(/\n/g, ' ');
      const likes = p.likes || p.likesCount || 0;
      const comments = p.comments || p.commentCount || 0;
      const url = p.url
        || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '');
      if (cap) {
        postsText += `    - URL: ${url}\n    - Likes: ${likes}\n    - Comments: ${comments}\n    - Caption: ${cap}\n\n`;
      }
    });

    compSummary += `\n@${handle}: ${followers} followers | avg ${avgLikes} likes | avg ${avgComments} comments\n  Top posts (with links):\n${postsText}`;
  });

  // Build my posts summary WITH URLs
  let myPostsText = "";
  myPosts.slice(0, 5).forEach(p => {
    const cap = (p.caption || '').slice(0, 180).replace(/\n/g, ' ');
    const likes = p.likes || 0;
    const comments = p.comments || 0;
    const url = p.url
      || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '');
    if (cap) {
      myPostsText += `  - URL: ${url}\n  - Likes: ${likes}\n  - Comments: ${comments}\n  - Caption: ${cap}\n\n`;
    }
  });

  return { myHandle, myFollowers, myAvgLikes, myAvgComments, myPostsText, compSummary };
}

const LINK_INSTRUCTION = `
IMPORTANT: Whenever you reference or recommend a specific post or reel from the data, you MUST include its full Instagram URL in this format: https://www.instagram.com/p/SHORTCODE/ — place it in parentheses immediately after mentioning the post, like this: (https://www.instagram.com/p/ABC123/). Never reference a post without its URL. Only use URLs that are explicitly listed in the data above — never invent or guess a URL.
`;

async function main() {
  console.log("==================================================");
  console.log("Content Agent — Running All 5 AI Agents (Gemini API)");
  console.log("==================================================");
  checkEnv();
  const data = loadData();
  const { myHandle, myFollowers, myAvgLikes, myAvgComments, myPostsText, compSummary } = buildSummaries(data);

  // Build day names for planner
  const dayNames = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dayNames.push(d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }));
  }

  console.log("\nRunning Agent 1: Ideator...");
  const ideator = await gemini(`
IMPORTANT: Whenever you reference or recommend a specific post or reel from the data, you MUST include its full Instagram URL in this format: https://www.instagram.com/p/SHORTCODE/ — place it in parentheses immediately after mentioning the post, like this: (https://www.instagram.com/p/ABC123/). Never reference a post without its URL. Only use URLs explicitly listed in the data — never invent or guess a URL.

You are a viral content strategist for Instagram creators in the Indian AI/tech/automation niche.

CREATOR PROFILE:
- Handle: @${myHandle}
- Followers: ${myFollowers}
- Avg likes/post: ${myAvgLikes}
- Avg comments/post: ${myAvgComments}
- Niche: AI tools, automation, productivity for Indian creators

MY RECENT 5 POSTS (with links):
${myPostsText}

COMPETITOR DATA — posts with Instagram links:
${compSummary}

${LINK_INSTRUCTION}

YOUR TASK — Write a COMPLETE response with all 4 sections. Do not truncate.

### SECTION 1: TOP 3 CONTENT PATTERNS
For each pattern:
- Name the pattern
- 2 real competitor examples WITH clickable markdown links to the actual posts
- The psychological reason it works

### SECTION 2: WHY THESE WORK FOR GARVIT'S AUDIENCE
Explain specifically why each pattern fits @${myHandle}.

### SECTION 3: 5 READY-TO-USE CONTENT IDEAS
For each idea:
- **Title:** exact video title
- **Hook:** first 3 seconds, word for word
- **Why it works:** for Garvit's audience specifically
- **Structure:** what goes in the video
- **CTA:** what viewers comment or do

### SECTION 4: QUICK WIN TODAY
One idea Garvit can film TODAY with zero prep that will outperform his recent posts. Reference a specific competitor post link as inspiration.

Write all 4 sections completely.
`, "Ideator");

  console.log("\nRunning Agent 2: Hook & Script...");
  const hook_script = await gemini(`
IMPORTANT: Whenever you reference or recommend a specific post or reel from the data, you MUST include its full Instagram URL in this format: https://www.instagram.com/p/SHORTCODE/ — place it in parentheses immediately after mentioning the post, like this: (https://www.instagram.com/p/ABC123/). Never reference a post without its URL. Only use URLs explicitly listed in the data — never invent or guess a URL.

You are a viral short-form video scriptwriter for Indian tech/AI creators on Instagram Reels.

CREATOR: @${myHandle} — ${myFollowers} followers | AI tools & automation niche
AUDIENCE: Indian creators, students, professionals interested in AI and productivity

COMPETITOR CONTENT (with links to actual posts):
${compSummary}

${LINK_INSTRUCTION}

YOUR TASK — Write 3 COMPLETE, ready-to-film Reel scripts. Do not truncate. Write every word of every script.

For each script, use EXACTLY this format:

---
### SCRIPT [N]: [TITLE]

**INSPIRATION:** [Link to the competitor post that inspired this — markdown link]

**HOOK (first 3 seconds):**
[exact words to say on camera]

**FULL SCRIPT:**
[complete word-for-word script with stage directions in brackets. 45-60 seconds spoken. Every single word.]

**CAPTION:**
[full caption with CTA]

**HASHTAGS:**
[15 hashtags]

**B-ROLL (what to show on screen):**
- [bullet list]
---

Write all 3 scripts completely using this format.
`, "Hook & Script");

  console.log("\nRunning Agent 3: Planner...");
  const planner = await gemini(`
IMPORTANT: Whenever you reference or recommend a specific post or reel from the data, you MUST include its full Instagram URL in this format: https://www.instagram.com/p/SHORTCODE/ — place it in parentheses immediately after mentioning the post, like this: (https://www.instagram.com/p/ABC123/). Never reference a post without its URL. Only use URLs explicitly listed in the data — never invent or guess a URL.

You are a data-driven Instagram content strategist.

CREATOR: @${myHandle} | ${myFollowers} followers | Niche: AI tools & automation
CURRENT PERFORMANCE: Avg likes: ${myAvgLikes} | Avg comments: ${myAvgComments}

COMPETITOR DATA (with links to actual posts):
${compSummary}

${LINK_INSTRUCTION}

CRITICAL FORMAT RULES — READ BEFORE WRITING:
- Output ONLY the 7 day blocks below. No introduction. No analysis. No "Part 1/2/3". No tables. No summary at the end.
- DO NOT use a markdown table or spreadsheet format. Use only the block format below.
- The schedule starts from TOMORROW: ${dayNames[1]} (not Monday, not today — literally ${dayNames[1]}).
- The 7 days in order are: ${dayNames.slice(1).join(', ')} plus one more day after that.
- All times must be in 24-hour IST format like "18:30 IST".

For EACH of the 7 days, output EXACTLY this block. No extra text between blocks.

---
## DAY [N] — [EXACT DAY NAME AND DATE from the list above, e.g. "Friday 04 Sep"]

**Post Time:** [HH:MM IST] — [one sentence why this time works]
**Format:** [Reel / Carousel / Story]
**Topic:** [specific topic in 5-10 words]
**Title (on screen):** [exact text to show on screen, under 8 words]
**Hook:** [first sentence said on camera — must start with action or shock, not "Here is"]
**Goal:** [Reach / Engagement / Saves / Followers — pick ONE]
**Trigger Word:** "[single word viewers comment to get a DM]"
**Inspired by:** [markdown link to a competitor post that proved this format works]
---

Start immediately with DAY 1. No preamble. No analysis. Just 7 blocks.
`, "Planner");

  console.log("\nRunning Agent 4: Analyst...");
  const er = myFollowers ? ((myAvgLikes + myAvgComments) / myFollowers * 100).toFixed(2) : 0;
  const analyst = await gemini(`
IMPORTANT: Whenever you reference or recommend a specific post or reel from the data, you MUST include its full Instagram URL in this format: https://www.instagram.com/p/SHORTCODE/ — place it in parentheses immediately after mentioning the post, like this: (https://www.instagram.com/p/ABC123/). Never reference a post without its URL. Only use URLs explicitly listed in the data — never invent or guess a URL.

IMPORTANT DATA NOTE: @garvit.irl has one viral outlier post with 26,357 comments that skews averages. Use these pre-calculated correct values for @garvit.irl in ALL tables and analysis: Followers: 5,894 | Avg Likes: 336 | Avg Comments: 20 | Engagement Rate: 1.30%. Do not recalculate these — use them as given.

You are an Instagram growth analyst for the Indian tech/AI creator niche.

GARVIT'S STATS (@${myHandle}):
- Followers: ${myFollowers}
- Avg likes: ${myAvgLikes}
- Avg comments: ${myAvgComments}
- Engagement rate: ${er}%

COMPETITOR DATA (with links to actual posts):
${compSummary}

${LINK_INSTRUCTION}

YOUR TASK — Write a COMPLETE analysis report. Do not truncate. Write all 5 sections.

### SECTION 1: FULL RANKING TABLE
| Rank | Handle | Followers | Avg Likes | Avg Comments | Eng Rate |
|------|--------|-----------|-----------|--------------|----------|
[fill every row — all 10 creators including Garvit. Calculate engagement rate as (avg_likes + avg_comments) / followers * 100]

### SECTION 2: WHERE GARVIT IS WINNING
List every metric where @${myHandle} outperforms at least one competitor. Include exact numbers. Reference specific post links as evidence where relevant.

### SECTION 3: WHERE GARVIT IS FALLING BEHIND
For each gap: exact numbers, which creator is just above Garvit, and the specific post link proving what works for them.

### SECTION 4: BIGGEST GROWTH LEVER RIGHT NOW
The single most impactful action with:
- What to do (specific, not vague)
- Why (link to the competitor post proving it works)
- Expected outcome (e.g. "+300 followers in 2 weeks")

### SECTION 5: THIS WEEK'S PRIORITY ACTION
Step-by-step execution plan for one concrete task this week.

Write all 5 sections completely with real numbers.
`, "Analyst");

  console.log("\nRunning Agent 5: DM Manager...");
  const dm_manager = await gemini(`
IMPORTANT: Whenever you reference or recommend a specific post or reel from the data, you MUST include its full Instagram URL in this format: https://www.instagram.com/p/SHORTCODE/ — place it in parentheses immediately after mentioning the post, like this: (https://www.instagram.com/p/ABC123/). Never reference a post without its URL. Only use URLs explicitly listed in the data — never invent or guess a URL.

You are a DM strategy expert for Instagram creators in the AI/tech niche.

CREATOR: @${myHandle} | ${myFollowers} followers | AI & automation niche
EMAIL: garvitb.business@gmail.com

CONTEXT — My recent posts people may reference in DMs (with links):
${myPostsText}

${LINK_INSTRUCTION}

YOUR TASK — Write 8 COMPLETE DM reply templates. Write each fully.

For EACH template use EXACTLY this format:

---
### TEMPLATE [N]: [SITUATION TITLE]

**Situation:** [describe when to use this]
**Goal:** [what this reply achieves]

**The DM (copy-paste ready):**
> [exact message in quotes — under 3 sentences, warm, natural, sounds like Garvit]

**If they reply:** [what to do next]
---

The 8 situations:
1. New follower says "bro great content keep it up"
2. Someone asks "which AI tools do you use?"
3. Someone asks "how do I start with AI/automation?"
4. Collab request from another creator
5. Someone asks "can you make a video on [topic]?"
6. Brand/sponsor reaching out for paid partnership
7. Someone says "your content helped me a lot, thank you"
8. Someone asks "are you available for 1-on-1 consulting?"

Rules: Under 3 sentences. Conversational, warm, not robotic. Soft CTA where appropriate. Where relevant, link to a specific post from my recent posts list above using markdown.

Write all 8 templates completely.
`, "DM Manager");

  const output = {
    ideator,
    hook_script,
    planner,
    analyst,
    dm_manager,
    generated_at: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(OUT_PATH1), { recursive: true });
  fs.writeFileSync(OUT_PATH1, JSON.stringify(output, null, 2), 'utf8');
  fs.writeFileSync(OUT_PATH2, JSON.stringify(output, null, 2), 'utf8');

  console.log("\n✅ All 5 agents complete!");
  console.log(`Ideator:       ${ideator.length} chars`);
  console.log(`Hook & Script: ${hook_script.length} chars`);
  console.log(`Planner:       ${planner.length} chars`);
  console.log(`Analyst:       ${analyst.length} chars`);
  console.log(`DM Manager:    ${dm_manager.length} chars`);
}

main();
