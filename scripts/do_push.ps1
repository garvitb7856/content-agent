$ghExe = "C:\Program Files\GitHub CLI\gh.exe"
$token = & $ghExe auth token
$repoDir = "C:\Users\pc\.gemini\antigravity\scratch\content-agent"
Set-Location $repoDir

git remote set-url origin "https://garvitb7856:${token}@github.com/garvitb7856/content-agent.git"

git add dashboard/index.html dashboard/data/agents_output.json scripts/run_agents.py scripts/run_agents.js
git commit -m "fix: planner format + table parser CRLF bug + day-block styling"
git push origin main
git log --oneline -3
Write-Host "Done!"
