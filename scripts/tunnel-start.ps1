#!/usr/bin/env pwsh
# Cloudflare Tunnel Start Script
# Starts tunnel + app + worker

param(
    [switch]$UseTryCloudflare = $false,
    [string]$EnvFile = "env\.env.production.local",
    [switch]$NoEnvWrite = $false
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[START] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Update-EnvFile {
    param(
        [string]$FilePath,
        [string]$TunnelUrl
    )
    
    # Create backup
    $backupPath = "$FilePath.bak"
    Copy-Item -Path $FilePath -Destination $backupPath -Force
    Write-Success "Backup created: $backupPath"
    
    # Read current content
    $content = Get-Content -Path $FilePath -Raw
    
    # Update or add each variable
    $varsToUpdate = @{
        "NEXTAUTH_URL" = $TunnelUrl
        "SITE_BASE_URL" = $TunnelUrl
        "DISCORD_API_BASE_URL" = $TunnelUrl
    }
    
    foreach ($key in $varsToUpdate.Keys) {
        $value = $varsToUpdate[$key]
        $pattern = "(?m)^\s*$key\s*=.*$"
        
        if ($content -match $pattern) {
            # Replace existing
            $content = $content -replace $pattern, "$key=$value"
            Write-Host "  Updated: $key" -ForegroundColor Gray
        } else {
            # Add new at end
            $content += "`n$key=$value"
            Write-Host "  Added: $key" -ForegroundColor Gray
        }
    }
    
    # Write back
    Set-Content -Path $FilePath -Value $content -NoNewline
    Write-Success "Environment file updated: $FilePath"
}

# Validate script parsing
Write-Host "[PARSE] Script loaded successfully" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STARTING TUNNEL + APP + WORKER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if cloudflared exists
$binDir = Join-Path $PSScriptRoot "..\bin"
$cloudflaredPath = Join-Path $binDir "cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Error-Custom "cloudflared.exe not found"
    Write-Host "Run: .\scripts\tunnel-install.ps1 first"
    exit 1
}

# Check env file
if (-not (Test-Path $EnvFile)) {
    Write-Warning-Custom "Environment file not found: $EnvFile"
    Write-Host "Using .env.local as fallback"
    $EnvFile = ".env.local"
}

# Load environment
Write-Step "Loading environment from: $EnvFile"
$envVarsToPass = @{}
$envContent = Get-Content $EnvFile -ErrorAction SilentlyContinue
foreach ($line in $envContent) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
        continue
    }
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        # Store for passing to jobs
        $envVarsToPass[$key] = $value
    }
}

# Validate critical environment variables
Write-Step "Validating environment..."
$criticalVars = @(
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "OWNER_DISCORD_ID",
    "CHEF_FAMILLE_ROLE_ID"
)

$missingVars = @()
foreach ($var in $criticalVars) {
    $val = [System.Environment]::GetEnvironmentVariable($var)
    if (-not $val -or $val.Contains("__FILL_ME__")) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Error-Custom "Missing required environment variables:"
    foreach ($var in $missingVars) {
        Write-Host "  - $var"
    }
    Write-Host ""
    Write-Host "Edit $EnvFile and fill in all __FILL_ME__ values:"
    Write-Host "  1. NEXTAUTH_SECRET (32+ random characters)"
    Write-Host "  2. DISCORD_BOT_TOKEN (from Discord Dev Portal)"
    Write-Host "  3. DISCORD_CLIENT_ID (from Discord Dev Portal)"
    Write-Host "  4. DISCORD_CLIENT_SECRET (from Discord Dev Portal)"
    Write-Host ""
    Write-Host "Then run again:"
    Write-Host "  .\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile $EnvFile"
    exit 1
}

Write-Success "Environment validated"


# Start tunnel in background
Write-Step "Starting Cloudflare Tunnel..."

$tunnelProcess = $null
$tunnelUrl = $null

