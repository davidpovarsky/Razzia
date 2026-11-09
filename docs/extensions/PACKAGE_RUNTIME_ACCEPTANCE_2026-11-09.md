# Universal package runtime acceptance — 9 November 2026

Private staging delivery. Production installer/runtime remain OFF by default.
No production deployment, existing lab replacement, push, main merge, real phone
call, provider purchase or credential change was performed. Exact source/image
identities and final check outcomes are in
`package-runtime-evidence/delivery.json`; artifact hashes are in its SHA256SUMS.

Implementation branch: `codex/tadazz-package-runtime-20261109`, new worktree
`C:/Users/DAVID/Code/Razzia-worktrees/tadazz-package-runtime-20261109`.
Base: fetched `origin/codex/sync-all-20261109`, `a4891979244fd96d1585e822f65e873c0d0bfdf8`.
The original dirty `tadazz-next-20261105` worktree was preserved. The plan's
observed `3a5b6aa` was superseded by this verified newer base.

## Gate results

| Gate                    | Status | Implemented and actual evidence                                                                                                                                                                                                                                                                     |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — contracts/baseline  | Done   | Read current instructions/components; ADR and hook inventory; strict manifest/runtime Zod plus generated schemas. Original root 365 and extension 624 tests passed in Oracle before implementation.                                                                                                 |
| 1 — portable games      | Done   | ZIP parser/packer, relative references, existing composite import with fresh IDs, fifty answer images across ten questions, shared PNG/WAV/MP4/Lottie, source and current-game export. Real browser reimport under another account and contract tests.                                              |
| 2 — declarative themes  | Done   | Native compiled preview with scoped media capability before installation; independent exact review, catalog selection, immutable versions, restart and rollback contracts.                                                                                                                          |
| 3 — independent React   | Done   | Pinned networkless/unprivileged builder, tiny SDK, dedicated cookie-free origin, opaque iframe and one generic adapter. Actual uploaded Arcade and Cinematic TSX/CSS render without another platform build between uploads. All three roles, answer intents and core audio ownership remain intact. |
| 4 — complete packages   | Done   | One archive creates one theme and two games. Selection/dependency checks, explicit Classic option, journaled staging, injected second-game failure compensation and startup recovery tests.                                                                                                         |
| 5 — security/regression | Done   | See exact final delivery check results below and in machine-readable reports. Earlier obsolete WebKit cases and global baseline lint are disclosed separately, without being called green.                                                                                                          |
| 6 — authoring           | Done   | CLI scaffold/pack/validate/inspect/build/preview/install/export/rollback, schemas, six portable examples, README and updated creator skill.                                                                                                                                                         |
| 7 — staging             | Done   | Separate Oracle container/data, immutable builder, private backup, actual container recreation, all 255 initial persisted-file hashes retained, backup restored and checked read-only. Final application image/checks are recorded in delivery.json.                                                |

## Final measured results

| Check                                                               | Actual result                                                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Root / extension units                                              | 365 + 659 = **1,024 passed**; no failures                                                                                                    |
| Current native UI / original editor-flow-manager / package browsers | 22 + 21 + 6 = **49 passed**; no failures or flaky cases                                                                                      |
| Final starter polish                                                | 35 package contract tests, authoring types and focused lint passed; all six package browser cases passed again                               |
| Five TypeScript projects / production build                         | Passed; web/socket types and build repeated after final lint-only corrections                                                                |
| New-file / added integration-line lint                              | Zero diagnostics; whole-repository baseline lint remains failing                                                                             |
| Local-to-Oracle source verification                                 | **72 files**, identical hashes                                                                                                               |
| Final immutable staging image                                       | `sha256:3470e5567b5fa95bc2fd759b96fad1d500a4881c95ac0ded66280a8daf1d6e51`                                                                    |
| Independent networkless builder                                     | `sha256:41a49a0e68d13c2bdfc576d0364176c2e27ab278e10605b5a577ffc62cbe3c88`                                                                    |
| Final container recreation                                          | **762 files** retained with identical hashes; read-only audit verified 44 installed versions, 67 synthetic games and 2,360 object references |
| Backup restoration                                                  | 255-file initial backup restored byte-for-byte and read successfully by final source                                                         |

Source commits: `63c93644001a8218fdd17fb019f4f2d7fc7995eb` (runtime),
`416a98a58f4c46b9707939f903f84f90fcfb3db5` (starter timer/result labels).
The final template adjustment changed packaged customer CSS, then was uploaded
and tested on the already built platform. It required no platform rebuild for
the theme. Final image capture followed the tests for reproducible handoff.

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

## Known baseline failures and excluded claims

The old `playwright.cleanup-theme.config.ts` run was 25/28. Its three failing
WebKit cases were reproduced unchanged on the clean a489197 source: Classic
host lobby expected a cinematic PIN in the native operator, Studio's broad
test-id selector counted two current controls, and the old live-theme case
expected cinematic answer slots on the native surface. No assertion was removed
or product behavior altered to disguise these failures. Their reports and the
separate current-native-suite results are included.

Whole-repository `pnpm lint` fails. A clean baseline scan also fails (8,451
errors, 49 warnings); the complete new-file lint and diagnostics on added hook
lines are checked independently. Global lint is not reported green or all
differences attributed to historical code. The build retains its existing large
chunk warning. These are separate from the verified package acceptance cases.

Not tested: physical iPad/Safari hardware, real provider/PSTN/DTMF calls, a
40–400-browser runtime soak, long-running GPU exhaustion, hard browser CPU
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
