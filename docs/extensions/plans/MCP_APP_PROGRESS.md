# Tadazz MCP App - current progress and release entry point

Updated: 2026-11-18. This ledger is the current continuation entry point; historical packets retain their original source and outcome.

## Current state

**IN_PROGRESS. Production is not yet cut over; neither installed ChatGPT nor installed Claude is verified.**

The owner explicitly authorized implementation, production deployment, private connection, and Asana updates in the current conversation. Earlier STOP/no-deploy notes belong to historical checkpoints and do not override this continuation. Existing stopped Cezar managers remain stopped.

- Active branch: `codex/tadazz-mcp-connect-20261118`.
- Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-mcp-connect-20261118`.
- Handoff base: `e1482c4219da52bd722e1823190355fa45abf78a`.
- Pushed implementation milestone: `2a9db28b0a04cc58b9b459ef18ec4aa1ec6de470`.
- Current committed controller checkpoint: `9c8b1081f07c608e03946deec14351d27d6cca57`; semantic/media/transport changes are still being qualified. Do not deploy this checkpoint as if it contains the later work.
- Production baseline: `tadazz:design-system-bff12a6`, image `sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`.
- Final source, image, backup, rollout and installed-host receipts will be recorded below after actual execution. A Windows pass is not an immutable Linux or production pass.

## Acceptance ownership

| Asana scope                              | Current state                          | Required final evidence                                                                                                      |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| MCP02 protocol and SDK                   | IMPLEMENTED_UNVERIFIED on final source | Exact 14-tool discovery, schemas, resources and capability/fallback checks                                                   |
| MCP03 OAuth                              | IMPLEMENTED_UNVERIFIED on final source | Real issuer/client isolation, PKCE, tokens, consent/security and production configuration                                    |
| MCP04 draft/save/export                  | IMPLEMENTED_UNVERIFIED on final source | Final Linux semantic edits, explicit consent, save, Studio/editor reopen and JSON/native roundtrip                           |
| MCP05 native full-show                   | IN_PROGRESS                            | Both native families, pause/resume/replay/skip, result variants, dimensions, accessibility and one clock/audio owner         |
| MCP06/07 widget and conversational edits | IN_PROGRESS                            | Implemented browser flow plus actual ChatGPT and Claude account E2E                                                          |
| MCP08 reviewed media                     | IMPLEMENTED_UNVERIFIED on final source | Authorized bytes/identity/theme/purpose, media/motion preservation and native parity                                         |
| MCP09/10 installed hosts and combined QA | NOT_STARTED for final release          | Both real accounts, discovery, preview/edit/save, reconnect/upgrade, explicit PASS/FAIL/NOT_RUN matrix                       |
| MCP11 release and handoff                | IN_PROGRESS                            | Immutable receipts, independent review, verified private backup/restore, rollout, observation and exact host outcome/blocker |
| Parent                                   | OPEN                                   | Cross-host experience and remaining acceptance fulfilled                                                                     |

See [independent review](phase3-takeover-20261117/INDEPENDENT_RELEASE_REVIEW_20261118.md), [native consent evidence](phase3-takeover-20261117/NATIVE_CONSENT_QUALIFICATION.md), [full-show ledger](phase3-takeover-20261117/FULL_SHOW_IMPLEMENTATION_LEDGER.md), and [production continuation](phase3-takeover-20261117/PRODUCTION_COMPLETION_20261118.md).

## Public protocol and exact clients

These are the intended configured production URLs. The last pre-cutover observation still returned SPA HTML for MCP/OAuth; only the rollout receipt can establish that they are live.

| Purpose                       | URL                                                               |
| ----------------------------- | ----------------------------------------------------------------- |
| Streamable HTTP MCP resource  | `https://tadazz.com/mcp`                                          |
| Protected resource metadata   | `https://tadazz.com/.well-known/oauth-protected-resource`         |
| OAuth issuer                  | `https://tadazz.com/oauth`                                        |
| Authorization server metadata | `https://tadazz.com/.well-known/oauth-authorization-server/oauth` |
| Authorization                 | `https://tadazz.com/oauth/authorize`                              |
| Token                         | `https://tadazz.com/oauth/token`                                  |
| Revocation                    | `https://tadazz.com/oauth/revoke`                                 |
| Public signing keys           | `https://tadazz.com/oauth/jwks.json`                              |
| Health                        | `https://tadazz.com/api/health`                                   |

OAuth uses exact preregistered public clients, S256 PKCE, resource/audience binding and an explicitly approved first-party account session. It does not infer dynamic registration or wildcard redirect permission.

| Host    | Public client ID                  | Exact redirect URI                                      |
| ------- | --------------------------------- | ------------------------------------------------------- |
| ChatGPT | `tadazz-chatgpt-private-20261118` | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Claude  | `tadazz-claude-private-20261118`  | `https://claude.ai/api/mcp/auth_callback`               |

