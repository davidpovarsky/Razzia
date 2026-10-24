$ErrorActionPreference='Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { throw 'Missing .env' }
$kv = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^([A-Z_]+)=(.*)$') { $kv[$Matches[1]] = $Matches[2] }
}
$web = if ($kv['WEB_PORT']) { [int]$kv['WEB_PORT'] } else { 3000 }
$socket = if ($kv['SOCKET_PORT']) { [int]$kv['SOCKET_PORT'] } else { 3001 }
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$socket/api/health" -TimeoutSec 10
if ($health.status -ne 'ok') { throw 'Socket health response unexpected' }
Write-Output 'PASS socket health'
$manager = Invoke-WebRequest -Uri "http://127.0.0.1:$web/manager" -UseBasicParsing -TimeoutSec 15
if ($manager.StatusCode -ne 200) { throw 'Manager route not HTTP 200' }
Write-Output 'PASS manager HTML'
$body = @{password=$kv['MANAGER_PASSWORD']} | ConvertTo-Json -Compress
$auth = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$socket/api/auth/manager" -ContentType 'application/json' -Body $body -TimeoutSec 10
if (-not $auth.token -or $auth.role -ne 'manager') { throw 'Manager authentication failed' }
Write-Output 'PASS manager authentication'
$headers = @{ Authorization = 'Bearer ' + $auth.token }
$list = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$socket/api/quizz" -Headers $headers -TimeoutSec 10
if ($null -eq $list.quizz) { throw 'Quiz list response invalid' }
Write-Output ('PASS quiz API (count: '+@($list.quizz).Count+')')
Write-Output 'PASS local HTTP smoke checks'
