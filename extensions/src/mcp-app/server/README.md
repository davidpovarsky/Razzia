# MCP foundation server

Unpublished, unmounted, feature-off by composition. Create a fresh
createTadazzMcpServer(config, dependencies) for each request/session. It returns
the actual pinned MCP SDK McpServer; it opens no socket/HTTP port and reads no
environment/account/global filesystem. A later authorized transport must enforce
HTTPS, Origin policy, authentication before dispatch and <=64 KiB body size.
Tool-level OAuth metadata/errors alone are not an HTTP OAuth implementation.

Eight adopted MCP0.1 tool/result schemas and three static resources are registered.
The exhaustive eight-tool dispatcher stays in one file (264 formatted lines)
to keep authorization/error/output enforcement visible; preview verification
is a separate module. This is the scoped exception to the 250-line target.
The ui resource is an empty noninteractive placeholder, not a fake game preview.
No real identity, private draft repository, account storage, renderer or download
adapter is provided. Missing dependencies fail closed. The only synthetic
principal/store are under tests/server and never imported by production modules.

Trusted dependencies must verify issuer/audience/signature/time/active
grant/account on every request, implement rate limits, and use explicit principal
ownership. DraftRepository requires atomic CAS/idempotency/outcome/audit; it has
no default persistence. createNewWithConsent requires the original exact-save
consent, durable unique target/reservation/recovery guarantees. Exports use
ordinary scope/ownership/rights checks, with no added per-action consent.
Injected test export delivery is not actual account or download acceptance.

Authoring calls actual public core tadaShowV1Schema/preflight converters, with
narrower UTF8/card/question/text/media/settings/default policy. Conversion is
validation only; freshly random native IDs are not persisted or advertised as
stable. SB owns preview identity-rule1 and the executable port; native timeline
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
The isolated lock must be generated and verified on the assigned server runner;
there is no hand-written/fake frozen lock.

Validation must use this branch's exact application source, root frozen
dependencies, and the isolated package's own resolved/frozen dependency graph.
Do not use a stale Docker image's source or another worktree's source to satisfy
imports. tsconfig reuses the repository's public source aliases. No root/shared
manifest/lock or protected source edit is necessary.

After the manager grants a separate server namespace/runner:

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

Current commands, failed attempts and final validation results are retained in
docs/extensions/qa-evidence/mcp-foundation-20261115. Foundation test results do
not establish the unavailable real integrations or original host acceptance.
