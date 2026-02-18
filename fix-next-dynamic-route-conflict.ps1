Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function LogInfo($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function LogOk($msg)   { Write-Host "[OK]    $msg" -ForegroundColor Green }
function LogWarn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function LogErr($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

try {
  # ✅ Toujours partir de l’emplacement du script (évite le "Source not found" si tu n'es pas au bon dossier)
  $root = $PSScriptRoot
  if (-not $root) { $root = (Get-Location).Path }
  LogInfo ("Root: " + $root)

  $recruitmentsRoot = Join-Path $root "app\api\staff\recruitments"
  $src       = Join-Path $recruitmentsRoot "[id]"
  $dstParent = Join-Path $recruitmentsRoot "by-id"
  $dst       = Join-Path $dstParent "[id]"

  if (-not (Test-Path $recruitmentsRoot)) {
    LogWarn ("Recruitments folder missing: " + $recruitmentsRoot)
  } else {
    LogOk ("Recruitments folder found: " + $recruitmentsRoot)
  }

  if (Test-Path $src) { LogOk ("Source found: " + $src) }
  else { LogWarn ("Source not found: " + $src) }

  if (-not (Test-Path $dstParent)) {
    New-Item -ItemType Directory -Force -Path $dstParent | Out-Null
    LogOk ("Created: " + $dstParent)
  } else {
    LogInfo ("Exists: " + $dstParent)
  }

  if (Test-Path $dst) {
    Remove-Item -Recurse -Force -Path $dst
    LogOk ("Removed existing target: " + $dst)
  }

  # ✅ Move complet si [id] existe
  if (Test-Path $src) {
    Move-Item -Force -Path $src -Destination $dst
    LogOk ("Moved: " + $src + " -> " + $dst)
  }

  # ✅ Sécurité: si le dossier [id] est (re)présent à la racine recruitments, on le supprime (c'est LUI qui crée le conflit)
  if (Test-Path $src) {
    Remove-Item -Recurse -Force -Path $src
    LogOk ("Removed leftover: " + $src)
  }

  LogInfo "Final directory structure: app\api\staff\recruitments"
  if (Test-Path $recruitmentsRoot) {
    Get-ChildItem -Force -Path $recruitmentsRoot | Select-Object Mode, Name, FullName
  }

  LogInfo "Scanning for dynamic route conflicts under /app (parents containing multiple [..] folders)"
  $dynParents = @{}
  Get-ChildItem -Path (Join-Path $root "app") -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^\[.+\]$" } |
    ForEach-Object {
      $parent = $_.Parent.FullName
      if (-not $dynParents.ContainsKey($parent)) { $dynParents[$parent] = @() }
      $dynParents[$parent] += $_.Name
    }

  # ✅ Fix .Count : on force un array
  $conflicts = @()
  foreach ($kv in $dynParents.GetEnumerator()) {
    $unique = @($kv.Value | Select-Object -Unique)
    if ($unique.Length -gt 1) {
      $conflicts += [pscustomobject]@{
        Parent = $kv.Key
        Slugs  = ($unique -join ", ")
      }
    }
  }

  if ($conflicts.Length -gt 0) {
    LogWarn "Dynamic route conflicts found:"
    foreach ($c in $conflicts) {
      Write-Host (" - " + $c.Parent + " => " + $c.Slugs) -ForegroundColor Yellow
    }
  } else {
    LogOk "No dynamic route conflicts detected under /app."
  }

  if (Test-Path (Join-Path $root ".next")) {
    Remove-Item -Recurse -Force -Path (Join-Path $root ".next")
    LogOk "Removed .next cache"
  } else {
    LogInfo ".next cache not found"
  }

  Write-Host ""
  Write-Host "RUN: npm run dev" -ForegroundColor Magenta
}
catch {
  LogErr $_.Exception.Message
  throw
}
