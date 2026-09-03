import os, json
import google.generativeai as genai
from datetime import datetime

# Load .env
if os.path.exists('.env'):
    for line in open('.env'):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
gen_cfg = genai.types.GenerationConfig(max_output_tokens=8192, temperature=0.8)
model = genai.GenerativeModel('gemini-1.5-flash', generation_config=gen_cfg)

def ask(prompt):
    try:
        r = model.generate_content(prompt)
        return r.text.strip()
    except Exception as e:
        return f"Error: {e}"

# Load data
data_path = 'dashboard/data/data.json'
if not os.path.exists(data_path):
    data_path = 'dashboard/data.json'

with open(data_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

me = data.get('your_account', {})
my_handle = me.get('username', 'garvit.irl')
my_followers = me.get('followers', 5845)
stats = me.get('stats', {})
my_avg_likes = stats.get('avg_likes') or me.get('avg_likes', 50)
my_avg_comments = stats.get('avg_comments') or me.get('avg_comments', 10)
my_posts = me.get('posts') or me.get('recent_posts', [])

competitors_raw = data.get('competitors', [])
if isinstance(competitors_raw, dict):
    competitors = [{'username': k, **v} for k, v in competitors_raw.items()]
else:
    competitors = competitors_raw

# Build competitor summary WITH post URLs so Gemini can reference them as links
comp_summary = ""
for c in competitors:
    c_handle = c.get('username') or c.get('handle', 'unknown')
    c_followers = c.get('followers', 0)
    c_stats = c.get('stats', {})
    c_likes = c_stats.get('avg_likes') or c.get('avg_likes', 0)
    c_comments = c_stats.get('avg_comments') or c.get('avg_comments', 0)
    c_posts = c.get('posts') or c.get('recent_posts', [])
    posts_text = ""
    for p in c_posts[:5]:
        cap = p.get('caption', '')[:180].replace('\n', ' ')
        likes = p.get('likes') or p.get('likesCount', 0)
        url = p.get('url', '')
        if cap:
            if url:
                posts_text += f"    - [{likes} likes] [{cap[:80]}...]({url})\n"
            else:
                posts_text += f"    - [{likes} likes] {cap[:80]}...\n"
    comp_summary += f"\n@{c_handle}: {c_followers} followers | avg {c_likes} likes | avg {c_comments} comments\n  Top posts (with links):\n{posts_text}"

# Build my posts summary WITH URLs
my_posts_text = ""
for p in my_posts[:5]:
    cap = p.get('caption', '')[:180].replace('\n', ' ')
    likes = p.get('likes', 0)
    comments = p.get('comments', 0)
    url = p.get('url', '')
    if url:
        my_posts_text += f"  - [{likes} likes, {comments} comments] [{cap[:80]}...]({url})\n"
    else:
        my_posts_text += f"  - [{likes} likes, {comments} comments] {cap[:80]}...\n"

LINK_INSTRUCTION = """
IMPORTANT — LINKING RULE: Whenever you reference a specific competitor post or my post, format it as a markdown link using the URL provided in the data above. Example: [post title or description](https://www.instagram.com/p/XXXXX/). This allows the reader to click and watch the actual video. Always include the link when you reference a specific post.
"""

print("Running Agent 1: Ideator...")
ideator_output = ask(f"""
You are a viral content strategist for Instagram creators in the Indian AI/tech/automation niche.

CREATOR PROFILE:
- Handle: @{my_handle}
- Followers: {my_followers}
- Avg likes/post: {my_avg_likes}
- Avg comments/post: {my_avg_comments}
- Niche: AI tools, automation, productivity for Indian creators

MY RECENT 5 POSTS (with links):
{my_posts_text}

COMPETITOR DATA — posts with Instagram links:
{comp_summary}

{LINK_INSTRUCTION}

YOUR TASK — Write a COMPLETE response with all 4 sections. Do not truncate.

### SECTION 1: TOP 3 CONTENT PATTERNS
For each pattern:
- Name the pattern
- 2 real competitor examples WITH clickable markdown links to the actual posts
- The psychological reason it works

### SECTION 2: WHY THESE WORK FOR GARVIT'S AUDIENCE
Explain specifically why each pattern fits @{my_handle}.

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
""")

print("Running Agent 2: Hook & Script...")
hook_script_output = ask(f"""
You are a viral short-form video scriptwriter for Indian tech/AI creators on Instagram Reels.

CREATOR: @{my_handle} — {my_followers} followers | AI tools & automation niche
AUDIENCE: Indian creators, students, professionals interested in AI and productivity

COMPETITOR CONTENT (with links to actual posts):
{comp_summary}

{LINK_INSTRUCTION}

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
""")

print("Running Agent 3: Planner...")
# Get today's date for real day names
today = datetime.now()
from datetime import timedelta
day_names = []
for i in range(7):
    d = today + timedelta(days=i)
    day_names.append(d.strftime("%A %d %b"))

planner_output = ask(f"""
You are a data-driven Instagram content strategist.

CREATOR: @{my_handle} | {my_followers} followers | Niche: AI tools & automation
CURRENT PERFORMANCE: Avg likes: {my_avg_likes} | Avg comments: {my_avg_comments}

COMPETITOR DATA (with links to actual posts):
{comp_summary}

{LINK_INSTRUCTION}

YOUR TASK — Write a structured 7-day content calendar starting from today ({day_names[0]}).

First write this section:
---
## WEEKLY STRATEGY
[2-3 sentences: the single biggest focus this week to grow fastest, based on competitor data. Reference a specific competitor post link as proof.]

## WHAT NOT TO DO THIS WEEK
1. [mistake to avoid with reason]
2. [mistake to avoid with reason]
3. [mistake to avoid with reason]
---

Then for EACH of the 7 days, use EXACTLY this block format with no variations:

---
## DAY [N] — [DAY NAME AND DATE e.g. Thursday 04 Sep]

**Post Time:** [HH:MM IST] — [one sentence reason why this time]
**Format:** [Reel / Carousel / Story]
**Topic:** [specific topic]
**Title (on screen):** [exact text to put on screen]
**Hook:** [first sentence/line of the video or carousel]
**Goal:** [Reach / Engagement / Saves / Followers]
**Trigger Word:** "[word people comment to get a DM]"
**Inspired by:** [markdown link to a competitor post that proved this works]
---

The 7 days are: {', '.join(day_names)}

Write all 7 day blocks completely using this exact format. Do not skip any field.
""")

print("Running Agent 4: Analyst...")
eng_rate = round((my_avg_likes + my_avg_comments) / my_followers * 100, 2) if my_followers else 0
analyst_output = ask(f"""
You are an Instagram growth analyst for the Indian tech/AI creator niche.

GARVIT'S STATS (@{my_handle}):
- Followers: {my_followers}
- Avg likes: {my_avg_likes}
- Avg comments: {my_avg_comments}
- Engagement rate: {eng_rate}%

COMPETITOR DATA (with links to actual posts):
{comp_summary}

{LINK_INSTRUCTION}

YOUR TASK — Write a COMPLETE analysis report. Do not truncate. Write all 5 sections.

### SECTION 1: FULL RANKING TABLE
| Rank | Handle | Followers | Avg Likes | Avg Comments | Eng Rate |
|------|--------|-----------|-----------|--------------|----------|
[fill every row — all 9 creators including Garvit. Calculate engagement rate as (avg_likes + avg_comments) / followers * 100]

### SECTION 2: WHERE GARVIT IS WINNING
List every metric where @{my_handle} outperforms at least one competitor. Include exact numbers. Reference specific post links as evidence where relevant.

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
""")

print("Running Agent 5: DM Manager...")
dm_output = ask(f"""
You are a DM strategy expert for Instagram creators in the AI/tech niche.

CREATOR: @{my_handle} | {my_followers} followers | AI & automation niche
EMAIL: garvitb.business@gmail.com

CONTEXT — My recent posts people may reference in DMs (with links):
{my_posts_text}

{LINK_INSTRUCTION}

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
""")

output = {
    "ideator": ideator_output,
    "hook_script": hook_script_output,
    "planner": planner_output,
    "analyst": analyst_output,
    "dm_manager": dm_output,
    "generated_at": datetime.now().isoformat()
}

os.makedirs("dashboard/data", exist_ok=True)
with open("dashboard/data/agents_output.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("\n✅ All 5 agents complete!")
print(f"Ideator:      {len(ideator_output)} chars")
print(f"Hook & Script:{len(hook_script_output)} chars")
print(f"Planner:      {len(planner_output)} chars")
print(f"Analyst:      {len(analyst_output)} chars")
print(f"DM Manager:   {len(dm_output)} chars")
