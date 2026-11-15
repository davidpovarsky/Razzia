param([ValidateSet('claim','release')][string]$Action, [long]$ConsumedBytes = 0, [string]$TerminalEvidence = '')
$ErrorActionPreference = 'Stop'
$register = 'C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.json'
$thread = $env:CODEX_THREAD_ID
if ($thread -ne '01a1dfa9-5c5a-7723-8993-110f2dfe4892') { throw 'Unexpected Lane B chat identity' }
$gate = [System.IO.File]::Open('C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.lock',[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
try {
  $state = [System.IO.File]::ReadAllText($register) | ConvertFrom-Json
  $active = @($state.active_claims | Where-Object { -not $_.terminal })
  $own = @($active | Where-Object { $_.thread_id -eq $thread })
  if ($Action -eq 'claim') {
    if (-not $state.new_claims_authorized -or $own.Count) { throw 'New claims disabled or own claim already exists' }
    if (@($active | Where-Object { $_.role -eq 'recovery' }).Count) { throw 'Recovery already reserved' }
    if ((($active | Measure-Object cpu -Sum).Sum + 0.25) -gt $state.cpu_ceiling -or (($active | Measure-Object memory_mib -Sum).Sum + 2048) -gt $state.memory_mib_ceiling) { throw 'Shared capacity unavailable' }
    $state.active_claims = @($state.active_claims) + [pscustomobject]@{role='recovery';thread_id=$thread;cpu=0.25;memory_mib=2048;job='C1 wave witness then native11; init initially OFF';terminal=$false;claimed_utc=[DateTime]::UtcNow.ToString('o');parent_authorization='SINGLE_MANAGER_WAVE_RESTART_20261115'}
  } else {
    if ($own.Count -ne 1 -or -not $TerminalEvidence) { throw 'Require own unique claim and terminal evidence' }
    if ($ConsumedBytes -lt $state.disk_budgets.recovery.new_consumed_bytes -or $ConsumedBytes -gt 64MB) { throw 'Invalid cumulative accounting' }
    $own[0].terminal=$true
    $own[0] | Add-Member released_utc ([DateTime]::UtcNow.ToString('o'))
    $own[0] | Add-Member terminal_evidence $TerminalEvidence
    $state.disk_budgets.recovery.new_consumed_bytes=$ConsumedBytes
  }
  $state.updated_utc=[DateTime]::UtcNow.ToString('o')
  [System.IO.File]::WriteAllText($register,($state | ConvertTo-Json -Depth 20),[System.Text.UTF8Encoding]::new($false))
  $state.active_claims | Select-Object role,thread_id,cpu,memory_mib,terminal | ConvertTo-Json
} finally { $gate.Dispose() }
