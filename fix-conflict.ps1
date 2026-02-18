$ErrorActionPreference = "Stop"

Write-Host "`n=== FIXING NEXT.JS ROUTE CONFLICT ===" -ForegroundColor Cyan

# 1. Create by-id/[id] if missing
$dest = "app\api\staff\recruitments\by-id\[id]"
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Write-Host "✓ Ensured: $dest" -ForegroundColor Green

# 2. Move all files from [id] to by-id/[id]
$src = "app\api\staff\recruitments\[id]"
if (Test-Path $src) {
    Get-ChildItem $src -Recurse -Force | ForEach-Object {
        $rel = $_.FullName.Substring((Get-Item $src).FullName.Length + 1)
        $target = Join-Path $dest $rel
        
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $target -Force -ErrorAction SilentlyContinue | Out-Null
        } else {
            $targetDir = Split-Path $target -Parent
            New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction SilentlyContinue | Out-Null
            Copy-Item $_.FullName $target -Force
            Write-Host "  → $rel" -ForegroundColor Gray
        }
    }
    
    # 3. Delete original [id]
    Remove-Item $src -Recurse -Force
    Write-Host "✓ Deleted: $src" -ForegroundColor Green
} else {
    Write-Host "⚠ Source not found: $src (may already be moved)" -ForegroundColor Yellow
}

# 4. Delete .next cache
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
    Write-Host "✓ Deleted: .next" -ForegroundColor Green
}

# 5. Scan for conflicts
Write-Host "`n=== SCANNING FOR DYNAMIC ROUTE CONFLICTS ===" -ForegroundColor Cyan

$hasConflicts = $false
Get-ChildItem "app" -Recurse -Directory -Force | Where-Object {$_.Name -match '^\[.*\]$'} | Group-Object Parent | Where-Object {$_.Count -gt 1} | ForEach-Object {
    $hasConflicts = $true
    Write-Host "⚠ CONFLICT: $($_.Name)" -ForegroundColor Red
    $_.Group | ForEach-Object { Write-Host "    - $($_.Name)" -ForegroundColor Yellow }
}

if (!$hasConflicts) {
    Write-Host "✓ No conflicts found" -ForegroundColor Green
}

# 6. Show final structure
Write-Host "`n=== FINAL: dir app\api\staff\recruitments ===" -ForegroundColor Cyan
dir "app\api\staff\recruitments" -Force

# 7. Verify fix
Write-Host "`n=== VERIFICATION ===" -ForegroundColor Cyan
if (Test-Path "app\api\staff\recruitments\[id]") {
    Write-Host "✗ FAILED: [id] still exists" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✅ SUCCESS: [id] removed" -ForegroundColor Green
    Write-Host "✅ READY: npm run dev" -ForegroundColor Green
}
