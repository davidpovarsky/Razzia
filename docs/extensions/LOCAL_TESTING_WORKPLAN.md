# Local-only development and QA execution plan

## Phase 0 — environment setup (owner approval required)

E0.1 Establish project-isolated Node.js 24 runtime. Keep global Node 22 unchanged.
E0.2 Install pnpm lockfile dependencies, verify compiler/test scripts.
E0.3 Create .env (gitignored), strong local manager password, stable random JWT secret.
E0.4 Confirm ports 3000/3001 free, bind localhost-only, separate content and e2e fixture stores.
E0.5 Establish baseline build, unit/integration, lint/format and e2e results.
Exit: full baseline report with reproducible commands, exact test counts and failing traces.

## Phase 1 — local Razzia product smoke test

E1.1 Open manager/editor and create 1 quiz with single/multi/estimation questions.
E1.2 Launch quiz, join 2-5 browser participants, validate timed answers, scoring and leaderboard.
E1.3 Verify reconnect, manager disconnect, lock/unlock, survey, media and result persistence.
E1.4 Capture screenshots and Playwright traces in ignored test-output directory.
Exit: manual + automated evidence with no upstream modifications.

## Phase 2 — extension contract spikes

E2.1 Sidecar metadata round-trip, question reorder, clone/delete and revision conflict.
E2.2 Round policy injection with exact original default status transitions.
E2.3 Editor and game view slots using existing design tokens.
E2.4 Local extension API and isolated socket event envelope.
Exit: exact diff proposals in UPSTREAM_TOUCHES.md, no upstream edits until approved.

## Phase 3 — phone without telephone service

E3.1 Mock keypad web UI and authenticated Socket.IO bot as phone participant.
E3.2 Provider-neutral event generator with mock signed webhook: started, digit, ended, error.
E3.3 Test key mapping 1..4 to indices 0..3; invalid digits, multi/estimation unsupported handling.
E3.4 Test webhook dedupe, epoch checks, stale answer, concurrency, call termination, reconnect.
E3.5 Inject synthetic latency and report fairness vs browser players.
Exit: no real PSTN claims; provider adapter contract tests green.

## Phase 4 — modular features

E4.1 Rich answer media + text fallback.
E4.2 Leaderboard policy + teams.
E4.3 Interludes, reveal effects and sound themes.
E4.4 Localization parity across eight existing languages and visual regression.
Exit: acceptance matrix evidence, independent QA, original UI unchanged when disabled.

## Phase 5 — local release rehearsal

E5.1 Clean build + regression + load and security tests.
E5.2 Optional Docker build after checking free disk and RAM; never require a paid host.
E5.3 Document production-only blockers (UK phone routing, real DTMF, webhook authenticity, deployment and resilience).
Exit: locally validated release candidate, not production-certified.

## Responsibilities

Tomer: contracts, seams, versioning, minimal patches.
Roni: independent test matrix, traces, negative cases, compatibility.
Dana: auth, secrets, webhook verification, rate limits, privacy.
Eitan: final acceptance and approval of upstream edits and external spend.

## Do not

Do not buy a server or phone subscription; do not open public tunnels; do not modify upstream without approval; do not run destructive e2e tests against config/; do not claim local mock proves real telephone interoperability.
