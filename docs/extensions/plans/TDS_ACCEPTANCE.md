# TDS-12 — final development acceptance and release handoff

PHASE: TDS-12 `VERIFIED — DEVELOPMENT` (external qualifications below remain open)
Asana parent: `1220402777392717` (OPEN); subtask `1220402539686110`.
BASE_HEAD: `3812a1ab54ab5af9a7972ca4de8d9fbe377b21bc` (verified TDS-11).
IMPLEMENTATION_COMMIT: `3570689c073014cb78ec0b33a572d414594ce3a2`.
Branch/worktree: `codex/tadazz-design-system-20261110`,
`C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`.
No push, merge, deployment, provider/billing operation or customer-data migration.

## Final QA scope

Use the established isolated Oracle container, fixed at 2 CPU / 4 GiB / 768 PIDs,
no published ports. Frozen dependencies, all three TypeScript projects, root lint,
target/repository format, complete root and extension units, default production
build, native package runtime compatibility and the actual site/API production
bundle. Keep runs sequential under Tini and retain failures.

Browser coverage: new public/owned route and fault-state acceptance; original
site regression excluding the editor-authoring test; live host/stage/roster/package
scenarios; default-off original gameplay; tokens/components/catalog/motion; final
original editor pixel comparison. Chromium and WebKit, with the native clipboard
permission scenario restricted to Chromium and explicitly reported.

Viewport coverage: 1920x1080, 1366x768, 1280x720, 1024x768, 768x1024, 390x844;
separate touch tablet portrait/landscape contexts, native browser fullscreen,
200% CSS zoom, RTL/light fixtures, all eight locales and reduced motion.
Device simulation and CSS zoom are not physical-device/native zoom evidence.

The static shared native HTML metadata remains frozen. Its visible browser title
is uppercase, so the platform canvas now composes a declarative React title,
`Tadazz`, only while site/Studio is mounted. This uses React metadata ownership,
not source rewrites or imperative DOM mutation. Final QA must prove the native
editor retains its original title/metadata, source, pixels and behavior.

## Evidence and pending gates

Run `bash extensions/qa/tds-phase12.sh`; record every actual exit code, count,
failure and NOT RUN in this document before marking the phase verified.
Retain the historical 4-GiB capacity failures as resource-bound NOT RUN for the
40-Chromium/20-WebKit display soak; bounded runtime/watchdog and real package
operations are in the current run. Physical devices, native browser zoom UI,
real PSTN and external CI remain unavailable. They cannot be claimed as passes.

Asana has no connection. Update [ASANA_SYNC_PENDING.md](ASANA_SYNC_PENDING.md)
with exact phase commits and descriptions. Parent stays OPEN for release.
No release approval is requested or implied by development acceptance.

## Initial findings and exact correction ledger

The first full run passed frozen install, all three original type projects, both complete
unit suites, production build and repository-wide format. Root lint initially reported 719
errors on 78 initiative-owned paths, with zero protected/upstream paths. These
include safe style fixes and QA JSX being checked outside a JSX-enabled project.
The root configuration remains unchanged. A dedicated downstream QA tsconfig
provides the actual JSX/import context; safe lint fixes are restricted to the
already audited allowlist. Types/units/format/guards and final runtime evidence
must be refreshed after those fixes. No suppression of the repository rules or
editor migration is authorized.

### Exact pre-edit QA configuration ledger

CLI `--tsconfig` overrides import resolution, but does not put excluded JSX
fixtures into the checked project. The proven downstream alternative is:

- Add `extensions/qa/tsconfig.json`, extending the unchanged extension compiler
  options and including only the initiative's `tds*` QA fixtures/specs/guards.
- Extend `extensions/tsconfig.json`'s include list with `tds*.ts` so the existing
  Vite/Playwright configs are checked with the existing JSX/bundler options.
  The existing no-emit project additionally permits TypeScript import extensions
  used by the actual Vite config. The QA project loads existing Vite client/CSS
  declarations and typed browser instrumentation. These affect checking only;
  no emit target, alias, editor import, provider or runtime routing is changed.
- Add exactly those two downstream config paths to the boundary allowlist. All
  602 frozen hashes, protected source rules and nine approved seam limits remain
  unchanged. This strengthens QA type checking, not an exception for runtime code.

