# RUN ONLY after Tomer bootstrap commit, BEFORE any other agent starts.
# Fast-forward seven clean branches to bootstrap commit; no force, no reset, no deletion.
$ErrorActionPreference = 'Stop'
$main = Join-Path $HOME 'Code\Razzia'
$tomer = Join-Path $HOME 'Code\Razzia-worktrees\tomer'
$roles = @('eitan','noam','maya','roni','yael','dana')
$target = (git -C $tomer rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read Tomer HEAD' }
$subject = (git -C $tomer log -1 --format=%s).Trim()
if ($subject -notmatch 'bootstrap typed workspace|bootstrap.*extensions') { throw "Tomer must commit the bootstrap first. Current subject: $subject" }
foreach ($r in $roles) {
  $p = Join-Path $HOME ('Code\Razzia-worktrees\'+$r)
  $expected = 'agent/'+$r+'/wave1'
  $branch = (git -C $p branch --show-current).Trim()
  if ($branch -ne $expected) { throw "Unexpected branch in $r" }
  $status = @(git -C $p status --porcelain)
  if ($status.Count -ne 0) { throw "Worktree $r has changes; abort without modifying anything" }
  git -C $p merge-base --is-ancestor HEAD $target
  if ($LASTEXITCODE -ne 0) { throw "Branch $r cannot fast-forward to bootstrap" }
}
foreach ($r in $roles) {
  $p = Join-Path $HOME ('Code\Razzia-worktrees\'+$r)
  git -C $p merge --ff-only $target
  if ($LASTEXITCODE -ne 0) { throw "Failed to fast-forward $r" }
  Write-Output ("SYNCED "+$r+" "+(git -C $p rev-parse --short HEAD))
}
Write-Output "SUCCESS: all six implementation branches include Tomer's bootstrap; no push."
