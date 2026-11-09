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

Final cleanup-fixture correction: the WebKit failure probe records two distinct
authoritative `elapsed` completions (question 2 / epoch 2 and question 4 / epoch 5),
not a duplicated cue. The last five-viewport screenshot loop ran against a live
20-second timer (`400 / GAME_SPEED 20`). Pause before this second geometry loop,
assert it stays paused, then resume and end manually, retaining the exact one
natural-expiry and manual-lock audio assertions. No production audio/clock change
is warranted by this evidence. Preserve the initial failing probe/report.

Type-verification correction: the earlier follow-up called `tsc -p` on the web
solution config with an empty `files` list, which did not traverse references.
The closure runner checks `tsconfig.app.json` and `tsconfig.node.json` directly.
Its first run exposed one unused callback argument at
`extensions/src/presentation/tadazz-v4/FullShowScenes.tsx:231`; rename it to
`_value`, TypeScript's explicit unused-parameter spelling. This does not change
generated behavior. Two required blank lines in the new QA config are also fixed.

In progress. Do not infer passing results from this plan or older evidence.
