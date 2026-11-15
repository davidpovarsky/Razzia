# P3_NEXT — actual backend negative API preparation

Preparation only, following independent `phone-review-30280fa.md`. Baseline producer commit: `30280fa18398b8608d5800eb160726f027042eef`. Source lease remains pilot-runtime and this evidence directory. `packages/socket/**` and all other backend sources remain read-only. The remote runner currently belongs to QA for Site browser work; this lane has not started a local backend, browser, remote container, install, test or competing remote job.

The new `phone-real-backend.test.ts` imports the delivered actual Hono app, creates its actual Socket.IO server on loopback, authenticates a synthetic manager, creates synthetic quizzes/games over HTTP and reads actual Registry/Game/controller roster, binding, answer and score state. There is no backend model. `phone-gateway-qa-child.cjs` starts the actual gateway in separate real child processes. It can hold a request before forwarding, drop a selected hangup before forwarding, and offset only the gateway child's Date.now. All non-dropped backend requests use real loopback HTTP. A request abort is never treated as rolling back an action already processed by the backend.

No test assertions are weakened to accept a known vulnerability. The runner exits nonzero on a violated security expectation while retaining observations; a red security test is not a passing acceptance. Actual execution and dependency availability are pending, so the table below contains required assertions and source-based predictions, not measured outcomes.

| ID | Real backend assertion | Readiness / current source concern |
| --- | --- | --- |
| API01 | Configured key rejects missing/wrong key and creates no roster entry | Prepared; route has configured-key comparison |
| API02 | Missing key configuration fails closed and creates no roster entry | Prepared; current conditional branch appears to allow it |
| API03 | Stale A poll after B rebind denies joined/private roster state and leaves B unchanged | Prepared; cached connected-roster branch lacks active-call check |
| API04 | Late A answer/hangup preserve B binding, player count, answers and points; B gets actual server score | Prepared; controller already has call-ID checks; needs execution |
| API05 | Old epoch is rejected with unchanged state; current key 5 is accepted once | Prepared; checks actual route/controller and current answer flag |
| API06 | Wrong phone/call plus connected victim roster ID cannot poll private identity | Prepared; connected-roster route currently trusts roster ID |
| API07 | Wrong phone cannot rebind a disconnected victim by supplying its roster ID | Prepared; rebind path needs identity verification |
| API08 | Copied active call/roster IDs with a mismatched phone cannot answer for victim | Prepared; assumes caller proof must bind phone too, not just knowledge of gateway key/IDs; owner must settle protocol requirement |
| API09 | Failed cleanup, B rebind, then gateway clock beyond ten minutes does not revive retired A | Prepared; tombstone pruning currently permits a new join; actual roster checked |
| API10 | Real gateway process restart does not let a replayed retired A replace B | Prepared; restart loses all local history; actual roster checked |
| API11 | Core-documented national/international aliases agree; held earlier A delivered after B cannot replace B | Prepared; B delivered via real API while A is held in transport. This requires trusted call generation/registration context, which current wire does not contain. It is a desired protocol gate, not proof that the server can infer physical call order |
| API12 | Two duplicate provider callbacks through actual gateway produce one answered participant and no extra authoritative score | Prepared; actual Game score, no fake scoring |
| API13 | Actual invitation-only API denies unknown phone without adding state; invited control succeeds | Prepared; this still cannot certify real provider unknown-caller rejection or UI persistence |

Each case uses a fresh actual game/manager and a generated UK drama-range identity. Observations omit raw phones, tokens, password and secrets; child transport logs are discarded. The dedicated container has no external network, production mounts, ports or provider endpoints. Accounts/billing are disabled solely in its synthetic environment; account-enabled/tenant authorization is not certified by this profile. The fixture quiz uses the current validator minimum cooldown of three seconds, game speed 1, a real sixty-second answer window and bounded manager event/authoritative-state waits. Normal host start/advance uses authenticated sockets, not direct round mutation.

## Portable inputs and prerequisites

`prepare-phone-api-package.mjs <full-review-SHA>` creates an exclusive ignored `delivery/phone-<SHA>/` containing source.tar, a per-file SHA256/mode/size manifest, delivery hashes and a safe extractor. It uses immutable Git blobs, includes actual common/socket/extension sources and all workspace manifests/lockfile/TS configs, rejects links and config/secret/customer paths, and never exports local dependencies, ignored config, `.env`, fixtures or production data. Git objects are read in one bounded batch, not hundreds of separate processes. The delivery archive is generated locally; creating it is not backend test execution.