Alternatives rejected: root/upstream config edits, disabling type-aware rules,
and ignoring QA JSX errors. Validate plain repository lint, the new QA typecheck,
all existing types/units/builds, boundary/AST guards and production editor parity.
These are downstream QA/configuration changes within the authorized acceptance
scope; they require no new upstream seam or owner permission.

## Corrections proven during acceptance

- The first plain lint run exposed 719 errors in 78 initiative-owned files.
  Safe fixes add braces/padding, equivalent explicit branches, typed fixture
  validation and correct QA JSX context. No root rule was disabled. Final plain
  lint must remain clean, including all new acceptance tools.
- Native confirmation Escape could be consumed by the exiting action menu.
  The scoped native dialog now owns Escape when focus is outside a nested menu;
  cancellation restores the actual game trigger. Successful deletion restores
  the games region only after the card's exit completes. Search/filter exits
  cannot steal focus through that deletion callback.
- A closing Radix layer could process the trigger's pointer/focus interaction
  after it reopened the menu. The downstream menu prevents that duplicate
  outside dismissal through Radix's public event API and ignores stale close
  autofocus while reopened. A four-cycle submenu/reopen check covers both host
  document portals and the site ShadowRoot in both engines.
- WebKit at 200% CSS zoom exposed horizontal Studio header overflow. Scoped,
  token-sized container queries hide the optional search field and wrap compact
  header actions. Existing editor/native layouts receive none of these styles.
- Platform title ownership is declarative and mounted with ReferenceCanvas.
  Native editor title and shared metadata remain uppercase and unchanged.

## Historical harness and infrastructure qualifications

The untouched original game suite expects PIN entry at `/`. Its trace shows
that the preserved native app redirects that URL to `/manager`; player entry is
`/game`. The first attempt retained two failures, one interrupted test and fifteen
unrun cases. `tds.legacy-acceptance.playwright.config.ts` reproduces that attempt;
it is not a passing acceptance configuration.

The downstream `tds-native-game.spec.ts` exercises those eight native gameplay
scenarios directly at `/game`, using existing manager/answer helpers and the real
server. It closes its synthetic contexts directly rather than waiting indefinitely
for before-unload dialogs. A podium assertion identifies the existing first Exit
button; it does not require two legitimate Exit controls to have a unique name.
The native configuration uses the real 30-second voting window. The earlier
10x accelerated fixture could expire while WebKit interacted with two players.
No product route, UI, timer, test import alias or protected test file was changed.

The initial package attempt lacked the separate operator broker: four Chromium
build-dependent cases failed; four WebKit cases passed after it was started.
The final runner checks a fresh broker readiness record before package testing.
The committed bounded broker verifies the exact QA evidence mount, no published
ports, original worker SHA and immutable builder image; it only processes the
synthetic TDS staging store. Builder containers remain networkless/read-only with
1 CPU, 768 MiB and 48 PIDs. No application Docker socket or production mount exists.

The original site navigation test used a desktop-hidden avatar. Its assertion now
uses the visible canonical Account & licences link. The original touch swipe
helper uses Chromium CDP: the final WebKit project explicitly excludes that one
case. Both engines independently test touch taps/tablet geometry. Editor save/edit
tests are excluded because this initiative permits read-only editor verification.
No skipped case is counted as a browser pass.

## Reproduction and retained evidence

Use Node 24, frozen pnpm dependencies and the dedicated isolated Linux container.
Do not run the browser configurations against production or expose their ports.
The final source manifest identifies every one of 1,203 extension/package/root
build inputs; the remote identity report must have zero mismatches.

On the QA host, first start the committed operator broker with a fresh run ID:

```sh
sudo python3 extensions/qa/tds-package-broker.py UNIQUE-RUN-ID --seconds 1800
```

The host copy of that script may be launched in the background; it is bounded
and exits when its own done marker appears. Its reviewed root and container names
are intentionally fixed. In a second QA operator session, run inside `/cleanup`:

```sh
TADAZZ_REMOTE_QA=1 TDS_PACKAGE_QA_RUN=UNIQUE-RUN-ID \
  /usr/bin/tini -s -- bash extensions/qa/tds-phase12.sh
```

The runner records actual per-label exit codes; it continues after failures so
remaining evidence is retained and returns nonzero if any required label failed.
`phase-12-r1/` preserves the first broad run, including failed lint, menu/dialog,
legacy and missing-broker attempts. Raw Playwright traces stay private in the
isolated evidence volume; committed evidence contains synthetic logs, JSON and
selected screenshots only. Original controls/tolerances are not overwritten.

