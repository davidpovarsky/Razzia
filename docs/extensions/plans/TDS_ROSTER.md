# TDS-09 — roster and package panels

PHASE: TDS-09 `VERIFIED`

Asana parent: `1220402777392717` (external coordinator sync only).
Asana subtask: `1220402539686302`.

Working branch and worktree:
`codex/tadazz-design-system-20261110` at
`C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`.

BASE_HEAD: `4519a01fa82e4d0d12c654f211175c2a7bf0760a`.
NEW_HEAD / implementation commit:
`ad0152866e0f84fbead6c2a32dca6ec7d0fa0c07`.
No push, merge or deployment occurred.

## Changed files

Production and integration:

- `extensions/src/platform-ui/{alert-dialog,index,roster-controls,styles}.tsx/ts`
- `extensions/src/site/themes/packages.ts`
- `extensions/src/locales/{en,de,es,fr,it,ja,tr,vi}/extensions.json`
- `packages/web/src/features/game/components/HostPlayersModal.tsx`
- `packages/web/src/features/game/components/GameSettingsModal/index.tsx`

Tests and governance:

- `extensions/src/platform-ui/roster-controls.test.ts`
- `extensions/src/locales/locales.test.ts`
- `extensions/src/site/tests/browser/site.spec.ts`
- `extensions/qa/{tds-boundary,tds-host-seams}.mjs`
- `extensions/qa/{tds-roster,tds-package-admin}.spec.ts`
- `extensions/qa/tds-phase09.sh`
- `extensions/tds.{roster,package-admin}.playwright.config.ts`
- `docs/extensions/plans/{TDS_PROGRESS,TDS_ROSTER}.md`
- `docs/extensions/qa-evidence/design-system-20261110/phase-09*`

## Implementation

### Participant removal

Each row now uses the canonical `HostRosterRemove` alert dialog. Its accessible
title includes the actual participant name. The description states only the
established effect: remove the roster entry and disconnect an associated live
session. It does not claim historical answers, votes or points are deleted.

The original DELETE API and roster identity remain authoritative. Cancel sends
zero DELETE requests. Confirmation is single-flight, and pending dismissal is
blocked. A failed request keeps both the row and dialog visible and announces
participant-specific error feedback. A successful request waits for the server
snapshot, removes the row, and returns keyboard focus to roster search after the
row trigger disappears. A missing game ID disables the action.

### Phone Invite Only

`hostRules` overlays the latest `hostPresence.phoneInviteOnly` on stored game
settings. The settings form consumes reactive values with `keepDirtyValues`, so
socket updates replace the clean policy field without overwriting unrelated dirty
fields. Submission continues to PATCH only values that differ from the current
authoritative baseline. The existing general and dedicated settings endpoints
remain unchanged and broadcast/return host presence through the existing path.

The roster uses current game settings only as a pre-presence fallback. The policy
is separated from the four server-derived KPI cards and gives pending, saved and
error feedback without optimistic success.

### Roster layout and package administration

The roster keeps its original search, filters, CRUD, CSV/XLSX parsing, templates,
export, IDs, statuses, reconnect semantics and full authorized-host phone display.
It now uses four compact KPI cards, a separate token-based policy panel, sticky
bounded table scrolling, internal horizontal scrolling and narrow-screen column
priorities. Native rendering measured and passed with 40 and 400 rows, so no
virtualization or dependency was added.

The existing lazy `PackageManager` remains the only installer and state owner.
Its downstream Studio skin maps package surfaces, buttons, focus, status, errors,
lists and reduced motion to canonical Tadazz tokens. Capability, upload, build,
preview, install, export, rollback, tenant and permission logic was not copied or
changed. The current Studio route passed real package build, install and export in
both engines and at 1024px/390px/mobile-context layouts.

### Localization and guards

Added complete `saving`, `saved`, participant-specific removal title/description/
error and actions-column translations for en/de/es/fr/it/ja/tr/vi. The policy
reuses the existing translated explanatory key. Locale parity requires every key.

The boundary allowlist now recognizes initiative-owned
`extensions/src/locales/**`; protected upstream/editor/artwork hashes and seam
limits remain unchanged. The host AST guard keeps unapproved state/action bodies
identical to TDS-07 and pins the two owner-approved TDS-09 roster/settings bodies
to exact reviewed AST hashes. Visual tolerance and editor baselines were not
weakened.

## Decisions and tradeoffs

- Native table rendering passed 400-row browser QA, so virtualization was rejected
  as unnecessary complexity.
- The approved host handler propagates rejection to the canonical dialog while
  retaining the existing toast path.
- `GameSettingsModal` is exactly 18/18 cumulative changed lines;
  `HostPlayersModal` is 87/110. No tenth upstream file was touched.
- Package functionality uses the current Studio route. The historical full package
  suite still contains a `/manager/config` assumption; its separate result is
  disclosed below rather than hidden or used as the current UI gate.