The five scopes are `tadazz.catalog.read`, `tadazz.drafts.read`, `tadazz.drafts.write`, `tadazz.library.write`, and `tadazz.exports.read`. The ChatGPT package uses provided-client mode with token endpoint auth method `none`; no client secret is invented. Private signing/ticket keys remain only in the root-owned server configuration, outside Git and public evidence.

Current issuer code limits an access token to five minutes, an authorization code to two minutes, and a grant to at most 24 hours and the underlying approved session expiry. Refresh tokens rotate and reuse revokes the corresponding grant. Expiry/revocation denies access; it is not a claim that stored drafts, durable mutation records, audit records or native saved games are deleted.

## Tools, schemas and resources

Contract version: `0.1.0`. The authoritative strict input/output definitions are [contracts/tools.ts](../../../extensions/src/mcp-app/contracts/tools.ts), [semantic-edit.ts](../../../extensions/src/mcp-app/contracts/semantic-edit.ts), and [full-show-frame.ts](../../../extensions/src/mcp-app/contracts/full-show-frame.ts). The live MCP discovery response must match these; do not maintain a second hand-written JSON schema.

| Tool                     | Purpose                                                               | Required scope suffixes (all prefixed `tadazz.`) |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------ |
| `list_game_templates`    | Reviewed account-authorized templates                                 | `catalog.read`                                   |
| `list_themes`            | Exact built-in theme versions and capabilities                        | `catalog.read`                                   |
| `create_game_draft`      | Private validated draft                                               | `drafts.write`                                   |
| `get_game_draft`         | Canonical draft and ordered bounded question references for the model | `drafts.read`                                    |
| `get_game_draft_summary` | Bounded selected-state summary                                        | `drafts.read`                                    |
| `apply_game_edit`        | Revision-bound approved semantic edit                                 | `drafts.read`, `drafts.write`                    |
| `undo_game_edit`         | Durable inverse of an acknowledged edit                               | `drafts.read`, `drafts.write`                    |
| `list_editing_assets`    | Exact permitted asset references                                      | `drafts.read`                                    |
| `update_game_draft`      | Revision-bound canonical replacement                                  | `drafts.read`, `drafts.write`                    |
| `preview_game`           | Existing bounded preview/fallback                                     | `drafts.read`                                    |
| `preview_show`           | Version 3 native selected-chapter full-show demo                      | `drafts.read`                                    |
| `update_game_title`      | Compatible revision-bound title edit                                  | `drafts.read`, `drafts.write`                    |
| `save_game`              | Explicit first-party-approved native library save                     | `drafts.read`, `library.write`                   |
| `export_game`            | Authorized exact JSON or enhanced native bundle                       | `drafts.read`, `exports.read`                    |

Resources include `ui://tadazz/full-show/v3.html`, the existing `ui://tadazz/quiz-preview/v1.html`, `tadazz://authoring/v1/schema.json`, and `tadazz://authoring/v1/guide.md`. The deployed V3 HTML is static and pinned by the backend manifest; raw authored content is not interpolated into HTML. The iframe receives only an authorized current chapter and bounded summaries. It runs a demonstration, without a live room, real player or cast vote. Unsupported host UI must retain bounded text/fallback behavior.

Final host receipts record the exact SDK versions, browser versions, source manifest, compiled backend hash, widget manifest/HTML hash and physical inputs. The previously inspected MCP server/client/core cache is 2.4.0; the final receipt is authoritative. The existing `extensions/tds.catalog.vite.config.ts` catalog and native presentation components remain the renderer references; no second gameplay engine or frozen-editor fork is introduced.

## Data, media and operational limits

- Draft, grant, operation and inverse-edit state remains account/grant scoped on the server. Model/user strings never authorize a different account, filesystem path, grant or arbitrary media URL.
- Mutations require the exact revision and stable idempotency key. A successful edit acknowledgement is a private draft update; library save additionally requires the actual first-party consent flow.
- Built-in media is accepted only through the reviewed manifest, exact asset hash/path/size/theme/purpose and current file identities. JSON reference export is a separate explicit permission; it does not authorize binary redistribution or arbitrary tenant media.
- Existing account rate limits remain 120 reads and 30 mutations per minute. The browser harness is paced; production limits are not raised to obtain a test pass.
- Static UI resource serialization is bounded by the existing 4 MiB response gate. Full-show frames, inputs, exports and media streams retain their independent schema/byte limits.
- Audit records capture operation kinds/IDs/digests and timings, not authorization headers, signing keys, raw customer drafts or passwords. Production raw logs and backup content must not be copied into Git/chat.
- No automatic data-deletion promise is made. Retention/deletion of durable drafts and saved native games follows explicit account/operator handling; reconnect/revoke tests must not delete customer state.

## Reproducible release gate

