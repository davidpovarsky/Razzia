# Dot-source in PowerShell: . .\scripts\local\Use-Node24.ps1
$nodeDir = Join-Path $HOME '.local\tools\node-v24.22.1-win-x64'
if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
  throw "Project Node 24 not installed at $nodeDir"
}
$env:PATH = "$nodeDir;$env:PATH"
Write-Host "Project Node: $(& (Join-Path $nodeDir 'node.exe') --version)"
