@echo off
cd /d C:\Users\pc\.gemini\antigravity\scratch\content-agent
if not exist logs mkdir logs
echo [%date% %time%] Starting daily content agent cycle... >> logs\daily.log
node scripts\run_cycle.js >> logs\daily.log 2>&1
git add dashboard\data\data.json >> logs\daily.log 2>&1
git add dashboard\data\agents_output.json >> logs\daily.log 2>&1
git commit -m "Daily update %date%" >> logs\daily.log 2>&1
git push origin main >> logs\daily.log 2>&1
echo [%date% %time%] Daily run complete >> logs\daily.log
