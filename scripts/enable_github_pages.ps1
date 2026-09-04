$ghExe = "C:\Program Files\GitHub CLI\gh.exe"
$token = & $ghExe auth token

$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$body = '{"source":{"branch":"main","path":"/dashboard"}}'

Write-Host "Enabling GitHub Pages..."

try {
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/garvitb7856/content-agent/pages" -Method POST -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Pages enabled! URL: $($r.html_url)"
} catch {
    Write-Host "Already exists, updating..."
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/garvitb7856/content-agent/pages" -Method PUT -Headers $headers -Body $body -ContentType "application/json"
        Write-Host "Pages updated!"
    } catch {
        Write-Host "Note: $($_.Exception.Message)"
    }
}

Start-Sleep -Seconds 8

$status = Invoke-RestMethod -Uri "https://api.github.com/repos/garvitb7856/content-agent/pages" -Method GET -Headers $headers
Write-Host "Status: $($status.status)"
Write-Host "Live URL: $($status.html_url)"
