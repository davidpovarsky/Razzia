# Real account authority and native adoption — source stage, 15 November 2026

Authority: manager chat 01a1dd10-2ef0-73c2-9c65-569a843f44da explicitly authorized a concrete map and new unmounted leaves in the owned telephony namespace. Baseline `ffb3718cf14330dfa8267a44fc712bc578ea3992`. This map is recorded before new source. Prior V2A_NEXT_AUTH_ADAPTER_DESIGN.md still specifies lease issuance/hash-only persistence/rotation; this document settles its async boundary and adds native adoption/bypass requirements. No heavy/server run or new resource grant is assumed.

## Frozen source ownership for this stage

Only NEW `extensions/src/telephony/pilot-runtime/service-auth-v2/native-account-authority.ts` and `request-bound-verifier.ts`, plus own evidence. These are unmounted read-side authority leaves: actual existing JWT/account/session/Registry bindings, and a synchronous scoped service-lease reader contract plus request-bound verification. No default trusting verifier, credential generator, account/lease DB writer, gateway, route, barrel, configuration or customer-data change. Accepted four V2-A server files remain byte-identical to0ad2. Root integration, M3A WIP and other workers are not dependencies.

The lease reader is a required concrete implementation boundary, with no memory-map/always-true production substitute supplied. This source stage is not full service provisioning or real-auth runtime acceptance. Storage/control/adoption composition remains a later reviewed candidate phase.

## Actual authority reused

| Read-only existing API | Exact use |
| --- | --- |
| api/middleware.ts readClaims / requireManager | Future manager control routes retain actual Bearer/manager middleware. The leaf calls the same underlying services/auth.ts verifyToken; no alternate token parser/signature authority |
| services/auth.ts verifyToken | Async HS256/JWT/expiry verification before the owning turn. Strict account mode plus manager role and nonempty sid are independently required; never use verifyIgnoringExpiry, player refresh or manager password as service identity |
| services/account-auth.ts activeAccount / isAccountSessionValid | Synchronous real SQL reads of current verified/enabled account and live owner+sid+expiry. Repeat at every protected boundary; no cached authorization boolean |
| services/account-scope.ts accountsEnabled / withAccount / activeAccount | Strict mode guard; future composition enters the verified owner scope before lifecycle-root use and checks the scope. resolveTenantFile global fallback is forbidden for absent owner |
| services/registry.ts getManagerGame | Exact owner and game lookup; pin the returned object, not only an ID. Future execution requires the same object and RealGameFacade.executorId |
| api/routes/auth.ts logout; account-auth.ts revokeAccountSession/resetPassword | Existing session deletion is observed by the next synchronous check, including replay and after a SQLite wait. No new account schema/revocation cache |

No existing secret is copied or returned by these leaves. verifyToken continues to use the existing backend secret internally. An existing manager JWT is only a provisioning/control proof and is never the gateway credential. Startup must establish a strict, isolated account profile before imports; the existing lazy account DB/configuration is not opened during this source-only stage.

## Resolve asynchronous preparation versus the synchronous Game turn

Choose the existing local account/session database as the **current authority** for this candidate. It exposes synchronous predicates today. Manager JWT cryptography remains asynchronous:

1. Outside all lease/lifecycle write transactions, await actual verifyToken. Reject invalid role, missing sid, expired/disabled/unverified/account-disabled state and wrong Game. Capture an opaque in-process manager proof with the verified claim expiry and exact Game object.
2. Any executor queue acquisition/other async preparation occurs before the critical turn. The prepared proof is only a description of a verified request, not permission cached through a wait.
3. Immediately after a wait, re-read actual account, live sid, current grant/credential version and owned Game synchronously. For service requests, verify the distinct scoped opaque capability from a real synchronous lease reader. Derive a fresh frozen context and private request proof. No manager JWT is stored in that context.
4. Within the owning turn, the existing V2-A callbacks synchronously reload authority after BEGIN IMMEDIATE, before projection/completion and before cached receipt disclosure. No Promise, await, remote auth call or detached verifier can enter that callback. The candidate rejects a thenable lease-reader result and uses strict boolean checks on the actual session predicate.
5. Invoke the existing known synchronous coordinator/Game methods, with no awaited work between the final live/binding/epoch checks and native dispatch. Do not hold a lease-authority write transaction across this call. Request proof is released in finally. A cached store receives the shared live verifier and each new context's private proof, never the first request's principal/token.

Service capability verification is synchronous because a local SQL reader and hash comparison are synchronous. Repeated callbacks reload the exact current record, compare proof/version and immutable binding again, and call the actual account/session/Registry functions again. Expiry and request lifetime are rechecked. A copied/fabricated context or one used after request release has no private provenance.

