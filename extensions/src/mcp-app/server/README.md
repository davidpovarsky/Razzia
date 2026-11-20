# MCP foundation server

Unpublished, unmounted, feature-off by composition. Create a fresh
createTadazzMcpServer(config, dependencies) for each request/session. It returns
only a guarded connect/close handle around the actual pinned MCP SDK McpServer.
The bare server is not exposed. It opens no socket/HTTP port and reads no
environment/account/global filesystem. A later authorized transport must enforce
HTTPS, Origin policy, authentication before dispatch and <=64 KiB body size.
Tool-level OAuth metadata/errors alone are not an HTTP OAuth implementation.

Eight adopted MCP0.1 tool/result schemas and three static resources are registered.
The public SDK Transport interface wraps decoded tools/call messages before SDK
schema evaluation. A required trusted-context ingress budget runs even for invalid
or unauthenticated calls; verified principals receive one tool budget charge.
Bounded input checks and strict schemas reject invalid tool names/arguments with
safe contract errors. Discovery retains strict schemas; valid calls then execute
the SDK's own validation/dispatch. Public projectCallToolResult retains wire-era
projection for intercepted errors. No SDK private method is replaced or modified.
Each connection holds at most32 request lifetimes. Cancelled verification/handler
work stays counted until settled. SDK abort signals and admission-time cancellation
retire authority without rolling back side effects. Close is terminal before the
underlying transport settles, including failure. Unique internal SDK request IDs
isolate late completions from reused client IDs; original client IDs are restored
on the wire. Duplicate active IDs close only their owning connection.
This decoded-message boundary does not implement HTTP body/Origin/TLS validation.
The ui resource is an empty noninteractive placeholder, not a fake game preview.
No real identity, private draft repository, account storage, renderer or download
adapter is provided. Missing dependencies fail closed. The only synthetic
principal/store are under tests/server and never imported by production modules.

Trusted dependencies must verify issuer/audience/signature/time/active
grant/account on every request, implement rate limits, and use explicit principal
ownership. DraftRepository requires atomic CAS/idempotency/outcome/audit; it has
no default persistence. Read/create/replace results are independently validated
against canonical authored content and its recomputed summary. Save/export pass
selection+revision+mutation identity to an authoritative replay-or-new adapter;
a prior authorized outcome is reachable before any fresh-draft revision check.
A NEW operation requires exact revision/content validation and, for save, original
exact-save consent plus durable unique target/reservation/recovery guarantees.
The test-only volatile replay model establishes none of those durable guarantees. Exports use
ordinary scope/ownership/rights checks, with no added per-action consent.
Injected test export delivery is not actual account or download acceptance.

Authoring calls actual public core tadaShowV1Schema/preflight converters, with
narrower UTF8/card/question/text/media/settings/default policy. Conversion is
validation only; freshly random native IDs are not persisted or advertised as
stable. SB owns preview identity and the executable port; native timeline
UUID validation stays unchanged. The counterexample test illustrates that boundary.

M2 owns the one canonical preview identity-envelope serializer; SB normalization,
identity, manifest validation and rendering remain producer-owned dependencies.
No SB schemas/phase mappings/game clock/scoring/audio engine are copied here.
Any future preview adapter must import the accepted SB port and validate its
manifest/content/identity/assets before producing the strict MCP data/meta.
Ready cannot be inferred from the candidate source registry.

The isolated package pins ext-apps2.1.0 and MCP server/client/core2.4.0, replacing
the historical example's vulnerable2.0 pin after official signature/security
verification. maxToolInputElements100 is explicit; SDK instances are not shared.
The isolated lock was generated and verified on the assigned server runner;
public-registry dist/integrities are recorded. Corrected validation reuses the
same frozen lock and this job's own public-registry offline store/cache.

Validation must use this branch's exact application source, root frozen
dependencies, and the isolated package's own resolved/frozen dependency graph.
Do not use a stale Docker image's source or another worktree's source to satisfy
imports. tsconfig reuses the repository's public source aliases. No root/shared
manifest/lock or protected source edit is necessary.

On the separately allocated server namespace/runner:

- resolve the isolated lock with scripts disabled; record registries/integrities;
- reinstall with the new isolated frozen lock and explicit approved build scripts;
- run the package's typecheck/test scripts on that server, not Windows;
- retain exact source input hashes, commands/versions/exits and failed attempts;
- run ui:check/freeze on the same source snapshot when validation is authorized.

Tests use real SDK client/server protocol over linked in-memory transports; they
do not claim Streamable HTTP, Inspector, actual UI host, device or real OAuth
acceptance. Focused cases cover discovery/resources, validated5Q draft/Q3 edit,
CAS conflict, duplicate keys, A/B isolation/revoked replay, invalid identity,
missing real adapters, schema/settings/media denial, ordinary export delegation,
canonical envelope and preview-prefix/native-UUID incompatibility.

Private Node checks use tests/server/_.nodecheck.ts. The original8 suites retain
their exact bytes across rename, and the parent Vitest src/\**/_.test.ts glob no
longer selects them. Lifecycle checks add cancellation, close/send failure,
bounded unsettled work, duplicate/reused IDs and independent factory cases.
Shared Vitest configuration and parent test scripts remain unchanged.

Current commands, failed attempts and final validation results are retained in
docs/extensions/qa-evidence/mcp-foundation-20261115. Foundation test results do
not establish the unavailable real integrations or original host acceptance.

## Native package authoring port

The public tool catalog includes an optional `PackageAuthoringPort` for the
existing portable `.tadazz` engine. Eleven package tools cover actual capability
discovery, paged account packages, staged upload/chunks/completion, status,
isolated build, exact-revision preview, deletion of an uninstalled draft,
consent-bound installation and authorized export. Existing OAuth scopes apply;
tool discovery does not enable native deployment flags or grant review/consent.

The package schemas share the native archive budget. Each base64 chunk is at
most 24,000 decoded bytes, keeping normal MCP calls within the existing ingress
budget. An adapter may provide an expiring first-party binary upload URL for the
declared bytes. Completion must independently verify their exact length and
digest before native package validation. Uploading or building creates no
saved account game. Package lists return bounded summaries in pages of 20;
status returns content identities without source, files or the full manifest.

The adapter owns live account/workspace grants, signed pagination, immutable
upload identities, durable idempotency, exact revision checks, isolated worker
execution, native review and installation. The dispatcher validates outputs,
binds result identities/revisions, and permits only configured first-party
URLs. The new protocol tests exercise this boundary through the real SDK
harness. They do not establish production worker, browser or installation
acceptance, which must be verified against the composed candidate separately.
