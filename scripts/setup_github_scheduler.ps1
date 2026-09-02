# setup_github_scheduler.ps1 — Daily GitHub Pages Auto-Update Task

$batPath = "C:\Users\pc\.gemini\antigravity\scratch\content-agent\scripts\push_update.bat"
$workDir = "C:\Users\pc\.gemini\antigravity\scratch\content-agent"

$action = New-ScheduledTaskAction `
    -Execute $batPath `
    -WorkingDirectory $workDir

$trigger = New-ScheduledTaskTrigger -Daily -At "07:00AM"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "ContentAgentDailyUpdate" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Fetches data, runs agents, pushes to GitHub, sends Telegram" `
    -Force

Write-Host "Task successfully registered!"
Get-ScheduledTask -TaskName "ContentAgentDailyUpdate" | Select-Object TaskName, State
