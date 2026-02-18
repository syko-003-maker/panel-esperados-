#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Final production deployment for Los Esperados panel
.DESCRIPTION
    Builds and runs:
    - Next.js production server (port 3000)
    - Discord worker
    - Cloudflare Tunnel (los-esperados)
.EXAMPLE
    .\start-prod.ps1
#>

param(
    [switch]$Build = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Los Esperados - Production Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`n📋 Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js: $(node --version)" -ForegroundColor Green

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm not found." -ForegroundColor Red
    exit 1
}
Write-Host "✅ npm: $(npm --version)" -ForegroundColor Green

# Check cloudflared
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "❌ cloudflared not found. Install from https://github.com/cloudflare/cloudflared" -ForegroundColor Red
    exit 1
}
Write-Host "✅ cloudflared: $(cloudflared --version)" -ForegroundColor Green

# Check PostgreSQL connectivity
Write-Host "`n🔗 Checking PostgreSQL..." -ForegroundColor Yellow
$env:PGPASSWORD = "postgres"
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  psql not found (PostgreSQL client), skipping DB check" -ForegroundColor Yellow
} else {
    try {
        psql -h 127.0.0.1 -p 5434 -U postgres -d postgres -c "SELECT 1" | Out-Null
        Write-Host "✅ PostgreSQL connected" -ForegroundColor Green
    } catch {
        Write-Host "❌ PostgreSQL connection failed: $_" -ForegroundColor Red
        Write-Host "   Make sure PostgreSQL is running on 127.0.0.1:5434" -ForegroundColor Yellow
        exit 1
    }
}
$env:PGPASSWORD = ""

# Check .env.prod
if (-not (Test-Path ".env.prod")) {
    Write-Host "❌ .env.prod not found" -ForegroundColor Red
    exit 1
}
Write-Host "✅ .env.prod found" -ForegroundColor Green

# Check Cloudflare tunnel credentials
$tunnelCreds = Join-Path $env:USERPROFILE ".cloudflared\cd2a0e2d-f3c1-4866-ae84-8115817b154a.json"
if (-not (Test-Path $tunnelCreds)) {
    Write-Host "❌ Tunnel credentials not found at $tunnelCreds" -ForegroundColor Red
    Write-Host "   Run: cloudflared tunnel login" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Tunnel credentials found" -ForegroundColor Green

# Check Cloudflare config
if (-not (Test-Path ".cloudflared-config.yml")) {
    Write-Host "❌ .cloudflared-config.yml not found" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Cloudflare config found" -ForegroundColor Green

# Build if needed
if ($Build -or $Force) {
    Write-Host "`n🔨 Building Next.js..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Build complete" -ForegroundColor Green
}

# Load environment
Write-Host "`n🔧 Loading production environment..." -ForegroundColor Yellow
Get-Content .env.prod | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $key = $matches[1]
        $value = $matches[2]
        [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
    }
}
Write-Host "✅ Environment loaded" -ForegroundColor Green

# Final checks
Write-Host "`n✅ All prerequisites met!" -ForegroundColor Green
Write-Host "`n🌍 Deployment Configuration:" -ForegroundColor Cyan
Write-Host "   Domain: https://losesperados.fr" -ForegroundColor Cyan
Write-Host "   Next.js: http://localhost:3000 (internal)" -ForegroundColor Cyan
Write-Host "   Tunnel: los-esperados (cd2a0e2d-f3c1-4866-ae84-8115817b154a)" -ForegroundColor Cyan

Write-Host "`n📌 NOTE: You can stop all services with Ctrl+C" -ForegroundColor Yellow
Write-Host "`n🚀 Starting services..." -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

# Launch with concurrently
npm run start:prod
