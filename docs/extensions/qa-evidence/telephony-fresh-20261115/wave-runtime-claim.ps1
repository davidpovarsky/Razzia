param([ValidateSet('reserve','release')][string]$Action, [string]$Job, [long]$ConsumedBytes = 0)
$ErrorActionPreference = 'Stop'
$claimsPath = 'C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.json'
$lockPath = 'C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.lock'
$threadId = $env:CODEX_THREAD_ID
if ($threadId -ne '01a1dfa9-87af-79f3-a855-8a93c517b4f5') { throw 'Current Lane C identity required' }
$lock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
  $state = Get-Content -Raw -LiteralPath $claimsPath | ConvertFrom-Json
  $live = @($state.active_claims | Where-Object { $_.terminal -ne $true })
  $mine = @($live | Where-Object { $_.thread_id -eq $threadId })
  $terminalHistoryBefore = ConvertTo-Json -InputObject @($state.active_claims | Where-Object { $_.terminal -eq $true }) -Depth 30 -Compress
  if ($Action -eq 'reserve') {
    if (!$state.new_claims_authorized -or $mine.Count) { throw 'Activation or free own allocation required' }
    $cpu = 0.25; $memory = 1024 + $state.shared_metadata_mib
    foreach ($claim in $live) { $cpu += $claim.cpu; $memory += $claim.memory_mib }
    if ($cpu -gt $state.cpu_ceiling -or $memory -gt $state.memory_mib_ceiling) { throw 'Shared capacity unavailable' }
    $state.active_claims = @($state.active_claims) + [pscustomobject]@{
      role='telephony'; thread_id=$threadId; cpu=0.25; memory_mib=1024; job=$Job; terminal=$false
      parent_authorization='SINGLE_MANAGER_WAVE_RESTART_20261115'; issued_by=$threadId
      reserved_utc=[DateTime]::UtcNow.ToString('o')
    }
  } else {
    if ($mine.Count -ne 1 -or $mine[0].job -ne $Job) { throw 'Exact own terminal job required' }
    if ($ConsumedBytes -lt $state.disk_budgets.telephony.new_consumed_bytes -or $ConsumedBytes -gt 16777216) { throw 'Invalid cumulative disk accounting' }
    $state.disk_budgets.telephony.new_consumed_bytes = $ConsumedBytes
    $state.active_claims = @($state.active_claims | Where-Object { !($_.thread_id -eq $threadId -and $_.job -eq $Job -and $_.terminal -ne $true) })
    $released = $mine[0]; $released.terminal = $true
    $released | Add-Member -NotePropertyName released_utc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    $state.released_claims = @($state.released_claims) + $released
  }
  $terminalHistoryAfter = ConvertTo-Json -InputObject @($state.active_claims | Where-Object { $_.terminal -eq $true }) -Depth 30 -Compress
  if ($terminalHistoryAfter -ne $terminalHistoryBefore) { throw 'Terminal reservation history changed; refuse to write ledger' }
  $state.updated_utc = [DateTime]::UtcNow.ToString('o')
  [System.IO.File]::WriteAllText($claimsPath, ($state | ConvertTo-Json -Depth 30) + "`n", [System.Text.UTF8Encoding]::new($false))
  $liveAfter = @($state.active_claims | Where-Object { $_.terminal -ne $true })
  [pscustomobject]@{ action=$Action; job=$Job; consumed_bytes=$state.disk_budgets.telephony.new_consumed_bytes; live_cpu=(@($liveAfter | Measure-Object cpu -Sum).Sum); live_memory_mib_including_metadata=(@($liveAfter | Measure-Object memory_mib -Sum).Sum)+$state.shared_metadata_mib; shared_metadata_mib=$state.shared_metadata_mib; terminal_history_preserved=$true } | ConvertTo-Json -Compress
} finally { $lock.Dispose() }