## Architecture and release handoff

- [Architecture and ownership map](TDS_ARCHITECTURE.md),
  [live catalog and import/API guide](TDS_CATALOG.md),
  [components](TDS_COMPONENTS.md), [tokens](TDS_TOKENS.md) and
  [generated registry](tds-tokens.json).
- Catalog: `pnpm --dir extensions ui:catalog`, loopback
  `http://127.0.0.1:4340`; production artifact is separate and internal.
- [Approved upstream seam ledger](TDS_UPSTREAM_SEAMS.md) and
  [exact nine limits](tds-approved-seams.json). This resumed session makes zero
  new upstream/editor edits; local full boundary and non-UI AST checks remain
  required in addition to remote frozen-file checks.
- [Naming and compatibility map](TDS_NAMING.md): semantic aliases are additive;
  historical schema/theme IDs, persisted values, URLs, logos and licenses remain.
- Changed source summary: scoped menu/dialog focus, Studio zoom container queries,
  site-only title ownership, safe initiative lint repairs, stronger QA typing and
  acceptance/reproduction tools. No engine, billing, provider or data migration.

Release remains an owner-controlled later operation. The final candidate SHA is
recorded in TDS_PROGRESS.md and ASANA_SYNC_PENDING.md after the local commit.
For a source-only review rollback of this resumed TDS-10–12 range, create a clean
isolated checkout and review `git revert --no-commit e756f619c015893462ae72f77f810889d2e32e70..3570689c073014cb78ec0b33a572d414594ce3a2`.
This is a documented proposal, not an executed command or a production/data
rollback. Preserve existing customer data and obtain a separate release plan
before any deployment. No release approval is requested in this session.

### Final cumulative upstream ledger

These changes predate this resumed TDS-10–12 session. The entire resumed range
has zero `packages/**` or editor source changes. Against the original freeze,
the same nine approved host files remain within their owner-approved limits:

| Host component                   | Cumulative changed lines | Approved maximum |
| -------------------------------- | -----------------------: | ---------------: |
| GameSettingsModal/index.tsx      |                       18 |               18 |
| GameWrapper.tsx                  |                       26 |               35 |
| HistoryDialog.tsx                |                       11 |               18 |
| HostPlayersModal.tsx             |                       87 |              110 |
| HostShortcutsDialog.tsx          |                        6 |               18 |
| ManagerControlToolbar.tsx        |                       72 |              140 |
| states/Room.tsx                  |                       33 |               35 |
| tadazz-show/NativeGameLayout.tsx |                       20 |               40 |
| tadazz-show/TadazzScreens.tsx    |                       34 |               35 |

All paths above are under `packages/web/src/features/game/components/`.
The final boundary report audits 602 frozen files: 593 original hashes match,
and exactly those nine previously approved host seams differ. The independent
host-action AST guard verifies the existing handler/controller bodies.

## Verified development result — 12 November 2026

PASS: **30 effective gate labels**, **1,079 unit tests** and **147 browser cases**.
No failed, flaky or skipped case is counted in these final selected browser
results. The initial broad run and the primary r2 native failures are retained.
Primary r2 returned 1 because its native assertion deadline was 20 seconds for a
30-second vote. The final native follow-up passes 16/16 with a 45-second wait,
plus fresh config formatting, extension TypeScript and plain repository lint.
The effective status file combines the other primary results with that verified
follow-up; it does not relabel the original r2 exit as successful.

Environment: Linux aarch64, Node **v24.22.2**, pnpm **12.18.0**, Playwright
**1.64.0**, fixed 2 CPUs / 4 GiB / 768 PIDs, one synthetic evidence mount,
no published ports or production storage. Frozen install; extension, QA, web
and socket TypeScript; plain root lint (**zero warnings/errors**, 865 files);
target/repository formatting; default production build and catalog build PASS.

| Unit suite | Tests passed | Files |
| ---------- | -----------: | ----: |
| root       |          365 |    37 |
| extensions |          714 |    86 |

| Browser suite   | Cases passed |
| --------------- | -----------: |
| package-runtime |            8 |
| routes          |           22 |
| live            |           19 |
| site-regression |           15 |
| native          |           16 |
| tokens          |            6 |
| components      |           22 |
| catalog-browser |           16 |
| motion          |            8 |
| motion-site     |            4 |
| stage           |           10 |
| integration     |            1 |