if ($UseTryCloudflare) {
    Write-Host "Using trycloudflare.com (temporary URL)..."
    Write-Host ""
    
    # Create log file for tunnel output
    $tunnelLogPath = Join-Path $PSScriptRoot "..\cloudflared\tunnel.log"
    $tunnelLogDir = Split-Path $tunnelLogPath
    if (-not (Test-Path $tunnelLogDir)) {
        New-Item -ItemType Directory -Path $tunnelLogDir -Force | Out-Null
    }
    
    # Start tunnel with trycloudflare - redirect output to log file
    $tunnelJob = Start-Job -ScriptBlock {
        param($cloudflaredPath, $logPath)
        & $cloudflaredPath tunnel --url http://localhost:3000 2>&1 | Tee-Object -FilePath $logPath
    } -ArgumentList $cloudflaredPath, $tunnelLogPath
    
    Write-Host "Waiting for tunnel URL..."
    Write-Host "(cloudflared may show info/warning messages, this is normal)"
    Write-Host ""
    
    # Poll log file for URL (max 30 seconds)
    $maxAttempts = 30
    $attempt = 0
    $urlFound = $false
    
    while (-not $urlFound -and $attempt -lt $maxAttempts) {
        Start-Sleep -Seconds 1
        $attempt++
        
        if (Test-Path $tunnelLogPath) {
            $logContent = Get-Content $tunnelLogPath -ErrorAction SilentlyContinue
            if ($logContent) {
                # Look for trycloudflare URL in log
                foreach ($line in $logContent) {
                    if ($line -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
                        $tunnelUrl = $matches[1]
                        $urlFound = $true
                        break
                    }
                }
            }
        }
        
        # Also check job output (but suppress errors)
        try {
            $jobOutput = Receive-Job -Job $tunnelJob -Keep -ErrorAction SilentlyContinue 2>$null
            if ($jobOutput) {
                $outputText = $jobOutput | Out-String
                if ($outputText -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
                    $tunnelUrl = $matches[1]
                    $urlFound = $true
                }
            }
        } catch {
            # Ignore errors from Receive-Job (cloudflared info messages)
        }
        
        if (-not $urlFound) {
            Write-Host "." -NoNewline
        }
    }
    
    Write-Host ""
    
    if ($tunnelUrl) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "[TUNNEL] URL: $tunnelUrl" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        
        # Auto-update env file with tunnel URL (unless -NoEnvWrite is specified)
        if (-not $NoEnvWrite -and (Test-Path $EnvFile)) {
            Write-Step "Auto-updating environment file with tunnel URL..."
            try {
                Update-EnvFile -FilePath $EnvFile -TunnelUrl $tunnelUrl
                
                # Reload env file to validate
                Write-Step "Validating updated environment..."
                $envVarsToPass = @{}
                $envContent = Get-Content $EnvFile -ErrorAction SilentlyContinue
                foreach ($line in $envContent) {
                    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
                        continue
                    }
                    if ($line -match '^([^=]+)=(.*)$') {
                        $key = $matches[1].Trim()
                        $value = $matches[2].Trim().Trim('"')
                        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
                        $envVarsToPass[$key] = $value
                    }
                }
                
                # Check for __FILL_ME__ after update
                $stillMissing = @()
                foreach ($line in $envContent) {
                    if ($line -match '__FILL_ME__' -and $line -notmatch '^\s*#') {
                        $stillMissing += $line.Trim()
                    }
                }
                
                if ($stillMissing.Count -gt 0) {
                    Write-Warning-Custom "Some variables still contain __FILL_ME__:"
                    foreach ($line in $stillMissing) {
                        Write-Host "  $line" -ForegroundColor Yellow
                    }
                    Write-Host ""
                }
                
                # Verify NEXTAUTH_URL matches tunnel URL
                $currentNextAuthUrl = [System.Environment]::GetEnvironmentVariable("NEXTAUTH_URL")
                if ($currentNextAuthUrl -eq $tunnelUrl) {
                    Write-Success "NEXTAUTH_URL validated: $currentNextAuthUrl"
                } else {
                    Write-Warning-Custom "NEXTAUTH_URL mismatch - expected: $tunnelUrl, got: $currentNextAuthUrl"
                }
                
                Write-Host ""
            } catch {
                Write-Warning-Custom "Failed to update env file: $_"
                Write-Host "You'll need to manually update:" -ForegroundColor Yellow
                Write-Host "  NEXTAUTH_URL=$tunnelUrl" -ForegroundColor Yellow
                Write-Host "  SITE_BASE_URL=$tunnelUrl" -ForegroundColor Yellow
                Write-Host "  DISCORD_API_BASE_URL=$tunnelUrl" -ForegroundColor Yellow
                Write-Host ""
            }
        }
        
        # Display Discord redirect URI prominently
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "[DISCORD] REDIRECT URI:" -ForegroundColor Yellow
        Write-Host "$tunnelUrl/api/auth/callback/discord" -ForegroundColor White
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "NEXT STEPS:" -ForegroundColor Cyan
        Write-Host "1. Go to: https://discord.com/developers/applications" -ForegroundColor White
        Write-Host "2. Select your application (ID: $env:DISCORD_CLIENT_ID)" -ForegroundColor White
        Write-Host "3. OAuth2 -> Redirects -> Add the URI above" -ForegroundColor White
        Write-Host "4. If you updated the redirect URI, restart this script" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Warning-Custom "Could not detect URL automatically after ${attempt}s"
        Write-Host "Check tunnel log: $tunnelLogPath"
        Write-Host "Or check job output: Receive-Job -Id $($tunnelJob.Id) -ErrorAction SilentlyContinue"
    }
    
    Write-Host ""
    Write-Host "Tunnel Job ID: $($tunnelJob.Id)"
    Write-Host "Tunnel Log: $tunnelLogPath"
    Write-Host ""
    
} else {
    # Use config.yml
    $configPath = Join-Path $PSScriptRoot "..\cloudflared\config.yml"
    
    if (-not (Test-Path $configPath)) {
        Write-Error-Custom "Tunnel config not found: $configPath"
        Write-Host "Run: .\scripts\tunnel-create.ps1 first"
        Write-Host "Or use: .\scripts\tunnel-start.ps1 -UseTryCloudflare"
        exit 1
    }
    
    Write-Host "Using config: $configPath"
    
    # Start tunnel with config
    $tunnelJob = Start-Job -ScriptBlock {
        param($cloudflaredPath, $configPath)
        & $cloudflaredPath tunnel --config $configPath run
    } -ArgumentList $cloudflaredPath, $configPath
    
    Write-Success "Tunnel started (Job ID: $($tunnelJob.Id))"
    Write-Host "Check your Cloudflare dashboard for tunnel status"
}

