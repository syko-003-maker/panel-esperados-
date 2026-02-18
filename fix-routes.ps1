# Create by-id structure
New-Item -ItemType Directory -Path "app\api\staff\recruitments\by-id\[id]" -Force | Out-Null

# Move all content from [id] to by-id/[id]
if (Test-Path "app\api\staff\recruitments\[id]") {
    Get-ChildItem "app\api\staff\recruitments\[id]" -Recurse | ForEach-Object {
        $dest = $_.FullName -replace '\[id\]', 'by-id\[id]'
        $destDir = Split-Path $dest -Parent
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        Move-Item $_.FullName $dest -Force
    }
    # Remove empty [id] folder
    Remove-Item "app\api\staff\recruitments\[id]" -Recurse -Force
    Write-Host "✓ Moved [id] → by-id\[id]" -ForegroundColor Green
}

# Clean Next.js cache
if (Test-Path ".next") {
    Remove-Item ".next" -Recurse -Force
    Write-Host "✓ Removed .next cache" -ForegroundColor Green
}

# Verify structure
Write-Host "`nFinal structure:" -ForegroundColor Cyan
Get-ChildItem "app\api\staff\recruitments" -Directory -Recurse | Select-Object FullName

Write-Host "`n▶ Run: npm run dev" -ForegroundColor Yellow