1. Commit the final integrated source with `packages/**` unchanged. Preserve all old failures/evidence and the immutable lint baseline source.
2. Run `extensions/qa/phase3-recovery/linux-verify.py native-launch` on that exact HEAD. This includes the expanded HTTP/issuer/semantic matrix, strict new-code checks, an explicit historical lint comparison, widget/backend/site builds and the separate production-image launcher.
3. Run `extensions/qa/phase3-native-consent/browser-verify.py <SOURCE_RUN>`, `extensions/qa/phase3-full-show/linux-browser-verify.py <SOURCE_RUN>`, and `extensions/qa/phase3-native-consent/proxy-verify.py --source-run <SOURCE_RUN> --immutable` against the same compiled inputs. The proxy gate must prove protected URL/query/Referer exclusion on success, denial and upstream failure, with positive ordinary-log controls. Recovery qualification has its own command and receipt.
4. Copy and hash-check all five outer receipts: host, launch, consent browser, full-show browser and immutable proxy. Stage with `extensions/deployment/stage-mcp-site.py` including `--proxy-receipt`; the host receipt may also represent the web receipt only under its exact-source/gate identity check.
5. Use `extensions/deployment/deploy-mcp-site.py --action qualify-backup --qualify-candidate` with exact source/image/container/config pins. The private archive must restore byte-for-byte with modes and SQLite validation, and the candidate must boot on that isolated restored clone.
6. Use the same guarded deployer with `--action deploy` and the pinned successful qualification receipt. Preserve the old container, all original environment except its declared overrides, the customer mount and every unrelated running container.
7. Verify loopback and public HTTPS JSON/auth metadata/JWKS, unauthenticated MCP 401 challenge, consent GET/HEAD security headers, built site asset hashes, and synthetic Engine.IO open/close. Then record bounded live observations and actual installed-host results.

The final deployment is recorded in a separate result section after execution. Historical freeze reports still contain 23 baseline mismatches; all 23 files were unchanged from `34cfd464ac0bba432701b87f10f4f8388d665066`. Historical broad TypeScript/lint limitations are not declared green by scoped checks.

## Rollback, revoke and observation

The deployer automatically returns to the retained original container if startup/smoke/restore verification fails, preserving current customer writes and never restoring a backup over live data. The successful deployment receipt names the exact replacement, retained container, images, private archive/hash and qualification.

For a later operator rollback: identify the exact containers/images from that receipt; check active rooms and customer traffic; stop only the replacement; retain it under a distinct failed-release name; restore the original container name and start it; rerun health/auth/base-route/transport probes. Do not overwrite the customer mount with an older archive. A data restore is a separate explicitly scoped incident operation, not an automatic consequence of reverting an image.

Revoke the relevant host grant through the supported OAuth revocation endpoint with its registered client and token, then remove the host connection where appropriate. Verify revocation; merely removing a UI entry is not server-side proof. Reauthorization after revocation creates a new approved grant and maintains account/client isolation; refresh/reconnect on an existing active grant retains its durable operations. Never put tokens into command history, public receipts or task notes.

After rollout, run `extensions/deployment/observe-mcp-site.py` with the exact deployed container/image/gateway IDs and rollout timestamp to record bounded endpoint status/content-type/latency samples, restart counts before and after the window, and sanitized error-category counts since rollout. Keep raw private logs on the server. Verify the phone gateway and unrelated container identities remain unchanged. A short observation window proves immediate health only, not long-term reliability.

## Actual host connection

The private package is `extensions/plugins/tadazz` (version 0.1.0). Upload through the supported Plugin Creator and record the returned plugin/release URL; an uploaded package is not an installed or authenticated account. Use the Plugin Management connection card, complete OAuth and then exercise discovery, five-question draft, native preview, semantic edits, explicit save, Studio reopen, export, reconnect and version upgrade where supported.

An actual Browser-plugin security rejection currently prevents navigation to the ChatGPT management page: the host-access gate did not grant `chatgpt.com`. This is an observed host automation restriction. Do not bypass it with another browser, CDP, Windows UI or indirect session. The supported Plugin Creator/Plugin Management connection flow remains available. Record any required user login/consent explicitly instead of claiming host E2E.

Claude has its own registered public client and supported connector flow; it requires a separate actual account proof. Unsupported or blocked host cases remain BLOCKED/NOT_RUN with the exact observed reason, and the parent remains open until its cross-host acceptance is achieved.

## Applied edge-log privacy checkpoint

At 2026-11-18 06:30:47 UTC, the active Caddy 2.6.2 logging encoder was changed to remove request URI and Referer fields. The independently qualified isolated fixture preserved 502 diagnostics without retaining those capability-bearing fields. The guarded production application verified the exact before/candidate/binary pins, revalidated as the Caddy service user, atomically replaced the configuration, reloaded Caddy and read back active/persisted configuration. Health and the existing application and phone-gateway identities remained unchanged. Only the logging encoder changed; application rollout is still pending.

Sanitized applied receipt: `/var/tmp/tadazz-caddy-privacy-candidate-20261118-73642f/caddy-log-privacy-applied.json`. Current Caddyfile SHA256: `101381b7b10b99f72573584de230498119639e6c26ec8bf8439aeed4a534ba24`. Private configuration and backups stay off Git.

## Final execution receipts

Pending: final integrated commit, Linux native/launch/browser/recovery, stage/image, private restore qualification, live rollout/observation, private plugin URL, ChatGPT/Claude E2E, and corresponding Asana readback.