# Build app if not already built
Write-Step "Checking if app is built..."
$distDir = Join-Path $PSScriptRoot "..\.next"
if (-not (Test-Path $distDir)) {
    Write-Step "Building app..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Build failed"
        Stop-Job -Job $tunnelJob
        Remove-Job -Job $tunnelJob
        exit 1
    }
    Write-Success "Build complete"
} else {
    Write-Success "App already built"
}

# Start app
Write-Step "Starting Next.js app on port 3000..."

$appJob = Start-Job -ScriptBlock {
    param($envVars)
    
    # Set environment variables in job context
    foreach ($key in $envVars.Keys) {
        [System.Environment]::SetEnvironmentVariable($key, $envVars[$key], "Process")
    }
    
    cd "c:\panel-esperados\panel"
    & npm run start 2>&1
} -ArgumentList $envVarsToPass -ErrorAction SilentlyContinue

if (-not $appJob) {
    Write-Error-Custom "Failed to start app job"
    exit 1
}

Write-Success "App started (Job ID: $($appJob.Id))"

# Wait for app to be ready with health check loop (max 60 seconds)
Write-Step "Waiting for app to be ready..."
$appReady = $false
$appMaxAttempts = 60
$appAttempt = 0

while (-not $appReady -and $appAttempt -lt $appMaxAttempts) {
    Start-Sleep -Seconds 1
    $appAttempt++
    
    # Check if job is still running
    $appJobState = (Get-Job -Id $appJob.Id -ErrorAction SilentlyContinue).State
    if ($appJobState -ne "Running") {
        Write-Error-Custom "App job stopped unexpectedly (State: $appJobState)"
        Write-Host ""
        Write-Host "========== APP ERROR LOG ==========" -ForegroundColor Red
        $appError = Receive-Job -Id $appJob.Id -ErrorAction SilentlyContinue
        Write-Host $appError
        Write-Host "===================================" -ForegroundColor Red
        
        # Stop tunnel if running
        if ($tunnelJob) {
            Stop-Job -Job $tunnelJob -ErrorAction SilentlyContinue
            Remove-Job -Job $tunnelJob -ErrorAction SilentlyContinue
        }
        
        Write-Host ""
        Write-Host "Common causes:"
        Write-Host "  - DATABASE_URL not set or incorrect"
        Write-Host "  - NEXTAUTH_SECRET not filled in"
        Write-Host "  - Discord credentials missing"
        Write-Host "  - Port 3000 already in use"
        Write-Host ""
        Write-Host "Check your env file: $EnvFile"
        exit 1
    }
    
    # Try health check
    try {
        $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
        if ($healthResponse.StatusCode -eq 200) {
            $appReady = $true
            Write-Success "App is ready!"
        }
    } catch {
        # App still starting, this is normal
    }
    
    if (-not $appReady) {
        Write-Host "." -NoNewline
    }
}

