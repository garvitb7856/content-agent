"""
generate_sample_data.py — creates realistic sample data.json
"""
import json, random
from pathlib import Path
from datetime import datetime, timedelta

random.seed(42)

HANDLES = {
    "garvit.irl": {"followers": 18400, "tier": "yours"},
    "nick_saraev": {"followers": 142000, "tier": "big"},
    "arshman": {"followers": 85000, "tier": "big"},
    "ishansharma7390": {"followers": 920000, "tier": "macro"},
    "aryamanupmanyu": {"followers": 560000, "tier": "macro"},
    "nivedan.ai": {"followers": 31000, "tier": "mid"},
    "dhavalkataria_": {"followers": 78000, "tier": "big"},
    "vaibhavsisinty": {"followers": 210000, "tier": "big"},
    "favourite.engineer": {"followers": 44000, "tier": "mid"},
}

POST_TYPES = ["Image", "Video", "Sidecar"]
TOPICS = [
    "AI tools that 10x your productivity",
    "Why most people fail at content creation",
    "The only content framework you need",
    "How I went from 0 to 18k followers in 6 months",
    "Stop doing this on Instagram",
    "5 AI prompts that write your captions",
    "My exact content workflow",
    "The viral hook formula",
    "Why consistency beats virality",
    "Building in public: week 3 update",
]

def make_posts(username, n=20):
    posts = []
    tier = HANDLES[username]["tier"]
    base_likes = {"yours": 280, "mid": 900, "big": 3500, "macro": 18000}[tier]
    for i in range(n):
        dt = datetime.now() - timedelta(days=i * 3 + random.randint(0, 2))
        likes = int(base_likes * random.uniform(0.4, 2.8))
        topic = random.choice(TOPICS)
        ptype = random.choices(POST_TYPES, weights=[2, 5, 3])[0]
        posts.append({
            "id": f"{username}_{i}",
            "username": username,
            "type": ptype,
            "caption": f"{topic} — here's exactly how I do it\n\n#contentcreator #ai #instagram #growth",
            "likes": likes,
            "comments": int(likes * random.uniform(0.02, 0.08)),
            "views": int(likes * random.uniform(3, 12)) if ptype == "Video" else 0,
            "plays": int(likes * random.uniform(4, 15)) if ptype == "Video" else 0,
            "timestamp": dt.isoformat() + "Z",
            "url": f"https://www.instagram.com/p/sample_{username}_{i}/",
            "hashtags": ["contentcreator", "ai", "instagram", "growth", "creator"],
        })
    return posts

def stats(posts):
    if not posts:
        return {}
    likes = [p["likes"] for p in posts]
    comments = [p["comments"] for p in posts]
    return {
        "post_count": len(posts),
        "avg_likes": round(sum(likes) / len(likes), 1),
        "avg_comments": round(sum(comments) / len(comments), 1),
        "top_post": max(posts, key=lambda p: p["likes"]),
    }

your_posts = make_posts("garvit.irl", 20)

comp_dict = {}
for h, info in HANDLES.items():
    if h != "garvit.irl":
        p = make_posts(h, 20)
        comp_dict[h] = {
            "followers": info["followers"],
            "posts": p,
            "stats": stats(p),
        }

data = {
    "fetched_at": datetime.now().isoformat() + "Z",
    "sample_data": True,
    "your_account": {
        "username": "garvit.irl",
        "followers": HANDLES["garvit.irl"]["followers"],
        "posts": your_posts,
        "stats": stats(your_posts),
    },
    "competitors": comp_dict,
}

out = Path(__file__).parent.parent / "dashboard" / "data" / "data.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, indent=2))

out2 = Path(__file__).parent.parent / "dashboard" / "data.json"
out2.write_text(json.dumps(data, indent=2))

print(f"Sample data written to {out}")
for h, d in data["competitors"].items():
    print(f"  @{h}: {d['stats']['post_count']} posts")
