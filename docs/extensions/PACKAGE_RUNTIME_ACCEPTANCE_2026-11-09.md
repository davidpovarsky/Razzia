# Universal package runtime acceptance — 9 November 2026

Private staging delivery. Production installer/runtime remain OFF by default.
No production deployment, existing lab replacement, push, main merge, real phone
call, provider purchase or credential change was performed. Exact source/image
identities for the original delivery are in `package-runtime-evidence/delivery.json`.
The final closure is recorded in `PACKAGE_RUNTIME_COMPLETION_2026-11-09.md` and
`qa-evidence/package-completion-20261109/`. The earlier lint/WebKit follow-up is recorded in `LINT_WEBKIT_REPAIR_2026-11-09.md`
and `qa-evidence/lint-webkit-20261109/`; each evidence directory has SHA256SUMS.

Implementation branch: `codex/tadazz-package-runtime-20261109`, new worktree
`C:/Users/DAVID/Code/Razzia-worktrees/tadazz-package-runtime-20261109`.
Base: fetched `origin/codex/sync-all-20261109`, `a4891979244fd96d1585e822f65e873c0d0bfdf8`.
The original dirty `tadazz-next-20261105` worktree was preserved. The plan's
observed `3a5b6aa` was superseded by this verified newer base.

## Gate results

| Gate                    | Status | Implemented and actual evidence                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — contracts/baseline  | Done   | Read current instructions/components; ADR and hook inventory; strict manifest/runtime Zod plus generated schemas. Original root 365 and extension 624 tests passed in Oracle before implementation.                                                                                                                                       |
| 1 — portable games      | Done   | ZIP parser/packer, relative references, existing composite import with fresh IDs, fifty answer images across ten questions, shared PNG/WAV/MP4/Lottie, source and current-game export. Real browser reimport under another account and contract tests.                                                                                    |
| 2 — declarative themes  | Done   | Native compiled preview with scoped media capability before installation; independent exact review, catalog selection, immutable versions, restart and rollback contracts.                                                                                                                                                                |
| 3 — independent React   | Done   | Pinned networkless/unprivileged builder, tiny SDK, dedicated cookie-free origin, opaque iframe and one generic adapter. Actual uploaded Arcade and Cinematic TSX/CSS render without another platform build between uploads. All three roles, answer intents and core audio ownership remain intact.                                       |
| 4 — complete packages   | Done   | One archive creates one theme and two games. Selection/dependency checks, explicit Classic option, journaled staging, injected second-game failure compensation and startup recovery tests.                                                                                                                                               |
| 5 — security/regression | Done   | See exact final delivery check results below and in machine-readable reports. The subsequent lint/WebKit follow-up resolves the earlier baseline failures; final closure reports record 1,024 unit tests and 81 browser cases passing.                                                                                                    |
| 6 — authoring           | Done   | CLI scaffold/pack/validate/inspect/build/preview/install/export/rollback, schemas, six portable examples, README and updated creator skill.                                                                                                                                                                                               |
| 7 — staging             | Done   | Separate Oracle container/data, immutable builder, private backup, actual container recreation, all 255 initial persisted-file hashes retained, backup restored and checked read-only. Original image/checks remain in delivery.json; final source/build/image, 1,991-file persistence and restore proofs are in the completion evidence. |

## Final measured results

These supersede the original delivery and lint-only follow-up. Full evidence is
in `qa-evidence/package-completion-20261109/`; raw earlier reports stay unchanged.

| Check                                  | Final observed result                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root / extension units                 | 365 + 659 = **1,024 passed**, no failures or pending                                                                                                        |
| Original editor/game/manager           | **21/21** Chromium                                                                                                                                          |
| Current UI fidelity                    | **22/22** Chromium + WebKit                                                                                                                                 |
| Cleanup and audio regression           | **28/28** Chromium + WebKit                                                                                                                                 |
| Package acceptance                     | **10/10** Chromium + WebKit, including four new load/watchdog cases                                                                                         |
| Browser total                          | **81 passed**, 0 failed, 0 skipped, 0 flaky in the four named configurations                                                                                |
| TypeScript                             | **8 actual projects pass**, including web app and web tooling directly                                                                                      |
| Whole configured lint / format / build | Pass; **0 lint errors and warnings**, existing non-failing Vite notices retained                                                                            |
| Concurrent runtime displays            | **40 Chromium / 20 WebKit**, both 800×600, plus manager/player; 10-second synchronized pause smoke, zero-vote results and reload                            |
| Heavy renderer / watchdog              | Actual TSX does bounded 60ms work every 500ms; lost child health triggers fallback, room resumes/completes and renderer recovers after reload, both engines |
| Source verification                    | **1,802 files** at source commit `354669edc365e10ad92bdbfbad9308b05cbcf133`, identical local/Oracle hashes                                                  |
| Immutable final staging image          | `sha256:76a77a56d964b53611541c7a1a7594567fbee9b6bcc9bd547feda82646840d10`                                                                                   |
| Isolated immutable builder             | `sha256:41a49a0e68d13c2bdfc576d0364176c2e27ab278e10605b5a577ffc62cbe3c88`                                                                                   |
| Built web verification                 | **90 compiled files** match exactly after final container recreation                                                                                        |
| Persistence and backup/restore         | **1,991 durable files** match before/after recreation and restored backup; existing installed games/assets pass read-only smoke                             |

