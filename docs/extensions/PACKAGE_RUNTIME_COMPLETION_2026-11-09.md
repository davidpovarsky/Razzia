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

In progress. Do not infer passing results from this plan or older evidence.
