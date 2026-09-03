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

gen_cfg = genai.types.GenerationConfig(
    max_output_tokens=8192,
    temperature=0.8
)
model = genai.GenerativeModel('gemini-3.5-flash', generation_config=gen_cfg)

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

comp_summary = ""
for c in competitors:
    c_handle = c.get('username') or c.get('handle', 'unknown')
    c_followers = c.get('followers', 0)
    c_stats = c.get('stats', {})
    c_likes = c_stats.get('avg_likes') or c.get('avg_likes', 0)
    c_comments = c_stats.get('avg_comments') or c.get('avg_comments', 0)
    c_posts = c.get('posts') or c.get('recent_posts', [])
    posts_text = ""
    for p in c_posts[:3]:
        cap = p.get('caption', '')[:200].replace('\n', ' ')
        likes = p.get('likes') or p.get('likesCount', 0)
        if cap:
            posts_text += f"    - [{likes} likes] {cap}\n"
    comp_summary += f"\n@{c_handle}: {c_followers} followers | avg {c_likes} likes | avg {c_comments} comments\n  Top posts:\n{posts_text}"

my_posts_text = ""
for p in my_posts[:5]:
    cap = p.get('caption', '')[:200].replace('\n', ' ')
    likes = p.get('likes', 0)
    comments = p.get('comments', 0)
    my_posts_text += f"  - [{likes} likes, {comments} comments] {cap}\n"

print("Running Agent 1: Ideator...")
ideator_output = ask(f"""
You are a viral content strategist for Instagram creators in the Indian AI/tech/automation niche.

CREATOR PROFILE:
- Handle: @{my_handle}
- Followers: {my_followers}
- Avg likes/post: {my_avg_likes}
- Avg comments/post: {my_avg_comments}
- Niche: AI tools, automation, productivity for Indian creators

MY RECENT 5 POSTS:
{my_posts_text}

COMPETITOR DATA (what is working RIGHT NOW):
{comp_summary}

YOUR TASK — Give a COMPLETE, DETAILED response with these 4 sections:

SECTION 1: TOP 3 CONTENT PATTERNS
List the top 3 content patterns/hooks driving the most engagement across competitors. For each: name the pattern, give 2 real examples from competitor data, and explain the psychological reason it works.

SECTION 2: WHY THESE WORK FOR GARVIT
Explain specifically why each pattern fits @{my_handle}'s audience and niche.

SECTION 3: 5 READY-TO-USE CONTENT IDEAS
For each idea provide:
- Exact video title (the text on screen)
- Hook (first 3 seconds, word for word)
- Why it will work for Garvit's audience
- Content angle and structure

SECTION 4: QUICK WIN
One content idea Garvit can film TODAY with zero prep that will outperform his recent posts.

Be extremely specific. Use real competitor post data above. Write in full — do not truncate or summarise. Complete all 4 sections fully.
""")

print("Running Agent 2: Hook & Script...")
hook_script_output = ask(f"""
You are a viral short-form video scriptwriter for Indian tech/AI creators on Instagram Reels.

CREATOR: @{my_handle} — Indian creator, AI tools & automation niche, {my_followers} followers
AUDIENCE: Indian creators, students, professionals interested in AI and productivity

BEST PERFORMING COMPETITOR CONTENT:
{comp_summary}

YOUR TASK — Write 3 COMPLETE, ready-to-film Instagram Reel scripts. Do not truncate. Write each script in full.

For EACH of the 3 scripts provide ALL of these:

--- SCRIPT [N] ---
TITLE: [video title]
HOOK: [exact words for first 3 seconds — must stop the scroll]
FULL SCRIPT: [complete word-for-word script, 45-60 seconds when spoken at normal pace. Include stage directions in brackets. Write every single word.]
CAPTION: [full caption with call to action]
HASHTAGS: [15 relevant hashtags]
B-ROLL: [bullet list of what to show on screen]

Make the scripts sound natural — not corporate, not robotic. Indian creator energy. Reference real AI tools. Be specific. Write all 3 scripts completely.
""")

