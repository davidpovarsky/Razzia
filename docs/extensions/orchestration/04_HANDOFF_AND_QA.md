# Role handoffs and test evidence — ACTIVE V3

Every active role owns `docs/extensions/orchestration/handoffs/<role>/` (Tomer, Maya, Noam; Roni only at optional QA). A deliverable must contain real code, tests and **a local Git commit**, not only a plan or RFC.

## Handoff template per milestone

- **Identity:** worktree path, branch, baseline bootstrap hash, delivered commit SHA(s).
- **Changed paths:** exact list; show no edits outside allowed ownership; `git diff --check`.
- **API surface:** exported type/function and import path; examples of how another role uses it; schema version.
- **Tests:** command, actual exit code and test count, failure diagnostics; separate mock/local from real carrier/browser evidence.
- **Running locally:** minimum reproduction command, ports, fixture data paths, no secrets.
- **Upstream touch ledger:** BEFORE changing original upstream file, record symbol + purpose + smallest change + default-off regression test in your role handoff; Tomer collates after integration. This is pre-authorized only for role-owned paths specified in V3.
- **Blockers:** exact failing code/error and which role owns resolution; no speculative new architecture/research.
- **Final status:** IMPLEMENTED+TESTED, IMPLEMENTED+BLOCKED, or NOT STARTED. Do not claim production readiness from mocks.

## Cross-role dependency protocol

Tomer freezes V1 contracts in Bootstrap. Maya/Noam import `@razzia/extensions/core` public API. If a missing export is found, use the existing contract spec with a typed adapter local to the role or report the exact gap; do not edit `core`. Tomer can issue a reviewed contract v1-compatible addition in a scheduled handoff; avoid ad-hoc cross-branch sync while agents have uncommitted changes.

Only Tomer can cherry-pick reviewed feature commits into the integration branch. Do not have Maya/Noam run merges into Tomer; no shared progress file is concurrently written. Tests for server/game are Tomer's; web tests Maya's; telephony tests Noam's; independent QA Roni's.

## Test stages

1. **Each role:** scoped unit, typecheck and format/lint on owned files, failure injection and disabled-feature fallback.
2. **Tomer integration:** full root Build, Vitest, extension tests, lint, Prettier; original E2E plus new extension E2E after stopping/coordinating local dev server on ports 3000/3001; manual browser join/presenter/phone simulator.
3. **Optional Roni QA:** adversarial security, stale version, sidecar crash, cross-room call, 100 mock concurrent calls with metrics, media accessibility, locale parity, regression.
4. **Owner acceptance:** visually verify editor, presenter and player, iPhone/iPad over LAN, offline mock keypad, zero paid services.

Historical green counts: 217/217 Vitest and 46/46 Playwright on Node 24 (pre-extensions); agent reports must show CURRENT runs, not claim old numbers prove new features.

Keep tests and memory load controlled on ~16GB Windows. Avoid running Docker, three browsers, three pnpm builds and load tests simultaneously.
