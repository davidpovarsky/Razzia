# M3A proposal: real first-party draft HTTP + operation store

15 November 2026. Proposal only, based on accepted MCP source
`60d289821df631d55c91d48f4f753197d85d0041`. No source lease, install, runner,
production route, provider setting or customer-data access is implied.

**One smallest stage:** build an unmounted first-party Hono request module using
Tadazz's actual revocable account sessions and a real account-bound SQLite draft /
operation store. Deliver create/read/CAS-replace and authenticated idempotent replay
through HTTP Request/Response. Native save preparation has an explicit blocked
state until an accepted C1 reservation capability is integrated. No native game is
published in this stage. The MCP SDK factory remains frozen and unmounted.

This is useful integration evidence beyond injected principals/MemoryDrafts:
actual JWT verification, actual accounts/sessions lookup and actual SQLite
transactions/reopen are exercised together on synthetic isolated fixtures after a
separate runner grant. It is **first-party session authentication, not host OAuth**.

## Actual seams, narrowly reused

- [requireManager/readClaims](../../../../packages/socket/src/api/middleware.ts#L22) calls
  [verifyToken](../../../../packages/socket/src/services/auth.ts#L67), checks manager role and
  executes inside `withAccount(claims.sub, next)`. Source
  [isAccountSessionValid](../../../../packages/socket/src/services/account-auth.ts#L288)
  joins session/account and checks sid, expiry, disabled and verified state.
  Reuse these actual functions; do not copy JWT/session logic.
- [resolveTenantFile](../../../../packages/socket/src/services/account-scope.ts#L18) falls
  back to global storage when account mode/scope is absent. New store entry
  must reject that condition before opening a private path or cached handle.
- [StorageInjections](../../../../extensions/src/server/storage/sidecar.ts#L11) currently
  exposes `saveQuizz(data)->{id}`, with no pre-write reservation capability.
  [saveQuizz](../../../../packages/socket/src/services/config.ts#L266) chooses native ID and
  random-suffixed basename, writes, then returns ID. It supplies no durable
  pre-return operation binding. No same-title collision/customer loss was proved.
- [getQuizzById/getQuizz](../../../../packages/socket/src/services/config.ts#L105) may write
  missing legacy IDs. New draft GET is a store SELECT, never a call to this native
  reader. Native-library inspection/import/reopen is not enabled via a migrating
  GET or a directory-delta/orphan guess.

The broader existing evidence remains in
[REAL_ADAPTER_PLAN](REAL_ADAPTER_PLAN.md).
This stage does not repeat or implement that entire plan.

## HTTP/auth boundary and scope

Return a Hono app/router only; use `app.request` later for isolated tests. No
listener, route mount, SDK connection, OAuth metadata endpoint or host registration.
Apply explicit configured Host/Origin/method/content-type checks and a streamed
64KiB ceiling before JSON parsing, plus bounded pre-auth admission. No trusted
forwarded-header inference. Mutations require the configured first-party Origin;
first-party authenticated GET does not acquire a new consent requirement.

Bind the actual manager middleware lazily from the same application auth module.
Require accounts enabled, a UUID subject, manager role, sid and an active verified
account/session. Assert AsyncLocalStorage owner equals that exact subject before
every private operation and asynchronous callback. No tenant/workspace/role/scope
header or body field selects authority. No shared/global fallback when context is
lost, account mode changes, or a request is unauthenticated.

Use a distinct `FirstPartySessionPrincipal` (subject/account/sid/expiry), never cast
it to MCP `VerifiedPrincipal` or invent issuer/resource/client/grant/scopes. Server
policy permits only own-account draft read/write and preparation-state operations.
It grants no OAuth scopes, theme workspace privileges or preview `viewRole` power.
Reverify session/account on every request, replay and immediately before a mutation
decision; a revoked session cannot retrieve a prior result. Recheck authorization
before returning private outcomes. Do not claim cross-database linearizable
revocation from an account-DB check plus a separate operation-DB transaction.

Existing [env.ts](../../../../packages/socket/src/env.ts#L44) can use a random fallback signing
key. The binding must require existing persistent account-mode JWT configuration;
it must not mint a new key, accept a fallback instance or change credentials.
No provider/email configuration is added by this stage.

## Real store and minimal HTTP operations

Use a new private per-account DB under an explicitly trusted account root, opened
only for an authorized mutation; GET uses an existing read-only handle/open and
never creates an absent DB or repairs an inconsistent one. If consistent reading
requires recovery, fail closed and retain that as separately authorized recovery
work. Reject unsafe ancestry/symlinks and retain
exact owner spelling. Never store under an accountless root. New tables only in
this feature's own DB: canonical drafts/revisions, operation key/input-digest/state/
outcome, and mutation audit. No migration of existing account/library data.

- `POST /drafts`: existing authored validator/normalizer; create and record key,
  canonical input digest, outcome and audit in one transaction.
- `GET /drafts/:id`: authorized SELECT with no repair, mkdir, native GET, migration
  or content rewrite. Foreign/absent IDs have the same outward result.
- `PUT /drafts/:id`: strict expected revision; one transactional CAS/key/outcome/
  audit decision. Same key/digest returns the same authorized result; changed
  input returns key-reused error. Preserve existing content/summary consistency.
- `POST /drafts/:id/save-intents`: record the exact revision/content/action request
  under its key, but return dependency-unavailable / pending-C1 while the real
  reservation port is absent. This is not `save_game` success or consent approval.

First-party keys are explicitly namespaced by first-party authority/account/sid/
operation/key; no fake host grant or cross-authority replay. SQLite transaction/
process-reopen evidence is scoped to the qualified fixture filesystem, not hardware
power-loss durability. Client cancellation does not roll back a committed row.
Ordinary authorized read/export remains without additional per-action consent;
real export/download and native publication are not part of this stage.

## C1 / semantic import / R2 dependencies: fail closed

The operation state machine must make C1's pre-ID gap impossible to cross:
`pending-C1` has no publishable target. A future `reserved/prepared` state requires
an actual owner-bound C1 capability containing the stable native identity and real
basename **before any public write**; persist target, canonical/frozen native bytes,
digests and exact revision/action before allowing that capability to commit. No
`saveQuizz`-then-record, invented filename, client-supplied target or duplicate
reservation writer. Native ID and basename are independent; native timeline and
question UUIDs are prepared once and persisted, never regenerated during retry.
Missing C1 means no native target allocation/public file/Studio URL/success claim.

HQ `C1_F1_REVIEW_DISPOSITION_20261115.md` conditionally approves architecture,
not a currently integrated capability. Its protected preparer/composition/startup
hooks belong to the separately leased Recovery C1 owner, not this MCP stage.
No C1 hook or native library writer is added here. A later durable save also needs
exact-revision first-party confirmation; GET cannot approve it, and stale/foreign/
expired/revoked confirmation cannot authorize publication.

R2 native binding/logical digest/import correction must be accepted and integrated
before native read/import/reopen/publication can be enabled. In particular a
present imported `quizz.id` must equal source `extras.quizId` **before allocation
or write**; only that checked matching top-level storage ID may be omitted from
the logical payload projection. Preserve all other fields and question/timeline
identities/remapping behavior; mismatch denies with zero allocation/FS writes.
This authored-only stage rejects native/enhanced import bodies rather than copy
or bypass R2 semantics. No broad digest change, hidden GET mutation or schema-
stripping workaround. Unaccepted Recovery59xx WIP is not a dependency pin or source
overlay. C1/F1/native tenant-startup/durability acceptance remains separate.

Accepted SB source is `81d5b8f7c0bd3931982c2b0d5a3a13b86e523a8c`, port3 /
identityRule2. Exact accepted-object evidence is in
[the source anchor receipt](integration-stage-60d/accepted-sb-source-anchors.json):
`preview-port.ts:9` exports the sole `projectShowBindings`; `identity-rule.ts:2–4`
defines3/2/utf16-hex-v2. Its compiled manifest still has zero pins. Do not copy its
schema/mapping/engine or import another worktree's WIP through aliases. This stage
persists authored content without claiming a renderer or activating preview.

## Exact proposed exclusive source ownership

MCP worker only, after root approval; no new source file is created by this proposal:

| New path | Responsibility |
| --- | --- |
| `extensions/src/mcp-app/first-party/bindings.ts` | Lazy actual socket auth/session bindings; separate principal type |
| `extensions/src/mcp-app/first-party/http.ts` | Unmounted Hono request handlers, ingress/strict route schemas |
| `extensions/src/mcp-app/first-party/owner.ts` | Explicit account-root capability and per-operation scope checks |
| `extensions/src/mcp-app/first-party/store.ts` | SQLite draft/CAS/idempotency/audit transactions and recovery state |
| `extensions/src/mcp-app/first-party/save-intent.ts` | Pending-C1/prepared-state invariant; no native publication |
| `extensions/src/mcp-app/tests/first-party/fixture.ts` | Isolated real accounts/session DB + temporary operation store fixture |
| `extensions/src/mcp-app/tests/first-party/auth.nodecheck.ts` | Actual JWT/session/account revocation and scope negatives |
| `extensions/src/mcp-app/tests/first-party/store.nodecheck.ts` | Real transaction/CAS/reopen/idempotency and blocked preparation |
| `extensions/src/mcp-app/tests/first-party/http.nodecheck.ts` | Actual unmounted HTTP ingress/request/response cases |

Only own isolated `package.json`, lock and tsconfig may need additive export,
`test:first-party` script, source aliases and direct dependencies. Existing root
lock supplies Hono4.13.13/http-status-codes2.3.0; preserve SDK pins and record any
necessary private Node:sqlite type alignment against the actual Node24 runner.
Source resolution may point only to exact existing public socket/common modules;
no global alias, WIP overlay, source rewrite or alternate implementation.
No root dependency/config edits or type-suppression shim. Existing41 checks remain
frozen; no blanket rerun without a changed dependency/boundary reason.

**Unavoidable protected hooks for this stage: none.** Tests compose the actual
auth services read-only; the router is unmounted. Future application mounting may
need one feature-off composition seam at `packages/socket/src/api/index.ts:34`,
with exact ledger/owner approval then. No editor/provider/routing/UI source changes.

## Planned acceptance / stage blockers

Later isolated server grant only: actual Hono+JWT/session DB+operation SQLite,
two synthetic accounts, revoked/expired/disabled/player/missing-sid negatives,
account mode off/lost scope/changed context with zero draft/native-storage I/O, bad Host/Origin/
oversized streamed body/unknown authority fields, concurrent CAS/key conflicts,
restart/replay and unchanged native/idless sentinels. Missing C1 and native import
must deny before allocation/public FS; no consent is invented. Record actual exits,
DB/path hashes and raw guard result. No live customer/account or host is needed.

Missing actual OAuth authorization server/client registration/host grant/account-
scope mapping blocks a real MCP HTTP endpoint. C1 and accepted integrated R2 block
native durable publication. These are explicit dependencies, not fixture-backed
"implemented" integrations. M3A can establish real first-party draft transactions
while those gates remain closed. Original MCP02–05/HQ remain OPEN.
