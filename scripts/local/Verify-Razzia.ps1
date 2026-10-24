$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Use-Node24.ps1')
Set-Location $root
Write-Host '=== Toolchain ==='
& node --version
& pnpm.cmd --version
Write-Host '=== Build ==='
& pnpm.cmd build
if ($LASTEXITCODE -ne 0) { throw "Build failed: $LASTEXITCODE" }
Write-Host '=== Unit and integration ==='
& pnpm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Tests failed: $LASTEXITCODE" }
Write-Host '=== Lint ==='
& pnpm.cmd lint
if ($LASTEXITCODE -ne 0) { throw "Lint failed: $LASTEXITCODE" }
Write-Host '=== Format ==='
& pnpm.cmd format
if ($LASTEXITCODE -ne 0) { throw "Format failed: $LASTEXITCODE" }
Write-Host 'Baseline checks complete.'
