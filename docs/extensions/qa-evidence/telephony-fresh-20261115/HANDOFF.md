# P3_PHONE fresh worker — 15 November 2026

ASSIGN ACK: worker `01a1dd18-b62a-7321-88c2-6fafb71937cc`, manager `01a1dd10-2ef0-73c2-9c65-569a843f44da`. Manager independently verified Sol/high, primary visibility and null parent. Native wait_threads delivered the two preflight ACKs. File write/read and native Asana mutation/readback passed. Assignment received and exclusive lease verified as ASSIGN_DELIVERED before mutation.

Worktree: `tadazz-hq-telephony-fresh-20261115`; branch `codex/tadazz-hq-telephony-fresh-20261115`; clean starting HEAD `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.

Owned paths: `extensions/src/telephony/pilot-runtime/**` and this evidence directory only. No upstream, editor, provider, production, customer data or credentials changes.

Assigned source tasks: `1219846294963052`, `1219881067977912`, `1219999342715862`, `1219886202109096`; HQ `1220541896326970`. All require acceptance beyond an injected adapter test; retain OPEN pending applicable physical/provider, real server capacity and independent QA gates.

Historical source reviewed: `docs/extensions/qa-evidence/tadazz-phone-load50-20261106/RESULTS.md` records 500/500 isolated server answers and 50 synthetic gateway callbacks, explicitly not PSTN capacity. The handoff's 30/30 HTTPS synthetic and two partial real PSTN calls are historical claims, not tests run in this lane. The requested dirty primary `tada-pilot-gateway.faults.test.cjs` did not exist at the assigned reference path when read; no other worktree was modified or copied.

Current controller source already guards stale answer/hangup call IDs. The gateway callback harness uses a deliberately limited backend model of that protocol; its results cannot certify the actual controller, Socket.IO scoring, physical DTMF, PSTN authentication or carrier capacity.

Implementation: gateway-only ordering and lifecycle changes, new deterministic handler tests, and runtime README. Public wire IDs, API payload shape, key mapping, audio cues, generic read behavior and proxy keepalive settings are preserved. No dependencies installed.

The new harness executes the actual leased gateway/audio source in isolated VM contexts, with injected HTTP request/response objects, backend fetch, timers and console. Deferred promises control callback interleavings without sleeps. The backend model approximates the current join/rebind, stale call, epoch and duplicate rules; it is explicitly not the real server. Separate existing gateway regression uses loopback HTTP on ephemeral ports and its existing synthetic backend.

| Fault / behavior | Before scoped fixes | Final result |
| --- | --- | --- |
| 1..5 mapping, two question epochs, invalid keys, duplicate answers, closed answer window | PASS | PASS (synthetic adapter) |
| A→B, late A hangup; closed/reused A callback | Reopened A and could rebind roster | PASS; closed callback does no backend work |
| Concurrent duplicate of the same read key | Two answer requests | PASS; one answer request |
| Superseded A polls after B disconnects, with no A hangup | Rebound A | PASS; superseded A remains closed |
| Initial A join delayed behind B | A overwrote B | PASS; same-identity joins stay ordered |
| First backend hangup fails; provider repeats hangup | Backend remained connected | PASS; retry disconnects without reopening |
| Hangup arrives during poll | Answer submitted after hangup | PASS; pending digit suppressed, local/backend cleanup |
| Old poll response delivered after newer epoch | Local epoch rolled back | PASS; ordered delivery |
| Epoch advances between poll and answer | PASS | PASS; rejected by backend model, neutral cue |
| Consumed read replay into next question | Preserved existing key behavior | PASS; old key submits nothing, current key works |
| Backend disconnect before confirmed join | Existing silence/retry behavior | PASS; no join cue until confirmation, cleanup works |
| Independent phone while another poll stalls | Independence required | PASS; no global callback lock |
| Invitation-only 403 | PASS | PASS; local session removed, no join cue |
| Fetch rejects before headers | Deadline timer leaked | PASS; timer cleared |
| Response body stalls after headers | Deadline already disarmed | PASS; abort remains armed through body |
| Existing three persistent calls × ten questions | Existing regression | PASS; exactly 30 accepted votes, no extra timeout poll |

`baseline-faults.tap`: original gateway at base, first nine tests, **3 pass / 6 fail**, exit 1. `redial-cleanup-before.tap`: first fixes applied, twelve tests, **9 pass / 3 fail**, exit 1. The latter three failures drove the same-identity ordering, superseded binding and cleanup-retry fixes. Final harness has fifteen tests. These are development failure receipts, not unresolved final failures.

Executed final command (Node **v22.17.0**, no installation):

```text
node --test --test-concurrency=1 extensions/src/telephony/pilot-runtime/tada-audio-logic.test.cjs extensions/src/telephony/pilot-runtime/tada-pilot-gateway.test.cjs extensions/src/telephony/pilot-runtime/tada-pilot-gateway.faults.test.cjs
```

**34/34 PASS**, exit 0, test runner duration 1265.3092 ms: 18 existing audio tests, 15 fault tests, 1 existing loopback HTTP regression. `final-focused.tap` retains test assertions and summary; console transport logs were omitted to avoid retaining dialed numbers. Existing 100-session audio test is pure simulation, not 100 live socket or phone capacity.

Both changed CJS files passed `node --check`; scoped `git diff --check` passed. Freeze guard `node extensions/qa/tds-boundary.mjs --files-only` passed: 602 protected files, 593 unchanged hashes plus nine previously approved modified hashes. This checks the frozen file manifest, not browser/editor visual parity or the broader TDS scope allowlist. No UI implementation or browser/build/full CI ran. Formatting used the already-installed reference-worktree Prettier against only the two leased CJS paths; initial invocation from this dependency-free worktree could not resolve the existing Tailwind plugin, then reference working directory resolved it. No install/config change or reference-source write occurred.

Resource restraint: initial live free-memory observation was approximately 1.2 GiB, with manager reporting CPU saturation and heavy runner leased to QA. Only built-in focused Node tests, syntax/freeze checks and existing formatter were run sequentially.

Remaining acceptance and review gates:

- Independent QA reviewer `01a1dd1a-0c70-7b02-a179-c8c2b7c11755` must review the actual commit. All four source tasks remain OPEN/PARTIAL.
- Actual PSTN two-question 1..5 answers, host visibility, authoritative score, audio, real unknown-caller rejection and carrier capacity were NOT RUN. No real calls, provider configuration, paid operations, production probes, secret reads, push, merge or deployment.
- `1219999342715862`: current `real-telephony-e2e.test.ts` Scenario 10 uses `TelephonyBridge` / `RealRazziaTransport` with real authenticated Socket.IO clients, independent of this pilot HTTP gateway. It already waits for 100 ready clients and checks 50 positive / 50 zero authoritative scores. The current mocked PHONE06 threshold is already 600 ms in the base; it was not changed. Neither historical scoring failures nor real 100-client capacity are resolved by this harness. Reserve a sequential real-server run for QA; do not substitute adapter results.
- Read-only `packages/socket/src/api/extensions/game-routes.ts` still conditionally authenticates `/pilot-phone` only when its secret is configured. Its connected cached-roster poll path does not verify an active call binding. Current downstream controller does guard answer/hangup call IDs, but these route boundaries need real negative API tests before a security release. No protected-source edits were made or approved in this lane.
- In-memory replay retention is ten minutes and is lost on restart. Reused provider IDs during that interval fail closed. Initial joins with different national/international spellings of one phone identity are not certified; the new identity queue ignores common punctuation only. Provider canonical identity and unique CallId guarantees require verification. Generic active read keys deliberately span epochs, so an old physical press cannot be dated from the callback alone.
- Backend request abort cannot undo a request the server has already processed. A failed hangup can retry only when a provider callback repeats; durable recovery and a gateway restart cleanup drill are not proven here.

Next step: independent review and integration of the scoped commit, then the separately controlled real-server/API and physical/provider acceptance gates. Local commit SHA is reported in the final HANDOFF and Asana notes; its manifest includes this evidence.