If future authority requires an asynchronous remote verifier, this design **cannot** wrap its Promise as a V2-A boolean or run it while holding SQLite. It needs a separately reviewed async prepare/reservation/reauthorize protocol, with actual owning-executor and cancellation semantics. There is no such hook or authority dependency in this candidate. Revocation after the last local check may race another process; account/lease SQL and Game heap are not one atomic transaction. No instantaneous cancellation/linearizable cross-DB revocation claim is made. Observed revocation after reservation/effect preserves UNKNOWN/PENDING; it does not trigger replay, compensating hangup or guessed rollback.

## Credential and delivery contract carried forward

Dedicated private service authority store, separate from account/billing tables, must enforce one adopted `(owner,game)` authority and scoped `(owner,game,provider,service/leaseId,issuerSid,executorId,initialActions,fixedExpiry)` identity. Every lookup includes owner/game/provider/service; a candidate address is not an authenticated principal. The authority lookup is part of authentication; no lifecycle/roster/receipt/path lookup precedes successful proof. Its future root is explicitly injected and synthetic for the first run, with no global path fallback.

Service credential is a distinct256-bit random capability, hash-only persisted with scope/version domain separation. The future writer returns it in at most one secret-bearing issuance response attempt, commits PENDING_DELIVERY, and requires exact-version proof-of-possession activation before service operations. Lost response cannot be recovered from a hash. Same issuance/rotation request repeats only its metadata receipt; changed fingerprint conflicts. Explicit owner rotation increments version, disables the former version immediately, retains lease identity/sid/Game/executor/actions upper bound/fixed expiry, and requires activation of the new version. No raw secret is placed in durable response receipts/logs/URLs. Actual secure gateway delivery/journal/key/path remains unimplemented.

Reordered/duplicated delivery is fenced by monotonic **credential version** and explicit expected version for rotation/control, not arrival order or provider call ID. A delayed v1 activation/use/response after v2 exists is stale and cannot overwrite v2's journal/authority or reactivate v1. A pending newer version blocks older-version use. A gateway missing its scoped durable tuple stops, rather than polling/minting a replacement. An ACK lost after activation can repeat exact activation metadata; it cannot reveal the secret. An operation response lost after effect retries the same operation ID and independently reauthenticates; UNKNOWN is not re-executed. Per-call capabilities retain their separate precommitted tuple and predecessor CAS. No physical call chronology follows from either version counter.

The current V2-A constructor requires register permission and pins issuer/service/expiry. Initial next proof uses all four limited phone actions; poll-only reopen, transparent lease-expiry renewal, issuer replacement and terminal-call recovery remain explicit later gates.

## Native adoption: additional actual bypasses and minimal hook proposal

Adoption must be explicit and fixed before a newly constructed native Game is published. An empty current roster is not proof that an old Game has never been used. Recommended production composition creates a dedicated v2 Game through an injected **actual Game constructor/getIo/owned quiz** port, records the new object/executor/adoption decision before Registry publication, then exposes its room. It does not retrofit an arbitrary existing Game or infer age from UUID ordering. Unpublished/uncertain creation/adoption remains unresolved; no automatic billing compensation or lifecycle resurrection.

Read actual services/game/index.ts: join resolves a roster ID/phone and can replace its client/socket; roster/browser-identity.ts also matches a unique pre-registered display name. HTTP `/games/join` currently mints phone/roster claims, and handlers/game.ts PLAYER.LOGIN awaits verifyJoinTicket then calls game.join. Therefore fencing only `/pilot-phone` is insufficient for a mounted adopted Game. A phone-linked identity can reach native rebinding through browser admission; even a ticket created before adoption must be checked after async verification.

| Proposed protected seam; NONE edited now | Smallest required behavior/evidence |
| --- | --- |
| api/extensions/game-routes.ts gameExtensionRoutes chain | One downstream factory import/mount and injected actual auth/account/session/owned-Game/new-Game ports. No common SessionClaims extension or broad manager token delegation |
| same file `/pilot-phone`, after resolvePilotTargetGame and before correlation/private projection | Reject the whole legacy call for every adopted target/action, including target fallbacks, poll and hangup. Unadopted legacy semantics remain unchanged |
| api/routes/games.ts `/join`, after exact target resolution and before media/ticket/identity disclosure | Deny browser claims that would resolve a protected phone roster in an adopted Game. Check phone/source/roster plus display-name resolution; a source:web label cannot bypass it. Pure normal web identities may remain allowed only when classification is unambiguous |
| handlers/game.ts PLAYER.LOGIN inside verified-ticket continuation, immediately before game.join | Recheck current adopted mode and actual protected roster resolution after the async ticket wait. Reject stale/pre-adoption phone/roster/name tickets before native mutation |
| same file PLAYER.RECONNECT / PLAYER.SELECTED_ANSWER before native calls | Refuse the browser Socket.IO path for v2-protected phone participants even if a historical client/session proof exists. Ordinary web participants remain governed by their original path. No substitute scoring |
| Optional extensions/src/server/index.ts | Named factory export only if composition requires it; otherwise direct unmounted import. No edit now |

