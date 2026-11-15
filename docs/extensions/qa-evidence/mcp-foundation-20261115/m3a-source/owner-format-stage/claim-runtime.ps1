$ErrorActionPreference='Stop'
$base='C:\Users\DAVID\Code\Codex-Agent-HQ\docs\tadazz'
$until=[DateTime]::UtcNow.AddMinutes(15)
$claimed=$false
while ([DateTime]::UtcNow -lt $until -and !$claimed) {
  $lock=$null
  try {
    $lock=[IO.File]::Open((Join-Path $base 'runtime-claims.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $ledger=Get-Content -Raw -LiteralPath (Join-Path $base 'runtime-claims.json')|ConvertFrom-Json
    if (!$ledger.new_claims_authorized) { throw 'Current claims disabled' }
    $active=@($ledger.active_claims|Where-Object {!$_.terminal})
    $cpu=($active|Measure-Object cpu -Sum).Sum
    $memory=($active|Measure-Object memory_mib -Sum).Sum
    if ($cpu+0.25 -le $ledger.cpu_ceiling -and $memory+1024+$ledger.shared_metadata_mib -le $ledger.memory_mib_ceiling) {
      if (@($active|Where-Object thread_id -eq $env:CODEX_THREAD_ID).Count) {throw 'Duplicate own claim'}
      $ownRemaining=[long](8MB-$ledger.disk_budgets.mcp_server.new_consumed_bytes)
      if ($ownRemaining -lt 3MB) {throw 'Insufficient cumulative own disk allowance'}
      $claim=[pscustomobject]@{role='mcp_server';thread_id=$env:CODEX_THREAD_ID;cpu=0.25;memory_mib=1024;job='mcp-runtime-F-20261115-01a1dfaa';claim_id='mcp-runtime-F-20261115-01a1dfaa';claimed_utc=[DateTime]::UtcNow.ToString('o');parent_authorization='SINGLE_MANAGER_WAVE_RESTART_20261115';terminal=$false}
      $ledger.active_claims=@($ledger.active_claims)+$claim
      $ledger.updated_utc=[DateTime]::UtcNow.ToString('o')
      $ledger|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $base 'runtime-claims.json')
      $remaining=0L
      foreach ($p in $ledger.disk_budgets.PSObject.Properties) {$remaining += [Math]::Max(0,$p.Value.ceiling_mib*1MB-$p.Value.new_consumed_bytes)}
      [ordered]@{threadId=$env:CODEX_THREAD_ID;job=$claim.job;ownerActivation=$claim.parent_authorization;otherReserveBytes=[long]($ledger.disk_floor_bytes+$ledger.margin_mib*1MB+$remaining-$ownRemaining);diskRemainingBytes=$ownRemaining;claim=$claim}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-01/activation.json')
      $claimed=$true
    }
  } catch [IO.IOException] {
    # Another developer owns the short ledger lock; do not modify their state.
  } finally {if ($lock) {$lock.Dispose()}}
  if (!$claimed) {Start-Sleep -Seconds 15}
}
if (!$claimed) {throw 'No runtime capacity during bounded15minute queue; no claim or dispatch'}
Write-Output 'Reserved0.25CPU/1024MiB within cumulative lane disk allowance'
& 'C:\Users\DAVID\AppData\Local\Programs\Python\Python312\python.exe' (Join-Path $PSScriptRoot 'runtime-01/transport.py')
exit $LASTEXITCODE