print("Running Agent 3: Planner...")
planner_output = ask(f"""
You are a data-driven Instagram content strategist.

CREATOR: @{my_handle} | {my_followers} followers | Niche: AI tools & automation
CURRENT PERFORMANCE: Avg likes: {my_avg_likes} | Avg comments: {my_avg_comments}

COMPETITOR POSTING ANALYSIS:
{comp_summary}

YOUR TASK — Write a COMPLETE 7-day content calendar. Do not truncate. Cover all 7 days in full.

Start with: WEEKLY STRATEGY NOTE — what is the single biggest thing Garvit should focus on this week.

Then for EACH day (Day 1 Monday through Day 7 Sunday) provide ALL of:
- Best posting time in IST with specific reason why
- Content format: Reel / Carousel / Story
- Specific topic and exact title
- Hook (first line of the video or carousel)
- Content goal: reach / engagement / saves / followers
- Comment trigger word (what word people comment to get a DM)

Then end with: WHAT NOT TO DO THIS WEEK — 3 mistakes to avoid based on the competitor data.

Write all 7 days completely. Be specific with times. Base times on when competitor content peaks.
""")

print("Running Agent 4: Analyst...")
eng_rate = round((my_avg_likes + my_avg_comments) / my_followers * 100, 2) if my_followers else 0
analyst_output = ask(f"""
You are an Instagram growth analyst for the Indian tech/AI creator niche.

GARVIT'S STATS (@{my_handle}):
- Followers: {my_followers}
- Avg likes per post: {my_avg_likes}
- Avg comments per post: {my_avg_comments}
- Engagement rate: {eng_rate}%

COMPETITOR DATA:
{comp_summary}

YOUR TASK — Write a COMPLETE competitor analysis report. Do not truncate. Cover all 5 sections fully.

SECTION 1 — FULL RANKING TABLE
Rank all 9 creators (Garvit + 8 competitors) in a table with columns: Rank | Handle | Followers | Avg Likes | Avg Comments | Engagement Rate. Show every creator, no omissions.

SECTION 2 — WHERE GARVIT IS WINNING
List every metric where @{my_handle} outperforms at least one competitor. Include exact numbers. Be honest — even small wins count.

SECTION 3 — WHERE GARVIT IS FALLING BEHIND
List every significant gap with exact numbers comparing Garvit to the creator just above him. Be direct.

SECTION 4 — BIGGEST GROWTH LEVER RIGHT NOW
The single most impactful action Garvit can take RIGHT NOW to close the gap. Give specific expected outcome (e.g. "+200 followers in 2 weeks if X is done").

SECTION 5 — THIS WEEK'S PRIORITY ACTION
One concrete task for this week with a step-by-step execution plan.

Write all 5 sections completely. Include actual numbers from the data above.
""")

print("Running Agent 5: DM Manager...")
dm_output = ask(f"""
You are a DM strategy expert for Instagram creators in the AI/tech niche.

CREATOR: @{my_handle} | Indian AI & automation creator | {my_followers} followers
EMAIL: garvitb.business@gmail.com

YOUR TASK — Write 8 COMPLETE DM reply templates. Write each one fully, do not summarise.

For each template provide:
- SITUATION: [describe the situation]
- GOAL: [what this reply achieves]
- THE DM: [the exact message to send, in quotes, ready to copy-paste]
- FOLLOW-UP: [what to do if they reply]

Write templates for these 8 situations:
1. New follower says "bro great content keep it up"
2. Someone asks "which AI tools do you use?"
3. Someone asks "how do I start with AI/automation?"
4. Collab request from another creator
5. Someone asks "can you make a video on [topic]?"
6. Brand/sponsor reaching out for paid partnership
7. Someone says "your content helped me a lot, thank you"
8. Someone asks "are you available for 1-on-1 consulting?"

Rules: Under 3 sentences per DM. Conversational and warm — sounds like a real person, not a bot. Soft CTA where appropriate. Sound like Garvit — Indian creator, AI-focused, friendly but professional.

Write all 8 templates completely with the SITUATION, GOAL, THE DM, and FOLLOW-UP for each.
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
print(f"Ideator: {len(ideator_output)} chars")
print(f"Hook & Script: {len(hook_script_output)} chars")
print(f"Planner: {len(planner_output)} chars")
print(f"Analyst: {len(analyst_output)} chars")
print(f"DM Manager: {len(dm_output)} chars")
print("Saved to dashboard/data/agents_output.json")
