# P3_NEXT actual backend results — 15 November 2026

**FAIL: 13 executed, 5 pass, 8 failed assertions, 0 skipped/cancelled/timeouts.** Tested source is exactly `fcd48134017333462b7346de1c9ac5548e5a32e8`; no application/controller/API/test source was changed remotely. No assertions, waits or cases were weakened. This is actual Hono + authenticated Socket.IO + Registry/Game/controller execution with synthetic fixtures, not the earlier backend model and not real PSTN.

Node v24.22.2, pnpm v12.18.0, arm64 image `sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647`. The run used the granted **0.25 CPU / 1 GiB** cap, `network=none`, no public ports, all capabilities dropped and no-new-privileges. Existing production/Site/MCP/SB containers and data were not touched. The source, synthetic fixture and evidence mounts were new exclusive phone paths. Image environment was cleared with `env -i`; ephemeral synthetic keys were generated inside the test process. Accounts/billing were disabled in this isolated profile; this does not establish account-enabled tenant authorization.

Before starting, HQ allocation was GRANTED and QA's old allocation RELEASED. Host preflight showed two CPUs, approximately 10.6 GiB available memory and 19 GiB free disk. Other named allocations were inspected without reading their environment/secrets. These are setup observations, not capacity measurements.

## Actual case matrix

| Case | Result | Authoritative observation / classification |
| --- | --- | --- |
| API01 configured key | PASS | Missing/wrong key returned 401; zero roster entries created |
| API02 absent key configuration | FAIL | HTTP 200, joined true, one actual roster entry created. Cause: route bypasses authentication when expected secret is absent |
| API03 stale A poll after B | FAIL | HTTP 200, joined true and private phone field returned; B stayed bound. Cause: cached connected roster poll lacks active-call check |
| API04 late A answer/hangup | PASS | Stale answer rejected as stale_call; late hangup preserved B binding/count/score/answer state; B's valid key 5 answer earned **1000 actual server points** |
| API05 stale epoch / key5 / duplicate | PASS | Epoch 1 input rejected as stale_question_epoch while actual epoch was 2, without mutation; current epoch key5 accepted once, duplicate rejected |
| API06 wrong call/phone, connected victim roster | FAIL | HTTP 200, joined true, private phone field returned; victim binding unchanged. Valid shared gateway key was supplied; this is not an anonymous attack against a correctly configured key |
| API07 wrong phone, disconnected victim roster | FAIL | Actual victim changed from disconnected/A to connected/spoof call; same actual client/roster reused. Cause: supplied roster ID selects rebind target without validating caller phone identity |
| API08 copied call/roster IDs, mismatched phone | FAIL | Accepted true and actual victim answered flag changed false→true. The test possesses the shared gateway key and copied IDs; no claim of cryptographic provider impersonation. Immediate points stayed 0 while verdict was pending |
| API09 failed cleanup, then TTL expiry | FAIL | Hangup was deliberately dropped before backend forwarding; B then became active. After only the gateway child's clock advanced beyond ten minutes, old A callback was allowed and actual backend binding changed B→A |
| API10 actual gateway process restart | FAIL | A retired, B active, gateway process terminated/recreated, old A callback accepted and actual backend binding changed B→A. Backend stayed running; this is not a full system restart drill |
| API11 alias / earlier request delivered late | FAIL / CONTRACT GAP | Actual core normalized national/international aliases equally. Earlier A was held in transport, B joined through actual API, then A was released and replaced B. Current wire has no trusted provider generation/order proof; server cannot infer physical call chronology from arrival order alone |
| API12 duplicate gateway callbacks / score | PASS | Exactly one answer request forwarded, one actual answered participant; actual score became positive and subsequent input did not add points |
| API13 invitation-only actual API | PASS | Unknown phone returned 403 phone_invite_only, no roster growth/connection; invited positive control joined. Real provider rejection and UI persistence remain untested |

All eight failures are completed assertion failures with recorded authoritative state, not environment timeouts or OOM. The three lifecycle/order failures demonstrate missing retirement/generation guarantees; they do not establish provider CallId/retry behavior or prove that an opaque call ID contains chronology. No 100-client scoring/capacity run was performed, and this capped run must not be used for latency/capacity claims.