Remote prerequisites still to verify in the granted window: Python 3.9+ for `phone-safe-extract.py`; existing arm64 QA image `tadazz:design-system-qa-20261110`; Node24/tsx and dependencies from a frozen offline pnpm install in the NEW snapshot. The extractor checks archive and manifest hashes before any extraction, rejects traversal/absolute/links/special files, verifies every regular member against the manifest and refuses an existing destination. `verify-phone-api-source.mjs` rehashes source before and after execution and proves workspace symlinks resolve into the delivered /work snapshot, not stale image source. Offline dependency misses are a setup blocker, not permission to mutate a live container or fetch arbitrary packages.

Only after manager transfers the remote runner from QA, use existing SSH `ubuntu@132.145.25.168`, identity `C:/Users/DAVID/.ssh/tadazz_oracle_2026`, `BatchMode=yes`, `StrictHostKeyChecking=yes`. Do not read key contents or change trust. Reserved paths:

- New source: `/home/ubuntu/tadazz-hq-qa-20261115/source/phone-<reviewSHA>`.
- Delivery staging: `/home/ubuntu/tadazz-hq-qa-20261115/fixtures/phone-<reviewSHA>/input`; generated config: its separate `runtime` sibling.
- New evidence: `/home/ubuntu/tadazz-hq-qa-20261115/evidence/phone-api-<reviewSHA>`.
- New container: `tadazz-hq-phone-api-20261115`; refuse if the name already exists. Do not touch Site or old containers/artifacts/fixtures.

Copy the three input files plus extractor into the exclusive input directory without overwriting. Verify extractor/archive/manifest hashes against the local delivery receipt. Run the extractor with source.tar, source-manifest.json, the two expected hashes and the exact new source destination. Use NEW fixture/runtime and evidence directories; preserve receipts and synthetic fixtures after execution.

Container invocation template (run only after current live resource/lease check; use exact resolved paths and SHA, no unexpanded placeholders):

```text
docker run --name tadazz-hq-phone-api-20261115 --network none --cpus 1 --memory 1536m --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges \
  --mount type=bind,src=<new-source>,dst=/work \
  --mount type=bind,src=<delivery-input>,dst=/input,readonly \
  --mount type=bind,src=<new-fixture-runtime>,dst=/fixtures/phone-<SHA> \
  --mount type=bind,src=<new-evidence>,dst=/evidence/phone-api-<SHA> \
  -e PHONE_REVIEW_SHA=<SHA> -e PHONE_REMOTE_RUNNER_GRANTED=P3_PHONE_API \
  tadazz:design-system-qa-20261110 bash /work/extensions/src/telephony/pilot-runtime/run-phone-api-qa.sh
```

Do not use `--rm`: retain setup/test exit receipts, dependency log, actual-api.tap, sanitized actual-api-observations.json and before/after source hashes. No public ports, customer config, environment-file injection, Docker socket or provider credentials. The shell runner refuses a second run in the same evidence directory. The isolated container may write dependencies into its new source mount; tracked source/lockfile must retain exact hashes. A fresh review SHA/evidence attempt is required for changed code; no modifying artifacts already reviewed.

## Backend seam and next capacity gate

See `BACKEND_SEAM_REQUEST.md` for proposed read-only contract/hunk boundaries. These are not approved changes or executed exploit results. The actual API run must establish precise behavior before implementation outside the gateway lease. In-memory ten-minute tombstones are only a local bounded replay mitigation. Provider unique CallId, retry horizon, identity canonicalization, durable retirement/generation, restart reconciliation and actual caller identity remain open.

The next 100-client actual Socket.IO/scoring job is deliberately not implemented or executed yet: negative API conditions and identity/retirement contract must be clear first. Reuse the existing Scenario 10 basis afterwards, retaining all 100 authoritative answers, fifty correct/fifty incorrect, duplicates, p50/p95/failure metrics and source SHA. Do not substitute pure audio, gateway model or historical 500/500 receipts; do not relax thresholds or alter test sequencing without root-cause evidence.

No current physical PSTN/DTMF/provider/carrier, real 100-client capacity, live customer or production acceptance is claimed. All four original source tasks remain OPEN/PARTIAL.

## Checks actually executed during preparation

`node --check` passed for the child/packager/verifier; the TypeScript harness passed an esbuild syntax-only transform with zero warnings (no imports/backend execution). `Git Bash -n` passed for the remote shell runner. Python AST syntax passed, and `py -3 -B .../phone-safe-extract.test.py` passed **8/8** in-memory archive safety tests in 0.008s: valid regular source, archive/manifest mismatch, traversal/absolute names even when manifested, links/devices/FIFOs, duplicate members and content digest mismatch. No extraction occurred. Freeze file-manifest guard passed for all 602 protected paths (593 unchanged, nine existing approved hashes). See `NEXT_STATIC_CHECKS.json` and `NEXT_DELIVERY_SAFETY.txt`; these are preparation checks, not the thirteen real-backend test outcomes. The existing 34/34 producer proof at 30280fa remains a separate earlier receipt.
