#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick test for Discord worker production startup
.DESCRIPTION
    Builds and starts the Discord worker, validates env loading and critical channels
.EXAMPLE
    .\test-worker-prod.ps1
#>

$ErrorActionPreference = "Stop"
$startTime = Get-Date

Write-Host "`n" -NoNewline
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  DISCORD WORKER PRODUCTION TEST" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check prereqs
Write-Host "[?] Checking prerequisites..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[X] Node.js not found" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Node.js $(node --version)" -ForegroundColor Green

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[X] npm not found" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] npm $(npm --version)" -ForegroundColor Green

# Verify .env files exist
Write-Host "`n[?] Checking environment files..." -ForegroundColor Yellow

$rootEnvProd = ".\\.env.prod"
$workerEnvProd = ".\\discord-worker\\.env.prod"

if (Test-Path $rootEnvProd) {
    Write-Host "[OK] Found: $rootEnvProd" -ForegroundColor Green
} else {
    Write-Host "[!] Missing: $rootEnvProd (will be auto-created)" -ForegroundColor Yellow
}

if (Test-Path $workerEnvProd) {
    Write-Host "[OK] Found: $workerEnvProd" -ForegroundColor Green
} else {
    Write-Host "[!] Missing: $workerEnvProd (will be auto-created)" -ForegroundColor Yellow
}

# Build
Write-Host "`n[*] Building worker..." -ForegroundColor Yellow
Push-Location discord-worker
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "[OK] Build successful" -ForegroundColor Green
Pop-Location

# Start worker and capture output for 10 seconds
Write-Host "`n[*] Starting worker (10 second test)..." -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

Push-Location discord-worker

# Run worker with 10 second timeout to capture startup logs
$process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c npm run start" `
    -PassThru `
    -NoNewWindow `
    -RedirectStandardOutput ".\worker-test-stdout.log" `
    -RedirectStandardError ".\worker-test-stderr.log"

# Wait for startup logs
Start-Sleep -Seconds 5

# Kill the process
try {
    Stop-Process -InputObject $process -Force -ErrorAction SilentlyContinue
} catch {
    # Process already exited
}

# Read and display logs
$stdout = Get-Content ".\worker-test-stdout.log" -Raw -ErrorAction SilentlyContinue
$stderr = Get-Content ".\worker-test-stderr.log" -Raw -ErrorAction SilentlyContinue
$logs = $stdout + $stderr

# Display relevant logs
Write-Host ""
$logs | ForEach-Object {
    if ($_ -match "\[ENV|worker_ready|ENV CHECK|channel_access_ok|boot_complete|boot_error|boot_critical") {
        Write-Host $_ -ForegroundColor White
    }
}

# Validate critical checks
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

$envCheckOk = $logs -match "\[ENV CHECK OK\]"
$workerReady = $logs -match "worker_ready"
$contactPanelOk = $logs -match "contact_panel_ok"
$channelAccessOk = ($logs -match "channel_access_ok" | Measure-Object).Count -ge 3
$bootComplete = $logs -match "boot_complete"

Write-Host "[OK] Validation Results:" -ForegroundColor Cyan
Write-Host "  [ENV CHECK OK]........" -NoNewline
Write-Host $(if ($envCheckOk) { "[OK]" } else { "[X]" }) -ForegroundColor $(if ($envCheckOk) { "Green" } else { "Red" })

Write-Host "  [WORKER READY]........" -NoNewline
Write-Host $(if ($workerReady) { "[OK]" } else { "[X]" }) -ForegroundColor $(if ($workerReady) { "Green" } else { "Red" })

Write-Host "  [CONTACT PANEL OK]..." -NoNewline
Write-Host $(if ($contactPanelOk) { "[OK]" } else { "[!]" }) -ForegroundColor $(if ($contactPanelOk) { "Green" } else { "Yellow" })

Write-Host "  [CHANNELS ACCESS]...." -NoNewline
Write-Host $(if ($channelAccessOk) { "[OK]" } else { "[X]" }) -ForegroundColor $(if ($channelAccessOk) { "Green" } else { "Red" })

Write-Host "  [BOOT COMPLETE]......" -NoNewline
Write-Host $(if ($bootComplete) { "[OK]" } else { "[X]" }) -ForegroundColor $(if ($bootComplete) { "Green" } else { "Red" })

# Overall result
$allOk = $envCheckOk -and $workerReady -and $bootComplete
Write-Host ""
if ($allOk) {
    Write-Host "[OK] PRODUCTION READY" -ForegroundColor Green -BackgroundColor Black
    Write-Host "   npm run start:prod should work fine" -ForegroundColor Green
} else {
    Write-Host "[X] ISSUES DETECTED" -ForegroundColor Red -BackgroundColor Black
    Write-Host "   Check logs above for details" -ForegroundColor Red
}

# Cleanup
Remove-Item ".\worker-test-*.log" -ErrorAction SilentlyContinue
Pop-Location

Write-Host ""
$elapsed = ([Math]::Round(((Get-Date) - $startTime).TotalSeconds, 1))
Write-Host "Test completed in ${elapsed}s" -ForegroundColor Gray
Write-Host ""
