# Point local app at Supabase develop: sync keys + swap .env.local
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot "sync-supabase-develop-env.ps1")

$local = Join-Path $Root ".env.local"
$develop = Join-Path $Root ".env.develop.local"
$backup = Join-Path $Root ".env.local.main-backup"

if (Test-Path $local) {
  Copy-Item $local $backup -Force
  Write-Host "Backed up .env.local -> .env.local.main-backup"
}

Copy-Item $develop $local -Force
Write-Host "Active: .env.local -> Supabase develop (ovclbgxtpxyzlcmwbviw)"

$engineDevelop = Join-Path $Root "apps\engines\bingo\.env.develop.local"
$engineEnv = Join-Path $Root "apps\engines\bingo\.env"
if (Test-Path $engineDevelop) {
  Copy-Item $engineDevelop $engineEnv -Force
  Write-Host "Active: apps/engines/bingo/.env -> develop"
}

Write-Host "Restart npm run dev and apps/engines/bingo to pick up changes."
