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
