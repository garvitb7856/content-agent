# setup_scheduler.ps1 — Register Windows Scheduled Task for Content Agent

$nodePath = "C:\Program Files\nodejs\node.exe"
$scriptPath = "C:\Users\pc\.gemini\antigravity\scratch\content-agent\scripts\run_cycle.js"
$workDir = "C:\Users\pc\.gemini\antigravity\scratch\content-agent"

$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument $scriptPath `
    -WorkingDirectory $workDir

$trigger = New-ScheduledTaskTrigger -Daily -At "07:00AM"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "ContentAgentDailyReport" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Sends daily content briefing to Telegram at 7AM IST" `
    -Force

Write-Host "Task successfully registered!"
Get-ScheduledTask -TaskName "ContentAgentDailyReport" | Select-Object TaskName, State
