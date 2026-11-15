# Real first-party consent client / OAuth issuer boundary

Source:63e1094 on codex/tadazz-hq-mcp-20261115. This adds one F-owned test file;
production issuer, UI, root importer and dependency locks are unchanged.

Actual final result: **3 PASS, 0 FAIL/SKIP/CANCEL**, focused TypeScript exit0,
on local Windows Node22.17.0 with actual SQLite, native manager mint/session
verification/revocation, encrypted tickets, tenant grant storage and access-token
verification. Raw boundary-02 logs/receipt retain commands/exits/hashes.
All172 actual F/E inputs match their immutable snapshot and original bytes before
and after. E client source is its owner's uncommitted, read-only input:
extensions/src/components/oauth-consent/client.ts, SHA256
9f3cda2cbaacf9191eab30f30da34a9f564491a0f39e25bd00027600d6aac07b.
The test must be integrated with that real E client or a separately reviewed
compatible successor; it does not add a copied UI implementation to F's source.

The fetch bridge only supplies browser-added Host/Origin and checks the actual
client's same-origin credential, no-referrer and redirect-error settings. Calls
go to the real createFirstPartyOAuth.fetch. There is no authority/schema/store
stub. The tests prove:

- Real inspect returns the registered client/scopes without creating a grant DB.
  Explicit client.approve produces the exact callback, unchanged state and issuer.
  Its actual PKCE code exchange yields a verified access token for that account.
  Native sentinel bytes remain unchanged; a second client approval is denied.
- A real native inspect response held in flight is discarded after the client's
  native session token changes. No approval request or other-tenant grant occurs.
- Actual native logout after inspect prevents approval and grant allocation.

A normal scripts-off QA-only npm lock generation and npm ci installed the exact
12 declared private dependencies (46 installed packages). Package hashes match
the earlier direct dependency receipts. The captured npm lock is a local focused
graph, not claimed identical to the manager's full frozen pnpm graph. The private
pnpm lock stays e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838.
The second immutable snapshot reuses that unchanged local installed graph through
an owned junction; no package cache or remote metadata was copied.

boundary-01 already passed3/3 and focused TypeScript0. Then only the new test was
formatted with exact Prettier3.9.10 and the repository's base TypeScript options
(no Tailwind strings/plugin transformation is involved). The final immutable
snapshot and3-case/typecheck rerun bind the committed7046-byte test, SHA256
b1876707db2679b8e0e88b2b8afa9caa55189122ffdfd803796a844493947fc9.
Both source manifests, both raw runs and the unchanged local dependency graph
remain retained. The accepted63 SDK/43 first-party suite was not repeated.

The manager's abd4dcb/c30c8dc combined evidence independently supersedes the
earlier pending TC wording for integrated OAuth and V2 consumer: actual SDK63,
firstparty43 and parent/private/socket TC0, with its documented unchanged-source
reuse after the type-only correction. This new boundary file is separate evidence.

No Oracle job, resource claim, public listener, TLS setup, credential provisioning,
native game save, production operation or real ChatGPT/Claude installation was
performed. This is neither a real browser click nor consent HTML/header-route
acceptance. E owns its actual page, eight locales and browser checks; the manager
owns the real root mount and persistent distinct keys. Native-save exact-revision
consent and executable Preview/rights remain separate. G stays gated. The four
original source tasks remain OPEN; research stays DONE.
