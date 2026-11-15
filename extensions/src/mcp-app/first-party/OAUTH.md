# First-party OAuth and private draft service

`createFirstPartyOAuth(options)` returns an unmounted fetch handler, access-token
verifier, tenant DraftRepository factory and remote MCP composition helper.
It requires the already-bootstrapped actual account service, explicit CONFIG_PATH,
the existing persistent manager JWT configuration and separate deployment-owned
Ed25519/AES keys. Production code creates no default key and reuses no manager
JWT as an MCP token. The test keys/accounts are isolated synthetic fixtures.

Clients are explicitly preregistered public clients with exact HTTPS redirect
URIs and allowed Tadazz scopes. PKCE S256 is mandatory. There is no wildcard
redirect, CIMD fetch, dynamic registration, client-credentials grant or ambient
account fallback. Register the actual current ChatGPT callback shown by its
connection settings; Claude's documented custom-client callback is
https://claude.ai/api/mcp/auth_callback. Configuration is not proof of either
host installation.

For issuer https://example.invalid/oauth, the fetch routes are:

- GET /.well-known/oauth-authorization-server/oauth: issuer metadata.
- GET /oauth/jwks.json: public signing key only.
- GET /oauth/authorize: validate exact client/resource/scopes/PKCE/state, then
  redirect to the explicitly configured same-origin consent page with an
  encrypted, five-minute pending request. This does not issue a grant.
- POST /oauth/inspect: real manager JWT/session plus exact Origin/Host; JSON
  ticket returns client/scopes/expiry and a session/ticket-bound consent proof.
- POST /oauth/approve: the same real manager authority, explicit allow decision
  and matching proof atomically approve one grant and single-use code. Return
  the exact preregistered callback with code, unchanged state and issuer.
- POST /oauth/token: standard form authorization_code or refresh_token grant,
  including exact resource/client binding. Authorization codes require the
  original PKCE verifier/redirect and expire after at most120seconds. Access
  tokens expire after at most300seconds; refresh rotation/grant expiry cannot
  outlive the consenting native manager session or24hours.
- POST /oauth/revoke: registered client plus possessed refresh token revokes the
  entire associated grant. Unknown tokens do not disclose grant existence.

The existing trusted first-party UI must display the actual account/client and
requested scopes, require a human click, then call inspect/approve and navigate
to the returned callback. A consent page is an explicit dependency; this module
does not invent a page or auto-approve a link. The API rejects cross-origin
approval and returns frame-ancestor denial headers. Frontend UI must apply its
own matching clickjacking protection and existing eight-locale i18next/Rubik
conventions. OAuth scope consent is distinct from exact-revision native-save
consent; native save remains unavailable without that actual adapter.

Grant/code/refresh/draft/idempotency/audit data lives only under
CONFIG_PATH/tenants/<verified-account>/extensions/mcp-oauth/grants.sqlite.
This is temporary MCP authoring data, not a second native game store. There is
no global DB or automatic migration of the older first-party draft namespace.
Unknown/corrupt/unsafe files, unexpected schemas, journals or WAL/SHM are denied
and preserved. Reads open query-only databases; no absent private family is
created by access verification or get. Service-owned paths are assumed; this
does not promise safety against an actor racing filesystem replacements.

Only digests of codes, pending consent requests and rotating refresh credentials
are stored. Tenant DBs use rollback journals, FULL synchronous transactions and
exclusive mode0600 creation. Correct-proof code replay and refresh replay
durably revoke their grant. OAuth-grant revocation, draft CAS, idempotency and
audit are checked atomically in the same tenant DB. Native account/session state
is in the preexisting separate DB, so cross-DB logout is not linearizable.
Blocking SQLite cannot be instantly interrupted; postcommit cancellation can
withhold a response without undoing committed data. Unknown close/IO failures
never report a successful write.

The verifier checks the live native account/session and grant on every call.
An issuer-private WeakSet binds real verified principals to validated SDK copies
through a synchronous trusted callback; structural caller copies cannot invoke
the real DraftRepository. Draft writes revalidate canonical authored content,
summary, actual dispatcher digest and precise scopes before their atomic CAS.
There are100drafts/5000draft operations/1000grants/5000refresh records per tenant;
no automatic data deletion or recovery loop is introduced.

Use `oauth.remote({allowedOrigins,dependencies:{authoring,drafts,rateLimit,...}})`
with `drafts:oauth.draftRepository(authoring)`. Principal budgets remain a required
trusted host dependency; synthetic tests use an explicit test-only allow budget.
The module does not mount a listener, open ports, create a provider account,
change production credentials, publish content, export downloads or enable an
executable renderer. D's V1/V2 composition/frame semantics remain producer-owned;
MCP's existing canonical digest and strict0.1 tool schemas are not widened.

Official sources checked15November2026:

- https://developers.openai.com/plugins/build/auth
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

Execution evidence must accompany this source. Native auth/SQLite synthetic E2E
does not prove a deployed consent page, TLS mount or actual ChatGPT/Claude link.
