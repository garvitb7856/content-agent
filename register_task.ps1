$action = New-ScheduledTaskAction -Execute "node" -Argument "scripts/telegram_listener.js" -WorkingDirectory "C:\Users\pc\.gemini\antigravity\scratch\content-agent"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName "ContentAgentTelegramListener" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
