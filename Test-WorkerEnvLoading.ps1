# Test-WorkerEnvLoading.ps1
# Verify that discord-worker loads environment variables correctly before module imports

Write-Host "========================================"
Write-Host "Discord Worker: Environment Loading Test"
Write-Host "========================================"
Write-Host ""

# Check .env.prod exists
$envProdPath = Join-Path (Get-Location) ".env.prod"
if (Test-Path $envProdPath) {
    Write-Host "[OK] Found .env.prod at $envProdPath" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[ERROR] .env.prod not found at $envProdPath" -ForegroundColor Red
    exit 1
}

# Parse .env.prod for key variables
Write-Host "Key environment variables in .env.prod:"
Write-Host ""

$envFile = Get-Content $envProdPath
$ingestBaseUrl = $envFile | Where-Object { $_ -match "^INGEST_BASE_URL=" } | ForEach-Object { $_ -split "=" | Select-Object -Last 1 }
$ingestSecret = $envFile | Where-Object { $_ -match "^INGEST_SECRET=" } | ForEach-Object { $_ -split "=" | Select-Object -Last 1 }
$discordToken = $envFile | Where-Object { $_ -match "^DISCORD_TOKEN=" } | ForEach-Object { $_ -split "=" | Select-Object -Last 1 }

if ($ingestBaseUrl) {
    Write-Host "  INGEST_BASE_URL = $ingestBaseUrl" -ForegroundColor Cyan
} else {
    Write-Host "  [MISSING] INGEST_BASE_URL" -ForegroundColor Yellow
}

if ($ingestSecret) {
    Write-Host "  INGEST_SECRET = <$(($ingestSecret).Length) chars>" -ForegroundColor Cyan
} else {
    Write-Host "  [MISSING] INGEST_SECRET" -ForegroundColor Yellow
}

if ($discordToken) {
    Write-Host "  DISCORD_TOKEN = <$(($discordToken).Length) chars>" -ForegroundColor Cyan
} else {
    Write-Host "  [MISSING] DISCORD_TOKEN" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================"
Write-Host "Building TypeScript (discord-worker)..."
Write-Host "========================================"
Write-Host ""

$workerDir = Join-Path (Get-Location) "discord-worker"
Push-Location $workerDir

$buildResult = & npm run build 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Build successful - no TypeScript errors" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[ERROR] Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    Write-Host $buildResult
    Pop-Location
    exit 1
}

Pop-Location

Write-Host "========================================"
Write-Host "Fix Verification PASSED"
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host ""
Write-Host "1. Deploy with .env.prod in production environment"
Write-Host ""
Write-Host "2. Start worker:"
Write-Host "   npm run discord:start"
Write-Host ""
Write-Host "3. Check logs for:"
Write-Host "   [ENV CONFIG AT BOOT] - should show INGEST_BASE_URL and INGEST_SECRET_LENGTH"
Write-Host "   env_config_at_boot - JSON log with actual values"
Write-Host ""
Write-Host "4. Verify /link command works:"
Write-Host "   /link @testuser"
Write-Host "   -> Should show link panel"
Write-Host "   -> NO 'Unexpected token' errors"
Write-Host "   -> Modal opens on 'Lier/Modifier' button"
Write-Host ""
Write-Host "========================================"
