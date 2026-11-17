# Native host implementation ledger

Scope: downstream `extensions/src/mcp-app/native-host/**`, its QA fixtures and
the Studio native-save consent branch only. No `packages/**`, editor, global
CSS/provider, credential or data-schema edit. All preserved fd341b34 source is
read-only; copied WIP is a candidate until independently exercised here.

Use the accepted protected MCP raw-header Node listener unchanged for all MCP/
OAuth machine requests. Harden the WIP composition before mounting: reject
ambiguous normalized request paths; reserve configured machine namespaces from
SPA fallback; bound non-machine work with deadlines and body limits; propagate
client cancellation; stream responses with backpressure instead of unbounded
arrayBuffer buffering. Keep feature disabled by default and loopback binding
unless explicit trusted configuration enables the host.

Studio reuses the existing NativeSaveConsentPage and its actual account/profile,
exact-revision client, explicit click, original-key retry and abort guards. The
new branch is gated by a dedicated build flag. Test with existing native account,
OAuth, C1 and Studio APIs on synthetic fixtures, never customer data.

Qualification requires real HTTP/HEAD HTML security policy and JSON discovery,
PKCE/scope/tenant/CSRF negatives, same-account save/reopen, and real Chromium/
WebKit human-click flow. Synthetic browser proofs will not be called installed
ChatGPT or Claude acceptance. Preserve failed attempts and exact source hashes.

Local focused QA now resolves the repository's existing workspace source paths
instead of a stale dependency junction and supplies the bundler's CSS ambient
types. This is QA-only; production imports, root aliases and protected sources
are unchanged. The earlier broad MCP TS147 baseline is not relabeled green.

The original task-created MCP dependency junction pointed to an empty cache.
It was preserved under QA .dependency-links; the replacement uses the stopped
worker's existing exact SDK2.4.0 installation read-only. No dependency upgrade,
installation or preserved-worktree edit occurred.

First native Linux attempt ran out of QA tmpfs while transferring source, before
product tests. Preserved all scratch/evidence and switched new task-owned source
to ext4 with a minimum free-space check. No filesystem cleanup was performed.
The consent-only site build keeps the tracked preview-build manifest unchanged;
it does not qualify the separately pending full-show runtime.

Linux45b266b with the exact existing SDK linked produced10 PASS,2 FAIL,
1 interrupted/timeout in the HTTP packet; types/lint/format PASS. Preserved
receipt: `tadazz-codex-45b266bd74ae-6f7c237d-retry-02713f83/receipt.json`.
The WIP header fixture lacked explicit account DB bootstrap, and the native
quiz-list fixture incorrectly assumed an array instead of the actual `{quizz}`
wire response. Both fixture repairs preserve strict product auth/contracts.

The real Socket.IO shutdown also stalled with an idle non-HTTP socket. A local
TCP regression failed before repair and passed afterwards. Root shutdown now
closes sockets concurrently with Socket.IO instead of waiting for Socket.IO
first, and explicitly stops the existing Registry cleanup timer only when this
host owns initializeNativeRuntime. No protected Registry source was changed.
Local TCP5/5 now passes. Linux/native-save/browser rerun remains required.

The QA transfer now streams a validated immutable Git archive directly into a
fresh ext4 source directory. It avoids additional host/container archive copies
and preserves old evidence. Task-owned scratch cleanup remains pending the
owner's answer to the explicit narrow cleanup question.

The next Linux packet on a9a3fe2 completed in9.455s (12 PASS,1 FAIL), with
types/lint/format PASS and no shutdown timeout. The remaining failure was the
Node-only browser-client fixture not supplying the Origin a real browser adds.
It now supplies that exact origin; the separate missing-Origin negative remains
403. The B-account negative now sends the actual consentRequestId DTO, uses B's
real OAuth ledger, and asserts the accepted ledger's exact uniform503 /
DEPENDENCY_UNAVAILABLE refusal plus no leaked snapshot. A's valid inspection
and approval must succeed afterward, so generic service failure cannot pass.
Windows passes the HTTP flow while explicitly requiring POSIX/C1 denial; Linux
still must prove actual save, drift409 and idempotent reopen before acceptance.

Before the next bridge edit: preserve the existing native POST /api/media cap
(MAX_MEDIA_SIZE + 64 KiB multipart overhead) instead of imposing the new generic
16 MiB cap on uploads. Scope: native-host/node-bridge.ts and focused TCP QA only.
Stream bounded bodies with backpressure so native authorization can run before
upload completion; limit concurrent media requests separately to two. Keep the
generic cap, machine raw listener, native authorization and media validator
unchanged. Verify large upload compatibility, declared/chunked overflow,
pre-body refusal, concurrency and disconnect/timeout behavior before acceptance.

Fresh no-network browser QA on c4125d58a746 verified all1669 source hashes and
ran Chromium/WebKit successfully, but all six scenarios failed: the top-level
downstream site router omitted /studio/native-save-consent/$requestId and showed
404. Before editing: add that one feature-gated route in site/bootstrap.tsx,
and allow only the exact 54-character query/hash-free local consent destination
after login in site/adapters/client.ts, with focused security regression cases.
No generated/native editor route, provider, typography or package changes.

7141211 immutable Linux: HTTP16/16, types/lint/format/site-build PASS; all1671
source hashes unchanged. Fresh browser127.315s:1/6 PASS (Chromium all8 locales),
5 FAIL. Positive flows reached a recorded real browser approval but the QA text
locator matched both the definition and live status; use the semantic status
region. B's generic failed alert is correct for the accepted uniform503 refusal;
the QA now also requires the exact API status/error, disabled approval and no
snapshot. WebKit navigation waited for URL before Studio finished mounting;
wait for the authenticated email in the real Studio before starting OAuth.
These are pending QA repairs, not claimed passes. Preserve both failed receipts.
Reuse only hash-identical task-owned SDK cache copies, mounted read-only, to
avoid copying66 MiB on every bounded browser run. Record SDK hashes before/after.

163cb92 immutable Linux again passes HTTP16/16, types/lint/format/build, all1671
hashes. Fresh browsers167.454s:4/6 PASS; both engines pass the negative security
packet and all8 locales. Both positive flows performed trusted approval, MCP
retry/native save and Studio navigation, then failed because a title text
locator also matched a hidden delete-dialog description. Require the actual
game heading by exact accessible name; the editor and B-account reopen checks
remain mandatory afterward. SDK cache hashes before/after match. Not yet a full
browser acceptance and not production/ChatGPT evidence.
