@echo off
cd /d C:\Users\pc\.gemini\antigravity\scratch\content-agent
echo Running Instagram scraper & 5 AI Agents...
node scripts/run_cycle.js
git add dashboard/data/data.json
git add dashboard/data/agents_output.json 2>nul
git commit -m "Daily content & agent update %date%"
git push origin main
echo Done. Dashboard updated on GitHub Pages and Telegram report sent.
