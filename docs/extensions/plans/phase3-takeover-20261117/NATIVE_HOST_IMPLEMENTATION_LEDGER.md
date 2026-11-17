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
