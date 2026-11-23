# Twelve legacy regressions resolved; original Razzia controls

9 November 2026. Isolated branch `codex/upstream-cleanup-theme-engine-20261108`, worktree `tadazz-cleanup-theme-20261108`. Source commit `78b571716eb083b8e8ca121239d204e9631657da`; subsequent source changes only add braces/blank lines in the validation handler and grouped-toggle wrapper, verified by final focused lint and two browser cases. `final-source-inputs.json` records the exact final 59 changed non-documentation files, all matched against remote QA (`source-verification.json`). No dependency upgrade or scoring/wire/default change.

## Outcome and classification

All twelve previously failing cases now pass. One newly identified real application defect was fixed: invalid save changed the question index while Studio retained a different selected timeline item, which restored the old selection. Saving invalid data now opens Questions and selects the correct timeline item, preserving validation errors. The earlier category-inheritance repair in `4d8fa98` is also reverified by the all-types save case.

The other failures reflected current Add card/numeric labels, per-card quiz/survey, import preview and saved-editor landing, current toolbar and `/game` reconnect, or tests that needed to explicitly enable automatic completion. Default manual completion remains unchanged. The real-speed fixture exercises actual timers/reloads. See `twelve-failure-classification.json` for every original test title and retained assertion. All twenty original tests remain; one native-control test was added. No case was removed/skipped and no scoring/data assertion was weakened to obtain green.

## Actual original controls

- Shared `packages/web/src/components/Button.tsx` is byte-exact against original baseline `5161eb7`, SHA-256 `951bb0d41553c48ec5ae1ab16a92c625ffefbd2001f088b7afb1af35cc8063a0`.
- Downstream actions compose that actual Button, or the actual specialized original AnswerButton/ToggleGroup. GroupedToggleGroup now delegates to original ToggleGroup/Radix radios, with narrow optional metadata/decorations hooks. It no longer copies their implementation.
- The root supplies the real Button through a CSS-free public `presentation/platform-controls` entry. The bridge forwards original interaction/accessibility/ref/content props. Its unstyled fallback is only for independent/headless library rendering; actual application browser cases require zero standalone controls.
- All web and extension source is guarded against new raw buttons, dynamic raw factories and fake div/span/article buttons. The inventory intentionally retains 25 original primitive sites in 19 upstream files, including original answer pickers, media controls, room/lock/close/config primitives. These remain their original native implementations.
- Native answer cards retain game visuals, read-only rendering and native keyboard handling. Overlay/timeline buttons retain pointer capture/drag, keyboard nudging and saved transforms; team/scene actions avoid nested buttons. Existing phone simulator actions use the same native control port without changing any provider/transport.
- Operator/editor controls retain Rubik and original variants. Themes remain scoped to game content. No cinematic CSS is imported through the root control binding.

## Remote validation

All executable validation ran on Oracle in private Docker QA containers with no published ports. No local game, browser, test, type check, build or lint ran on Windows.

| Check | Final result | Evidence |
| --- | --- | --- |
| Original editor/flow/manager suite plus native editor case | 21 passed; 0 failed/skipped/flaky | `legacy-browser-report.json.gz` (r6) |
| Current UI suite, Chromium and WebKit iPad/mobile emulation | 22 passed; 0 failed/skipped/flaky | `ui-browser-report.json.gz` (r6) |
| Root unit suite | 365 passed | `root-tests.json.gz` (r6) |
| Extension unit suite, including control guard | 624 passed | `extension-tests.json.gz` (r6) |
| Five TS projects: web/socket/extensions/e2e/authoring | all exit 0 | `unit-types-build-status.txt` (r6), repeated r7 |
| Production build | exit 0 | `build.log.gz` (r6), repeated r7 |
| CSS-free entry refinement | 1 editor + 8 targeted UI browser cases passed | `entrypoint-*-report.json.gz` (r7) |
| Final control bridge/expanded guard | 2 contract cases; zero focused lint diagnostics | `controls-contract.json`, `controls-lint.json` |
| Final braces/spacing | 2 browser cases (invalid-save focus, native editor); zero focused hook lint diagnostics | `final-style-browser.json.gz`, `native-hooks-lint-final.json` |

There are 43 distinct browser cases and 989 unit tests; repeated focused checks are not added to those totals. The UI suite covers all four families, real picture choices/fifth-choice and single/multi/numeric scoring, responsive portrait/landscape, pause, read-only QR, scenes/editor isolation, real Chromium fullscreen and WebKit denial recovery. New actual-editor cases exercise overlay keyboard nudges, pointer drag, scrubbing and saved transforms in both engines. The native editor case verifies all eleven card kinds, radio keyboard navigation and media actions. WebKit is viewport/mobile emulation, not a physical iPad. Whole-repository historical lint is not claimed green; the new foundation and four integration hooks have zero focused type-aware lint diagnostics.

Earlier attempts were not all green: migrated r1 was 16/20 and exposed the real focus defect plus stale import/toolbar expectations. A duplicate private-server startup was diagnosed as Playwright multi-argument defineConfig concatenating webServer arrays and fixed with one configuration object. One r5 HTTP-fixture timeout occurred during concurrent QA; final r6 scheduled unit checks before browser runs and passed without changing its timeout/assertions. Final reports above, not those attempts, support the outcome.

## Synchronization and deployment boundary

Fetched all remotes and checked all 25 local/origin branch refs. Committed concurrent billing documentation/evidence (`edb4b2b`) is integrated; other worktrees and unsaved changes were preserved. External Razzia upstream was fetched without an implicit version upgrade. See `final-sync-audit.json`.

This follow-up was tested privately and pushed to the isolated branch. It does **not** replace the existing public v2 lab or production. Public v2 still runs source `4d8fa98`. `protected-apps-proof.json` confirms unchanged production/v1/v2 container identities/images and production/v1 start times; the v2 identity/image also match the previous delivery. No active game was restarted. New QA runs have completed.

Only selected regular-file reports/logs and screenshots are included, without browser storage/auth state, traces, JWTs, environment files or staging passwords. `SHA256SUMS` authenticates this packet's bytes, not an external signature.
