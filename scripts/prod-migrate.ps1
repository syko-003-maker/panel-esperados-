#!/usr/bin/env pwsh
# Production Prisma Migration Script (PowerShell)
# Usage: .\scripts\prod-migrate.ps1 -EnvFile .env.production
#
# Loads environment variables and runs Prisma migrations
# Suitable for: production deployments, Docker containers, CI/CD pipelines

param(
    [string]$EnvFile = "env/.env.ovh",
    [switch]$Verbose = $false
)

function Write-Step {
    param([string]$Message)
    Write-Host "[MIGRATE] $Message" -ForegroundColor Cyan
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
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
        if ($Verbose) {
            Write-Host "  Set $key"
        }
    }
}

Write-Step "Environment loaded"

# Verify critical variables
$criticalVars = @("DATABASE_URL", "SHADOW_DATABASE_URL")
foreach ($var in $criticalVars) {
    $val = [System.Environment]::GetEnvironmentVariable($var)
    if (-not $val) {
        Write-Error-Custom "$var is not set"
        exit 1
    }
    Write-Step "$var is set"
}

# Run Prisma migrations via Docker Compose
Write-Step "Running Prisma migrations via Docker Compose..."
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "docker not found. Install Docker and ensure it is in PATH."
    exit 1
}

docker compose -f docker-compose.prod.yml --env-file $EnvFile run --rm app npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Prisma migrate deploy failed"
    exit 1
}

Write-Success "Prisma migrations applied successfully"