Three protected files are the proposed minimum mounted-entry ownership: game-routes.ts, routes/games.ts and handlers/game.ts. Creating v2 Games through the injected native constructor avoids a new hook in legacy Game creation. If the product instead adopts through existing POST `/games`, a creation/cohort marker immediately after its actual constructor and before publication is an alternative additional hunk in routes/games.ts, not a hidden assumption of freshness. Neither alternative is applied now.

Use a downstream adopted-mode registry keyed by exact Game object/executor plus durable authority identity. Missing mode/incarnation denies v2 activity, not fallback to a global room. Browser identity classification must use the existing actual public roster view and fail closed on ambiguity; do not duplicate scoring or mutate hidden DOM/Game internals. Manager roster edits/kicks may invalidate a binding; current callbacks then deny. Any desire for automatic continuation after that mutation needs explicit reconciliation, not a forged rebind.

No Game/controller/roster schema change is yet proven necessary. A minimal canonical admission hook is only an alternative if actual public-ports tests demonstrate an irreducible gap. No ownership outside the two new leaves is exercised by this stage.

## Frozen candidate and bounded next proof

Prepare the two read-side leaves now, plus source/blob/import audit and lightweight syntax/format checks only. A later accepted candidate must supply the real dedicated synchronous lease reader/writer, activation/control receipt CAS and test-only composition; absence of that store is not replaced with a trusting lambda. No server run is started here and previous grants remain returned.

Before a new bounded execution assignment, freeze full candidate SHA and deliver only a small immutable overlay using verified read-only S02 deps/no install/pull. Proposed first batch: at most .25CPU/1GiB, <=8MiB new disk with private RAM fixtures, root's freshly stated admission gate and2GiB floor. Three focused actual profiles: (1) actual strict verified-account login/sid/owner + exact credential scope/version, (2) actual session/credential revocation before lookup/after SQLite wait/on receipt replay, (3) lost/reordered issuance/activation/rotation and stale native/browser identity denial in the unmounted test app. Preserve raw outcomes, authority/lifecycle lookup/native counters and unchanged victims; do not rerun20/3 without a newly justified concern. This is a proposal, not an active allocation.

Original four production tasks remain OPEN and pilot API09/10/11 retain FAIL. Source leaves confer no runtime auth, provider, gateway, PSTN, capacity, customer migration or release acceptance.

## Prepared source outcome

The two new telephony leaves are now prepared. NativeAccountAuthority awaits actual verifyToken only during manager preparation, keeps an opaque WeakMap ticket, and revalidates actual activeAccount/isAccountSessionValid/getManagerGame synchronously after waits. Strict profile checks require account mode and the already configured/captured backend JWT secret; no key is generated, provisioned, returned or changed by the leaf. A new owner lookup is pinned to the same native Game object.

RequestBoundServiceVerifier requires a concrete synchronous current-lease reader, with no default stub. Its capability hash binds owner/game/provider/service/version **and issuerSid/executor/fixed expiry/initial actions**. Private request contexts reload that current record and actual native account/session/Game on every V2-A callback. Thenable readers, unproven/copied/released contexts, inactive/version-stale leases, scope drift and expired request lifetimes deny. It does not issue a credential, write a lease, activate an endpoint or dispatch native gameplay itself. The real dedicated lease store/control/adoption composition is still required before a runtime-auth candidate is complete.

PHONE_SERVICE_AUTH_SOURCE_AUDIT.json freezes new source hashes, consulted native dependency blobs, unchanged accepted V2-A blobs and absence of existing imports/barrel/mount. Node22.17 `--experimental-transform-types --check` passed both new files without module evaluation; scoped whitespace passed. These are syntax checks, **not full TypeScript or runtime acceptance**. Prettier was not run because the previously available local dependency tree is now absent; no install, alternate worktree dependency alias/copy or server formatter job was performed. No heavy/local/server tests were run and no previous grant was resumed.
