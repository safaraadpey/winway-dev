# Restore local app to Supabase main (prod)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $Root ".env.local"
$backup = Join-Path $Root ".env.local.main-backup"

if (-not (Test-Path $backup)) {
  Write-Error "Missing .env.local.main-backup — restore main keys manually from Dashboard."
}

Copy-Item $backup $local -Force
Write-Host "Restored .env.local from .env.local.main-backup (main / ayybcrihxgtukwyeuoks)"
Write-Host "Update apps/engines/bingo/.env manually if needed."
