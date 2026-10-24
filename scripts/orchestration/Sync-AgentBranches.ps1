# V3: run ONLY after Tomer's bootstrap commit, before Maya and Noam begin coding.
# Safe preflight on ALL targets before any mutation. No force/reset/push.
$ErrorActionPreference = 'Stop'
$root = Join-Path $HOME 'Code\Razzia-worktrees'
$tomer = Join-Path $root 'tomer'
$roles = @('maya', 'noam')
$target = (git -C $tomer rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read Tomer HEAD' }
$branch = (git -C $tomer branch --show-current).Trim()
if ($branch -ne 'agent/tomer/wave1') { throw "Unexpected Tomer branch: $branch" }
$subject = (git -C $tomer log -1 --format=%s).Trim()
if ($subject -notmatch '^build\(extensions\): bootstrap shared contracts for three agents$') {
  throw "Tomer bootstrap commit is required. Current HEAD subject: $subject"
}
foreach ($role in $roles) {
  $worktree = Join-Path $root $role
  if (-not (Test-Path $worktree)) { throw "Missing worktree: $worktree" }
  $actual = (git -C $worktree branch --show-current).Trim()
  if ($actual -ne "agent/$role/wave1") { throw "Wrong branch for $role : $actual" }
  $status = @(git -C $worktree status --porcelain)
  if ($status.Count -ne 0) { throw "$role worktree is dirty; NO branches updated" }
  git -C $worktree merge-base --is-ancestor HEAD $target
  if ($LASTEXITCODE -ne 0) { throw "$role is not a fast-forward ancestor of bootstrap" }
}
foreach ($role in $roles) {
  $worktree = Join-Path $root $role
  git -C $worktree merge --ff-only $target
  if ($LASTEXITCODE -ne 0) { throw "Failed to fast-forward $role; STOP" }
  $now = (git -C $worktree rev-parse HEAD).Trim()
  if ($now -ne $target) { throw "Unexpected hash after sync for $role" }
  Write-Output "SYNCED $role $now"
}
Write-Output 'SUCCESS: Maya and Noam now have Tomer bootstrap; safe to start three active conversations.'
