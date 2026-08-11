<#
.SYNOPSIS
  Refresh sql/baseline/001_schema.sql from the live develop database (schema-only).

.NOTES
  Requires:
  - WSL with PostgreSQL 17 client: /usr/lib/postgresql/17/bin/pg_dump
  - DATABASE_URL in .env.local (or pass -DatabaseUrl)
  Prefer the Supabase pooler session URL (IPv4) if direct db.* is IPv6-only.
#>
[CmdletBinding()]
param(
  [string] $DatabaseUrl = "",
  [string] $OutFile = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $OutFile) {
  $OutFile = Join-Path $repoRoot "sql\baseline\001_schema.sql"
}

if (-not $DatabaseUrl) {
  $envFile = Join-Path $repoRoot ".env.local"
  if (-not (Test-Path $envFile)) { throw ".env.local not found; pass -DatabaseUrl" }
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
  if (-not $line) { throw "DATABASE_URL not set in .env.local; pass -DatabaseUrl" }
  $DatabaseUrl = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
}

$schemas = @(
  "public", "tournament", "game_core", "game_finance", "game_pool",
  "game_ticket", "game_admin", "game_archive", "game_trash",
  "platform", "deposit", "monitor", "load_test"
) -join ","

$wslOut = ($OutFile -replace '\\', '/') -replace '^([A-Za-z]):', { "/mnt/$($matches[1].ToLower())" }
$schemaArgs = ($schemas.Split(',') | ForEach-Object { "-n $_" }) -join " "

Write-Host "[DB] Dumping schema-only baseline → $OutFile"
$bash = @"
set -euo pipefail
export PGSSLMODE=require
/usr/lib/postgresql/17/bin/pg_dump "$DatabaseUrl" --schema-only --no-owner --quote-all-identifiers $schemaArgs -f "$wslOut"
wc -l "$wslOut"
"@

wsl bash -lc $bash
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

# Strip pg_dump 17 \restrict / \unrestrict and note PG17-only SET
$content = Get-Content -LiteralPath $OutFile -Raw
$content = [regex]::Replace($content, '(?m)^\\restrict .+\r?\n', '')
$content = [regex]::Replace($content, '(?m)^\\unrestrict .+\r?\n', '')
$content = $content -replace '(?m)^SET transaction_timeout = 0;', '-- SET transaction_timeout = 0; -- PG17+ only'
$stamp = Get-Date -Format "yyyy-MM-dd"
$header = @"
--
-- WinWay / DingMoney — schema baseline (schema-only)
-- Regenerated: $stamp via scripts/db-dump-baseline.ps1
-- Apply order: 000_extensions.sql → 001_schema.sql
--

"@
if ($content -notmatch 'WinWay / DingMoney — schema baseline') {
  $content = $header + $content
}

Set-Content -LiteralPath $OutFile -Value $content -NoNewline
Write-Host "[DB] Baseline dump complete."
