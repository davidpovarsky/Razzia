# S01 verified route guards — 15 November 2026

**S01 scope verified; aggregate security gate remains FAIL: 15 cases, 10 PASS / 5 failed assertions.** Final actual tested source: `422eae307ee44135cd5bcb0d8ff996bf8ab7bf7e`. Original thirteen cases/assertions and both added control bodies are preserved. No skip, cancellation, timeout or OOM. Scoped native TypeScript 7.0.2 project check exited **0**; actual test process exited **1** for the five retained identity/lifecycle failures.

## Approved code and behavior

Manager decision PHONE_S01_ROUTE_GUARDS_20261115.md approved only two hunks in `packages/socket/src/api/extensions/game-routes.ts`. UPSTREAM_TOUCHES.md was recorded before edit. Implementation commit `0ba26fd025ca0e0cd9d7997b7d900cf9c8001e48` applied the reviewed artifact exactly: require a configured matching pilot secret; reject supplied cached connected-roster polls whose activeCallId differs. Final route Git blob is `c0df0a032bc35b8f108764d1e98f0772d2970acc`. No further protected-file hunks, controller/storage/schema/global config writes or S02 edits occurred.

| Cases | Final actual result |
| --- | --- |
| API01 | Configured missing/wrong key 401 with zero roster growth: PASS |
| API02 | Missing expected secret now denied without creating a roster entry: **fixed / PASS** |
| API03 | Cached stale A poll after B denied without private identity/state, B unchanged: **fixed / PASS** |
| API04 | Stale answer and late A hangup preserve B; active B earns authoritative score: PASS |
| API05 | Stale epoch rejected, current key5 accepted once, duplicate rejected: PASS |
| API06 | Unbound connected victim-roster poll denied without privacy/mutation: **fixed / PASS** |
| API07 | Wrong-phone disconnected victim rebind: **FAIL, unchanged residual** |
| API08 | Copied call/roster IDs plus wrong phone can answer victim: **FAIL, unchanged residual** |
| API09 | Old A can rebind after failed cleanup and local TTL expiry: **FAIL, unchanged residual** |
| API10 | Old A can rebind after actual gateway process restart: **FAIL, unchanged residual** |
| API11 | Earlier alias request delivered after B can replace B; trusted generation/order missing: **FAIL / contract gap, unchanged residual** |
| API12 | Concurrent duplicate gateway callbacks forward one answer, no extra score: PASS |
| API13 | Actual invitation-only rejection and invited positive control: PASS |
| S01-C1 | Configured initial/current poll 200; fresh B registration without supplied stale roster 200; stale supplied A roster 403 with no phone/displayName/roster/state and no mutation; current B poll 200: PASS |
| S01-C2 | Correct-phone disconnected rebind 200/reconnected=true; stable client/one roster/one player, **1000 earned points retained**; late predecessor hangup harmless: PASS |

Fresh different calls without supplied cached roster remain legitimate registrations where the legacy contract permits. S01 does not pretend to identify retired references during fresh registration or infer physical chronology. API07/08 use a valid shared gateway key plus mismatched claimed caller identity; these are correlation failures, not proof of forging provider authentication.

## Check history and final input integrity

