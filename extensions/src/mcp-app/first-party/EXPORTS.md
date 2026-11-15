# Explicit OAuth export delivery

`createFirstPartyOAuth` accepts an optional deployment-owned `exportPolicy`:
`{ authoring, canExport(context, exactDraftSnapshot, format): boolean }`.
The issuer origin must also be explicitly listed in `config.firstPartyOrigins`.
Missing policy leaves `oauth.exports` undefined and download requests unavailable.
Configure a real synchronous rights decision for the account, grant, authored
content, selected theme and assets; permission to author a public URL alone does
not establish export rights. The synthetic allow policy in tests is not a
production policy.

Supply the returned `oauth.exports` to the existing remote dependency:
`dependencies: { authoring, drafts: oauth.draftRepository(authoring),
exports: oauth.exports, rateLimit: actualHostBudget }`.
The existing `export_game`0.1 input/output schemas and scopes are unchanged.
Ordinary export requires `tadazz.drafts.read` and `tadazz.exports.read` and adds
no new per-export consent. It does not invoke native Save or C1 creation.

Creation uses the existing tenant operations ledger in `grants.sqlite`, without
new tables, schema versions or migration. One transaction checks real issued
principal, owner/grant/session/scopes, key/input digest, exact current revision,
normalized content/summary and rights; records one snapshot/outcome plus audit;
then rechecks authority. Replay authorizes and validates the original immutable
outcome before reading the current mutable draft. Same key with changed input
is rejected. The existing5000-operation tenant limit is shared with draft writes;
there is no automatic eviction or recovery.

`tada-json` delivers the exact canonical authored JSON. `enhanced-bundle` uses the
existing native converter and enhanced-bundle creator, then normal JSON wire
serialization (which omits the converter's optional undefined properties) before
canonical encoding. Generated native IDs exist only inside that exported file;
no native game is allocated. Snapshot payloads are capped at262144 UTF-8 bytes.

The returned same-origin URL is a **bearer capability for that one snapshot**.
Anyone holding it may retrieve those bytes until expiry/revocation; do not log
or send it to an unrelated party. It contains a domain-separated AES-GCM ticket,
not a manager JWT or access token. It binds account/grant/key/export/draft/
revision/format, authored/body SHA and expiry. Lifetime is at most60seconds,
capped by the requesting access token and native grant. Existing persistent
deployment-owned ticket encryption keys are required after restart. No default
key or credential change is introduced.

GET `/oauth/downloads/<ticket>` (under the configured issuer path) validates the
encrypted capability, exact stored outcome and hashes, current registered-client
grant/account/native session/scopes and current rights. It opens the private DB
query-only and does not initialize a missing family or write an audit/receipt on
download. After the rights callback it rechecks live authority and expiry before
disclosure. Invalid, expired, tampered, revoked or unavailable downloads return
empty404. Responses have bounded Content-Length, application/json, a fixed safe
attachment filename, no-store/no-referrer, nosniff and existing frame denial.
Request abort can hide a response without undoing an already committed export.
Native session state and the export ledger remain separate databases, without
a cross-database linearizable revocation claim.

Retrying an export key returns the original outcome, including its original
expiry; it never extends a capability or reconstructs the old file from a newer
draft. A fresh export needs a new key and a valid selected current revision.

This is an unmounted fetch/adapter implementation. Real root routing, TLS,
persistent distinct signing/encryption/native keys and actual ChatGPT/Claude
linking remain host integration. A successful local RPC/download is not evidence
of a browser download, installed connector or production deployment. Exact-
revision native-save consent and executable Preview/rights remain separate.
