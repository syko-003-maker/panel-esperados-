#!/usr/bin/env pwsh
# Setup Staff Role ID in environment file
# Finds or creates the Staff role in Discord guild

param(
    [string]$EnvFile = "env\.env.production.local",
    [switch]$AutoCreate = $false
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
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
Write-Host "SETUP STAFF ROLE ID" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check env file
if (-not (Test-Path $EnvFile)) {
    Write-Error-Custom "Environment file not found: $EnvFile"
    exit 1
}

Write-Step "Loading environment from: $EnvFile"

# Load env file
$guildId = $null
$botToken = $null
$staffRoleId = $null

$envContent = Get-Content $EnvFile -Raw
foreach ($line in $envContent -split "`n") {
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        
        if ($key -eq "DISCORD_GUILD_ID") { $guildId = $value }
        if ($key -eq "NEXT_PUBLIC_DISCORD_GUILD_ID") { $guildId = $value }
        if ($key -eq "DISCORD_BOT_TOKEN") { $botToken = $value }
        if ($key -eq "STAFF_ROLE_ID") { $staffRoleId = $value }
    }
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Guild ID: $guildId"
Write-Host "  Bot Token: $(if ($botToken) { '✓ Found' } else { '✗ Not found' })"
Write-Host "  Current STAFF_ROLE_ID: $(if ($staffRoleId -and $staffRoleId -notmatch '__FILL_ME__') { $staffRoleId } else { 'Not set' })"
Write-Host ""

# Validate prerequisites
if (-not $guildId) {
    Write-Error-Custom "DISCORD_GUILD_ID not found in $EnvFile"
    exit 1
}

if (-not $botToken) {
    Write-Error-Custom "DISCORD_BOT_TOKEN not found in $EnvFile"
    Write-Host "You need to set DISCORD_BOT_TOKEN first"
    exit 1
}

# Check if bot token is valid format
if ($botToken -eq "__FILL_ME__" -or $botToken.Length -lt 10) {
    Write-Error-Custom "DISCORD_BOT_TOKEN is not valid (appears to be placeholder)"
    exit 1
}

Write-Step "Finding existing Staff role in Discord guild..."

try {
    # Query Discord API to get all roles
    $headers = @{
        "Authorization" = "Bot $botToken"
        "Content-Type" = "application/json"
    }
    
    $rolesResponse = Invoke-WebRequest -Uri "https://discord.com/api/v10/guilds/$guildId/roles" `
        -Headers $headers `
        -Method Get `
        -UseBasicParsing `
        -ErrorAction Stop
    
    $roles = ($rolesResponse.Content | ConvertFrom-Json)
    
    # Find "Staff" or similar role (case-insensitive)
    $staffRoles = $roles | Where-Object { 
        $_.name -match "staff" -or $_.name -match "modér" -or $_.name -match "admin"
    }
    
    Write-Host ""
    if ($staffRoles.Count -gt 0) {
        Write-Success "Found potential Staff roles:"
        Write-Host ""
        
        foreach ($role in $staffRoles | Select-Object -First 5) {
            Write-Host "  [$($role.id)] $($role.name)" -ForegroundColor White
        }
        
        Write-Host ""
        
        # If exactly one match, suggest it
        if ($staffRoles.Count -eq 1) {
            $selectedRole = $staffRoles[0]
            Write-Host "Suggested Staff role (single match):" -ForegroundColor Green
            Write-Host "  Name: $($selectedRole.name)" -ForegroundColor Green
            Write-Host "  ID: $($selectedRole.id)" -ForegroundColor White
            Write-Host ""
            
            # Ask for confirmation
            $confirm = Read-Host "Use this role as STAFF_ROLE_ID? (y/n)"
            if ($confirm -eq "y" -or $confirm -eq "yes") {
                # Update env file
                Write-Step "Updating $EnvFile..."
                
                # Create backup
                $backupPath = "$EnvFile.bak"
                Copy-Item -Path $EnvFile -Destination $backupPath -Force
                Write-Success "Backup created: $backupPath"
                
                # Read and update
                $content = Get-Content -Path $EnvFile -Raw
                $pattern = "(?m)^STAFF_ROLE_ID\s*=.*$"
                
                if ($content -match $pattern) {
                    $content = $content -replace $pattern, "STAFF_ROLE_ID=$($selectedRole.id)"
                } else {
                    $content += "`nSTAFF_ROLE_ID=$($selectedRole.id)"
                }
                
                Set-Content -Path $EnvFile -Value $content -NoNewline
                Write-Success "Updated STAFF_ROLE_ID to: $($selectedRole.id)"
                
                Write-Host ""
                Write-Host "✅ Staff role configured successfully!"
                Write-Host ""
                Write-Host "Next steps:"
                Write-Host "1. Restart the tunnel script:"
                Write-Host "   .\scripts\tunnel-stop.ps1"
                Write-Host "   .\scripts\tunnel-start.ps1 -UseTryCloudflare"
                Write-Host ""
                exit 0
            }
        }
        
        # Multiple matches - let user choose
        Write-Host "Found $($staffRoles.Count) potential Staff roles. Please choose the correct one:"
        Write-Host ""
        
        $i = 0
        foreach ($role in $staffRoles | Select-Object -First 10) {
            Write-Host "  [$i] $($role.name) (ID: $($role.id))"
            $i++
        }
        Write-Host ""
        
        $choice = Read-Host "Enter the number of the correct role (or 'skip' to do manually)"
        
        if ($choice -match "^\d+$" -and [int]$choice -lt $staffRoles.Count) {
            $selectedRole = @($staffRoles)[$choice]
            
            # Update env file
            Write-Step "Updating $EnvFile..."
            $backupPath = "$EnvFile.bak"
            Copy-Item -Path $EnvFile -Destination $backupPath -Force
            Write-Success "Backup created: $backupPath"
            
            $content = Get-Content -Path $EnvFile -Raw
            $pattern = "(?m)^STAFF_ROLE_ID\s*=.*$"
            
            if ($content -match $pattern) {
                $content = $content -replace $pattern, "STAFF_ROLE_ID=$($selectedRole.id)"
            } else {
                $content += "`nSTAFF_ROLE_ID=$($selectedRole.id)"
            }
            
            Set-Content -Path $EnvFile -Value $content -NoNewline
            Write-Success "Updated STAFF_ROLE_ID to: $($selectedRole.id)"
            
            Write-Host ""
            Write-Host "✅ Staff role configured successfully!"
            Write-Host ""
            exit 0
        }
    } else {
        Write-Warning-Custom "No roles matching 'staff/admin/modér' found"
    }
    
} catch {
    Write-Warning-Custom "Could not connect to Discord API: $_"
    Write-Host ""
    Write-Host "This is usually due to:"
    Write-Host "  1. DISCORD_BOT_TOKEN is not valid"
    Write-Host "  2. Guild ID is wrong"
    Write-Host "  3. Network connection issue"
    Write-Host ""
}

# Manual instructions
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "MANUAL SETUP" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "To find your Staff role ID manually:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to Discord and open your guild settings" -ForegroundColor White
Write-Host "2. In the left menu, click 'Roles'" -ForegroundColor White
Write-Host "3. Find your 'Staff' role" -ForegroundColor White
Write-Host "4. Right-click on the role and select 'Copy Role ID'" -ForegroundColor White
Write-Host "5. Edit $($EnvFile):" -ForegroundColor White
Write-Host "   STAFF_ROLE_ID=<paste_role_id_here>" -ForegroundColor Gray
Write-Host ""
Write-Host "Alternative (Discord Developer Mode):" -ForegroundColor Cyan
Write-Host "1. Enable Developer Mode in Discord settings (User > Advanced > Developer Mode)" -ForegroundColor White
Write-Host "2. Right-click the Staff role in the role list" -ForegroundColor White
Write-Host "3. Click 'Copy User ID' - no wait, right-click again and 'Copy ID'" -ForegroundColor White
Write-Host ""
Write-Host "Example STAFF_ROLE_ID value:" -ForegroundColor Cyan
Write-Host "  STAFF_ROLE_ID=1234567890123456789" -ForegroundColor Gray
Write-Host ""
Write-Host "Then restart the tunnel:" -ForegroundColor White
Write-Host "  .\scripts\tunnel-stop.ps1" -ForegroundColor Gray
Write-Host "  .\scripts\tunnel-start.ps1 -UseTryCloudflare" -ForegroundColor Gray
Write-Host ""
