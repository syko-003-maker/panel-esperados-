#!/usr/bin/env pwsh
# Cloudflare Tunnel Login Script
# Authenticates with Cloudflare account via browser

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[LOGIN] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CLOUDFLARE TUNNEL LOGIN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if cloudflared exists
$binDir = Join-Path $PSScriptRoot "..\bin"
$cloudflaredPath = Join-Path $binDir "cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Error-Custom "cloudflared.exe not found at: $cloudflaredPath"
    Write-Host "Run: .\scripts\tunnel-install.ps1 first"
    exit 1
}

Write-Step "Launching browser for Cloudflare authentication..."
Write-Host ""
Write-Host "Instructions:"
Write-Host "  1. Browser will open to Cloudflare login"
Write-Host "  2. Log in to your Cloudflare account"
Write-Host "  3. Select the domain you want to use (or skip for trycloudflare.com)"
Write-Host "  4. Authorize cloudflared"
Write-Host ""

# Run cloudflared tunnel login
try {
    & $cloudflaredPath tunnel login
    Write-Success "Login complete!"
} catch {
    Write-Error-Custom "Login failed: $_"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "LOGIN COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: .\scripts\tunnel-create.ps1"
Write-Host ""
