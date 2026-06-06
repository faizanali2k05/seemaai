# Create the repo-root .env from .env.example, filling every __GENERATE__
# placeholder with a strong random hex secret. Windows / PowerShell equivalent
# of generate-secrets.sh. Will NOT overwrite an existing .env unless -Force.
param([switch]$Force)

$ErrorActionPreference = "Stop"
# repo root = two levels up from deploy/scripts/
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

if ((Test-Path .env) -and -not $Force) {
    Write-Host ".env already exists. Re-run with -Force to regenerate (this rotates"
    Write-Host "all DB passwords + the JWT secret and will require a fresh database)."
    exit 1
}

function New-Secret {
    $bytes = New-Object 'System.Byte[]' 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

$out = foreach ($line in (Get-Content .env.example)) {
    if ($line -match '__GENERATE__') { $line -replace '__GENERATE__', (New-Secret) } else { $line }
}
$out | Set-Content -Encoding utf8 .env

Write-Host "Generated .env with random secrets."
Write-Host ""
Write-Host "Next: open .env and paste your keys:"
Write-Host "  - ANTHROPIC_API_KEY   (required for AI features)"
Write-Host "  - CLIO_CLIENT_ID / CLIO_CLIENT_SECRET   (required for Clio sync)"
Write-Host ""
Write-Host "Then run:  docker compose up -d --build"
