#!/usr/bin/env pwsh
# Production Prisma Status Script (PowerShell)
# Usage: .\scripts\prod-status.ps1 -EnvFile .env.production
#
# Shows migration status and checks for drift

param(
    [string]$EnvFile = ".env.production"
)

function Write-Step {
    param([string]$Message)
    Write-Host "[STATUS] $Message" -ForegroundColor Cyan
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if env file exists
if (-not (Test-Path $EnvFile)) {
    Write-Error-Custom "Environment file not found: $EnvFile"
    exit 1
}

Write-Step "Loading environment from: $EnvFile"

# Load .env file into environment
$envContent = Get-Content $EnvFile
foreach ($line in $envContent) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
        continue
    }
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

Write-Step "Checking migration status..."
npx prisma migrate status

Write-Step "Done"
