# TDS-00 baseline and ownership — 10 November 2026

## Integrated baseline

Inspected all Git worktrees and local / remote branch pointers. The original
`agent/tadazz-next-20261105` tree at `0079e456` has extensive uncommitted work,
including editor/runtime/server files. It is preserved untouched and is not a
safe source snapshot for this initiative. No other worktree is modified.

The clean integrated site branch `fb6c7631999f` includes the package runtime base
`18d3c9d052e3` and five preview-account integration commits through `08ddc42`,
followed by the validated site integration, production rollout, scrolling,
performance and delivery documentation. It has zero `packages/**` diff relative
to `18d3c9d`. A separate scoped worktree was created from this exact revision.

`git ls-remote` confirms origin's package baseline `18d3c9d` and main `5161eb7`.
The integrated site branch has no remote branch yet. Explicit fork PR query
`gh pr list --repo davidpovarsky/Razzia --state open ...` returns `[]`.
Upstream main is `8345663f7f47` (4.0.2), 14 commits beyond fork main; upstream
dev now advertises `a073544f4af4`. No upstream merge or drift repair is part of
this UI task. Earlier default `gh` lookup selected upstream; its unrelated PRs
are not fork integration work.

## Production read-only confirmation

SSH to the configured existing Oracle host used its existing authorized key.
No credentials, environment values, data contents or logs were inspected.
Container `tadazz`: ID `96e9a2b4c3f42edb6e4618309475b2893aa7e5d814fdb8527e5ed0220c554fb1`,
image `sha256:6b08742f1758aee1dc60554bbec5b885148209b3eaa4e5020b6db5ada6d92ba8`,
started `2026-11-10T14:19:26.741504869Z`.
Live public HTML still points to `/assets/index-I6QCz3Vn.js`, matching the latest
site audit, rather than assuming the container base-image label is its current
web payload. Recreate image `tadazz:site-audit-final-ba64f49` exists. This proves
the observed asset identity, not a new claim that every production source file
matches a Git SHA. No production service/data changes were performed.

## Freeze / allowed paths

The canonical prompt is copied verbatim into this directory. Existing editor
under `packages/web/src/features/quizz/**`, `extensions/src/editor/**`, all
upstream source, font/global CSS/router and the logo/source artwork are locked.
`tds-freeze.json` records exact SHA-256 for 602 protected files.
`extensions/qa/tds-boundary.mjs` rejects changed protected paths and changes
outside downstream site/platform UI, initiative QA/config, extension package
manifest and downstream developer documentation. It also detects modifications
to any artwork. Any future necessary seam requires exact owner authorization;
old P0 permissions do not authorize this initiative's upstream edits.

## Verification plan and baseline captures

No new screenshot was attached to this request. Existing immutable approved
site reference assets and previous QA evidence are reference material only.
Fresh actual-browser captures use an isolated Linux Docker environment,
synthetic `example.invalid` accounts, disposable test config, blocked outbound
mail and no production mount/provider credentials/published ports. The existing
local Windows game/browser restriction is respected. CPU/memory/PID quotas
apply to the test container. No other lab is replaced.

Commands/results:

- PASS: clean integrated source / ancestry / worktree / fork PR / live entry audit.
- PASS: `pnpm install --frozen-lockfile --ignore-scripts` (Node 24.22.1, pnpm 11.24.0), no manifest/lock changes.
- PASS: `node extensions/qa/tds-boundary.mjs --record`, 602 protected hashes.
- PASS: `pnpm --dir extensions exec playwright test --config tds.playwright.config.ts`
  in the disposable Oracle container: **1 passed, 34.4s**, twenty representative
  captures including package preflight and host history. Production bundle built
  by the existing preview harness. Remote Node 24.22.2 / pnpm 12.18.0 /
  Playwright 1.64.0. [Raw result](../qa-evidence/design-system-20261110/baseline-browser-results.json)
  and [log](../qa-evidence/design-system-20261110/baseline.log).
- PASS: 602 protected file hashes also match inside the actual QA container.
- PASS: reviewed actual home/demo/Studio/gallery/list/account, native host lobby,
  fullscreen standby, shortcuts/settings/roster/history, clean spectator standby,
  package preflight, theme preview and saved editor question/scene/timeline/media.
  [Before captures](../qa-evidence/design-system-20261110/before/).
- NOT RUN: baseline Chromium/WebKit regression suites, physical-device checks.

Known baseline risks: Windows oversized theme-upload test had historical
`ECONNRESET`; that is not a fresh result. Existing manager roster/settings
Radix portals omit a fullscreen container, while shortcuts include one.
NativeGameSurface owns the themed backdrop but GameWrapper mounts the original
classroom under the whole frame. These are source findings, not fixes yet.

QA refinement: the initial 18-capture smoke passed. Adding history initially
failed because the fixture had no connected player, then because its player
name exceeded the existing 24-character validator. Corrected the QA fixture
to use `FixturePlayer` and distinct host/display/player browser contexts;
retained failed attempt logs. No application behavior was changed to satisfy
these checks. WebSocket proxy ECONNRESET messages during role-context teardown
remain in the successful raw log; the scenario's assertions all pass.

Current baseline findings are now also visually confirmed: classroom behind
native host toolbars; vertically stretched list cover; redundant Create tile;
widely separated secondary/destructive actions; phone-only setting presented as
a roster metric. Audience/host projection intentionally begins in standby:
do not infer that a standby screenshot proves the live join data contract.

TDS-00 exit: VERIFIED. Baseline and freeze are documented; only documentation
and isolated QA tooling/evidence differ from BASE_HEAD. No product source changed.
Next: TDS-01 rules and naming contracts, after the phase commit / Asana update.
Owner approval needed only for a proven unavoidable protected-source seam or
the separate release gate.
