import os, json, requests
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID")
DATA_PATH = Path(__file__).parent.parent / "dashboard" / "data" / "data.json"

def check_env():
    missing = []
    if not BOT_TOKEN or "your_" in BOT_TOKEN: missing.append("TELEGRAM_BOT_TOKEN")
    if not CHAT_ID   or "your_" in CHAT_ID:   missing.append("TELEGRAM_CHAT_ID")
    if missing:
        raise SystemExit(f"ERROR: Missing in .env: {', '.join(missing)}")

def load_data():
    if not DATA_PATH.exists(): return None
    return json.loads(DATA_PATH.read_text())

def fmt(n):
    try:
        n = int(n)
        return f"{n/1000:.1f}k" if n >= 1000 else str(n)
    except: return str(n)

def avg(lst):
    return round(sum(lst) / len(lst)) if lst else 0

def build_report(data):
    now  = datetime.now()
    mine = data.get("your_account", {}) if data else {}
    posts = mine.get("posts", [])
    my_avg = avg([p["likes"] for p in posts])
    comps  = data.get("competitors", {}) if data else {}
    comp_lines = []
    for h, d in sorted(comps.items(), key=lambda x: -(x[1].get("stats",{}).get("avg_likes",0)))[:3]:
        comp_lines.append(f"  * @{h}: {fmt(round(d.get('stats',{}).get('avg_likes',0)))} avg likes")
    all_comp = [p for d in comps.values() for p in d.get("posts",[])]
    top = max(all_comp, key=lambda p: p["likes"]) if all_comp else None
    day_types = {0:"Reel",1:"Carousel",2:"Reel",3:"Story",4:"Reel",5:"Carousel",6:"REST DAY"}
    sample = "\nNOTE: Sample data. Run fetch_data.py for real stats." if data and data.get("sample_data") else ""

    return f"""Content Agent Daily Briefing
{now.strftime('%A, %d %b %Y')} - {now.strftime('%I:%M %p IST')}
{sample}

YOUR STATS (@garvit.irl)
Avg likes/post: {fmt(my_avg)}
Posts tracked:  {len(posts)}
Top post: {fmt(max([p['likes'] for p in posts])) if posts else '-'} likes

TOP 3 COMPETITORS
{chr(10).join(comp_lines)}

TOP COMPETITOR POST
{"@"+top["username"]+": "+fmt(top["likes"])+" likes" if top else "No data"}
{'"'+top["caption"][:120]+'..."' if top else ""}

TODAY: Post a {day_types[now.weekday()]} at 7:00 PM IST

5 agents running. Dashboard: open dashboard/index.html"""

def send_message(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    r = requests.post(url, json={"chat_id": CHAT_ID, "text": text}, timeout=15)
    r.raise_for_status()
    return r.json()

if __name__ == "__main__":
    check_env()
    data = load_data()
    report = build_report(data)
    print("Sending to Telegram...")
    result = send_message(report)
    if result.get("ok"):
        print("SUCCESS — message sent! ID:", result["result"]["message_id"])
    else:
        print("FAILED:", result)
