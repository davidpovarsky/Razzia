# Remote MCP service boundary

`createRemoteMcpApp(options)` exposes a Web Standard `fetch(Request)` handler.
It opens no listener, creates no public route and has no anonymous private-data
fallback. Mounting and root importer integration belong to the manager.
No dependency additions are required beyond the existing isolated lock:
MCP server/client/core 2.4.0, ext-apps 2.1.0 and the existing project dependencies.

The official SDK `createMcpHandler` owns modern 2026-07-28 negotiation and
stateless 2025 fallback. Each HTTP exchange creates a fresh SDK instance using
the same eight tool registrations, schemas, dispatcher and static resources as
the linked-transport factory. No alternate renderer or tool engine exists.
JSON responses are used; there are no subscription streams, public rooms,
session-ID authority or server-initiated actions.

The exact external HTTPS resource URL, same-origin protected resource metadata
URL and browser Origin allowlist are deployment configuration. The trusted
HTTP host must preserve the original Request URL and Host; this handler rejects
forwarded headers rather than trusting caller-selected proxy identities. The
outer HTTP host must also limit headers before constructing a Request.
Metadata is public and advertises only the initial catalog scope. All MCP
requests, including discovery/resources, need a verified access token. Tool
scope escalation uses the existing per-tool OAuth challenge contract.

`verifyAccessToken(token,signal)` must verify signature, exact issuer/resource,
expiry and live account/grant state on every invocation. It must not accept a
manager JWT or a model-selected account header. The optional separately exported
`createAccessTokenVerifier` implements the explicit Tadazz at+jwt profile using
configured RSA >=2048-bit or Ed25519 public keys and authoritative grant/account
callbacks. It fetches no token-supplied key URLs. This profile requires matching
issuer claim configuration; it is not a generic identity-provider integration.
It issues no tokens and does not implement authorization-code/PKCE, refresh,
consent, logout or grant persistence. Those remain unaccepted until a real
compatible authorization server and first-party account bridge are connected.

Private repositories must implement the existing DraftRepository contract with
explicit tenant ownership, durable CAS and idempotency/outcome/audit. No default
memory/global database or persistence fallback is introduced. The existing
first-party session store is not relabeled as an OAuth store. Native saving,
consent, downloads and the real Preview producer remain unavailable without
their genuine adapters. Preview must consume D's port3/rule2 and E's actual
renderer/loader; empty executable pins never mean ready.

The adapter bounds actual request bodies to 64 KiB, admits at most32 active
HTTP operations and120 attempts/minute per configured service instance. Aborted
verification/dependency work retains its slot until it settles. Observed abort
prevents new dependency work/disclosure; committed effects are not rolled back.
The HTTP host must apply service-wide distributed admission if multiple service
instances are deployed. No raw tokens, keys or backend exception text are logged
or returned. Browser OAuth challenges are exposed only to allowed Origins.

The UI resource remains the explicit empty placeholder. G owns the interactive
resource and host bridge; no installation or widget acceptance follows from
protocol tests. The eight-tool contract remains version0.1.0 and the UI URI
remains ui://tadazz/quiz-preview/v1.html.

Official references opened 15 November2026:

- https://developers.openai.com/plugins/build/auth
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/server/src/server/createMcpHandler.ts
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/server/src/index.ts

Executed checks and limitations belong to the immutable wave evidence receipts;
this source document alone is not a passing test or a host connection receipt.
