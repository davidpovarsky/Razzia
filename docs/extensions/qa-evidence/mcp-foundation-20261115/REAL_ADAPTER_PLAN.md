# Real MCP adapter seams — 15 November 2026

Documentation-only inspection of `412eee44255e159e6bdb1fb5d31f3fef0c1fdc6f`,
branch `codex/tadazz-hq-mcp-20261115`. This proposes later work; it provides no
runtime acceptance or permission to change a protected file. The reviewed module,
lock, successful/failed receipts and source snapshots remain frozen. No install,
runner, production/customer data, environment value or credential was accessed.
Evidence links below refer to files at this exact commit. No new normative
protocol claims are needed; OAuth details remain governed by the adopted
[ADR](../../plans/MCP_APP_ADR.md#L364), subject to integration verification.

## 1. Reusable capabilities and actual gaps

| Existing symbol / exact evidence | Reusable now | Limitation for a real MCP adapter |
| --- | --- | --- |
| [verifyToken / mintToken](../../../../packages/socket/src/services/auth.ts#L37), [sessionClaimsValidator](../../../../packages/common/src/validators/auth.ts#L18) | HS256 browser-session signature/expiry checks; manager sessions have revocable `sid` in account mode. | Claims are `sub,role,iat,exp,sid`; no MCP issuer/resource/client/grant/scopes. Browser login is not host OAuth. Never use `verifyIgnoringExpiry` for access. |
| [isAccountSessionValid](../../../../packages/socket/src/services/account-auth.ts#L288), [activeAccount](../../../../packages/socket/src/services/account-auth.ts#L47) | Session/account join checks expiry, verified status and disabled state. Active account lookup can support a trusted mapping. | Account DB has accounts/codes/sessions/limits, no OAuth grants, MCP drafts, consent or operation outcomes: [getAccountDb](../../../../packages/socket/src/services/account-db.ts#L8). |
| [readClaims / requireManager](../../../../packages/socket/src/api/middleware.ts#L22) | Existing first-party bearer authentication and manager authorization. | Manager role alone is not an MCP grant. `requireManager` establishes account context but does not itself require account mode. |
| [withAccount / resolveTenantFile](../../../../packages/socket/src/services/account-scope.ts#L9), [resolveConfigFile](../../../../packages/socket/src/services/config-scope.ts#L24) | Existing tenant root composition and path containment. | Disabled account mode or absent context deliberately falls back to global storage; MCP must reject before invoking it. Recovery/callbacks need explicit owner binding. |
| [themeWorkspacePrincipal](../../../../packages/socket/src/services/theme-installation.ts#L88) | Theme-specific trusted assignment policy. | Not a generic private-game workspace role or an OAuth scope source. Initial MCP account remains the verified account; no selected workspace/header authority. |
| [quizz routes](../../../../packages/socket/src/api/routes/quizz.ts#L15), [CompositeStorageService](../../../../extensions/src/server/storage/service.ts#L33) | Existing manager authorization, native quiz representation, composite validation, digests, sidecar revision checks and export representation. | Raw quiz PATCH has no CAS. Composite save checks then writes files, not a cross-process transaction; nullable expected revision accepts legacy bypass. |
| [getQuizzById / getQuizz](../../../../packages/socket/src/services/config.ts#L105), [readSidecar](../../../../extensions/src/server/storage/sidecar.ts#L51) | Existing readers explain Studio's persisted format. | `getQuizz` writes missing legacy IDs at lines147–152; sidecar path lookup creates its directory at lines20–38. Invalid/unreadable sidecar returns null, indistinguishable from absent. These cannot establish strict no-write, no-corruption-masking MCP reads. |
| [saveQuizz](../../../../packages/socket/src/services/config.ts#L266), [normalizeFilename](../../../../packages/socket/src/utils/file.ts#L3), [createCompositeQuiz](../../../../extensions/src/server/storage/service.ts#L207) | Native schema validation and composite prevalidation. `normalizeFilename` appends a fresh `nanoid(8)` suffix to the subject slug; the stored native ID is generated separately. | The write supplies no exclusive-create flag or reserved-path handle. This leaves a publication guarantee to prove; no same-title collision, overwrite or customer failure was demonstrated. Composite create writes base first, then sidecar, with best-effort cleanup, no durable key reservation or create journal. |
| [createStagedJournal / recoverJournals](../../../../extensions/src/server/storage/journal.ts#L55), [recoverStartupJournals](../../../../extensions/src/server/media-library.ts#L1051) | Existing update journal validation, preservation of unresolved entries and rollback verification. | No operation/grant/consent binding or fsync guarantee. Startup caller [index.ts](../../../../packages/socket/src/index.ts#L18) supplies a root resolver without tenant enumeration. Recovery's base lookup assumes `quizz/<id>.json` whereas ordinary saves use a subject slug plus random suffix, independently of native ID. Do not claim per-tenant new-create recovery. |
| [authoredShowToNativeBundleDraft](../../../../extensions/src/core/show-authoring-convert.ts#L51), [nativeBundleToAuthoredShow](../../../../extensions/src/core/show-authoring-convert.ts#L759) | Actual conversion/schema implementations; do not copy them. | Native conversion generates UUID identities. Persist the one prepared native result before publication/retry; never rerun conversion to reconstruct committed identity. Native-to-authored conversion defaults to excluding private roster. |
| [quizzQuery](../../../../packages/web/src/features/manager/queries.ts#L22), [Studio route](../../../../packages/web/src/pages/manager/quizz/%24quizzId.tsx#L13), [useQuizzExtras](../../../../packages/web/src/features/quizz/contexts/extensions/use-quizz-extras.ts#L20) | Studio opens `/manager/quizz/<quizId>`, reads native base, then sidecar with its existing bearer token. | URL existence alone proves no roundtrip. Need actual same-account reopen with exact saved content/native identities and foreign-account rejection. All editor sources stay read-only. |

## 2. Principal verification and HTTP boundary

Add a downstream transport/composition module, initially unmounted. Use an approved
real authorization server behind a trusted verifier. Do not implement a pretend
OAuth layer by passing browser JWTs through `VerifiedPrincipal` with invented
issuer/audience/scopes, or minting a manager token for a host access token.

Per HTTP request: enforce the adopted canonical resource and trusted TLS boundary,
exact configured Host/Origin policy, methods/content type and streamed body ceiling
of 65,536 bytes before JSON parsing. Reject an unapproved present Origin; absence
may be accepted only for the approved authenticated non-browser client policy.
Never trust arbitrary forwarded headers. No wildcard credentialed CORS. Fresh
server/transport per request/session; session IDs and SSE replay are bound to the
same authenticated principal and reauthorized, never credentials themselves.
Anonymous static resources carry no private invocation data.

The verifier must validate access-token cryptography/algorithm/time and exact
issuer/resource, then resolve client, live grant, allowed scopes and active account
from trusted server records on every request. Unknown key, disabled accounts,
expired/revoked grant or missing assignment fails closed. Account ID must be a
verified nonempty UUID. Only then fill [VerifiedPrincipal](../../../../extensions/src/mcp-app/server/dependencies.ts#L10)
and the request-bound SDK context used by `Dependencies.authorize`. This context
must not come from tool JSON, query strings, host widget identity or account headers.
Map seconds to the interface's explicit millisecond expiry correctly.

Existing first-party login can authenticate a person in the authorization/consent
UI through `readClaims`, manager role, account-mode check and active account/session
lookup. The real authorization-server integration must issue the host grant and
enforce its adopted PKCE/redirect/revocation contract. Existing browser logout
currently revokes its `sid`; it does not revoke separate host grants. Specify and
test that bridge before claiming disconnect/logout revocation.

Wrap legacy service calls in `withAccount(verified.accountId, ...)` with a matching
active-scope assertion before each storage callback. Capture immutable explicit
owner-bound ports for background work; never recover from lost context using the
global path. Reuse account lookup exports without reading their backing DB here.
An optional new downstream DB can hold MCP grants/operations without changing
`account-db.ts` or mixing secrets into quiz files. Its location and migrations
need later owner authorization; no DB is opened by this plan.

Trusted caller authority and selected preview `viewRole` are different. The former
controls private authored data, mutations, scopes and account. The latter is only
SB's demo rendering/redaction selection; it cannot become a manager grant, change
tenant, invoke live controls or expose answer keys. Frozen MCP0.1 has no viewRole
tool field: do not add hidden fields. The authorized controller can receive
authored content under the adopted design; only SB-redacted visual props reach a
selected player/display surface. Corrected SB port3/identityRule2 integration remains a separate
interface review; import its producer and never copy its schema/engine.

## 3. Private draft repository and ordinary reads/exports

Implement [DraftRepository](../../../../extensions/src/mcp-app/server/dependencies.ts#L39)
in a new owner-bound downstream durable store. Persist canonical authored JSON,
derived summary, draft revision and owner. Create/replace use one transaction for
ownership, strict expected revision, idempotency key/digest, outcome and audit.
Uniqueness follows the adopted verified principal/grant + tool + key. Replay first
reauthorizes; another payload returns `REQUEST_KEY_REUSED`; another owner sees the
same `NOT_FOUND` as absence. CAS updates one matching row and reports conflict
without touching content. Recompute/validate stored summary against authored JSON;
do not trust schema-valid but contradictory repository output.

`get` is a SELECT with no migration, directory creation, repair or write audit.
Keep mutation audit in the mutation transaction; operational read logs must not
touch private content. Accountless/disabled/foreign calls perform no private I/O.
No generic private-library import tool is added to the frozen eight-tool contract.
For later library reads, prefer an explicit read-only adapter using existing
validators and tenant-confined files; reject ambiguous/corrupt legacy data rather
than calling migrating `getQuizz` or treating bad sidecars as missing. This is a
downstream composition alternative to modifying legacy readers/editor behavior.

Ordinary authorized reads and exports require scope, ownership and asset rights,
with **no new per-action consent**. Export exact revision through existing
conversion/bundle schemas; no copy of schema or private roster. Store a bounded
artifact with opaque ID and owner/grant mapping, expiry and approved rights.
The first-party download endpoint reauthorizes before reading bytes; no bearer in
URL, private filesystem path or open redirect. An absent download adapter remains
`EXPORT_UNAVAILABLE`. New upload/private asset publishing is outside this seam.

## 4. Explicit save confirmation and safe new-game publication

`save_game` remains `intent:createNew`; never PATCH an original game. No consent
argument is added to the wire. [createNewWithConsent](../../../../extensions/src/mcp-app/server/dependencies.ts#L99)
looks up a durable operation bound to principal/grant, tool/key, draft ID/revision,
canonical content digest and intended createNew action. Missing approval returns
the existing `CONSENT_REQUIRED` shape with an opaque first-party path URL.
Keep the key's state as pending consent, rather than finalizing a denial that
prevents the approved retry. GET only displays; a first-party authenticated,
CSRF-protected POST confirms that exact revision/action. Cross-account approval,
expired/declined/stale confirmation and grant revocation cannot authorize a save.
An edit changes the revision and needs a new exact-revision approval.

After approval, one durable decision rechecks grant/account, current draft CAS and
key/digest, reserves exactly one target ID and records the prepared native bundle
(including UUIDs) and digests. Use an operation-reserved stable target path;
do not derive it from the title alone or generate an unrecorded basename during
the write. Existing `saveQuizz` returns only the native ID after its write returns;
the caller has no prior durable operation-to-target mapping. This pre-return
intent gap is a source observation, not an observed crash or data-loss incident.
The initial downstream composition candidate reuses `CompositeStorageService`
with **operation-private staging injections**, a fixed reserved-ID create-only base
writer and confined staging paths. Validate all resulting native base/sidecar
bytes using existing schemas and preflight before publication. Staging is never
the tenant's live quiz directory and cannot be discovered by Studio.

A new downstream commit coordinator must durably record staging/publication state,
flush prepared files and required directories, and publish using a platform-tested
atomic create-if-absent primitive. No check-then-overwriting rename. Publish the
fully validated new sidecar first, base last as the discovery point, so an absent
base cannot expose an incomplete new game. Persist the completed operation/result
and verify owner-bound reopen before returning success. SQLite and two filesystem
files are not one transaction: crash recovery must reconcile every boundary from
the reserved identity/digests, including the interval after publication but before
outcome recording. Recover to the same result; never convert again or create a
second target. This candidate is unimplemented and needs fault-injection proof.

Unknown or conflicting existing files cause a preserved failure; never overwrite
or delete them. Cleanup may remove only proven operation-owned staging/unpublished
artifacts. Once published or subsequently edited, preserve the game and reconcile
the recorded outcome; do not roll back over a user's newer changes. Uncertain
commit state remains reconciling/unavailable, not a new-key retry recommendation.

Historical412eee dispatcher defect, now assigned for bounded correction before adapter acceptance:
[save/export branches](../../../../extensions/src/mcp-app/server/dispatch.ts#L166)
currently read the draft at expectedRevision before reaching the adapter. A
committed-key replay after later draft edit/deletion can therefore be blocked
before the durable result is consulted. The later reviewed design must allow an
authorized, owner-bound completed-outcome lookup before fresh-draft CAS, while
retaining payload-digest comparison and revocation checks. The manager authorized this correction after independent review. The original412eee
receipts remain frozen; corrected implementation and its validation are recorded
separately under corrections-412eee. Planning itself is not an acceptance result.

## 5. Minimal future leases and fail-closed rollout

| Candidate path/symbol | Smallest future change / prerequisite |
| --- | --- |
| New downstream `extensions/src/mcp-app/server/**` adapters/composition and focused tests | Real verifier, request-context binding, durable draft/operation/consent store, staged commit coordinator, downloads, transport. Separate future assignment; current source stays frozen. |
| `packages/socket/src/api/index.ts` `api` route composition | Only if mounting inside the existing process is chosen: import and mount one OFF-by-default downstream router with explicit injected existing services. Requires exact pre-edit ledger and separate protected-source approval. Standalone downstream listener is the composition alternative requiring no packages edit; deployment/routing is separately gated. |
| `packages/socket/src/index.ts` startup recovery invocation | Only if existing-process activation requires pre-listen MCP recovery; prefer injection into the additive composition startup. Existing recovery must not be represented as tenant-aware create recovery. Separate approval if unavoidable. |
| `packages/socket/src/services/config.ts` `saveQuizz/getQuizz`, legacy sidecar services | No edit proposed: operation-private staging and read-only adapters can supply explicit target reservation/exclusive publication and avoid read migration. Existing random-suffixed naming is not evidence of a same-title overwrite. If tested composition fails, stop at the exact missing primitive and obtain a lease; never silently patch these symbols. |
| `packages/common/**`, `packages/web/**`, editor/provider/CSS/router sources | No change required or authorized. Preserve wire IDs, native UUID schemas, editor behavior and all locales. Existing Studio route is the reopen target. |

Default injection stays absent/unavailable; startup configuration alone must not
enable private adapters. Activate only after independent source review, durable
fault tests, real OAuth/host acceptance and separate release authorization. An
adapter rollback disables/unmounts the new feature, revokes its grants as agreed
and preserves committed games, operation records and unresolved recovery evidence.
No automatic migration, repair, library deletion or customer cleanup is included.

## 6. Exact acceptance negatives before real-integration claims

| Boundary | Required focused failure and preservation proof |
| --- | --- |
| Tokens/grants | Wrong algorithm/signature/issuer/resource/client, expired token, unknown key, revoked grant/session, disabled/unverified account and missing scope denied before private I/O; browser/player JWT and ID token rejected as MCP access token. |
| Caller identity | Forged account/workspace headers/tool fields and selected viewRole cannot change tenant/scopes. A/B parallel callbacks retain owner; lost async context fails without global access. |
| HTTP/session | Unapproved Origin/Host/forwarded host, missing required policy, over-limit streamed/chunked body, malformed content type/JSON, wrong methods, session fixation/cross-owner SSE replay fail safely before dispatch. |
| No-write reads | Snapshot tenant file/DB state across get/list/export serialization, missing legacy IDs, absent/invalid/unreadable sidecar. No repair/migration/mkdir. Foreign/absent ID same outward result. |
| CAS/idempotency | Concurrent same-revision edits produce one winner; same key/same content same result, changed payload rejected; restart preserves outcome. Returned content/summary/identity must agree. Completed save/export replay after draft edit/deletion is explicitly tested. |
| Confirmation | No approval, GET approval attempt, CSRF, another user/client/grant, stale revision, changed content at same revision, expiry/decline/revocation and replay cannot authorize a new durable save. Ordinary read/export never asks for this confirmation. |
| New-create safety | Same title twice preserves both originals; reserved-ID or sidecar collision preserves existing bytes; native UUIDs stable across retry; no duplicate prior deleted scenes, original game unchanged. |
| Crash/storage | Fault before/after reservation, conversion persistence, each flush/publication, result commit and lost response; restart yields exactly one verified result or preserved unresolved state. Disk-full/permission/symlink/race/corrupt journal never overwrites or masks an uncertain write. |
| Reopen/export | Same-account existing Studio opens exact base+sidecar/theme/content; foreign account cannot. Download expiry/revocation/rights failure denies bytes, URL has no credentials, no arbitrary remote asset fetch or private roster leakage. |
| Preview | Corrected SB port3/identityRule2 only, real pinned producer/assets, role-redacted props; viewRole never grants author authority/live control. Missing producer stays PREVIEW_UNAVAILABLE. |

Planning does not complete MCP02/03/04/05 or HQ. Source review findings may refine
these seams; they cannot be dismissed by this plan or by the 18 foundation tests.

Successor steering: HQ decision `SB_IDENTITY_RULE2_PORT3_20261115.md` supersedes
the pending internal SB port2 with port3/identityRule2 (injective UTF16-unit hex
identity preimage/ordering). Authored1/nativeUUID/MCP0.1/UI metadata1 stay fixed.
No SB mapping, global key normalization or persisted migration is proposed here.
Independent review412eee also requires transport prevalidation auth/limits and
consistent stored summaries; both are assigned corrections, not waived by this plan.

Current checkpoint: the scoped public-send correction at
`60d289821df631d55c91d48f4f753197d85d0041` is accepted after independent6/6
targeted SDK cases and129 unchanged source hashes. The review's actual test exit0
and outer SSH final-assertion syntax exit1 remain distinct; neither remote
consumption nor real HTTP/OAuth/store/host acceptance follows. See the
[one bounded M3A stage proposal](REAL_INTEGRATION_M1_PROPOSAL_20261115.md).
It uses actual first-party session auth and a real private draft/operation store,
keeps host OAuth and native publication gated, and identifies C1/accepted-R2
integration dependencies. Accepted SB81d5 port3/rule2 replaces the earlier pending
producer status, with zero compiled pins and no renderer integration claimed.
