# Dedicated real-authority candidate — source only, 15 November 2026

**Implementation and first-batch artifacts prepared; runtime/type acceptance is pending.** No auth method, database initialization, credential generation, native dispatch or test was executed during this stage. No server grant was used. Pre-edit lease is PHONE_AUTHORITY_IMPLEMENTATION_PRE_EDIT.md, baseline72636aca. Only new auth/**, the leased telephony verifier and own evidence/tests changed. The accepted four0ad2 files, barrels, API app, three proposed native admission files and other worktrees are untouched.

## Concrete authority implementation

| File | Implemented source responsibility |
| --- | --- |
| auth/contracts.ts / credential-codec.ts | Scoped address/immutable binding, canonical phone actions, purpose-bound hash, constant-length proof comparison and safe control metadata types |
| auth/private-authority-files.ts | Fixed injected existing private synthetic root; explicit authorized exclusive initialization/mutation; separate existing read-only SQL access; schema/format/incarnation/private-permission checks; no mkdir/global fallback/repair |
| auth/authority-store.ts | Concrete synchronous reader and writer; one authority UNIQUE(owner,game); complete scoped queries; version/request/fingerprint CAS; metadata-only durable receipts; issue/activate/rotate/revoke |
| auth/unmounted-factory.ts | Actual NativeAccountAuthority preparation/revalidation, current-credential proof, actual owned native Game/facade pin, real withAccount composition and proof-gated accepted V2-A dispatch. Server-only methods, no HTTP app or route |
| telephony/.../request-bound-verifier.ts | Shared codec contracts; ACTIVE request proof and separate pending/active activation proof; facade resolution only after credential and actual owner/session verification; fresh live reads after waits/on replay |

The factory directly composes the existing verifyToken, activeAccount, isAccountSessionValid, Registry.getManagerGame and withAccount APIs through NativeAccountAuthority. It does not use a trusting fixture lambda, manager JWT as service key, M3A WIP, new account schema or replacement authority cache. Async JWT preparation finishes before SQL; actual current owner/session/Game checks remain synchronous inside the write/coordinator callbacks. A Promise/thenable is rejected, never coerced to permission.

## Credential state and idempotency

| Control action | Durable decision and delivery behavior |
| --- | --- |
| Issue expected0 | Derive public service selector from verified owner/game/provider plus request nonce; reserve exactly one Game authority. Commit version1 PENDING_DELIVERY with only a256-bit capability hash and immutable issuer/executor/expiry/action ceiling. Only a newly committed return may carry the in-memory secret |
| Activate expected=current | Prove that exact pending/active capability before writer access, then check version/hash/state again inside SQL. Revalidate actual issuer/session/Game after admission wait. Commit ACTIVE; retries return metadata only |
| Rotate expected=current | Same verified issuer and native pin; CAS to next version PENDING_DELIVERY, disabling old proof immediately. Fixed expiry, issuer, Game/executor and action ceiling stay unchanged. A duplicate request returns its original metadata receipt without another version or secret |
| Revoke expected=current | Verified actual owner may terminate the lease, including from a fresh owner session. Commit a monotonic terminal version, REVOKED and empty current actions. No native hangup, score change, repair or billing compensation is inferred |

Each fingerprint binds action, request nonce, actor, scope, immutable binding and explicit expected version. Changed payload under the same request conflicts. Every lease/receipt query includes owner+game+provider+service; the UNIQUE(owner,game) prevents separate provider partitions claiming the same actual phone roster. Credentials hash owner/game/provider/service/version/issuer/executor/fixed expiry/initial actions. The public deterministic service selector is never a secret or proof.

Only safe metadata fields are serialized into receipts. Raw secrets are neither persisted, encrypted for recovery, echoed on retries nor put in URLs/logs. An initial response lost after commit leaves PENDING delivery; explicit expected-version rotation is the recovery path. A delayed earlier activation/use after rotation is rejected. A lost activation ACK may repeat the exact metadata decision while its proof/version is current. No exact-once network delivery or actual gateway custody is claimed.

## Read-only authentication and uncertainty

Construction captures the trusted authority-root path only. Public scope values cannot select a path. Authentication validates scope, reads an existing DB readOnly, and performs only scoped authority reads before proof. There is no lifecycle root/DB, roster or lifecycle-receipt access before successful ACTIVE proof. Pending activation permits only the control operation, not a usable Game context.

Explicit initialization is manager-authorized and requires an already existing0700 synthetic root/0600 marker. It creates the dedicated DB exclusively and does not initialize customer/account/billing tables. Existing ready stores validate without DDL; missing/corrupt files are not created/repaired by reads. Header validation rejects WAL format before SQL opening; DELETE journal/FULL sync avoids authentication creating WAL/SHM. A writer lock or journal makes reads deny. Schema/application ID, structural quick_check, file identity and store incarnation are checked; database replacement denies in a live reader instance. The experimental authority file has a4MiB limit; there is no implicit pruning.

Every explicit mutation holds a private exclusive writer marker. A normal completed/rolled-back transaction closes before removing and syncing that marker. Unknown COMMIT/close/initialization leaves an uncertainty marker; it is never expired/deleted/recovered automatically. This intentionally sacrifices availability until separately controlled reconciliation. No stale-lock recovery or production maintenance policy is implemented. If authorization is lost after a known commit, metadata persists but disclosure/secret return denies; no native rollback is invented.

The implementation basis is the synchronous [Node24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), SQLite's documented [header versions](https://www.sqlite.org/fileformat.html), and [read-only rollback failure](https://sqlite.org/rescode.html). These documents support the intended API/format choices; they are not runtime evidence of this candidate's correctness or power-loss durability.

## Native boundary and source limits

The factory pins actual fixture Game objects and real RealGameFacade executors. Service verification resolves only a previously pinned facade after secret/owner proof. Replacing the Game or recreating the factory loses that pin and denies old credentials; no automatic executor/native state reconstruction occurs. Initial issue cannot overwrite an existing different executor/issuer. Lifecycle roots are fixed trusted injected fixture roots and opened only after proof; the original synthetic-marker checks remain.

This is an **unmounted composition**, not production native adoption. The known browser phone/roster/display-name ticket bypass and legacy pilot entry still need the three proposed native admission files from PHONE_SERVICE_AUTH_NATIVE_SOURCE_STAGE.md. None is leased/applied here. Manager roster edits may invalidate a call; no silent repair is added. The accepted V2-A terminal/UNKNOWN policy and lack of durable Game/score recovery remain unchanged. Separate account SQL, authority SQL and Game heap do not become one atomic transaction, and revocation after the final observed check is not linearizable cross-process cancellation.

## Actual first-batch source, not test passes

auth-source/authority-first-batch.node.ts is guarded against execution without a new grant. It uses actual register/verification-code consumption/authenticate/mintToken/verifyToken and real account/session rows, actual Game/Registry/Socket.IO objects, and this factory. It has no fake authority callback or mocked controller/scoring. No HTTP server is listened on and no new app route is mounted. Billing is independently disabled in this auth fixture; no email-provider/PSTN/billing entitlement acceptance follows from local code consumption.

1. AUTH-01: existing readonly auth rejects missing/corrupt/uncertain stores without creation/repair; pending proof has zero lifecycle-root/native calls; activate then real register and cached replay preserve one join. Raw credential is absent from authority bytes and retry output.
2. AUTH-02: first-response loss is modeled by ignoring a result; retry returns metadata, explicit next rotation advances version, reordered older activations deny, only current proof enters native dispatch, and terminal revocation denies even a cached lifecycle receipt. This is not a real gateway/TCP delivery failure test.
3. AUTH-03: a child holds a real authority SQLite reservation; transparent observation marks the parent's actual BEGIN entry. The child invokes actual revokeAccountSession before releasing the SQL lock. Parent must deny after its wait with unchanged lease, zero lifecycle/native calls and no credential disclosure. The child intentionally uses a direct fixture lock, not a production writer-protocol bypass.

The source includes explicit child cleanup, private fixture inputs, monotonic request lifetime checks and a scan for generated secrets in fixture files/public outputs. These assertions have **not run**. Full scoped native type checking is also prepared but not run. Only Node TypeScript/JS syntax, JSON/Python syntax and whitespace/source-boundary checks are performed now; no install/bootstrap or borrowed unaccepted dependency graph was used. Prettier remains unavailable locally; no formatter pass is claimed.

## Frozen overlay and bounded execution proposal

auth-source/prepare-overlay.mjs exports only the accepted core four, new auth files, two owned telephony leaves and own first-batch support from one immutable commit. It verifies accepted core bytes before packaging, rejects nonregular blobs and caps the tar at512KiB. The source manifest contains per-file hashes. The extraction helper retains prior path/link/member validation with a new exclusive phone-auth-SHA destination. It is syntax-checked here, not executed.

Proposed new allocation, **not an active grant**: .25CPU/1GiB, network none/no ports, read-only rootfs, no-new-privileges/cap-drop ALL, old verified S02 source/deps read-only; no install/pull/full tree copy. New source/input/evidence only, <=8MiB physical disk; private fixture32MiB RAM and /tmp16MiB RAM. Root must give a fresh shared-budget admission gate; monitor retains2GiB physical floor. Never resume prior returned grants.

Estimates before execution: source archive <=512KiB by hard packaging cap; unpacked source/input/evidence plus container metadata expected under2MiB, with8MiB ceiling. One authority file per case (few leases/receipts) plus account SQL should use well below1MiB of private RAM fixtures. Typecheck phase is separate, native Go limit640MiB plus a small wrapper; runtime Node heap512MiB plus scrypt64MiB, one child, native overhead and32MiB fixture reserve is estimated below~850MiB. No RSS or runtime has been measured for this candidate. The runner timeboxes scoped types90s and only these three tests120s; any OOM/timeout/budget failure is retained, not silently enlarged.

Before/after checks cover549 base inputs, workspace links and every overlay hash. Collect exact types/tests/observations/privacy/disk/container state, archive digests and release. Original20 and scoped3 are not rerun. Their previous acceptance retains its original scope, including RAM versus persistent gateway durability. All original four tasks remain OPEN; pilot API09/10/11 remain FAIL. No push/merge/deploy/provider/config/customer migration occurred.

## Final frozen source delivery

Final application/QA candidate: **f5412461c6d41ed263ec23d85cc3366e360c23ad**. The subsequent handoff commit changes evidence only. Source contains five new auth implementation files plus the two owned native-verifier leaves (one refactored, one reused unchanged), with all four0ad2 files identical. Explicit factory closure denies later control/service reuse. Final source review also added expiry validation after SQL admission and actual live-authority revalidation after asynchronous account-scope completion. First-attempt secret disclosure rechecks the current pending version/hash/expiry; activation acknowledgement and service results recheck the current actual Game/facade and authority before disclosure. These are source safeguards, not executed test results.

The immutable archive is **133120bytes /20 regular files**, SHA256 `9c75aeb696b31935e7bc9bf349abce88ef2a034c2026a6f51195c92e932b7e06`; manifest SHA256 `5ab859fba9f3a53bcd2b984442e022942232ed3bb84aae48c7e478ec5b2ca0b9`; narrow extraction-helper SHA256 `7d144aced19491e6ae914700acd961d4f288c8d1f225bb623b54c4b6d77766a6`. Local ignored delivery directory is `delivery/phone-auth-f5412461c6d41ed263ec23d85cc3366e360c23ad/`. PHONE_AUTHORITY_FROZEN_DELIVERY.json preserves its receipt.

Twelve TypeScript/JS source files pass syntax-only transform/check; JSON and Python extraction source parse; whitespace/source ownership/unmounted checks pass. Generic freeze guard still reports only the prior separately approved game-routes.ts seam. **Zero prepared tests or auth/database/credential methods ran; no typecheck/runtime/formatter pass or live-service acceptance is claimed.** The archive is below the proposed512KiB delta cap, and the unmeasured memory/disk estimates above remain within the requested proposed1GiB/8MiB bounds. Independent source review and a fresh bounded root grant are the next execution gate.
