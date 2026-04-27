# Test de notification de contact
# Usage: .\test-contact-notification.ps1

$WORKER_URL = "http://localhost:3001"
if (-not $env:DISCORD_WORKER_SECRET) {
    Write-Host "ERROR: DISCORD_WORKER_SECRET env variable is required" -ForegroundColor Red
    exit 1
}
$WORKER_SECRET = $env:DISCORD_WORKER_SECRET

Write-Host "Testing contact notification endpoint..." -ForegroundColor Green
Write-Host "Worker URL: $WORKER_URL"
Write-Host ""

# Test request
$body = @{
    discordId = "123456789"
    username = "TestPlayer"
    steamId = "76561198123456789"
    rpName = "John Doe"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "$WORKER_URL/api/worker/contact-notification" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $WORKER_SECRET"
    } `
    -Body $body `
    -ErrorAction SilentlyContinue

if ($response) {
    Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response Body:" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10)
} else {
    Write-Host "Request failed!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Test completed!" -ForegroundColor Green