if (-not $appReady) {
    Write-Error-Custom "App failed to start after ${appMaxAttempts}s"
    Stop-Job -Job $tunnelJob -ErrorAction SilentlyContinue
    exit 1
}

# Start worker
Write-Step "Starting Discord worker..."
$workerJob = Start-Job -ScriptBlock {
    param($envVars)
    
    # Set environment variables in job context
    foreach ($key in $envVars.Keys) {
        [System.Environment]::SetEnvironmentVariable($key, $envVars[$key], "Process")
    }
    
    cd "c:\panel-esperados\panel"
    & npm run discord:worker 2>&1
} -ArgumentList $envVarsToPass -ErrorAction SilentlyContinue

if (-not $workerJob) {
    Write-Warning-Custom "Failed to start worker (non-critical)"
} else {
    Write-Success "Worker started (Job ID: $($workerJob.Id))"
}

# Health check via tunnel
Write-Step "Running health checks..."
Start-Sleep -Seconds 3

try {
    $healthUrl = if ($tunnelUrl) { "$tunnelUrl/api/health" } else { "http://localhost:3000/api/health" }
    $response = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Success "Health check passed!"
    }
} catch {
    Write-Warning-Custom "Health check failed (app may still be starting): $_"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "ALL SERVICES STARTED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
if ($tunnelUrl) {
    Write-Host "Tunnel URL: $tunnelUrl" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Services:"
Write-Host "  Tunnel:  Job ID $($tunnelJob.Id)"
Write-Host "  App:     Job ID $($appJob.Id) (http://localhost:3000)"
Write-Host "  Worker:  Job ID $($workerJob.Id)"
Write-Host ""
Write-Host "To view logs:"
Write-Host "  Receive-Job -Id $($tunnelJob.Id) -Keep -ErrorAction SilentlyContinue"
Write-Host "  Receive-Job -Id $($appJob.Id) -Keep"
Write-Host "  Receive-Job -Id $($workerJob.Id) -Keep"
Write-Host ""
Write-Host "To stop all services:"
Write-Host "  .\scripts\tunnel-stop.ps1"
Write-Host ""
Write-Host "Press CTRL+C to stop (or close terminal)"
Write-Host ""

# Keep script running and monitor jobs
try {
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Check if jobs are still running
        $tunnelState = (Get-Job -Id $tunnelJob.Id -ErrorAction SilentlyContinue).State
        $appState = (Get-Job -Id $appJob.Id -ErrorAction SilentlyContinue).State
        $workerState = if ($workerJob) { (Get-Job -Id $workerJob.Id -ErrorAction SilentlyContinue).State } else { "N/A" }
        
        if ($tunnelState -ne "Running") {
            Write-Warning-Custom "Tunnel stopped (State: $tunnelState)"
            break
        }
        if ($appState -ne "Running") {
            Write-Error-Custom "App stopped (State: $appState)"
            Write-Host ""
            Write-Host "========== APP ERROR LOG ==========" -ForegroundColor Red
            $appError = Receive-Job -Id $appJob.Id -ErrorAction SilentlyContinue
            Write-Host $appError
            Write-Host "===================================" -ForegroundColor Red
            break
        }
        if ($workerJob -and $workerState -ne "Running") {
            Write-Warning-Custom "Worker stopped (State: $workerState)"
            break
        }
    }
} finally {
    Write-Host ""
    Write-Step "Stopping services..."
    Stop-Job -Job $tunnelJob -ErrorAction SilentlyContinue
    Stop-Job -Job $appJob -ErrorAction SilentlyContinue
    if ($workerJob) {
        Stop-Job -Job $workerJob -ErrorAction SilentlyContinue
    }
    Remove-Job -Job $tunnelJob, $appJob -ErrorAction SilentlyContinue
    if ($workerJob) {
        Remove-Job -Job $workerJob -ErrorAction SilentlyContinue
    }
    Write-Success "All services stopped"
}
