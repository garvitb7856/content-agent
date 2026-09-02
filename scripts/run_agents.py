"""
run_agents.py — runs all 5 AI agents using Gemini API.
Reads dashboard/data/data.json, writes to dashboard/data/agents_output.json.
Run: python scripts\run_agents.py
"""
import os, json, requests, time, sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

GEMINI_KEY = os.getenv("GEMINI_API_KEY")
DATA_PATH  = Path(__file__).parent.parent / "dashboard" / "data" / "data.json"
OUT_PATH   = Path(__file__).parent.parent / "dashboard" / "data" / "agents_output.json"

def check_env():
    if not GEMINI_KEY or "your_" in GEMINI_KEY:
        raise SystemExit("ERROR: GEMINI_API_KEY not set in .env")
    if not DATA_PATH.exists():
        raise SystemExit("ERROR: data.json not found.")

def load_data():
    return json.loads(DATA_PATH.read_text())

def gemini(prompt, label=""):
    print(f"  Calling Gemini for {label}...", end="", flush=True)
    models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"]
    last_err = None
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}"
        try:
            resp = requests.post(url, json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.8, "maxOutputTokens": 600}
            }, timeout=30)
            if resp.status_code == 200:
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                print(" done.")
                time.sleep(2)
                return text
            else:
                last_err = resp.text
        except Exception as e:
            last_err = str(e)
    print(f" failed: {last_err}")
    return f"[Error calling Gemini: {last_err}]"

def fmt(n):
    try: n=int(n); return f"{n/1000:.1f}k" if n>=1000 else str(n)
    except: return str(n)

def avg(lst): return round(sum(lst)/len(lst)) if lst else 0

def run_ideator(data):
    mine = data.get("your_account",{})
    comps = data.get("competitors",{})
    posts = mine.get("posts",[])
    my_avg = avg([p["likes"] for p in posts])
    top_posts = sorted(
        [p for d in comps.values() for p in d.get("posts",[])],
        key=lambda p: p["likes"], reverse=True
    )[:5]
    comp_summary = "\n".join([f"- @{p['username']} ({fmt(p['likes'])} likes): \"{p.get('caption','')[:120]}\"" for p in top_posts])
    my_captions  = "\n".join([f"- \"{p.get('caption','')[:100]}\"" for p in posts[:5]])
    prompt = f"""You are an expert Instagram content strategist.
CREATOR: @garvit.irl — AI/content creator, ~18k followers, avg {fmt(my_avg)} likes/post.
Their recent posts:
{my_captions}
Top competitor posts this week (by likes):
{comp_summary}
Generate 5 original, specific content IDEAS for @garvit.irl.
Each idea: adapted to their voice, clear angle, format (Reel/Carousel/Image).
Format: IDEA [N]: [Title] / Format: [type] / Angle: [one sentence]"""
    return gemini(prompt, "Ideator")

def run_hook_script(data, ideator_output):
    prompt = f"""You are a viral Instagram hook and script writer.
CREATOR: @garvit.irl — AI/productivity content, Gen Z Indian audience.
Based on these ideas:
{ideator_output[:800]}
Write:
1. THREE punchy opening hooks (first Reel line, under 10 words each, create curiosity).
2. A SHORT script outline for the best hook (8-12 sentences): Hook, Problem, Insight, Proof, CTA.
Format: HOOK 1:, HOOK 2:, HOOK 3:, then SCRIPT OUTLINE:"""
    return gemini(prompt, "Hook & Script")

def run_planner(data):
    mine = data.get("your_account",{})
    posts = mine.get("posts",[])
    from collections import defaultdict
    day_likes = defaultdict(list)
    for p in posts:
        try:
            d = datetime.fromisoformat(p["timestamp"].replace("Z",""))
            day_likes[d.strftime("%A")].append(p["likes"])
        except: pass
    day_summary = "\n".join([
        f"- {day}: {fmt(avg(day_likes.get(day,[])))} avg likes ({len(day_likes.get(day,[]))} posts)"
        for day in ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    ])
    prompt = f"""You are a content calendar strategist for Instagram creators.
CREATOR: @garvit.irl — posts AI/productivity/creator content, Indian audience.
Their engagement by day of week:
{day_summary}
Create a specific 7-day content calendar for next week.
For each day: Post type (Reel/Carousel/Image/Story/Rest), Best time IST, Topic focus, Why.
Be specific and data-driven. Format as a clean day-by-day plan."""
    return gemini(prompt, "Planner")

def run_analyst(data):
    mine  = data.get("your_account",{})
    comps = data.get("competitors",{})
    posts = mine.get("posts",[])
    my_avg_likes    = avg([p["likes"] for p in posts])
    my_avg_comments = avg([p["comments"] for p in posts])
    video_likes   = avg([p["likes"] for p in posts if p.get("type")=="Video"])
    image_likes   = avg([p["likes"] for p in posts if p.get("type")=="Image"])
    sidecar_likes = avg([p["likes"] for p in posts if p.get("type")=="Sidecar"])
    comp_stats = "\n".join([
        f"@{h}: {fmt(round(d.get('stats',{}).get('avg_likes',0)))} avg likes, {d.get('followers',0):,} followers"
        for h,d in sorted(comps.items(), key=lambda x: -(x[1].get("stats",{}).get("avg_likes",0)))
    ])
    prompt = f"""You are a data-driven Instagram growth analyst.
@garvit.irl stats: avg {fmt(my_avg_likes)} likes, {fmt(my_avg_comments)} comments, {len(posts)} posts.
Format performance: Video={fmt(video_likes)}, Image={fmt(image_likes)}, Carousel={fmt(sidecar_likes)}.
Competitors (ranked): {comp_stats}
Write: 1. PERFORMANCE GRADE (A-F + why). 2. TOP INSIGHT. 3. FORMAT VERDICT. 4. 3 SPECIFIC ACTIONS. 5. BENCHMARK GAP.
Be direct, honest, specific. No fluff."""
    return gemini(prompt, "Analyst")

def run_dm_manager(data):
    prompt = """You are a DM manager for @garvit.irl, Indian AI/content creator, 18k followers.
Write 5 ready-to-use DM templates for: 1) Growth questions 2) Collab/brand enquiry 3) Mentorship requests 4) Spam deflection 5) Fan appreciation.
Each: warm but boundaried, real person tone, under 3 sentences, include [PLACEHOLDER] where needed.
Format: DM TYPE [N]: [name] / TEMPLATE: [response]"""
    return gemini(prompt, "DM Manager")

def main():
    print("="*50)
    print("Content Agent — Running All 5 AI Agents (Gemini)")
    print("="*50)
    check_env()
    data = load_data()
    results = {}
    print("\n[1/5] Ideator")
    results["ideator"] = run_ideator(data)
    print("\n[2/5] Hook & Script")
    results["hook_script"] = run_hook_script(data, results["ideator"])
    print("\n[3/5] Planner")
    try: results["planner"] = run_planner(data)
    except Exception as e: results["planner"] = f"Planner needs more post history. Error: {e}"
    print("\n[4/5] Analyst")
    results["analyst"] = run_analyst(data)
    print("\n[5/5] DM Manager")
    results["dm_manager"] = run_dm_manager(data)
    output = {"generated_at": datetime.now().isoformat(), "agents": results}
    OUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\nAll agents done. Saved to {OUT_PATH}")
    print("Refresh dashboard/index.html to see AI output.")

if __name__ == "__main__":
    main()
