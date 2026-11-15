# Native Save consumer and separate first-party consent contract

The consumer is source-qualified against exact B product
`1909da2f653377c545923b2e91dd2f4b1a2cf802`: ten real F/C1 integration cases pass
on local WSL Linux/ext4 with Node26.11.1, including three genuine process kills
and fresh-process retries. The scoped production/test type check reports zero
diagnostics. See the native-save QA packet for immutable inputs, raw logs and
limitations. Default composition stays off; browser and production acceptance
remain separate.

Optional `createFirstPartyOAuth({ nativeSave: { authoring, operations,
consentPageUrl } })` consumes B's actual optional durable C1 operation port.
The root host supplies its `createNativeCreationPort({...actualEnvironment,
enableOperationBindings:true}).operations`. The real first-party consent page
and issuer origin must be explicitly configured and allowed. The existing
`oauth.storage` is then available for the existing remote `dependencies.storage`.
No C1 engine, schema, target allocator, repair routine or OAuth store is copied.

The model's first authorized `save_game` creates a private pending request in
the existing tenant ledger and returns `CONSENT_REQUIRED` with request ID and
first-party URL. It cannot authorize native publication. Request IDs are54 opaque
characters; the page URL is `<consentPageUrl>/<requestId>` with no query/hash,
as required by the existing MCP URL boundary. A suggested host route is
`/studio/native-save-consent/:requestId`; the host must provide the actual page.

Under the configured issuer prefix, the new machine endpoints are:

- POST `/oauth/native-save/inspect`, JSON `{ consentRequestId }`.
- POST `/oauth/native-save/approve`, JSON
  `{ consentRequestId, decision: "allow", proof }`.

Both require the real native manager JWT/session and exact same-origin Origin/
Host, JSON body, body limits and existing protected headers. An MCP access token
cannot substitute for that first-party authority. Response shape is
`{ contractVersion: "0.1.0", ok: true, data }`; failures use the existing safe
MCP error codes. The existing OAuth-scope inspect/approve APIs are unchanged.

Inspection data contains version1, consentRequestId, actual accountId/clientId,
draftId/revision/summary, the exact authoredShowJson, authoredDigest, expiresAt,
and state `pending|approved|publishing|saved|expired`. Only a live pending request
has a proof. The proof binds the actual native manager session to the signed
immutable request. Approval returns version1/state approved, consentRequestId,
draftId/revision/expiry. **Approval allocates no native game and returns no
native success.** The model retries the original tool/key to perform the save.

The existing E owner should reuse its real account/profile checks, eight locales,
Rubik/theme conventions, abort/session-change protection and explicit human click.
Show the account, requesting client, exact revision and actual snapshot/summary;
discard copied/stale proofs and do not reuse OAuth-scope approval as Save consent.
The root host must apply frame-ancestor denial/no-referrer/no-store to the actual
HTML and HEAD route before the page acts. This document creates no HTML route.

The consumer keeps the existing primary grant/tool/key/digest decision before
mutable draft reads. Pending/approval/native snapshots live in existing operations
rows; a same-grant consent index uses real grant IDs, without a new table or a
fictional grant. Intent/approval/outcome MACs use separate purposes. Native
operationId binds the authenticated tuple; authorizationDigest additionally
binds exact approved authored/native snapshots and consent. Correlation IDs do
not alter operation identity. Publishing is committed before crossing C1. The
next transaction performs no SQL write before actual native commit, then records
the original validated result and outcome MAC. Genuine C1 committed lookup is
consulted before current draft reads; reserved/unresolved evidence is denied,
never turned into a second create. Existing hot-journal/corrupt-family denial
remains unchanged. Unknown failures do not authorize recovery or success.

The returned native editor URL uses the existing real
`/manager/quizz/:quizzId` route and its StudioShell. The integration test reopens
the actual persisted native game with `getQuizzById`, verifies the native base,
and verifies sidecar question IDs against the one persisted native snapshot.
It does not drive a browser. Actual HTML/HEAD headers, TLS, keys, root wiring,
human page approval, browser reopening and external host installation remain
integration acceptance work. This backend packet does not make G ready.
