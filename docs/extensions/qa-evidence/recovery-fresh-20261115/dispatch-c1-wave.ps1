param([int]$Version=5)
$ErrorActionPreference='Stop'
$laneRoot='C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115'
$e=Join-Path $laneRoot 'docs/extensions/qa-evidence/recovery-fresh-20261115'
$claimed=$false
$deadline=[DateTime]::UtcNow.AddMinutes(20)
while (-not $claimed) {
  try {
    & (Join-Path $e 'runtime-claim-wave.ps1') claim
    $claimed=$true
  } catch {
    if ($_.Exception.Message -ne 'Shared capacity unavailable' -and $_.Exception -isnot [System.IO.IOException]) { throw }
    if ([DateTime]::UtcNow -ge $deadline) { throw 'Shared capacity unavailable after bounded resource wait; no job launched' }
    Start-Sleep -Seconds 15
  }
}
Write-Output 'Recovery claim acquired; staging the frozen synthetic packet'
& py -3.12 (Join-Path $e "c1-transfer-packet$Version.py") inspect
if ($LASTEXITCODE) { throw 'Source-only inspect failed; own claim remains for reconciliation' }
& py -3.12 (Join-Path $e "c1-transfer-packet$Version.py") transfer
if ($LASTEXITCODE) { throw 'Source-only transfer failed; own claim remains for reconciliation' }
$gate=[System.IO.File]::Open('C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.lock',[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
try {
  $raw=[System.IO.File]::ReadAllText('C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/runtime-claims.json')
  $snapshot=Join-Path $e "c1-wave-packet$Version-runtime-snapshot.json"
  if (Test-Path -LiteralPath $snapshot) { throw 'Existing snapshot; no overwrite' }
  [System.IO.File]::WriteAllText($snapshot,$raw,[System.Text.UTF8Encoding]::new($false))
} finally { $gate.Dispose() }
& py -3.12 (Join-Path $e 'run-c1-wave.py') $Version $snapshot
Write-Output "Packet finished with exit $LASTEXITCODE; inspect terminal evidence before releasing own claim"
