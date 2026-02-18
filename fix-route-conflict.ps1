$ErrorActionPreference = "Stop"

Write-Host "`n=== FIXING NEXT.JS ROUTE CONFLICT ===" -ForegroundColor Cyan

$idFolder = "app\api\staff\recruitments\[id]"
$byIdFolder = "app\api\staff\recruitments\by-id\[id]"

# 1. Create by-id/[id] structure
New-Item -ItemType Directory -Path "app\api\staff\recruitments\by-id\[id]" -Force | Out-Null

# 2. Move all content from [id] to by-id/[id]
if (Test-Path "app\api\staff\recruitments\[id]") {
    Get-ChildItem "app\api\staff\recruitments\[id]" -Recurse | ForEach-Object {
        $dest = $_.FullName -replace '\\recruitments\\\[id\]\\', '\recruitments\by-id\[id]\'
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        } else {
            $destDir = Split-Path $dest -Parent
            New-Item -ItemType Directory -Path $destDir -Force -ErrorAction SilentlyContinue | Out-Null
            Copy-Item $_.FullName $dest -Force
        }
    }
    # 3. Delete original [id] folder
    Remove-Item "app\api\staff\recruitments\[id]" -Recurse -Force
}

# 5. Remove .next cache
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
}

# Verification
$remaining = Get-ChildItem "app\api\staff\recruitments" -Directory | Where-Object {$_.Name -match '^\['}
if ($remaining.Name -contains "[id]") {
    Write-Host "ERROR: [id] folder still exists" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ CONFLICT RESOLVED" -ForegroundColor Green
Write-Host "`nFinal structure:" -ForegroundColor Cyan
Get-ChildItem "app\api\staff\recruitments" -Directory | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host "`nREADY — npm run dev peut être lancé" -ForegroundColor Yellow
