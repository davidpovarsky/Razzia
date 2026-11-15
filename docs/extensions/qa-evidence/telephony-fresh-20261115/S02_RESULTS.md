# S02 correlation/admission verified — 15 November 2026

**Approved S02 scope verified; aggregate lifecycle/security gate remains FAIL: 18 cases, 15 PASS / 3 failed assertions.** Exact actual tested source: `003cf88b6cba19989388dca20efcfaa01cc8f9ad`. Native scoped TypeScript 7.0.2 route/import check exited **0**. Actual tests exited **1** for API09/10/11 only. Zero skips/cancellations/timeouts/OOM; no original assertion/wait was weakened.

Manager approved S02_CALLER_CORRELATION_PROPOSED.patch via PHONE_S02_CALLER_CORRELATION_20261115.md. UPSTREAM_TOUCHES.md was recorded before editing. Only `packages/socket/src/api/extensions/game-routes.ts` changed among protected sources: existing normalizePhoneE164 import; common supplied-roster correlation guard; disconnected admission-denial propagation. The long new condition was line-wrapped inside its approved hunk for Prettier, with identical logic. S02_SOURCE_AUDIT.json proves those bounded hunks and unchanged original fifteen bodies. No controller/storage/schema/lifecycle wire or global configuration implementation changed. Final route Git blob: `4c4a806b15b2eace7f93d52c75ab53a09b48d783`.

## Actual outcomes

| Cases | Result / authoritative witness |
| --- | --- |
| API01–06 | PASS: S01 configured-key, missing-key, stale poll/call/hangup/epoch and score behavior retained |
| API07 | **fixed / PASS**: wrong phone cannot rebind disconnected victim roster |
| API08 | **fixed / PASS**: copied active call/roster IDs with wrong phone cannot set victim's answered flag |
| API09 | **FAIL retained**: expired gateway tombstone after failed cleanup still permits retired A fresh registration/rebind |
| API10 | **FAIL retained**: actual gateway process restart loses local retirement proof, allowing retired A rebind |
| API11 | **FAIL retained / contract gap**: delayed earlier alias join can replace B; no trustworthy physical chronology exists in current wire |
| API12/13 | PASS: one forwarded duplicate answer/no extra score; actual invitation-only denial and invited control |
| S01-C1/C2 | PASS: current configured poll, fresh registration without supplied cached roster, stale cached denial/no private state, legitimate disconnected rebind with stable client/roster and score |
| S02-C1 | PASS: **18** connected-context missing/null/empty/invalid/mismatched phone or unknown supplied-roster requests across poll/answer/hangup denied 403 with no private fields; victim active binding, client, answer, 1000 earned points, identity digests, lastSeen and counts unchanged. Correct caller can still answer |
| S02-C2 | PASS: **12** disconnected-context unsafe requests denied without mutation; actual canonical national/international aliases rebind/poll/hangup successfully; client/one roster/1000 earned points retained |
| S02-C3 | PASS: actual BillingService/beginPhoneCall admission refusal is propagated as 403 caller_admission_denied, not joined/private state; victim remains disconnected with the same identity/1000 points/lastSeen; zero game-reservation rows and phone-call rows; **0 external request attempts** |

C3 deliberately creates the actual game with billing disabled, then temporarily enables accounts/billing only inside the isolated test process while leaving that game unreserved. Existing native SQLite admission code rejects it. No controller/admission method is mocked; no grant/purchase/provider credential is seeded. The separate synthetic fixture database is created by existing code; no storage/schema source is edited. Fetch is guarded to real loopback, and flags/fetch/service are restored/closed. This negative admission fixture is not a full account-enabled billing/tenant/provider acceptance claim.

S02 is caller correlation under a configured gateway key, not cryptographic PSTN identity proof. Missing/invalid/mismatched/unknown supplied-roster cases share the same coarse denial. Valid new registration without a supplied cached roster retains the existing legacy path. Nothing here redefines opaque CallId chronology or fixes legacy fresh-registration replay semantics.

## Source, tooling and runner receipts

All original fifteen test bodies remain unchanged (body SHA256 `8eb33c54feb5ecfe4d20e3a6690f5df8aa80109dc8bd7f2955277472d3b2d49e`); three target cases were appended to the existing explicit Node-only harness. Shared Vitest discovery/configuration is unchanged. Route Prettier, local syntax transforms and eight archive-safety tests passed. Native installed TypeScript CLI checked the single-route project and transitive imports with exit0; no full-project CI/browser/capacity job was run.

Generic UI freeze guard was executed and exited1 solely for the separately approved route seam. Its manifest/allowlist was not widened. Exact S02 source audit passed; no other protected path changed. Raw receipt formatting is preserved rather than rewritten to satisfy prose formatting rules.

NEW dedicated source/fixtures/evidence phone-s02-003cf88… namespaces and container `tadazz-hq-phone-s02-20261115`; 0.25CPU/1GiB, network-none/no ports/cap-drop ALL/no-new-privileges, cleared image environment, synthetic fixtures only. Existing arm64 QA image, Node24.22.2/pnpm12.18.0, frozen offline install from explicit image cache with copy import. Install completed in13.9s; all **549 input hashes** passed before/after, with workspace links into delivered /work. No Windows/stale-image/other-worktree application imports. Runner duration120688.963154ms is not a performance/capacity claim.

Source archive SHA256 `72d6534c740dbfaae3d60df94796be212ce2785d2de1b185d1872ee29a00c01a`; manifest `fbf64847ffa15b3c6b19f6ea4a91c66f29bda2b6c13444931fe9223836c4e154`. Raw remote evidence archive **316a0856682a2d8577161b871fee74860d44f50094e780a6bf5aee8178cdd3d9** was downloaded and verified. Readable exact receipts are in remote-api-s02-003cf88; the ignored raw tar remains locally/remotely preserved. All earlier fcd481/S01 failure receipts are retained.

Host preflight had approximately10.7GiB available RAM and4.7GiB free disk; post-run disk was4.3GiB. No cleanup of others' work/images/containers was performed. The S02 container exited/Pid0/OOMKilled=false and its allocation is **RELEASED**, recorded in allocation-release.json. No other process/container was stopped or changed.

## Lifecycle review packet and next gate

PHONE_LIFECYCLE_V2_SOURCE_SEAMS.md (design0.2) maps the actual manager/session/account/Game/Registry/path-resolution/controller/checkpoint/gateway bindings and gaps; supplies the smallest proposed protected entry/mode seams, downstream facade/store/journal alternatives, and an acceptance matrix. It adopts manager-selected server-registration precedence with predecessor CAS and fail-closed ambiguity. It does not assume that server registration order is physical call chronology, and retains original API11 as unmet. Existing checkpoint/score Maps are not durable crash recovery; pending projection/unknown operation outcomes and private gateway capability recovery require critical review before implementation.

No lifecycle code/hook/store/wire, service credential, customer migration, provider or deployment is authorized/applied by that packet. Next action is manager/critical review disposition of those exact lifecycle seams and compatibility policy after Site operator priority. All four source Asana tasks remain OPEN/PARTIAL; 100-client scoring remains deferred while API09/10/11 fail. Physical PSTN/DTMF, authentic provider/ordering/retry behavior, carrier capacity, account-enabled tenant acceptance and production/customer release remain unproven. No push/merge/deploy occurred.
