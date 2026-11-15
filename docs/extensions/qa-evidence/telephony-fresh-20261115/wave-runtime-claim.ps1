param([ValidateSet('reserve','release')][string]$Action, [string]$Job, [long]$ConsumedBytes = 0)
$ErrorActionPreference = 'Stop'
$claimsPath = 'C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.json'
$lockPath = 'C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.lock'
$threadId = $env:CODEX_THREAD_ID
if ($threadId -ne '01a1dfa9-87af-79f3-a855-8a93c517b4f5') { throw 'Current Lane C identity required' }
$lock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
  $state = Get-Content -Raw -LiteralPath $claimsPath | ConvertFrom-Json
  $mine = @($state.active_claims | Where-Object { $_.thread_id -eq $threadId })
  if ($Action -eq 'reserve') {
    if (!$state.new_claims_authorized -or $mine.Count) { throw 'Activation or free own allocation required' }
    $cpu = 0.25; $memory = 1024
    foreach ($claim in $state.active_claims) { $cpu += $claim.cpu; $memory += $claim.memory_mib }
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
    $state.active_claims = @($state.active_claims | Where-Object { $_.thread_id -ne $threadId })
    $released = $mine[0]; $released.terminal = $true
    $released | Add-Member -NotePropertyName released_utc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    $state.released_claims = @($state.released_claims) + $released
  }
  $state.updated_utc = [DateTime]::UtcNow.ToString('o')
  [System.IO.File]::WriteAllText($claimsPath, ($state | ConvertTo-Json -Depth 30) + "`n", [System.Text.UTF8Encoding]::new($false))
  [pscustomobject]@{ action=$Action; job=$Job; consumed_bytes=$state.disk_budgets.telephony.new_consumed_bytes } | ConvertTo-Json -Compress
} finally { $lock.Dispose() }
