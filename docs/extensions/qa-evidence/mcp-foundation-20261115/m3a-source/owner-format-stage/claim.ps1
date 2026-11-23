$ErrorActionPreference='Stop'
$base='C:\Users\DAVID\Code\Codex-Agent-HQ\docs\tadazz'
$lock=[IO.File]::Open((Join-Path $base 'runtime-claims.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  $ledger=Get-Content -Raw -LiteralPath (Join-Path $base 'runtime-claims.json') | ConvertFrom-Json
  if (!$ledger.new_claims_authorized) { throw 'Current claims disabled' }
  $active=@($ledger.active_claims | Where-Object {!$_.terminal})
  $cpu=($active | Measure-Object cpu -Sum).Sum
  $memory=($active | Measure-Object memory_mib -Sum).Sum
  if ($cpu+0.25 -gt $ledger.cpu_ceiling -or $memory+512+$ledger.shared_metadata_mib -gt $ledger.memory_mib_ceiling) {
    throw "Capacity unavailable: cpu=$cpu memory=$memory"
  }
  if (@($active | Where-Object thread_id -eq $env:CODEX_THREAD_ID).Count) { throw 'Duplicate own claim' }
  $claim=[pscustomobject]@{role='mcp_server';thread_id=$env:CODEX_THREAD_ID;cpu=0.25;memory_mib=512;job='mcp-format-F-20261115-01a1dfaa';claim_id='mcp-format-F-20261115-01a1dfaa';claimed_utc=[DateTime]::UtcNow.ToString('o');parent_authorization='SINGLE_MANAGER_WAVE_RESTART_20261115';terminal=$false}
  $ledger.active_claims=@($ledger.active_claims)+$claim
  $ledger.updated_utc=[DateTime]::UtcNow.ToString('o')
  $ledger | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $base 'runtime-claims.json')
  $remaining=0L
  foreach ($p in $ledger.disk_budgets.PSObject.Properties) { $remaining += [Math]::Max(0,$p.Value.ceiling_mib*1MB-$p.Value.new_consumed_bytes) }
  [ordered]@{threadId=$env:CODEX_THREAD_ID;job=$claim.job;ownerActivation=$claim.parent_authorization;otherReserveBytes=[long]($ledger.disk_floor_bytes+$ledger.margin_mib*1MB+$remaining-8MB);claim=$claim} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'activation.json')
  Write-Output 'Claim reserved: 0.25 CPU / 512 MiB / cumulative 8 MiB disk'
} finally { $lock.Dispose() }
