Write-Host "=== Fixing recruitment route conflict ===" -ForegroundColor Cyan

# 1. Create by-id directory structure
$byIdPath = "app\api\staff\recruitments\by-id\[id]"
New-Item -ItemType Directory -Path $byIdPath -Force | Out-Null
Write-Host "✓ Created: $byIdPath" -ForegroundColor Green

# 2. Move all content from [id] to by-id\[id]
$sourcePath = "app\api\staff\recruitments\[id]"
if (Test-Path $sourcePath) {
    Get-ChildItem $sourcePath -Recurse | ForEach-Object {
        $relativePath = $_.FullName.Substring((Get-Item $sourcePath).FullName.Length)
        $destination = Join-Path $byIdPath $relativePath
        
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $destination -Force | Out-Null
        } else {
            $destDir = Split-Path $destination -Parent
            if (!(Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            Copy-Item $_.FullName $destination -Force
            Write-Host "  Copied: $($_.Name)" -ForegroundColor Gray
        }
    }
    
    # 3. Remove original [id] folder
    Remove-Item $sourcePath -Recurse -Force
    Write-Host "✓ Removed: $sourcePath" -ForegroundColor Green
} else {
    Write-Host "⚠ Source folder not found: $sourcePath" -ForegroundColor Yellow
}

# 4. Clean Next.js cache
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
    Write-Host "✓ Removed .next cache" -ForegroundColor Green
} else {
    Write-Host "⚠ .next folder not found" -ForegroundColor Yellow
}

# 5. Verify final structure
Write-Host "`n📁 Final structure:" -ForegroundColor Cyan
Get-ChildItem "app\api\staff\recruitments" -Directory | ForEach-Object {
    Write-Host "  $($_.Name)" -ForegroundColor White
    if ($_.Name -eq "by-id") {
        Get-ChildItem $_.FullName -Directory | ForEach-Object {
            Write-Host "    └─ $($_.Name)" -ForegroundColor Gray
        }
    }
}

Write-Host "`n✅ Conflict resolved!" -ForegroundColor Green
Write-Host "▶ Run: npm run dev" -ForegroundColor Yellow
