# F — real first-party OAuth/private drafts and legacy HTTP correction

Source:51946e1aca2935219e8dc639cba8197ad54c1e7e on
codex/tadazz-hq-mcp-20261115, additive after manager-adopted1ac016e.
All170 final source inputs match the tested local bytes exactly. Manifest:
oauth-01/server-receipts/legacy-formatted-input-manifest.json, SHA256
2cc91c71fff05d7d3a967b4a3212a4a563c4190a19459ff36835614ef8a8451b.

## Actual result

- Full private TypeScript0;10-file AST-equal formatting0.
- First-party/native-account/OAuth43/43 PASS: original34 plus9 new native
  JWT/session/SQLite OAuth cases. No fail/skip/cancel.
- SDK/HTTP55/55 PASS: original41 plus6 signed-token and8 HTTP cases.
  No fail/skip/cancel. Both modern and actual legacy SSE paths are exercised.
- Same12 installed package versions/entry hashes and frozen private lock
  e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838
  verified afterward. One frozen offline/scripts-off bootstrap; all subsequent
  commands call pinned Node/TypeScript/tsx directly, with no pnpm auto-install.

Raw commands/exits/log hashes:11-legacy-typecheck.json,
12-legacy-first-party-oauth.json,13-legacy-sdk.json and corresponding .log files
under oauth-01/server-receipts. final-source-dependency-check.json binds all170
source files and the actual dependencies. Original attempt's test-data TypeScript
errors and43-case42PASS/1parser failure remain unchanged and separately labeled.

## Implemented behavior

createFirstPartyOAuth uses the actual existing manager JWT/session/account DB
authority and native session revocation. Configured preregistered public clients
use exact HTTPS redirects, explicit resource/scopes/state, S256 PKCE, short-lived
Ed25519 access tokens, single-use codes, rotating refresh and durable replay
revocation. There is no fallback issuer/key/account or manager-JWT passthrough.
JWKS contains public material only. Keys are explicit persistent host inputs;
production code does not generate or alter them.

Same-origin authenticated inspect/approve endpoints require a real issued manager
capability and an exact account/session/ticket-bound proof. Approval is explicit;
opening an authorization URL cannot create a grant. The native account's logout
or disable state invalidates access. A fresh issuer instance with the same keys
and tenant DB verifies the existing grant; this is not a process-kill/power-loss
or actual ChatGPT/Claude installation claim.

Tenant-owned rollback-journal SQLite stores grants, code/refresh digests, drafts,
grant-keyed idempotency outcomes and audit. Draft content uses the existing core
authoring validators and the actual dispatcher digest. Native account+grant
authority, exact scopes, CAS, key/outcome/audit and private draft writes are
checked transactionally. Stored draft data survives a fresh repository; another
tenant cannot read it. Structural principal copies are denied through an
issuer-private capability set bound to the validated SDK principal copy. There
is no global DB, native game write, old-draft migration or silent corrupt/journal
recovery. Native account/session DB revocation remains a separate-DB boundary.

## Legacy SSE admission fix

The official SDK JSON response option applies to its modern path; legacy
stateless calls can return SSE before handler work completes. The original
foundation could then release HTTP admission too soon. The real OAuth draft RPC
witness exposed the SSE body; its first failing parser is preserved.

The product correction preserves official SDK framing, buffers bounded responses
through terminal EOF/cancel and retains admission through actual handler/body/
dependency retirement. The wire bound is327680+4096bytes for payload/framing.
A trusted host deadline defaults to30000ms, configurable1..120000ms. Timeout
returns504 and cancels disclosure; the bounded slot remains occupied while real
work/cancel/drain is unsettled. No timeout/abort implies rollback of committed
rows. drain()/close() observe the actual tracked retirements; close stops new
admission. No independent protocol parser/renderer/clock or permanent watcher.

The genuine legacy regression waits for all32 catalog handlers to enter, aborts
them, yields an event-loop turn and observes429 before the held dependency is
released. It then proves actual retirement and restored admission. A separate
deadline witness observes504 while close remains pending until the real handler
settles. The older32-unsettled-authorizer witness remains covered as well.

## Host integration contract and remaining acceptance

Public entry: @tadazz/mcp-foundation/oauth. No new package dependency or root
importer/lock change is requested. Required host inputs are explicit issuer/
resource metadata URLs, preregistered client IDs/redirects/scopes, persistent
separate signing/encryption keys, an existing account root and a real same-origin
consentPageUrl. Machine endpoints and composition are documented in
extensions/src/mcp-app/first-party/OAUTH.md. Configure the actual callback shown
by the selected host; test example.invalid callbacks are never production defaults.

The existing first-party UI still needs to show the logged-in account, client
and requested scopes, require a human click, call inspect/approve and follow the
exact returned callback. This UI/TLS/root route integration and real private
ChatGPT/Claude linking are NOT_RUN. Manager owns root wiring/key provisioning;
the existing Studio/first-party UI owner must consume this actual endpoint
contract using the existing eight-locale/i18next/theme conventions.

Use oauth.remote with oauth.draftRepository and the existing authoring policy;
a real host principal rate budget remains required. Tests use an explicit
synthetic allow-budget. Native save with exact-revision consent, download
delivery and actual Studio native-game reopening remain unaccepted. The private
MCP draft DB is temporary authoring storage, not native game storage.

D's explicit V2 composition/frame contract and E's real renderer/loader remain
the Preview seam. Current executable pins/readiness are absent. This batch does
not widen0.1 tool schemas, change existing V1 digests, create another canonical
MCP digest or serialize full host theme definitions. The placeholder resource
is not an interactive widget. G remains gated.

Original tasks1220539638955304/1220539632251971/1220539611695147/1220539638962739
remain OPEN for their complete acceptance. Research stays DONE. No push,
deployment, public listener/tunnel, credential change, customer mutation or
provider spending occurred.

## Resource custody

Own OAuth container08d54e934a7c631034357bdf147e82d3721dd6cdcdbddf2d3c0c36f15fee2a3e
naturally exited/PID0/OOMfalse at16:31:05UTC. Its exit1 belongs to its immutable
initial TypeScript2 test-data failure; the separate final candidate's TC0 and
43+55 PASS logs are not relabeled. Compute claim released immediately afterward.
All original source roots, failure receipts and synthetic raw witnesses retained.
The production/QA pair/metadata keeper/RAM volume/backups remain untouched.

Cumulative conservative own disk accounting8069120B remains below8MiB after
reconciling two older terminal Docker allowances against actual du/inspect-size;
the original upper-bound receipts are preserved. No file/container/cache deletion
manufactured space. Full OAuth receipt archive SHA256
cbb217404ade5daac9cb47c8a2fc30e7d7f595d81d02429f6fea60a8edc19054.

The earlier RESULT.md retains the exact459-metadata inventory, validated index,
read-only CAFS roots and bootstrap provenance for manager combined parent QA.
Raw local receipts deliberately preserve their original CRLF bytes, so Git
whitespace findings in evidence are not an application format failure. Application
source/staged diff whitespace checks passed. No evidence bytes were normalized.
