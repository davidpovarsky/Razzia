$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Use-Node24.ps1')
Set-Location $root
if (-not (Test-Path '.env')) { throw 'Missing .env; configure local credentials first.' }
if (-not (Test-Path 'node_modules')) { throw 'Missing dependencies; run pnpm install --frozen-lockfile.' }
Write-Host 'Razzia local web: http://localhost:3000 ; manager: http://localhost:3000/manager'
& pnpm.cmd dev
exit $LASTEXITCODE
