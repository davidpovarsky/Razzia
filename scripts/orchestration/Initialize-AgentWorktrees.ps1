# Safe, repeatable Razzia worktree bootstrap. No push, merge, reset, deletion or remote changes.
$ErrorActionPreference = 'Stop'
$repo = Join-Path $HOME 'Code\Razzia'
$root = Join-Path $HOME 'Code\Razzia-worktrees'
$roles = @('eitan','noam','maya','roni','tomer','yael','dana')
if (-not (Test-Path (Join-Path $repo '.git'))) { throw "Repository not found: $repo" }
Set-Location $repo
$expected = 'feat/modular-extensions-planning'
$current = (git branch --show-current).Trim()
if ($current -ne $expected) { throw "Expected branch $expected, got $current" }
if ($LASTEXITCODE -ne 0) { throw 'git branch failed' }
$tracked = @(git diff --name-only HEAD)
if ($tracked.Count -ne 0) { throw "Existing tracked upstream edits: $($tracked -join ', ')" }
$staged = @(git diff --cached --name-only)
if ($staged.Count -ne 0) { throw "Existing staged changes: $($staged -join ', ')" }
$planFiles = @('AGENTS.md','GEMINI.md','docs/extensions','scripts/local','scripts/orchestration')
foreach ($p in $planFiles) { if (-not (Test-Path (Join-Path $repo $p))) { throw "Missing: $p" } }
# Plan docs and local tooling are the only initial changes to commit; existing upstream tracked files stay untouched.
git add -- AGENTS.md GEMINI.md docs/extensions scripts/local scripts/orchestration
if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
$changed = @(git diff --cached --name-only)
$illegal = @($changed | Where-Object { $_ -notmatch '^(AGENTS\.md|GEMINI\.md|docs/extensions/|scripts/local/|scripts/orchestration/)' })
if ($illegal.Count -ne 0) { throw "Illegal staged paths: $($illegal -join ', ')" }
if ($changed.Count -gt 0) {
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace check failed' }
  git -c user.name='Razzia Local Planning' -c user.email='razzia-planning@localhost' commit -m 'docs: establish isolated Antigravity agent execution plan'
  if ($LASTEXITCODE -ne 0) { throw 'Planning commit failed' }
}
$base = (git rev-parse HEAD).Trim()
New-Item -ItemType Directory -Force -Path $root | Out-Null
foreach ($role in $roles) {
  $branch = "agent/$role/wave1"
  $folder = Join-Path $root $role
  if (Test-Path $folder) {
    $actualRoot = (git -C $folder rev-parse --show-toplevel 2>$null).Trim().Replace('\','/')
    if ($LASTEXITCODE -ne 0 -or $actualRoot -ne $folder.Replace('\','/')) { throw "Unexpected folder: $folder" }
    $actualBranch = (git -C $folder branch --show-current).Trim()
    if ($actualBranch -ne $branch) { throw "Wrong branch in ${folder}: $actualBranch" }
    Write-Output "EXISTS $role $folder"
  } else {
    git show-ref --verify --quiet "refs/heads/$branch"
    $ref = $LASTEXITCODE
    if ($ref -eq 0) { git worktree add $folder $branch }
    else { git worktree add -b $branch $folder $base }
    if ($LASTEXITCODE -ne 0) { throw "git worktree add failed for $role" }
    Write-Output "CREATED $role $folder"
  }
  git -C $folder config --local core.autocrlf false
  git -C $folder config --local core.eol lf
  $status = @(git -C $folder status --porcelain)
  if ($status.Count -ne 0) { throw "Unexpected uncommitted changes in $folder" }
}
Write-Output "PLANNING_COMMIT $base"
git worktree list
Write-Output 'SUCCESS: all seven isolated role worktrees ready; no remote changes.'
