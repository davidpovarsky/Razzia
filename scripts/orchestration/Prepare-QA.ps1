# V3: optional QA only, after Tomer integrated all features and ran acceptance.
# Run while Roni worktree is CLEAN and no Roni agent is working.
$ErrorActionPreference = 'Stop'
$root = Join-Path $HOME 'Code\Razzia-worktrees'
$tomer = Join-Path $root 'tomer'
$roni = Join-Path $root 'roni'
if ((git -C $tomer branch --show-current).Trim() -ne 'agent/tomer/wave1') { throw 'Wrong Tomer branch' }
if ((git -C $roni branch --show-current).Trim() -ne 'agent/roni/wave1') { throw 'Wrong Roni branch' }
if (@(git -C $tomer status --porcelain).Count -ne 0) { throw 'Tomer must commit all integrated code first' }
if (@(git -C $roni status --porcelain).Count -ne 0) { throw 'Roni worktree is dirty; stop' }
$target = (git -C $tomer rev-parse HEAD).Trim()
git -C $roni merge-base --is-ancestor HEAD $target
if ($LASTEXITCODE -ne 0) { throw 'Roni is not a fast-forward ancestor; stop, do not reset' }
git -C $roni merge --ff-only $target
if ($LASTEXITCODE -ne 0) { throw 'QA sync failed' }
Write-Output "QA_READY $target"