- Original real backend at fcd4813: 13 cases, 5 PASS / 8 FAIL, retained in REMOTE_API_RESULTS.md and remote-api-fcd4813.
- First S01 snapshot 0ba26fd: 15 cases, 10 PASS / 5 FAIL. The initial type-check helper failed before semantics because TypeScript 7 exports version metadata at its root rather than the old compiler API. Raw failed check and installed package export contract are retained in remote-api-s01-0ba26fd; no semantic PASS was claimed for that attempt.
- Snapshot 19cb057 replaced the helper with the installed supported native CLI plus a scoped single-route project: type exit 0 and 15 cases 10 PASS / 5 FAIL, all 548 source hashes unchanged. Raw receipts retained in remote-api-s01-19cb057.
- Before handoff, ordinary extensions Vitest discovery (`src/**/*.test.ts`) was found to include the separately gated Node harness. Commit 422eae3 renamed it to **phone-real-backend.node.ts** and updated only the explicit runner/package paths plus README. All fifteen bodies are byte-identical to 19cb057; all original thirteen remain unchanged. The shared Vitest configuration was not edited. S01_NODE_HARNESS_DISCOVERY.json and S01_FINAL_SOURCE_AUDIT.json record this correction and exact body hashes.
- Final snapshot **422eae307ee44135cd5bcb0d8ff996bf8ab7bf7e** was freshly extracted and retested after the rename: native scoped type check **exit 0**, 15 cases **10 PASS / 5 FAIL**, test exit 1, no skip/cancel/timeout/OOM, runner duration 78796.480103ms. This is correctness evidence, not a latency/capacity benchmark.

Route Prettier check and local syntax checks passed. Generic UI freeze guard was run and exited 1 solely for the explicitly manager-approved API seam; its raw output is S01_GENERIC_FREEZE_GUARD.txt. The UI manifest/allowlist was not widened or bypassed. Exact S01 diff audit passed and all other protected editor/core/server/package paths and global config remain unchanged. Raw diagnostics retain their original formatting; authored prose/source formatting was checked separately.

Final environment: existing arm64 QA image, Node24.22.2/pnpm12.18.0; NEW exclusive source/fixtures/evidence phone-s01-422eae3… paths; **0.25 CPU / 1 GiB**, network-none/no public ports/cap-drop ALL/no-new-privileges; cleared image environment and synthetic fixtures/keys only. Frozen offline dependencies used explicit image cache with copy import. All **548 source files** passed before/after SHA256 checks, and workspace links resolved into the delivered /work snapshot. No Windows/stale-image/other-worktree application imports were used.

Final source archive SHA256 `7363f4091120f855782b7ca512a38cbac1bd537f783f29ff7f74030fcf79081a`; manifest `55d32e2e1bad882d750c75eae113153804b78f87e2fc7b3c00ffdd509a8b19fd`. Raw final evidence archive SHA256 **30ea4ac766df84751655656e46bb7bce7ad401e6d33be9db4f9a9b735d69c368**, downloaded and verified; readable receipts in remote-api-s01-422eae3 and local ignored raw tar retained. Earlier attempt evidence was not overwritten.

## Remaining disposition

S02_CALLER_CORRELATION_PROPOSED.patch / S02_CALLER_CORRELATION_REVIEW.md provide exact **unapplied** route-only normalization, missing/mismatched caller denial and admission-denial propagation hunks. The proposal applies cleanly against S01 but has not been implemented, type-checked or behavior-tested as a fix. Anonymous caller and supplied-roster hangup policy are explicit review choices. Phone equality is correlation, not cryptographic provider proof.

PHONE_LIFECYCLE_V2_PROPOSAL.md is versioned draft 0.1 for backend registration/generation/retirement, uncertain-commit idempotency and real gateway restart reconciliation. It distinguishes trusted server registration order from unknowable physical chronology, preserves unknown provider retry/reuse guarantees as external gates, and proposes no longer-TTL or guessed orphan-cleanup fix. No v2 source/schema/storage/credential migration is applied or authorized.

The named Phone allocation is **RELEASED**. Final container exited with Pid0/OOMKilled=false; only own prior containers were renamed after exited verification, all retained stopped. Allocation receipt is remote-api-s01-422eae3/allocation-release.json. No other process/container was stopped or altered.

All four source tasks remain OPEN/PARTIAL. Next action is manager disposition of S02's exact hunks and lifecycle/identity contract. 100-client scoring stays deferred while these five safety failures remain; physical PSTN/DTMF, authentic provider behavior, carrier capacity, account-enabled tenant scope, live customer acceptance and release/deployment remain unproven. No push, merge, deployment, provider or production action occurred.
