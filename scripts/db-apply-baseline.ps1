<#
.SYNOPSIS
  Apply sql/baseline onto a target Postgres (empty Supabase project recommended).

.NOTES
  DATABASE_URL must point at the *target* database.
  Requires WSL psql 17 (or Windows psql on PATH).
#>
[CmdletBinding()]
param(
  [string] $DatabaseUrl = "",
  [switch] $AlsoApplyForwardMigrations
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $DatabaseUrl) {
  $envFile = Join-Path $repoRoot ".env.local"
  if (-not (Test-Path $envFile)) { throw ".env.local not found; pass -DatabaseUrl" }
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
  if (-not $line) { throw "DATABASE_URL not set; pass -DatabaseUrl" }
  $DatabaseUrl = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
}

function Invoke-PsqlFile([string] $RelPath) {
  $full = Join-Path $repoRoot $RelPath
  if (-not (Test-Path $full)) { throw "Missing $RelPath" }
  $wslPath = ($full -replace '\\', '/') -replace '^([A-Za-z]):', { "/mnt/$($matches[1].ToLower())" }
  Write-Host "[DB] Applying $RelPath"
  wsl bash -lc "export PGSSLMODE=require; /usr/lib/postgresql/17/bin/psql `"$DatabaseUrl`" -v ON_ERROR_STOP=1 -f `"$wslPath`""
  if ($LASTEXITCODE -ne 0) { throw "psql failed on $RelPath (exit $LASTEXITCODE)" }
}

Write-Host "[DB] Applying baseline to target database…"
Invoke-PsqlFile "sql/baseline/000_extensions.sql"
Invoke-PsqlFile "sql/baseline/001_schema.sql"

if ($AlsoApplyForwardMigrations) {
  $files = Get-ChildItem (Join-Path $repoRoot "sql\migrations\*.sql") -File | Sort-Object Name
  foreach ($f in $files) {
    $rel = "sql/migrations/$($f.Name)"
    Invoke-PsqlFile $rel
  }
}

Write-Host "[DB] Baseline apply complete."