## Verification environment

All executable browser checks ran on the established private Oracle server
`tadazz-quiz-server`, inside `tadazz-design-system-qa-20261110` based on
`tadazz:design-system-qa-20261110`. Limits: 2 CPU, 4 GiB, 768 PIDs, no published
ports, no production data/config/provider secrets. Every suite invocation used
`/usr/bin/tini -s --`. Source transport SHA-256 was
`02be5c86edd1ca8979824f81a35536db457eb6097df3914bd50749c44d66d6fc`.
The prior container source was archived privately before replacement.

## Tests and actual results

Definitive `extensions/qa/tds-phase09.sh`: **PASS, all 14 labels exit 0**:

- extension TypeScript: PASS.
- web TypeScript: PASS.
- focused unit/server/locales/platform: 17 suites, 40 tests PASS.
- targeted format: PASS.
- roster Chromium + WebKit: 2/2 PASS.
- lazy package preflight Chromium + WebKit: 2/2 PASS.
- current package administration Chromium + WebKit: 2/2 PASS.
- canonical component interactions Chromium + WebKit: 22/22 PASS.
- catalog production build: PASS.
- full production/API/editor integration Chromium: 1/1 PASS.
- freeze, design, generated token registry and catalog governance: PASS.

Roster browser assertions cover 40-row CSV import, preview/approval, downloads,
server KPIs, search/filter, cancel with zero DELETE, failure row retention and
alert, duplicate-confirm suppression, successful focus restoration, roster and
Game Settings policy synchronization, dirty unrelated form preservation,
changed-only PATCH, 400-row navigation, internal narrow scrolling and wide/narrow
screenshots in both engines.

Package administration assertions cover lazy disclosure, real package preflight,
build, private install, export download, canonical action color, text/overflow and
mobile access in both engines. The unchanged broader package runtime suite was
also run: **6/10 PASS, 4/10 FAIL**. The passing cases cover declarative private
preview, bounded heavy renderer/fallback and networkless dependency/import
rejection in both engines. Two load cases crashed browser targets under the fixed
4 GiB container; two old-route cases timed out waiting for the historical
`Quizz` control after `/manager/config` redirects to current Studio. These four
failures predate and do not exercise the TDS-09 package skin. They remain explicit
TDS-12 compatibility/performance follow-up, while the current-route package
operations required by TDS-09 pass in both engines.

Evidence:

- `phase-09-status.txt`, `phase-09-verified-r2-job.log`
- `phase-09-unit.json`, `phase-09-roster.json`, `phase-09-packages.json`
- `phase-09-package-admin.json`, `phase-09-components.json`
- `phase-09-integration.json`, `phase-09-boundary.json`
- `phase-09-{freeze,design,registry,catalog,catalog-build,format}.log`
- 400-row roster screenshots at 1024x768 and 390x844 in Chromium/WebKit
- package administration screenshots at 1024x768, 390x844 and a separate mobile
  context in Chromium/WebKit
- retained r2/r3 focus diagnostics and package-runtime failure reports

## Editor, compatibility, security and accessibility

`node extensions/qa/tds-boundary.mjs` passes against 602 protected files with
593 unchanged hashes and only the nine approved host seams. The final integration
run uses Playwright threshold `0` and `maxDiffPixels: 0`; all four frozen editor
captures pass against `editor-control`. PNG bytes are identical for scene/timeline
and settings; question/media were re-encoded to different PNG bytes but passed the
zero-pixel comparator. `phase-09-editor-proof.json` records both facts without
claiming byte identity where absent.

No editor source, global editor style, show choreography, audio/timer owner,
server wire, persisted identifier, graphical logo or license changed. Synthetic
accounts use `example.invalid`; generated test identities and safe fixture numbers
contain no customer PII. Public/player privacy tests pass. Keyboard cancellation,
failure recovery, successful focus restoration, native disabled/loading states,
RTL-capable logical styling and reduced-motion package styling are retained.

## Known issues and next action

- The historical package runtime load test exceeds the phase container's 4 GiB
  browser budget; rerun under the separately documented package-load environment
  during TDS-12 or report it as a resource-bound NOT RUN rather than physical-device
  evidence.
- The historical `/manager/config` package test needs a future compatibility test
  update to use the current Studio route; protected package business logic remains
  unchanged and current-route acceptance is green.
- Physical devices and the final route/locale/viewport/lifecycle matrix remain
  TDS-12.
- Local ignored `node_modules` was removed while troubleshooting Windows Docker;
  restore with `pnpm install --frozen-lockfile` if local execution is needed.

Next exact action: begin TDS-10 platform-only motion from implementation commit
`ad0152866e0f84fbead6c2a32dca6ec7d0fa0c07`. Owner approval required: no for
the local checkpoint commit and TDS-10; yes for any push, merge, deployment,
production operation or destructive remote cleanup.
