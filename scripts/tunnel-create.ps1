#!/usr/bin/env pwsh
# Cloudflare Tunnel Creation Script
# Creates a named tunnel with configuration

param(
    [string]$TunnelName = "panel-esperados-temp",
    [switch]$UseTryCloudflare = $false
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[CREATE] $Message" -ForegroundColor Cyan
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

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CLOUDFLARE TUNNEL CREATION" -ForegroundColor Cyan
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

# Create cloudflared directory for config
$cloudflaredDir = Join-Path $PSScriptRoot "..\cloudflared"
if (-not (Test-Path $cloudflaredDir)) {
    Write-Step "Creating cloudflared directory..."
    New-Item -ItemType Directory -Path $cloudflaredDir -Force | Out-Null
}

if ($UseTryCloudflare) {
    Write-Step "Using trycloudflare.com (temporary URL mode)"
    Write-Host ""
    Write-Host "No configuration needed for trycloudflare mode."
    Write-Host "URL will be generated when you run: .\scripts\tunnel-start.ps1"
    Write-Host ""
    Write-Warning-Custom "trycloudflare URLs are temporary and change on each restart!"
    Write-Host ""
    Write-Host "Next step: .\scripts\tunnel-start.ps1"
    exit 0
}

# Create tunnel
Write-Step "Creating tunnel: $TunnelName"
try {
    $output = & $cloudflaredPath tunnel create $TunnelName 2>&1
    Write-Host $output
    Write-Success "Tunnel created: $TunnelName"
} catch {
    Write-Error-Custom "Failed to create tunnel: $_"
    Write-Host ""
    Write-Host "If tunnel already exists, you can skip this step."
    Write-Host "Or delete existing tunnel: cloudflared tunnel delete $TunnelName"
    exit 1
}

# Get tunnel info
Write-Step "Getting tunnel information..."
$tunnelInfo = & $cloudflaredPath tunnel info $TunnelName 2>&1

# Extract tunnel ID from output
$tunnelId = $null
if ($tunnelInfo -match "Your tunnel ([a-f0-9-]+)") {
    $tunnelId = $matches[1]
} elseif ($tunnelInfo -match "id:\s*([a-f0-9-]+)") {
    $tunnelId = $matches[1]
}

if (-not $tunnelId) {
    Write-Warning-Custom "Could not extract tunnel ID automatically"
    Write-Host "You may need to get it manually: cloudflared tunnel list"
} else {
    Write-Success "Tunnel ID: $tunnelId"
}

# Create config.yml
$configPath = Join-Path $cloudflaredDir "config.yml"
Write-Step "Creating config: $configPath"

$configContent = @"
tunnel: $TunnelName
credentials-file: $HOME\.cloudflared\$tunnelId.json

ingress:
  - hostname: "*"
    service: http://localhost:3000
  - service: http_status:404
"@

Set-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Success "Configuration created"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "TUNNEL CREATED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Tunnel Name: $TunnelName"
if ($tunnelId) {
    Write-Host "Tunnel ID: $tunnelId"
}
Write-Host "Config: $configPath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Configure DNS in Cloudflare dashboard (or use trycloudflare)"
Write-Host "  2. Run: .\scripts\tunnel-start.ps1"
Write-Host ""
Write-Host "To use temporary URL instead:"
Write-Host "  .\scripts\tunnel-create.ps1 -UseTryCloudflare"
Write-Host ""
