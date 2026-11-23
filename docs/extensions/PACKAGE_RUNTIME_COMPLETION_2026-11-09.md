# Final staging closure — 9 November 2026

Base: `3b44b29`, latest relevant fetched origin base `a489197` is an ancestor.
The owner's continuation authorizes completing the supplied package plan in
private Oracle staging; production, push and other worktrees stay protected.

## Planned edit ledger, recorded before verification

- `packages/e2e/tests/package-runtime-load.spec.ts` and
  `packages/e2e/utils/package-install.ts`: exercise forty actual concurrent display
  Chromium pages and twenty WebKit pages with installed React sandbox code,
  authoritative pause, zero-vote results
  and reconnect. Build a bounded CPU-heavy TSX fixture; stop child health timers
  to verify the existing watchdog fallback, retained room and recovery.
- `packages/e2e/playwright.package-runtime.config.ts`: add the new suite to the
  explicit package acceptance configuration; retain every existing scenario.
- `scripts/qa/run-package-browser.py`: allow the clean `/verify` source mirror and
  propagate browser failure status. Select a separate synthetic QA data directory
  without deleting earlier installed packages. Keep compatible defaults.
- `scripts/qa/package-static-checks.py`: support the clean mirror, separate evidence
  prefixes, all eight actual TypeScript projects (including web app/tooling),
  strict whole-scope lint and format, units and production build.
- Acceptance/deploy documentation: reconcile historical figures with final
  measured results and record the immutable final staging source/image identity.

No game, timer, scoring, telephony, runtime or public API changes are planned.
Performance measurements describe the actual capped QA environment, not physical
devices, an unbounded GPU test or hard browser process isolation.

## State

Visual fallback repair ledger: `ThemeSandboxHost.tsx` returns an unsized fallback
wrapper in place of a full-size iframe. DOM/opacity checks can pass while the
absolute-positioned compiled stage is clipped to a collapsed containing block.
Preserve the iframe's allocated width/height on that wrapper and verify the
fallback's viewport geometry and a card's actual intersection before capturing
the screenshot. Application verification must be rerun after this layout fix.

Final cleanup-fixture correction: the WebKit failure probe records two distinct
authoritative `elapsed` completions (question 2 / epoch 2 and question 4 / epoch 5),
not a duplicated cue. The last five-viewport screenshot loop ran against a live
20-second timer (`400 / GAME_SPEED 20`). Pause before this second geometry loop,
assert it stays paused, then resume and end manually, retaining the exact one
natural-expiry and manual-lock audio assertions. Wait for the fifth card's
entrance opacity before pausing: pausing earlier correctly freezes that animation,
which would invalidate the screenshot. No production audio/clock change
is warranted by this evidence. Preserve the initial failing probe/report.

Type-verification correction: the earlier follow-up called `tsc -p` on the web
solution config with an empty `files` list, which did not traverse references.
The closure runner checks `tsconfig.app.json` and `tsconfig.node.json` directly.
Its first run exposed one unused callback argument at
`extensions/src/presentation/tadazz-v4/FullShowScenes.tsx:231`; rename it to
`_value`, TypeScript's explicit unused-parameter spelling. This does not change
generated behavior. Two required blank lines in the new QA config are also fixed.

**Done for private staging delivery.** The final source is `354669edc365e10ad92bdbfbad9308b05cbcf133` and the
final immutable image is `sha256:76a77a56d964b53611541c7a1a7594567fbee9b6bcc9bd547feda82646840d10`. The acceptance report has the complete
measured table; `qa-evidence/package-completion-20261109/` contains exact reports,
logs, metrics, screenshots, source/compiled artifact hashes and SHA256SUMS.

All 1,024 unit tests and 81 browser acceptance cases pass with zero failures,
skips or flaky cases. Eight actual TypeScript projects, strict whole-scope lint,
format and build pass. Production and both existing labs retain their exact
container/image/start identities; package flags remain disabled in production.
No push, production deployment, credential change or provider call was performed.

The recorded load envelope is 40 Chromium / 20 WebKit at 800×600 plus native
manager/player. Forty-tab WebKit probes exceeded 8 GiB and remain documented
capacity failures; they are not reported green or hidden as skips. Steady-state
load fixtures retain ten questions and media while avoiding opening-video
choreography, which remains covered by the original package tests. The load
questions use 120 seconds; original acceptance retains 20-second coverage.
The heavy TSX/real stopped-health cases pass in both engines. This is a short
bounded smoke, not a prolonged GPU/400-device or physical hardware qualification.

All 1,991 durable staged files survive recreation and backup restoration.
The source manifest covers 1,802 files; 90 compiled web hashes also match after
recreation. All 13 static commands and all 81 cases were rerun after the actual
fallback-wrapper viewport repair, against the exact application source/build
in the final immutable image. Both engines check geometry and card intersection;
final captures show the question and answer cards. Final data recreation uses
that same tested image. Read-only smoke validates original, restored and newly
imported installed games/media. Private rollback images and backups are retained;
two older redundant archives were transferred and hash-verified in the user's
private local backup directory before their remote copies were retired. Stopped
task-owned duplicate rootfs and verified temporary restore copies were removed;
bind data and unrelated containers were preserved.

## Supplied plan: final DONE checklist

- [x] One `.tadazz` upload automatically resolves inventoried media/audio.
- [x] Theme, Game and Complete package lanes install.
- [x] Newly uploaded TSX/CSS runs without per-theme platform source/deploy edits.
- [x] Actual sandbox denies host DOM/cookies/private APIs/unauthorized intents.
- [x] Distinct Arcade and Cinematic compositions render; six example archives ship.
- [x] Game media import/save/reload/export/reimport works across test accounts.
- [x] One Complete pack creates two games and one assigned independent theme.
- [x] Existing clock, votes, pause, skip, reconnect and audio retain core ownership.
- [x] Classic/Razzia and original editor/game/manager regressions pass.
- [x] Account and media authorization/cross-tenant denial are tested.
- [x] Logs/screenshots/build/source/security/review/version/rollback evidence ships.
- [x] Production code-backed runtime remains OFF and no rollout was performed.

The plan's private-staging boundary is reached. Before a separately authorized
real-user rollout, physical devices, real PSTN/provider behavior, customer
rights/content/accessibility/performance sign-off and wider/prolonged capacity
qualification remain explicit production gates. This task does not grant them.
