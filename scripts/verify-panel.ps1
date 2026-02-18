#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Script de verification automatique du panel Los Esperados
.DESCRIPTION
    Verifie build, dev server, endpoints HTTP et regles de securite
#>

param(
    [int]$StartPort = 3000,
    [int]$MaxPort = 3010,
    [int]$Timeout = 30
)

$ErrorActionPreference = "Continue"
$script:ServerJob = $null
$script:Port = $null
$script:CommonHeaders = @{}

# === Fonctions utilitaires ===

function Write-OK { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-ERR { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-INF { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-WRN { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }

function Stop-Server {
    if ($script:ServerJob) {
        Write-INF "Arret du serveur..."
        Stop-Job -Job $script:ServerJob -ErrorAction SilentlyContinue
        Remove-Job -Job $script:ServerJob -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-OK "Serveur arrete"
    }
}

function Test-Port {
    param([int]$P)
    try {
        $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $P)
        $l.Start()
        $l.Stop()
        return $true
    } catch { return $false }
}

trap { Write-ERR "Erreur: $_"; Stop-Server; exit 1 }

# Optional session cookie for authenticated checks
if ($env:VERIFY_SESSION_COOKIE) {
    $script:CommonHeaders["Cookie"] = $env:VERIFY_SESSION_COOKIE
    Write-INF "VERIFY_SESSION_COOKIE detected: authenticated checks enabled"
}

# === ETAPE 1: Build ===
Write-INF "=== ETAPE 1/5: Build ==="
Write-Host ""

$buildOut = npm run build 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $buildOut -match "Failed to compile\.|Type error:|error TS\d+:") {
    Write-ERR "Build failed"
    Write-Host $buildOut
    exit 1
}
Write-OK "Build OK"
Write-Host ""

# === ETAPE 2: Port libre ===
Write-INF "=== ETAPE 2/5: Recherche port libre ==="

for ($p = $StartPort; $p -le $MaxPort; $p++) {
    if (Test-Port -P $p) {
        $script:Port = $p
        break
    }
}

if (-not $script:Port) {
    Write-ERR "Aucun port libre entre $StartPort et $MaxPort"
    exit 1
}

Write-OK "Port $script:Port disponible"
Write-Host ""

# === ETAPE 3: Demarrage serveur ===
Write-INF "=== ETAPE 3/5: Demarrage serveur dev ==="

$env:PORT = $script:Port
$script:ServerJob = Start-Job -ScriptBlock {
    param($P, $Dir)
    Set-Location $Dir
    $env:PORT = $P
    npm run dev 2>&1
} -ArgumentList $script:Port, $PWD

Write-INF "Serveur demarre (Job $($script:ServerJob.Id)) sur port $script:Port"
Write-INF "Attente demarrage (max ${Timeout}s)..."

$baseUrl = "http://localhost:$script:Port"
$ready = $false

for ($i = 0; $i -lt $Timeout; $i++) {
    Start-Sleep -Seconds 1
    
    try {
        $r = Invoke-WebRequest -Uri "$baseUrl/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { }
    
    if ($script:ServerJob.State -eq 'Failed') {
        Write-ERR "Serveur crash au demarrage"
        $out = Receive-Job -Job $script:ServerJob 2>&1 | Out-String
        Write-Host $out
        Remove-Job -Job $script:ServerJob -Force
        exit 1
    }
}

if (-not $ready) {
    Write-ERR "Serveur non pret apres ${Timeout}s"
    Stop-Server
    exit 1
}

Write-OK "Serveur pret (${i}s)"
Write-Host ""

# === ETAPE 4: Tests HTTP ===
Write-INF "=== ETAPE 4/5: Tests HTTP ==="
Write-Host ""

$results = @()

function Test-HTTP {
    param(
        [string]$Path,
        [int[]]$Expected,
        [string]$Desc,
        [switch]$CheckLoop,
        [hashtable]$Headers = @{},
        [string]$Method = "GET"
    )
    
    Write-INF "Test: $Desc"
    $url = "$baseUrl$Path"
    
    try {
        $r = Invoke-WebRequest -Uri $url -Method $Method -TimeoutSec 5 -MaximumRedirection 0 -Headers $Headers -UseBasicParsing
        $status = $r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        } else {
            Write-ERR "  [$Path] Connexion echouee"
            return $false
        }
    }
    
    $ok = $Expected -contains $status
    
    if ($ok) {
        Write-OK "  [$status] $Path"
    } else {
        Write-ERR "  [$status] $Path - Attendu: $($Expected -join ',')"
    }
    
    # Detection boucle
    if ($CheckLoop -and ($status -eq 302 -or $status -eq 307)) {
        try {
            $loc = $r.Headers['Location']
            if ($loc) {
                Write-INF "  -> Redirect: $loc"
                $visited = @($Path)
                $curr = if ($loc -match '^https?://') { $loc } else { "$baseUrl$loc" }
                
                for ($j = 0; $j -lt 5; $j++) {
                    try {
                        $r2 = Invoke-WebRequest -Uri $curr -TimeoutSec 5 -MaximumRedirection 0 -Headers $Headers -UseBasicParsing
                        $s2 = $r2.StatusCode
                    } catch {
                        if ($_.Exception.Response) { $s2 = [int]$_.Exception.Response.StatusCode }
                        else { break }
                    }
                    
                    if ($s2 -eq 302 -or $s2 -eq 307) {
                        $loc2 = $r2.Headers['Location']
                        $path2 = if ($loc2 -match '^https?://') { ([System.Uri]$loc2).PathAndQuery } else { $loc2 }
                        
                        if ($visited -contains $path2) {
                            Write-ERR "  BOUCLE INFINIE: $($visited -join ' -> ') -> $path2"
                            return $false
                        }
                        $visited += $path2
                        $curr = if ($loc2 -match '^https?://') { $loc2 } else { "$baseUrl$loc2" }
                    } else { break }
                }
                Write-OK "  Pas de boucle"
            }
        } catch { Write-WRN "  Verification boucle impossible" }
    }
    
    return $ok
}

# Tests (public / unauthenticated)
$expectedProtected = @(401,403,302,307)
if ($env:VERIFY_SESSION_COOKIE) { $expectedProtected = @(200,401,403,302,307) }
$expectedStaffLogs = @(401,403,302,307,404)
if ($env:VERIFY_SESSION_COOKIE) { $expectedStaffLogs = @(200,302,307) }

$results += Test-HTTP -Path "/api/health" -Expected @(200) -Desc "Health check" -Headers $script:CommonHeaders
$results += Test-HTTP -Path "/me" -Expected $expectedProtected -Desc "/me sans auth" -CheckLoop -Headers $script:CommonHeaders
$results += Test-HTTP -Path "/staff/link" -Expected $expectedProtected -Desc "/staff/link sans auth" -CheckLoop -Headers $script:CommonHeaders
$results += Test-HTTP -Path "/staff/logs" -Expected $expectedStaffLogs -Desc "/staff/logs sans auth" -Headers $script:CommonHeaders

# Test debug avec ENABLE_STAFF_DEBUG=0
$env:ENABLE_STAFF_DEBUG = "0"
Start-Sleep -Milliseconds 500
$results += Test-HTTP -Path "/staff/debug/auth" -Expected @(401,403,302,307) -Desc "/staff/debug/auth (DEBUG=0)" -Headers $script:CommonHeaders

# Test debug avec ENABLE_STAFF_DEBUG=1
$env:ENABLE_STAFF_DEBUG = "1"
Start-Sleep -Milliseconds 500
$results += Test-HTTP -Path "/staff/debug/auth" -Expected @(200,401,403,302,307) -Desc "/staff/debug/auth (DEBUG=1)" -Headers $script:CommonHeaders

# Route deprecie (410)
$results += Test-HTTP -Path "/api/tickets/test/decision" -Expected @(410) -Desc "Route deprecie (410)" -Headers $script:CommonHeaders -Method "POST"

# Authenticated staff+linked tests (cookie required)
if ($env:VERIFY_SESSION_COOKIE) {
    Write-INF "=== Tests staff linked (avec cookie) ==="
    $results += Test-HTTP -Path "/staff/logs" -Expected @(200) -Desc "/staff/logs avec cookie" -Headers $script:CommonHeaders

    if ($env:VERIFY_DISCORD_ID) {
        $discordId = $env:VERIFY_DISCORD_ID
        $results += Test-HTTP -Path "/staff/members/$discordId/history" -Expected @(200) -Desc "/staff/members/<discordId>/history avec cookie" -Headers $script:CommonHeaders
    } else {
        Write-WRN "VERIFY_DISCORD_ID not set; skipping /staff/members/<discordId>/history test"
    }
}

# Fallback DB mode (no cookie required; uses provided discordId)
if (-not $env:VERIFY_SESSION_COOKIE -and $env:VERIFY_DISCORD_ID) {
    Write-INF "=== Fallback DB mode (VERIFY_DISCORD_ID) ==="
    $discordId = $env:VERIFY_DISCORD_ID
    $results += Test-HTTP -Path "/staff/members/$discordId/history" -Expected @(401,403,302,307,200) -Desc "history with VERIFY_DISCORD_ID" -CheckLoop -Headers $script:CommonHeaders
}

Write-Host ""

# === ETAPE 5: Resultat ===
Write-INF "=== ETAPE 5/5: Resultat ==="
Write-Host ""

$passed = ($results | Where-Object { $_ }).Count
$total = $results.Count

Write-INF "Tests reussis: $passed / $total"

if ($passed -eq $total) {
    Write-OK "Tous les tests OK!"
    $code = 0
} else {
    Write-ERR "Certains tests ont echoue"
    $code = 1
}

Write-Host ""

# === Nettoyage ===
Stop-Server

if ($code -eq 0) {
    Write-OK "=== VERIFICATION REUSSIE ==="
} else {
    Write-ERR "=== VERIFICATION ECHOUEE ==="
}

exit $code