## Attempts and source integrity

1. Container attempt 1 exited **126 before setup/tests**: mode-700 extracted inputs belonged to ubuntu; root with all capabilities dropped could not traverse them. Ownership changed only inside the three exclusive NEW phone source/fixture/evidence directories; capabilities/network/resource cap were retained. Raw failure/state preserved.
2. Attempt 2 exited **1 before tests**: pnpm selected an empty store on the mounted filesystem and reported ERR_PNPM_NO_OFFLINE_TARBALL. Frozen lock passed policy checks; no network fetch was allowed. Raw dependency log/exit preserved.
3. Attempt 3 used the existing image cache explicitly: `pnpm install --offline --frozen-lockfile --store-dir /root/.local/share/pnpm/store --package-import-method copy`. All six workspace projects installed offline in 13.5s. This copies dependency contents and preserves workspace links into delivered /work; it does not import old image or other-worktree application source. A separate evidence-only driver recorded the setup adjustment without modifying the pinned runner or test source.

Actual test command:

```text
node /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-concurrency=1 /work/extensions/src/telephony/pilot-runtime/phone-real-backend.test.ts
```

Runner exited **1** for eight failed security/policy assertions; raw Node spec-reporter output is retained as `remote-api-fcd4813/attempt-03/actual-api.tap`. Duration was 66600.151749ms; no perf threshold or timeout was changed. Container exited normally with OOMKilled=false and Pid=0. All **544 source hashes** passed before/after execution, and checked workspace symlinks resolved into the delivered snapshot. Input archive SHA256 `0237697dc11486f8f0bbc079266d739b438e4d490f56052258b6fa186c68c4f9`; input manifest SHA256 `60a3b1030167b743f9d517f3f53c292e708dd8577e492939f0a6ffa5bb69a928`.

All raw receipts were archived remotely and downloaded byte-for-byte; evidence archive SHA256 **b71581eecaab95a578b89298c5232dd50d10a2d2878c9f14648c4799f79393f9**. `DOWNLOAD_VERIFIED.json` records integrity. The local raw tar is ignored as generated output and retained alongside the readable committed files. An initial unprivileged Docker probe failed; existing authorized sudo -n access succeeded. One read-only control-script stat had a Windows CR suffix; subsequent SSH stdin strips CR. Neither affected app/test state.

## Concrete review boundary

`remote-api-fcd4813/S01_ROUTE_GUARDS_PROPOSED.patch` is a **review-only, unapplied** exact patch for `packages/socket/src/api/extensions/game-routes.ts`. `git apply --check` passed against the current protected baseline; `git diff -- packages/socket` remains empty. This is the smallest proposed batch for the measured causes of API02/03/06: deny missing expected secret, and deny cached connected-roster polls whose active call ID differs. It has not been executed and is not claimed as a verified fix. Its required verification is a new isolated snapshot running all thirteen original cases plus configured valid-redial controls. Manager must approve its exact protected hunks before application.

API07/08 need the agreed phone/caller-proof validation at supplied-roster poll/rebind/answer boundaries, including admission denial propagation. Phone string equality is correlation, not cryptographic provider authentication. API09/10/11 need a versioned backend-owned registration/retirement/generation and restart-reconciliation contract. A local ten-minute tombstone or longer timeout cannot honestly provide that guarantee. See BACKEND_SEAM_REQUEST.md; no controller/storage lease or implicit wire change is assumed.

The named Phone allocation is **RELEASED**: both own attempt containers are exited; the current `tadazz-hq-phone-api-20261115` has no running process. `allocation-release.json` is the durable lane receipt for the manager's central allocation ledger. Failed containers and evidence are retained, with no other container stopped or removed.

All four source Asana tasks remain OPEN/PARTIAL. Next action is manager review of the exact S01 hunks and lifecycle/identity contract, followed by controlled real-backend retest. The 100-client harness stays deferred until safety conditions are clear. Physical PSTN/DTMF, carrier capacity, authentic provider behavior, account-enabled tenancy and customer/production acceptance remain unproven. No push, merge or deployment occurred.
