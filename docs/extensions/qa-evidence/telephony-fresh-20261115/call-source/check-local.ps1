$ErrorActionPreference = 'Stop'
$root = 'C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-telephony-fresh-20261115'
$integration = 'C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-integration-20261115'
$evidence = Join-Path $root 'docs/extensions/qa-evidence/telephony-fresh-20261115/call-20261115'
$source = Join-Path $root 'docs/extensions/qa-evidence/telephony-fresh-20261115/call-source'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$targets = @('node_modules','extensions/node_modules','packages/socket/node_modules','packages/common/node_modules','packages/web/node_modules','docs/extensions/qa-evidence/telephony-fresh-20261115/node_modules')
$created = @()
$exitCode = $null
try {
  foreach ($relative in $targets) {
    $link = Join-Path $root $relative
    $target = Join-Path $integration $(if ($relative.StartsWith('docs/')) { 'packages/socket/node_modules' } else { $relative })
    if ((Test-Path -LiteralPath $link) -or !(Test-Path -LiteralPath $target)) { throw 'Dependency path unavailable; preserve preexisting state' }
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    $created += [pscustomobject]@{ path=$link; target=$target }
  }
  $authored = @(Get-ChildItem -LiteralPath $source -File | Where-Object Extension -In @('.ts','.mjs','.json') | ForEach-Object FullName)
  $authored += @(
    (Join-Path $root 'extensions/src/telephony/pilot-runtime/gateway-v2/contracts.ts'),
    (Join-Path $root 'extensions/src/telephony/pilot-runtime/gateway-v2/adapter.ts'),
    (Join-Path $root 'extensions/src/telephony/pilot-runtime/gateway-v2/call-precommit.ts'),
    (Join-Path $root 'extensions/src/server/phone-lifecycle-v2/auth/unmounted-factory.ts')
  )
  if ($authored.Count -lt 3) { throw 'Expected authored source files absent' }
  $ignore = Join-Path $evidence 'prettier-empty-ignore.txt'
  [IO.File]::WriteAllText($ignore, '')
  node (Join-Path $integration 'node_modules/prettier/bin/prettier.cjs') --config (Join-Path $integration '.prettierrc.json') --ignore-path $ignore --write @authored 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'format-write.log')
  if ($LASTEXITCODE -ne 0) { throw 'Authored scope formatter failed' }
  node (Join-Path $integration 'node_modules/prettier/bin/prettier.cjs') --config (Join-Path $integration '.prettierrc.json') --ignore-path $ignore --check @authored 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'format-check.log')
  if ($LASTEXITCODE -ne 0) { throw 'Authored scope format check failed' }
  $files = @($authored | Where-Object { $_.EndsWith('.ts') })
  if ($files.Count -lt 2) { throw 'Expected actual authority TypeScript roots absent' }
  [ordered]@{ extends=(Join-Path $root 'tsconfig.json'); compilerOptions=[ordered]@{ noEmit=$true; target='ESNext'; module='ESNext'; moduleResolution='bundler'; jsx='react-jsx'; skipLibCheck=$true; allowImportingTsExtensions=$true; types=@('node'); typeRoots=@((Join-Path $root 'packages/socket/node_modules/@types'),(Join-Path $root 'extensions/node_modules/@types')) }; files=$files; include=@() } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'affected.tsconfig.json')
  $env:GOMEMLIMIT='640MiB'
  $env:GOMAXPROCS='1'
  node --max-old-space-size=256 (Join-Path $integration 'node_modules/typescript/bin/tsc') --noEmit --pretty false -p (Join-Path $evidence 'affected.tsconfig.json') 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'typecheck.log')
  $exitCode=$LASTEXITCODE
} finally {
  foreach ($item in $created) {
    $link=Get-Item -Force -LiteralPath $item.path
    if ($link.LinkType -ne 'Junction' -or @($link.Target)[0].Replace('\','/') -ne $item.target.Replace('\','/') -or !$link.FullName.Replace('\','/').StartsWith($root+'/',[StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary dependency link changed; preserve it' }
    Remove-Item -LiteralPath $item.path -Force
  }
  [ordered]@{ scope='New isolated per-call encrypted precommit and explicit actual registration'; typescript='7.0.2'; authored_files=$authored; type_roots=$files; type_exit=$exitCode; no_install=$true; temporary_links_removed=(@($created | Where-Object { Test-Path -LiteralPath $_.path }).Count -eq 0) } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'typecheck-result.json')
}
if ($exitCode -ne 0) { throw "Affected types failed: $exitCode" }