Coverage includes all public/Studio routes and real history, fault/empty/loading
states, gallery/list and all four export formats with import preflight, genuine
failed deletion/retry and post-animation focus, eight locales, RTL/light/reduced
motion, touch/tablet/phone, six viewport sizes, 200% CSS zoom and actual fullscreen.
Live cases cover authoritative roster policy/import/CRUD and 40/400-row UI,
configured-phone/no-phone and decoded QR/PIN, display/host roles and privacy,
pause/audio/end/skip/restart/history, scene and custom-theme fallback. Native
compatibility covers full two-player quiz/podium, lock, PIN Enter, kick, reload,
manager exit, empty-room start refusal and tab-close reconnect in both engines.
Package cases exercise real preview/build/install/export, independent layouts,
networkless dependency rejection and bounded renderer-heartbeat fallback.

### Frozen editor and visual evidence

PASS: unchanged threshold **0** / maxDiffPixels **0** Playwright comparison for
all four final editor captures, with read-only editor title, metadata and scope
checks. Independent raw RGBA proof reports the **exact historical 9/2
antialias-edge variant** in question/media; those PNGs and all their differing
coordinates/deltas are byte-identical to the accepted TDS-06 captures. Scene/
settings are byte-identical to the independent original control. This result is
not claimed as four byte-identical original-control PNGs. TDS-10's separate
all-byte-identical observation remains preserved. No baseline/tolerance changed.

PASS: all four final Chromium/WebKit QR/viewport frames are byte-identical to
the accepted TDS-07 frames. Cinematic WAAPI, stage, motion bridge and audio-owner
hashes remain unchanged. Visually reviewed final gallery, host settings, Razzia
50-row roster, editor and WebKit CSS-zoom captures. The full-page zoom capture
records the sticky header at its actual keyboard-scrolled position.

PASS: full local ui:check, 602-file boundary, nine bounded seams and host-action
AST guard. **1,203** local/container build inputs match. The run-source audit
records only two QA-only corrections (broker job-store path and native assertion
deadline) after r2 started; zero runtime or browser-spec source changes.

Evidence: [final report](../qa-evidence/design-system-20261110/phase-12-final-report.json),
[effective statuses](../qa-evidence/design-system-20261110/phase-12-final-status.txt),
[raw editor proof](../qa-evidence/design-system-20261110/phase-12-editor-proof.json),
[historical variant proof](../qa-evidence/design-system-20261110/phase-12-editor-historical-variant.json),
[stage proof](../qa-evidence/design-system-20261110/phase-12-stage-proof.json),
[source identity](../qa-evidence/design-system-20261110/phase-12-source-identity.json),
and [preserved original 18 files](../qa-evidence/design-system-20261110/phase-12-preservation.json).
Before images remain in editor-control, phase-00 and prior accepted phase
folders; final real captures are in phase-12 and phase-12-*.png. Failed attempts
remain in phase-12-r1, phase-12-r2 and the probe/follow-up logs.

### Explicit NOT RUN / production readiness

- Physical iPhone/iPad/projector hardware.
- Native browser zoom UI (200% CSS zoom simulated).
- WebKit compositor swipe using the Chromium-only CDP helper.
- Native clipboard permission scenario on WebKit.
- 40 Chromium / 20 WebKit display capacity soak under the known 4-GiB quota.
- External CI execution.
- Real PSTN/provider/billing/customer data operations.
- Push, merge, deployment and production acceptance.

The 40/20 display soak retains its earlier resource-bound failures and is not
reclassified PASS. Local entry/lazy-resource attachments and bounded heartbeat
checks are useful development evidence, not a production latency/capacity
benchmark. The original incompatible / player-entry suite and excluded editor
authoring case remain disclosed above. No selected final development case is
unresolved; external qualifications are outstanding.

Recommendation: development implementation is verified and locally reviewable.
Production acceptance and release remain pending, with the Asana parent OPEN.
No push, merge, deployment, billing/provider or customer-data operation occurred.
[Final pending Asana synchronization](ASANA_SYNC_PENDING.md) carries the exact
implementation SHA after the local checkpoint commit.

Final Git proof: implementation `3570689c073014cb78ec0b33a572d414594ce3a2`; all 1,203
committed Git blobs and working files are byte-identical to their verified QA
inputs, with zero mismatches. The subsequent checkpoint changes documentation/
evidence only. See [Git checkpoint proof](../qa-evidence/design-system-20261110/phase-12-git-checkpoint.json).
