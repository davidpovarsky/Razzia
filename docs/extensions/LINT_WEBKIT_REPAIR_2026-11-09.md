# Lint and WebKit repair — 9 November 2026

The owner's follow-up explicitly authorizes repairing repository lint and the
three failing cleanup WebKit scenarios before further work. Base: `785f74f`,
branch `codex/tadazz-package-runtime-20261109`. Existing worktrees and private
staging data remain intact. No production deployment or push is authorized.

## Edit ledger (recorded before importing source changes)

- `oxlint.config.ts`: exclude immutable imported reference material and archived
  QA evidence from source lint; retain checks for maintained application and test
  code. Correct any JavaScript/project discovery mismatch explicitly.
- Maintained `extensions/**`, `packages/**`, and `scripts/**` TypeScript/JavaScript:
  apply reviewed safe lint fixes, then repair remaining diagnostics with types,
  guards, and behavior-preserving expressions. Preserve intentional sequential
  browser/game operations with explained local exceptions. No scoring, clock,
  provider, wire, or design changes are intended. Record the final file list in
  the verification evidence and commit diff.
- `packages/e2e/tests/cleanup-theme.spec.ts`: assert native operator/player
  controls and cinematic audience rendering on their actual surfaces; scope
  the two registered bundled families (Classic and Razzia). Preserve pause, roster,
  audio, persistence, viewport, timer, restart and skip assertions.
- `packages/web/src/features/game/components/states/Answers.tsx` and
  `tadazz-show/legacy-stage-elements.tsx`: restore the existing theme SFX bridge
  on native surfaces. Emit submission audio only after server acceptance, mount
  the event-only player audio engine, and classify server completion through the
  existing `themeTimerTransition`. Original unextended games keep their SFX path.
  The live cleanup scenario verifies this regression in both browser engines.
- `extensions/src/presentation/platform-controls.test.ts`: inspect parsed source
  nodes instead of raw text. The clean mirror exposes a false positive from the
  standalone package fixture's embedded TSX string; actual JSX and dynamic DOM
  controls remain checked, including controls in the fixture module itself.

## Verification environment

Executable checks run only in the existing isolated Oracle QA container
`tadazz-package-runtime-qa`, with no network or published ports. A clean
Git-tracked source mirror at `/verify` removes stale root-level duplicate files
from earlier image assembly. Dependencies come from the pinned QA image.
Historical reports are retained; fresh logs document the results below.

The root CI also runs `pnpm format`. Its scope now explicitly preserves hashed
fixtures, published templates/assets, imported choreography, frozen governance snapshots, generated stylesheets,
reference material and test output. Maintained source and documentation remain
checked. Formatter changes outside the functional repair are whitespace/style
only and will be included in the source identity manifest.

Type-aware rules remain enabled for maintained TypeScript. Plain JavaScript
utilities receive JavaScript checks. Serial QA/choreography, promise-shaped
APIs, positional public APIs and mutable dictionary deletion have explained
scoped exceptions. Runtime guards for sparse legacy dictionaries and browser
APIs are retained rather than deleted based on optimistic indexed types.

## Final result — Done

| Check                           | Actual result                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm lint --deny-warnings`     | 0 errors, 0 warnings; 736 maintained files, 233 rules                         |
| `pnpm format`                   | Whole configured repository scope passes                                      |
| TypeScript                      | 7 projects pass: web, socket, extensions, E2E, package authoring, scripts, QA |
| Unit tests                      | Root 365/365; extensions 659/659; total 1,024                                 |
| Original editor/game/manager    | 21/21 Chromium                                                                |
| Current UI fidelity             | 22/22 Chromium + WebKit                                                       |
| Cleanup/legacy suite            | 28/28 Chromium + WebKit; all three former WebKit failures resolved            |
| Package runtime/build isolation | 6/6 Chromium + WebKit with the pinned networkless builder                     |
| Browser total                   | 77 passed, 0 failed, 0 skipped, 0 flaky                                       |
| `pnpm build`                    | Passes; existing Vite notices remain non-failing                              |

Commands and exit codes, full unit/browser reports, byte-exact compressed logs,
selected screenshots and SHA-256 identities are in
`qa-evidence/lint-webkit-20261109/`. No tests or builds ran on Windows.

The native SFX repair uses the original server acknowledgement and audio engine.
Voting is observed through the native status; the attempt is retained while the
separately delivered extension snapshot advances to responses. Only the server
completion reason distinguishes natural expiry from a manual vote lock. A
participant receives submission SFX only after acceptance, with no extra ambient
track. The live test retains audio deduplication, pause/resume identity, restart,
skip, reconnect, private media, all roles and five viewport assertions.

The raw-control contract test now parses actual JSX and calls, so standalone TSX
inside an archive fixture string is not confused with a platform control. It
still scans the fixture module itself and all maintained feature code. The
auto-ported motion stylesheet, imported references, fixtures, public assets and
prior evidence were restored/verified byte-exactly; the stylesheet extraction
contract passes in the full extension suite.

The latest relevant origin base remains `a489197` after a fresh fetch. Work stays
on `codex/tadazz-package-runtime-20261109`. The original dirty worktree remains
untouched. Production and both existing labs retain their container/image/start
identities, and production package flags remain disabled. No push, main merge,
production deployment, credential change, provider action or real telephone call
was performed. The private QA volume and installed packages remain intact.

Coverage is the four named isolated configurations, not every historical probe
under the default Playwright glob. Physical Safari/iPad, real PSTN/provider calls
and the other production-readiness limitations in the package acceptance report
remain outside this QA claim.
