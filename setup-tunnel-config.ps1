#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Setup Cloudflare tunnel configuration file
.DESCRIPTION
    Copies .cloudflared-config.yml from project root to ~/.cloudflared/config.yml
.EXAMPLE
    .\setup-tunnel-config.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "🔧 Setting up Cloudflare Tunnel Configuration" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Check if config file exists
if (-not (Test-Path ".cloudflared-config.yml")) {
    Write-Host "❌ .cloudflared-config.yml not found in current directory" -ForegroundColor Red
    exit 1
}

# Create .cloudflared directory if it doesn't exist
$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
if (-not (Test-Path $cloudflaredDir)) {
    Write-Host "📁 Creating directory: $cloudflaredDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $cloudflaredDir | Out-Null
}

# Copy config file
$source = ".cloudflared-config.yml"
$dest = Join-Path $cloudflaredDir "config.yml"

Write-Host "📋 Copying config file..."
Write-Host "   From: $source" -ForegroundColor Gray
Write-Host "   To:   $dest" -ForegroundColor Gray

Copy-Item -Path $source -Destination $dest -Force
Write-Host "✅ Config file copied successfully" -ForegroundColor Green

# Verify
if (Test-Path $dest) {
    Write-Host "✅ Verification: File exists at $dest" -ForegroundColor Green
    Write-Host "`n📌 Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Run: cloudflared tunnel login" -ForegroundColor Cyan
    Write-Host "   2. Run: npm run start:prod" -ForegroundColor Cyan
} else {
    Write-Host "❌ Verification failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
