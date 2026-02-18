#!/usr/bin/env pwsh
# Cloudflare Tunnel Stop Script
# Stops all running tunnel/app/worker jobs

$ErrorActionPreference = "Continue"

function Write-Step {
    param([string]$Message)
    Write-Host "[STOP] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STOPPING SERVICES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get all running jobs
$jobs = Get-Job | Where-Object { $_.State -eq "Running" }

if ($jobs.Count -eq 0) {
    Write-Host "No running jobs found"
    exit 0
}

Write-Step "Found $($jobs.Count) running job(s)"

foreach ($job in $jobs) {
    Write-Step "Stopping job $($job.Id): $($job.Name)"
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -ErrorAction SilentlyContinue
}

Write-Success "All jobs stopped"

# Also kill any remaining processes
Write-Step "Checking for remaining processes..."

$processNames = @("cloudflared", "node")
foreach ($processName in $processNames) {
    $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue
    if ($processes) {
        Write-Step "Stopping $($processes.Count) $processName process(es)"
        $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "ALL SERVICES STOPPED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