The 40-tab WebKit capacity probes exceeded the private host's 8 GiB QA limit,
including a compact viewport attempt. They are documented failures and are not
included as passed/skipped cases. The final bounded acceptance profile uses
20 real WebKit display pages; full iPad/4:3 compatibility remains separately
covered by the unchanged functional suites. No claim of 40 WebKit tabs or a
400-device soak is made. This aggregate browser harness uses 2 CPU, 8 GiB and
1,536 PIDs; that is not the game server's per-viewer memory requirement.

The load fixture isolates question/media fanout from opening choreography and
uses 120-second questions ended through native controls. The original package
cases retain opening/video/Lottie and 20-second question coverage. Pre-start
diagnostics found all surfaces visible with no renderer error; a background
heartbeat hypothesis was not established and the runtime was not changed on
that assumption. The real stopped-heartbeat case still verifies the existing
five-second watchdog. See [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
for the browser scheduling behavior considered during diagnosis.

The earlier lint follow-up's web `tsc -p` command targeted the empty-files
solution config and did not traverse its references. Direct app/tooling checks
exposed one unused callback argument; it is corrected, and all eight projects
now pass. The original seven-command report is not evidence of that direct app
check. This correction is recorded with the raw initial diagnostic.

The fallback viewport repair was a real application correction: its unsized
wrapper clipped the absolutely positioned compiled stage even though DOM and
opacity checks passed. `ThemeSandboxHost` now gives the fallback wrapper the
parent's full height and width. Both engines verify answer-card intersection,
wrapper dimensions and completed entrance, and final screenshots show the
question and five answer cards. All 13 static commands and all 81 browser cases
were rerun after this repair against application source `354669edc365e10ad92bdbfbad9308b05cbcf133` and the
same 90 built web artifacts. The final data restart recreates the exact same
immutable tested image. Delivery-only Markdown and evidence follow without
application code changes. SQLite backup connections are checkpointed and
explicitly closed; ephemeral SHM/WAL files are excluded from durable comparisons.
Private backups and rollback images remain. Two older redundant backup archives
were copied byte-exactly into the user's private local backup directory before
retiring their Oracle copies; original stable r5/r6/r7, v3 and final backups remain
on Oracle. Only stopped task-owned duplicate container root filesystems and
verified temporary restore copies were removed to reclaim space.

Original implementation commits remain `63c9364` and `416a98a`; lint/native audio
repairs are `ca5cadb`. Load/verification source is `0e4e7c8` and
`354669e`. Nothing was pushed or merged to main.

## Delivered behavior and boundaries

Users upload a single `.tadazz` through the native manager Quizz tab. Preflight
shows inventory, author/version/size/content, code boundary and review state.
Build/decoder jobs run outside the application. Users preview and choose themes
and games, skip demo content, install privately, select installed versions,
export, roll back future catalog choices and delete idle drafts. Referenced
installed versions are retained. Assigned independent reviewers use their own
authenticated workspace preview; author self-review and arbitrary workspace
headers are rejected. This does not create marketplace publishing rights.

Existing JSON/XLSX/EnhancedBundle import, saved overrides, compiled Classic/
Razzia renderers, clocks, scoring, Socket transport and telephony are reused.
Only new package boundaries resolve relative references. Every game/question/
timeline receives fresh identities. Archives and media are tenant-scoped;
immutable objects are deduplicated within the tenant, never by cross-account
access. Binary objects stay outside SQLite. Logical and physical disk quotas
include conservative retained objects; draft deletion cannot reset disk usage.

The runtime receives a strict public projection, not raw server extras. Window,
opaque origin, channel, role, room/question, epoch, sequence and rate checks guard
intents. Account tokens, raw account/roster/phone fields, private APIs and sockets
are unavailable to customer TSX. Timers display the original server deadline and
frozen pause remainder. Answers reach the original handler; only the original
engine computes scores. Missing handshake/heartbeat, invalid snapshots and
renderer errors return to the existing stage without changing room authority.

New layouts own visual React composition. Manifest video/Lottie foregrounds and
audio remain with trusted media owners; direct iframe media/network playback is
blocked. Numeric input, question video and declared unsupported slots fall back
to the original stage. This is an explicit capability boundary, not arbitrary
HTML/media execution in the host. React hooks, CSS/relative assets and the SDK
work without per-theme core imports or renderer-registration edits.

## Verification

All tests/builds/types/lint/browsers ran inside the disposable Oracle Linux QA
container; none ran on Windows. Source reads/edits/Git and packaging transport
were local. All final status counts must be read from the attached reports,
not from earlier attempts or historical QA.

The root and extension suites exercise legacy JSON/XLSX, clock/score/pause,
history/replay/skip, ties/zero votes and synthetic concurrent participants,
including 100 simulated telephony participants. These are mock/simulation
results, not real PSTN evidence. The package suite adds strict ZIP/hash/CRC/
normalization/link/encryption/inventory negatives, review/CAS/idempotency,
capability expiry/signature, cross-tenant objects, physical quotas and recovery.

The dedicated package browser cases use Chromium 1920×1080, WebKit 1024×768
mobile/iPad emulation, independent 390×844 player and 800×600 reduced-motion
audience contexts. They cover declarative decoded preview and assigned review,
new TSX build/preview/install, two games, authorized assets, account reimport,
live answer images, keyboard focus/submission, pause/resume, reconnect,
host/player/display, renderer error fallback, DOM/cookie denial, popup/top-frame/
egress/navigation denial, and rejected Node/computed/remote imports in actual
networkless containers. Current native UI and original editor/flow/manager
suites are rerun separately, rather than treating old reports as new evidence.

## Resolved baseline failures and excluded claims

The original delivery recorded 25/28 in the old cleanup suite and a failing
whole-repository lint scan. Those historical reports remain byte-preserved.
The owner then explicitly requested repairing both before proceeding.

The completed follow-up passes `pnpm lint --deny-warnings`, full `pnpm format`,
eight actual TypeScript projects, the production build, all 1,024 unit tests and 81
browser cases. The old cleanup suite now passes 28/28, including all three
previously failing WebKit cases. Native operator/player selectors and the two
bundled families are tested on their current surfaces; cinematic geometry stays
asserted on the audience display. The missing native theme audio event bridge
was restored with server-acknowledged submission and authoritative completion
reasons, preserving the existing audio engine and legacy rollback.

See the follow-up report for commands, source identities, exact lint scope,
explained scoped exceptions, screenshots and raw report hashes. The four
isolated browser configurations are the coverage claimed; historical probes
requiring other deployments/providers are not reported green. Vite retains its
non-failing config-loader/chunk-size notices; preview teardown can log proxy
connection resets.

Not tested: physical iPad/Safari hardware, real provider/PSTN/DTMF calls, a
prolonged/400-device runtime soak, long-running GPU exhaustion, hard browser CPU
isolation, real customer licenses/content or human accessibility/performance
sign-off. Browser process/thread scheduling cannot be guaranteed by iframe CSP;
watchdog/error recovery is not a hard CPU/GPU quota. Synthetic assigned-review
receipts prove policy enforcement and do not approve customer rights. All such
checks remain before a separately authorized real-user production rollout.

## Artifacts and operation

- `extensions/fixtures/packages/README.md`: developer workflow and six example
  archives (Arcade/Cinematic/Playful React themes, Game, Complete, declarative).
- `PACKAGE_RUNTIME_ADR_2026-11-09.md`: architecture, contracts, boundaries and
  upstream hook rationale, including bounded-buffer versus streaming tradeoff.
- `PACKAGE_RUNTIME_API.md`: endpoints, request/review contracts, rights, errors,
  idempotency/CAS, quotas, capabilities and deletion/version behavior.
- `PACKAGE_RUNTIME_DEPLOY_ROLLBACK_2026-11-09.md`: separate staging services,
  immutable build worker, backups/restoration, migration and future production gate.
- `package-runtime-evidence/`: named compressed reports/logs, source/image
  identities, regular screenshots and hashes. Private DBs, backups, account
  storage state, cookies, tokens, environment files and traces remain excluded.

Oracle retains the private QA volume and backup; no host ports are published.
Playwright's three private services are temporary, not an exposed customer site.
Protected production, v1 lab and v2 lab identities/images/start times are checked
against the prior delivery and remain unchanged. Local source and delivery
commits are listed in Git; nothing is pushed or merged by this task.
