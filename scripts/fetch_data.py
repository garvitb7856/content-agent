import os, json, time, subprocess, sys
from pathlib import Path
from dotenv import load_dotenv

root_dir = Path(__file__).parent.parent
load_dotenv(root_dir / ".env")

api_token = os.getenv("APIFY_API_TOKEN")
my_handle = os.getenv("MY_INSTAGRAM_HANDLE", "garvit.irl").replace("@", "").strip()
comp_handles = [h.replace("@", "").strip() for h in os.getenv("COMPETITOR_HANDLES", "").split(",") if h.strip()]

if not api_token or "your_" in api_token:
    print("❌ ERROR: APIFY_API_TOKEN missing or invalid in .env file.")
    sys.exit(1)

print("Running Instagram fetcher via Node/Apify runtime...")
res = subprocess.run(["node", str(root_dir / "scripts" / "fetch_instagram_data.js")], cwd=str(root_dir))
sys.exit(res.returncode)
