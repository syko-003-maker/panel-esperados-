#!/usr/bin/env pwsh
# Cloudflare Tunnel Installation Script (Windows)
# Downloads and installs cloudflared.exe for Windows x64

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[INSTALL] $Message" -ForegroundColor Cyan
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
Write-Host "CLOUDFLARE TUNNEL INSTALLATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create bin directory if not exists
$binDir = Join-Path $PSScriptRoot "..\bin"
if (-not (Test-Path $binDir)) {
    Write-Step "Creating bin directory..."
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

$cloudflaredPath = Join-Path $binDir "cloudflared.exe"

# Check if already installed
if (Test-Path $cloudflaredPath) {
    Write-Step "cloudflared.exe already exists at: $cloudflaredPath"
    Write-Host "Checking version..."
    & $cloudflaredPath --version
    
    $response = Read-Host "Re-download? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Success "Using existing cloudflared.exe"
        Write-Host ""
        Write-Host "Next step: .\scripts\tunnel-login.ps1"
        exit 0
    }
}

Write-Step "Downloading cloudflared for Windows x64..."

# Cloudflare official download URL
$downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

try {
    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $downloadUrl -OutFile $cloudflaredPath -UseBasicParsing
    $ProgressPreference = 'Continue'
    
    Write-Success "Downloaded cloudflared.exe"
} catch {
    Write-Error-Custom "Download failed: $_"
    exit 1
}

# Verify file exists and is executable
if (-not (Test-Path $cloudflaredPath)) {
    Write-Error-Custom "cloudflared.exe not found after download"
    exit 1
}

$fileInfo = Get-Item $cloudflaredPath
if ($fileInfo.Length -lt 10MB) {
    Write-Error-Custom "Downloaded file is too small ($($fileInfo.Length) bytes), may be corrupted"
    exit 1
}

Write-Success "cloudflared.exe installed at: $cloudflaredPath"

# Test execution
Write-Step "Testing cloudflared..."
try {
    & $cloudflaredPath --version
    Write-Success "cloudflared is working!"
} catch {
    Write-Error-Custom "Failed to execute cloudflared: $_"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run: .\scripts\tunnel-login.ps1"
Write-Host "  2. Run: .\scripts\tunnel-create.ps1"
Write-Host "  3. Run: .\scripts\tunnel-start.ps1"
Write-Host ""
