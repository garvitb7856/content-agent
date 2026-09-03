import os, json, re
import google.generativeai as genai
from datetime import datetime

# Load env
if os.path.exists('.env'):
    for line in open('.env'):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel('gemini-1.5-flash')

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
my_avg_likes = stats.get('avg_likes') or me.get('avg_likes', 334)
my_avg_comments = stats.get('avg_comments') or me.get('avg_comments', 12)
my_posts = me.get('posts') or me.get('recent_posts', [])

competitors_raw = data.get('competitors', [])
if isinstance(competitors_raw, dict):
    competitors = [{'username': k, **v} for k, v in competitors_raw.items()]
else:
    competitors = competitors_raw

# Build competitor summary
comp_summary = ""
for c in competitors:
    c_handle = c.get('username') or c.get('handle', 'unknown')
    c_followers = c.get('followers', 0)
    c_stats = c.get('stats', {})
    c_likes = c_stats.get('avg_likes') or c.get('avg_likes', 0)
    c_comments = c_stats.get('avg_comments') or c.get('avg_comments', 0)

    posts_text = ""
    c_posts = c.get('posts') or c.get('recent_posts', [])
    for p in c_posts[:3]:
        cap = p.get('caption', '')[:150].replace('\n', ' ')
        likes = p.get('likes') or p.get('likesCount', 0)
        if cap:
            posts_text += f"    - [{likes} likes] {cap}\n"
    comp_summary += f"""
@{c_handle}: {c_followers} followers | avg {c_likes} likes | avg {c_comments} comments
  Top recent posts:
{posts_text}"""

# Build my posts summary
my_posts_text = ""
for p in my_posts[:5]:
    cap = p.get('caption', '')[:150].replace('\n', ' ')
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

MY RECENT POSTS:
{my_posts_text}

COMPETITOR DATA (what is working RIGHT NOW):
{comp_summary}

YOUR TASK:
1. Identify the TOP 3 content patterns/hooks that are getting the most engagement across competitors this week
2. Explain WHY each pattern works psychologically
3. Generate 5 specific, ready-to-use content ideas for @{my_handle} based on these patterns
4. For each idea, write: the exact video title, why it will work for Garvit's audience, and the content angle

Be extremely specific. Use real competitor post data. Give ideas that are unique to Garvit's voice — AI tools + automation + Indian creator perspective.
Format clearly with headers and numbered lists.
""")

print("Running Agent 2: Hook & Script...")
hook_script_output = ask(f"""
You are a viral short-form video scriptwriter specialising in Indian tech/AI creators on Instagram Reels.

CREATOR: @{my_handle} — Indian creator in AI tools & automation niche, {my_followers} followers
AUDIENCE: Indian creators, students, and professionals interested in AI and productivity

BEST PERFORMING COMPETITOR CONTENT THIS WEEK:
{comp_summary}

YOUR TASK:
Write 3 complete, ready-to-film Instagram Reel scripts for @{my_handle}.

For each script provide:
1. HOOK (exact words for first 3 seconds — must stop the scroll)
2. FULL SCRIPT (word-for-word, conversational, 45-60 seconds when spoken)
3. CAPTION (with call to action)
4. HASHTAGS (15 relevant hashtags)
5. B-ROLL suggestions (what to show on screen)

Make the scripts sound like Garvit is speaking naturally — not corporate, not robotic. Indian creator energy. Reference real AI tools. Be specific, not vague.
""")

print("Running Agent 3: Planner...")
planner_output = ask(f"""
You are a data-driven Instagram content strategist.

CREATOR: @{my_handle} | {my_followers} followers | Niche: AI tools & automation

COMPETITOR POSTING ANALYSIS:
{comp_summary}

CURRENT PERFORMANCE:
- My avg likes: {my_avg_likes}
- My avg comments: {my_avg_comments}

YOUR TASK:
1. Analyse when competitors post and when they get peak engagement
2. Create a specific 7-day content calendar for @{my_handle} for the coming week
3. For each day provide:
   - Best posting time (IST) with reason
   - Content format (Reel/Carousel/Story)
   - Specific topic/title
   - Content goal (reach/engagement/saves/followers)
4. Give a weekly strategy note — what is the ONE thing Garvit should focus on this week to grow fastest

Be specific with times. Base posting times on when competitor content peaks. Format as a clear day-by-day table then add strategy notes.
""")

print("Running Agent 4: Analyst...")
analyst_output = ask(f"""
You are an Instagram growth analyst specialising in the Indian tech/AI creator niche.

GARVIT'S STATS (@{my_handle}):
- Followers: {my_followers}
- Avg likes per post: {my_avg_likes}
- Avg comments per post: {my_avg_comments}
- Engagement rate: {round((my_avg_likes + my_avg_comments) / my_followers * 100, 2) if my_followers else 0}%

COMPETITOR BENCHMARKS:
{comp_summary}

YOUR TASK — Write a detailed competitor analysis report:

1. RANKING: Rank @{my_handle} vs all 8 competitors on: followers, engagement rate, avg likes, avg comments

2. WHERE GARVIT IS WINNING: List specific metrics where @{my_handle} outperforms competitors. Be honest — even small wins count.

3. WHERE GARVIT IS FALLING BEHIND: List specific gaps with exact numbers comparing Garvit to the nearest competitor above him.

4. GROWTH OPPORTUNITY: What is the single biggest lever Garvit can pull RIGHT NOW to close the gap? Give a specific, actionable recommendation with expected outcome.

5. WEEKLY PRIORITY ACTION: One concrete thing to do this week based on the data.

Be direct, honest, and data-driven. No fluff.
""")

print("Running Agent 5: DM Manager...")
dm_output = ask(f"""
You are a DM strategy expert for Instagram creators in the AI/tech niche.

CREATOR: @{my_handle} | Indian AI & automation creator | {my_followers} followers
NICHE: AI tools, automation, productivity, content creation with AI

YOUR TASK:
Write 8 ready-to-send DM reply templates for the most common situations @{my_handle} will face:

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
""")

output = {
    "ideator": ideator_output,
    "hook_script": hook_script_output,
    "planner": planner_output,
    "analyst": analyst_output,
    "dm_manager": dm_output,
    "_generated_at": datetime.now().isoformat()
}

os.makedirs("dashboard/data", exist_ok=True)
with open("dashboard/data/agents_output.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

with open("dashboard/agents_output.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("\n✅ All 5 agents complete!")
print(f"Ideator: {len(ideator_output)} chars")
print(f"Hook & Script: {len(hook_script_output)} chars")
print(f"Planner: {len(planner_output)} chars")
print(f"Analyst: {len(analyst_output)} chars")
print(f"DM Manager: {len(dm_output)} chars")
