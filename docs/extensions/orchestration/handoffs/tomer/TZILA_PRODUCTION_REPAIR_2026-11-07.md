# Tzila production repair touch ledger — 2026-11-07

Recorded before editing. The user explicitly authorized the complete Creating Worlds repair, browser verification, production deployment, commit, and push on `agent/tadazz-next-20261105`.

## Existing uncommitted work to preserve

- `extensions/src/server/game/session.ts`: make the stored 40-person roster available in the lobby before any connection.
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`: lobby fallback and opening artwork eligibility.
- `packages/e2e/tests/release-candidate-tzila.spec.ts`: renamed quiz expectation.
- Existing untracked lobby/load/audit tests and evidence are preserved pending classification.

## Planned narrow upstream web touches

- `packages/web/src/pages/(auth)/layout.tsx`, `AuthLayout`: choose a manager-only TADAZZ auth shell while retaining the existing player auth background. Necessary because the shared upstream `Background` visibly renders Razzia branding and GitHub footer on `/manager`. Alternative rejected: a fixed overlay in the manager child route would leave inaccessible hidden content and duplicate landmarks. Tests: manager Playwright branding/auth flow at laptop, desktop, and widescreen sizes; existing manager auth regression.
- `packages/web/src/features/manager/components/ManagerAuthBackground.tsx` (new): compose the existing official `/tadazz-show/v4/show-stage.webp` and `/tadazz-show/v4/tadazz-brand-logo.png` assets around the unchanged auth forms, using existing Rubik/theme conventions. No new design system or dependency. Tests: real browser screenshots and asset response checks.
- `packages/web/src/pages/(auth)/manager/index.tsx`, `ManagerAuthPage`: render loading/error states inside the branded readable panel without changing auth requests or redirects. Tests: manager auth mode and failed-login browser tests.
- `packages/web/index.html`: update visible product title, favicon, description, and theme metadata from Razzia to TADAZZ. Necessary for complete manager branding. Tests: browser title/favicon/metadata assertions and production HTTP check.
- `packages/e2e/tests/manager.spec.ts`: add branding and responsive bounds assertions while preserving all existing auth tests.

## Planned downstream presentation touches

- `extensions/src/presentation/tadazz-show/TadazzOpening.tsx` and scoped CSS/tests: sequence the original Creating Worlds artwork completely before mounting the TADAZZ video/Lottie transition. The current layers start concurrently, so the brand animation is already in progress when the artwork fades. Preserve 7.933-second branded transition and 12-second finite opening soundtrack. Tests: component source/timing tests and real browser scene assertions.
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`: only if needed, pass stable opening identity and harden delayed cooldown synchronization without remounting the stage. Tests: staged browser timer monotonicity and refresh/pause/resume.

## Merge risk and rollback

Changes are scoped to manager authentication presentation and opt-in TADAZZ show code. The player login flow continues to use upstream `Background`. Per-show presentation can still roll back through the existing motion-kit setting. Production rollback will retain the current image `tadazz:clean-flow-20261107-final` and exact live configuration snapshot.

## Additional upstream server touch discovered by browser test

- `packages/socket/src/services/game/index.ts`, `Game.join`: when a browser participant enters the exact configured representative display name, bind that connection to the existing pre-registered roster row instead of appending an anonymous 41st+ row. The complete browser run exposed `4 / 44` and no correct table LEDs. Phone ID/number matching remains higher priority; nonmatching ordinary browser players retain legacy behavior. Tests: focused roster-name join regression and full Creating Worlds browser run asserting `4 / 40` and tables 1–4 only.

## Successor repair ledger — 2026-11-08 (recorded before upstream edits)

User supplied the newer complete production repair and the real spreadsheet. Single primary session; preserve all prior working changes.

- `packages/socket/src/services/game/index.ts`: Game roster replacement, table propagation, exact name matching, complete round recaps; tests for 37 representatives/31 tables, removal of dummy records, duplicate joins and phone identity.
- `packages/socket/src/services/game/round-manager.ts`: opt-in server-owned entrance preparation before full voting window, pause/resume/reconnect timing and navigation cancellation; fake-clock tests plus measured browser countdown.
- `packages/common/src/types/game/status.ts`: optional authoritative voting-window timestamps, absent for legacy games.
- `packages/web/src/features/game/components/tadazz-show/{TadazzScreens,TadazzShowView}.tsx`: render real grouped table assignments and synchronize the existing V4 clock without restarting choreography. Browser lobby/full-game/timing/viewport checks.
- Candidate uses isolated configuration. Production activation requires verified candidate, full backup, concurrent revision/image guards and one-command rollback; reuse gateway secret without printing it.
- Browser QA exposed CSS class concatenation (fixed with arrays), and a countdown ending visually at 01 when results interrupts its final frame. Preserve a visible zero frame at closure and make voting identity stable across timestamp patches.
- `packages/common/src/types/game/socket.ts` and `packages/socket/src/handlers/game.ts`: additive authenticated clock acknowledgement; TADAZZ samples RTT to convert server timestamps to the browser clock. This avoids wall-clock skew across host/projector/players without trusting client time for answer acceptance. Validate with the real browser timer sequence and existing socket regressions.
