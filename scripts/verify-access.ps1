param(
    [string]$BaseUrl = $(if ($env:NEXTAUTH_URL) { $env:NEXTAUTH_URL } else { "http://localhost:3000" }),
    [string]$TunnelUrl = $(if ($env:NEXTAUTH_URL -and $env:NEXTAUTH_URL -match '^https://') { $env:NEXTAUTH_URL } else { "" }),
    [string]$SessionCookie = $env:VERIFY_SESSION_COOKIE,
    [ValidateSet("owner","chef","member")][string]$ExpectedRole = $(if ($env:VERIFY_EXPECTED_ROLE) { $env:VERIFY_EXPECTED_ROLE } else { "member" })
)

$ErrorActionPreference = "Stop"

function Resolve-Url([string]$current, [string]$location) {
    if ($location -match '^https?://') { return $location }
    if ($location.StartsWith("/")) {
        $uri = [Uri]$current
        return "$($uri.Scheme)://$($uri.Host)$location"
    }
    return ([Uri]::new($current, $location)).ToString()
}

function Invoke-Follow([string]$url, [hashtable]$headers, [int]$maxRedirects = 10) {
    $visited = @{}
    $current = $url
    $count = 0

    while ($true) {
        if ($visited.ContainsKey($current)) {
            return @{ ok = $false; reason = "redirect_loop"; url = $current; status = 0 }
        }
        $visited[$current] = $true

        try {
            $resp = Invoke-WebRequest -Uri $current -Headers $headers -MaximumRedirection 0 -UseBasicParsing
            $status = [int]$resp.StatusCode
        } catch {
            $resp = $_.Exception.Response
            if ($resp) {
                $status = [int]$resp.StatusCode
            } else {
                return @{ ok = $false; reason = $_.Exception.Message; url = $current; status = 0 }
            }
        }

        if ($status -ge 300 -and $status -lt 400 -and $resp.Headers["Location"]) {
            $count++
            if ($count -gt $maxRedirects) {
                return @{ ok = $false; reason = "too_many_redirects"; url = $current; status = $status }
            }
            $current = Resolve-Url $current $resp.Headers["Location"]
            continue
        }

        return @{ ok = $true; url = $current; status = $status }
    }
}

function Test-Endpoint([string]$base, [string]$path, [int[]]$expected, [hashtable]$headers) {
    $result = Invoke-Follow "$base$path" $headers
    $ok = $result.ok -and ($expected -contains $result.status)
    return @{ ok = $ok; status = $result.status; url = $result.url; path = $path; reason = $result.reason }
}

function Write-Result($label, $result) {
    if ($result.ok) {
        Write-Host "[PASS] $label -> $($result.status) ($($result.url))" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $label -> $($result.status) ($($result.url))" -ForegroundColor Red
        if ($result.reason) { Write-Host "       Reason: $($result.reason)" -ForegroundColor Yellow }
    }
}

$overallPass = $true

# Local tests
Write-Host "=== Local Tests ($BaseUrl) ===" -ForegroundColor Cyan
$headers = @{}

$health = Test-Endpoint $BaseUrl "/api/health" @(200) $headers
Write-Result "health" $health
$overallPass = $overallPass -and $health.ok

$me = Test-Endpoint $BaseUrl "/me" @(200,302,307,401,403) $headers
Write-Result "non-auth /me" $me
$overallPass = $overallPass -and $me.ok

$staff = Test-Endpoint $BaseUrl "/staff/dashboard" @(302,307,401,403) $headers
Write-Result "non-auth /staff/dashboard" $staff
$overallPass = $overallPass -and $staff.ok

# Tunnel tests if applicable
if ($TunnelUrl) {
    Write-Host "=== Tunnel Tests ($TunnelUrl) ===" -ForegroundColor Cyan
    $healthT = Test-Endpoint $TunnelUrl "/api/health" @(200) $headers
    Write-Result "tunnel health" $healthT
    $overallPass = $overallPass -and $healthT.ok
}

# Auth tests if cookie provided
if ($SessionCookie) {
    Write-Host "=== Auth Tests (cookie provided) ===" -ForegroundColor Cyan
    $authHeaders = @{ Cookie = $SessionCookie }

    $meAuth = Test-Endpoint $BaseUrl "/me" @(200) $authHeaders
    Write-Result "auth /me" $meAuth
    $overallPass = $overallPass -and $meAuth.ok

    if ($ExpectedRole -in @("owner","chef")) {
        $staffAuth = Test-Endpoint $BaseUrl "/staff/dashboard" @(200,302) $authHeaders
        Write-Result "auth /staff/dashboard (owner/chef)" $staffAuth
        $overallPass = $overallPass -and $staffAuth.ok
    } else {
        $staffDenied = Test-Endpoint $BaseUrl "/staff/dashboard" @(302,307,403) $authHeaders
        Write-Result "auth /staff/dashboard (member)" $staffDenied
        $overallPass = $overallPass -and $staffDenied.ok
    }
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
if ($overallPass) {
    Write-Host "PASS" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAIL" -ForegroundColor Red
    exit 1
}
