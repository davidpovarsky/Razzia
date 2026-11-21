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
  tokens expire after at most300seconds. A consented connection and its rotating
  refresh credential have no time-based expiry. The original native session row
  is retained as a revocation anchor: ordinary browser/JWT expiry does not
  disconnect MCP, but explicit session logout, password reset, account disabling
  and OAuth revocation still deny the connection. Native browser sessions keep
  their existing twelve-hour expiry and are not extended by OAuth refresh.
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
are stored, plus one issuer-encrypted token-response retry capsule per grant.
An identical, fully validated code or refresh exchange can recover that response
for30seconds while its refresh head is still current. Retries do not rotate
again, extend the access token, or cross client/resource/account bindings.
Correct-proof replay outside that window or after the head advances durably
revokes the grant. Tenant DBs use rollback journals, FULL synchronous transactions
and exclusive mode0600 creation. OAuth-grant revocation, draft CAS, idempotency and
audit are checked atomically in the same tenant DB. Native account/session state
is in the preexisting separate DB, so cross-DB logout is not linearizable.
Blocking SQLite cannot be instantly interrupted; postcommit cancellation can
withhold a response without undoing committed data. Unknown close/IO failures
never report a successful write.

The verifier checks the live native account, retained revocation anchor and grant
on every call. Persistent refresh tokens are versioned and encrypted with the
existing deployment-owned key. Each connection retains one current refresh
digest, so ordinary rotation cannot exhaust the historical5000-row lifetime
quota. Routine refresh count/time is updated in the same bounded encrypted
summary instead of appending an audit row every five minutes. Existing consent,
security, migration and revocation history is preserved. The existing numeric
grant deadline uses a reserved maximum-safe-integer
sentinel for an unexpired connection; issued access/save/export deadlines remain
short and independent.

An existing legacy connection upgrades on an actual refresh exchange only after
validating the exact unused stored credential, client, resource, active grant,
allowed scopes and retained native account/session anchor. Expiry caused only by
the old session/24-hour cap may be renewed. Manually revoked grants, deleted
anchors, replayed credentials and inactive accounts cannot be resurrected. A
client that has already discarded its credential must connect once again; the
server cannot recover client-side secrets. No schema rewrite or fabricated
consent is used for this migration.

An issuer-private WeakSet binds real verified principals to validated SDK copies
through a synchronous trusted callback; structural caller copies cannot invoke
the real DraftRepository. Draft writes revalidate canonical authored content,
summary, actual dispatcher digest and precise scopes before their atomic CAS.
There are100drafts/5000draft operations/1000grants per tenant;
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
