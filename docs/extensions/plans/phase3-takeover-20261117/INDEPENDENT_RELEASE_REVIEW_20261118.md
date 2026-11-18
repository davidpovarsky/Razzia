# Independent release review — Tadazz MCP and private ChatGPT connection

Date: 18 November 2026
Reviewer: independent security/release agent
Worktree: `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-mcp-connect-20261118`
Base commit: `e1482c4219da52bd722e1823190355fa45abf78a`

## Decision

No concrete P0 authorization or tenant-isolation bypass was found in the inspected source. The reviewed production export/catalog delta and guarded deployment script have no remaining concrete release-safety blocker from this review.

The script identified below is acceptable for the operator to run its **pinned backup qualification and isolated candidate boot**. This is a source-review decision, not evidence that production has already been deployed, that a private ChatGPT connection exists, or that every product acceptance item has passed.

The V3 frame producer/consumer, tool-visibility changes and production artifact-loader/compiled-manifest boundary have passed the scoped source review after corrections. Exact final artifact qualification, real browser/CSP evidence, live deployment probes and private ChatGPT end-to-end acceptance remain separate gates. The release owner must attach their actual receipts before marking those gates complete.

The independent security review was source inspection and review communication. After the initial report, the release owner explicitly assigned mechanical lint/type cleanup in production-capabilities.ts and its focused test to this reviewer; those two edits and their validation are disclosed in the follow-up below. Service operations, account consent, runtime key generation and the other implementation remain owned by the release and engineering agents.

## Scope and source identity

The audit started from the base commit above and continued over the uncommitted implementation changes listed below. These hashes bind this decision to the bytes observed at this checkpoint; later edits need review of their material differences, not an assumption that the same decision covers them.

| Reviewed path | Bytes | SHA-256 |
| --- | ---: | --- |
| `extensions/deployment/deploy-mcp-site.py` | 53011 | `a9a447b2007a00cae54b245c69545a4e9ee649e8c00a9a8c04e79873258f9ac5` |
| `extensions/src/mcp-app/native-host/production-capabilities.ts` | 4646 | `f3c05dae4907dea049b7461e6ec31be6210aa433f433cd28e3eb6926b60476c6` |
| `extensions/src/mcp-app/native-host/production-entry.ts` | 2536 | `bcce048fc7cc13661ec95b7c245861c1b62528a1a3d3f3f93f2e1af827b10cee` |
| `extensions/src/mcp-app/contracts/full-show-frame.ts` | 3816 | `20167d12b9efe029abcf83cef0fe5c5eb0d1eb45e78549190a1467d1357927ab` |
| `extensions/src/mcp-app/server/full-show-frame.ts` | 7056 | `3e8e5e35c905bcbb6b7bef82e92bd86d40caa08e40be9cdd24acd9208594f6e8` |
| `extensions/src/mcp-app/client/full-show-frame.ts` | 2213 | `841fd65303e8ebca3af9c7902b24d7719ef488330fd299539bb0f6c372586a81` |
| `extensions/src/mcp-app/server/dispatch.ts` | 9922 | `35979e3ee9b7f6e7058d72b83e19fb67f1e36421dbf1c9cef2d84bbf47334834` |
| `extensions/src/mcp-app/server/http.ts` | 18515 | `9f2007524b80c57570ec1e35bbbb8c778a52b28382ae035634324667a68e004f` |
| `extensions/src/mcp-app/server/factory.ts` | 7000 | `8b961d2142f2250bf98ca2a8a1ceff3f36807358eb774f8db93edfa8c72372be` |
| `extensions/src/mcp-app/contracts/tools.ts` | 6326 | `d1c52ce4cedaed8bdc8557453f9b82348dbfa55d27dc14fec61d1ef309260b7d` |
| `extensions/src/mcp-app/widget/full-show-entry.tsx` | 9895 | `6518ba3116b4fcd0c04c69c790f0fcd77af1a4654dd207845a592d19783cdb3d` |
| `extensions/src/mcp-app/widget/full-show-stage.tsx` | 6720 | `5ef12b695657637121f0939a16c09131f54485f01d2ec1face031097f7390766` |
| `extensions/src/mcp-app/widget/build-full-show.mjs` | 3823 | `44e9a4ff5ef798d9a735bf393b3013f042b28feeb7243fcced71cdd3bb043660` |

Additional inspected baseline areas include native-host configuration/entry/HTTP bridge/consent routes, first-party OAuth protocol/grants/bindings/service/catalog, access-token verification, server authorization/HTTP/resource dispatch, tenant drafts, native save, export authorization, full-show selection and bounded media access.

This is a targeted attack-path and release-safety review, not a claim of exhaustive penetration testing or prolonged-load qualification.

## Findings and corrections

### 1. Mutable policy inputs — corrected

An outer object freeze does not make a JavaScript Set immutable, and retaining an external authoring object would allow a caller to alter an allowlist after policy creation.

The production capability helper now snapshots allowed clients and allowed asset strings into private sets exposed through a frozen read-only facade. Trusted defaults are cloned and recursively frozen. Export normalization uses the stable private authoring snapshot. The production configuration starts with an empty arbitrary-media allowlist.

The owner reported five focused production-capability tests passing, including the important regression where the external allowlist is mutated after policy creation and the newly permitted-looking media is still rejected. Source inspection confirmed the isolation mechanism.

### 2. V3 title update digest — corrected

The first title-only tool implementation supplied a digest of its title input to a repository that validates the full canonical replacement request. That would fail legitimate updates.

The corrected implementation hashes the exact canonical replacement request expected by the real repository, including draft ID, expected revision, idempotency key and authored JSON. It preserves the existing repository's authorization, concurrency and revision checks. The tool is marked non-idempotent at the MCP annotation level because a lost acknowledgement followed by a new read-before-CAS call can safely conflict.

### 3. V3 resource response and lifetime handling — corrected

The previous special response-size allowance covered only the earlier resource URI. The V3 HTML resource could exceed the ordinary JSON response budget even though it was a valid bounded artifact.

The revised HTTP layer gives the bounded 4 MiB allowance only to the exact configured V3 resource URI. The factory also wraps the V3 preview port in the existing work/lifetime guard. This is not an unbounded increase for arbitrary resource responses.

### 4. Raw draft methods visible to the widget — corrected

Adding a bounded summary method alone did not prevent the iframe from using older app-visible raw draft methods.

The tool visibility list now exposes only bounded summary/title and preview methods to the widget. Raw get/update draft tools remain available to the model-side interface, not the app iframe. The new V3 widget uses the bounded paths. The older V2 raw editor is intentionally no longer an accepted editing path.

### 5. Existing production differences require a real restored-clone boot — addressed by release gate

The upstream freeze comparison to the recent handoff is not equivalent to a comparison with the old live image. The earlier review found twelve socket-package files changed relative to the old production baseline, including account database and game/media startup paths.

The deployment script therefore requires a successful, pinned candidate boot on an isolated restoration of a consistent production backup. A green synthetic MCP smoke check alone does not satisfy this condition. This operational gate is implemented; its actual production-data-clone receipt is still the operator's responsibility.

## OAuth and authorization assessment

The inspected implementation enforces exact preregistered client IDs, HTTPS redirect URIs and resource/audience identifiers. It requires authorization-code PKCE with S256 and currently supports public clients using token endpoint authentication method `none`. Dynamic client registration and arbitrary client metadata are not implied.

Access tokens use Ed25519 verification with issuer, audience, time and scope checks. Encrypted tickets are purpose-separated. Live native manager sessions, account state and durable OAuth grants are rechecked for sensitive operations. Logout/revocation invalidates access; confirmed code or refresh-token replay revokes the relevant grant. Persistent records store token digests rather than reusable raw tokens.

The actual issuer creates the trusted principal object; a structurally similar object cannot bypass the principal identity boundary. Tenant repository operations enforce account ownership, strict canonical schemas, revision comparison and idempotency. File handling rejects symlink/hardlink and unsafe journal paths, and reads do not silently create a missing tenant database.

Consent uses exact Host/Origin and proof checks. OAuth consent and the later human authorization to save a particular game revision are separate. The raw Node bridge also constrains ambiguous headers, body sizes, request lifetime and concurrency before constructing the higher-level request.

### Exact ChatGPT client registration

The current supported integration path is a **preregistered public OAuth client with PKCE S256**, using the exact callback reported by the ChatGPT connection workflow. The authorization server advertises issuer identification and includes `iss` on authorization redirects, including error redirects.

Current official documentation describes a stable eligible callback at:

`https://chatgpt.com/connector_platform_oauth_redirect`

The management-provided callback remains authoritative. For integrations that use a callback identifier, the form is:

`https://chatgpt.com/connector/oauth/{callback_id}`

Do not broaden callbacks to a prefix or wildcard, invent a callback ID, or weaken the authentication method to resolve a setup mismatch. The integration must request the intended scopes and demonstrate them in the real connection.

Expected issuer: `https://tadazz.com/oauth`
Expected protected resource/audience: `https://tadazz.com/mcp`

The five supported scopes are catalog read, drafts read, drafts write, library write and exports read under their `tadazz.*` names. The initial resource metadata advertises the catalog-read scope; the actual connection must verify the additional scopes or supported step-up behavior needed by the workflow.

Official references inspected for these registration requirements:

- <https://developers.openai.com/plugins/build/auth>
- <https://developers.openai.com/plugins/deploy/connect-chatgpt>

The application's current public-client implementation and the actual connection metadata must agree; documentation alone does not establish a successful account connection.

## Production export and catalog assessment

The production export callback requires a registered client, a UUID account identifier, a nonempty grant identifier and a supported format. The real issuer separately authorizes the account, grant and scope before and after work. Export policy is therefore not being used as a replacement for OAuth.

The policy strictly normalizes the authored draft and requires exact canonical authored-JSON and summary equivalence. It permits only the exact recognized built-in theme identities. The production arbitrary-media allowlist is empty. The output exports authored data; it does not redistribute built-in theme asset bytes or customer media.

The template added to the catalog is a bounded, explicitly approved public example. Catalog and export wiring must not claim that every theme's rendering or media rights have been qualified. The root owner reported 15 actual-issuer catalog/export regression checks passing in addition to the five production-capability checks; this reviewer inspected the relevant boundaries rather than rerunning those already qualified checks.

## V3 full-show boundary assessment

The producer uses the actual issuer and draft repository. It emits the selected scene/question only. Inventory entries contain bounded identifiers, order, kind and duration rather than future question content. Speaker notes and raw authored JSON do not enter the frame.

Answer options and correctness are phase-dependent; correct-answer information is exposed only in the results phase. Player-role requests are rejected. The current preview supports a constrained set of native question types and choice counts and rejects unsupported media and theme diagnostics. Demo counts are not presented as live player results.

The native scene configuration is constructed from a strict whitelist. Asset URLs must satisfy an explicit allowlist and the mandatory trusted `assertAssets` callback. Authorization and exact draft revision are checked after asynchronous asset work and again before returning the frame. The frame is schema-checked, size-bounded, associated with its input context and frozen.

The consumer validates the frame contract, digests, input context and selected chapter/revision association. The widget ignores stale asynchronous results. It uses the real native visual components for the two currently supported built-in families, with bounded app-visible tools and no socket connection to live game rooms.

**Remaining boundary:** the production policy must bind the renderer and public assets to the generated manifest, verify the actual deployed bytes/rights, and preserve these exact origin/CSP restrictions. Final iframe browser runs must show that the native Stage's assets, including fonts/images/animation resources, actually load under the declared policy. This report does not treat a source-only projection test as that browser proof.

The current preview intentionally mutes audio and uses demonstration results. It does not by itself establish live multiplayer, audio playback, arbitrary media import or every possible theme/question mode.

The full-show engineer reported 18 passing real-issuer/producer/SDK summary-title checks and scoped TypeScript checks after the corrections above. Browser/CSP qualification was still being completed at this report checkpoint.

## Persistent secrets and recovery

Production configuration is loaded from:

`CONFIG_PATH/extensions/mcp-service/runtime.json`

On Linux it must be a bounded regular file, mode 0600, owned by the service UID, with a canonical path and no symlink chain. The root, extensions and service directories must have appropriate ownership and no group/world write access. The file contains persistent signing and ticket material; restart must reuse these keys and the key ID. Existing native JWT configuration must remain stable.

A recoverable backup includes the **whole CONFIG_PATH**, not only one main database: account database and possible WAL/SHM files, each tenant's OAuth/draft database, native games/media, creation journals and runtime keys. Temporary build/test directories belong outside this tree.

The review did not print or copy secret values into this report. The deployment operator's private artifacts and receipts remain access-restricted.

## Deployment script assessment

Reviewed script:

`extensions/deployment/deploy-mcp-site.py`

SHA-256:

`a9a447b2007a00cae54b245c69545a4e9ee649e8c00a9a8c04e79873258f9ac5`

The default mode is preflight. Qualification and deployment require explicit modes and exact source/image/configuration/public-key pins. The script checks the old container, gateway, expected running containers, original mount, networking and process identity. It preserves existing container configuration and environment except the three deliberate MCP/config/socket overrides. Customer temporary storage beneath the protected data root is rejected.

Before stopping, it requires complete retained startup/game-count evidence for the current process and a zero-game state. Startup with no subsequent game events can prove an empty registry because the inspected registry starts empty. Missing/truncated startup evidence and a known positive count fail closed. The script records that a race between this observation and stop is not eliminated.

The private backup is captured while the application is stopped. It records and compares file hashes, modes and ownership, rejects links/mounts/special files, fsyncs the archive and verifies the tree did not change during capture. Extraction is restricted to the exact manifest. SQLite verification occurs on restored copies and includes native backup/integrity checking with WAL preserved.

Qualification restarts the exact old container promptly after archiving, then performs offline restoration checks. Candidate qualification boots the pinned image on the private restored copy with **no network, no published ports and no live data mount**, under explicit resource limits. Probe output is bounded and avoids private records/secrets.

Deployment requires a successful, hash-pinned, recent qualification receipt for the same candidate image, source container/image and runtime configuration. It takes a fresh stopped backup again, retains the old container and starts the exact replacement. Public/internal health, unauthorized native APIs, MCP challenge, OAuth metadata, public JWK, consent headers, web entry assets and Socket.IO handshake are gates.

Failure and handled termination attempt a container rollback to the exact retained old container. The failed candidate is retained for evidence. **Rollback does not overwrite the live customer-data tree** and therefore avoids discarding customer writes that may have happened after startup. Data restoration is a separate controlled recovery operation, not an automatic rollback side effect.

The author reported seven focused synthetic checks passing: precise environment overrides and original-object immutability; duplicate environment rejection; temporary-directory rejection; actual archive/restore/hash/mode/SQLite-WAL verification; same-size content tamper rejection; symlink rejection; and failures before/after replacement creation proving retention and restart without live-data replacement. The script hash was independently verified in both shared scratch and the Windows source snapshot.

## Acceptance still required at this checkpoint

1. Actual private, consistent backup plus restored-clone qualification of the pinned final image and persistent configuration.
2. Final V3 production manifest/asset wiring review and real Chromium/WebKit CSP/renderer receipts for the same candidate source.
3. Final source/artifact identities recorded after all accepted implementation edits, with focused gates rerun only where the delta warrants them.
4. Controlled deployment and passing live health/MCP/OAuth/consent/web/socket gates, or a recorded successful container rollback.
5. Private ChatGPT client registration, real user OAuth consent, app discovery, permitted draft creation/edit/preview, exact-revision native save and reopen/export as applicable.
6. Asana closure based on those receipts and the task's actual acceptance criteria. Source readiness or a test-only preview is not evidence that the whole project is connected and complete.

Known finite limits remain: grants are bounded by the native session and maximum grant duration; access tokens are short lived; repository record quotas are finite; cross-database logout is not a fully linearizable transaction; and prolonged loaded operation has not been established by this review. These do not create a newly identified P0/P1 bypass, but they bound what can truthfully be claimed about the private release.


## Follow-up: final production artifact boundary and mechanical cleanup

This follow-up completes the previously pending source review of production V3 artifact wiring. Actual Linux candidate and live/ChatGPT qualification remain separate gates.

| Follow-up source | Bytes | SHA-256 |
| --- | ---: | --- |
| `extensions/src/mcp-app/native-host/production-capabilities.ts` | 5175 | `4e348c14ba47e3e1ebbef5b72322d42b6720ec7f601efaf71509e5c6ea15e059` |
| `extensions/qa/phase3-native-consent/production-capabilities.nodecheck.ts` | 4313 | `3fc65648f5241a36baedc52cf2c6c10f5273bea0f7d3bf125a45b02172b7369e` |
| `extensions/src/mcp-app/native-host/production-artifacts.ts` | 7505 | `a2e73db0e12af97acab901305071f4a9b0bfd9ab1694b170c6de3698152cf06d` |
| `extensions/src/mcp-app/native-host/production-entry.ts` | 3269 | `bb832e51358929f050006236214df85eae6ae533e900c4cd018678723171da94` |
| `extensions/deployment/build-native-host.mjs` | 5281 | `5621d316ab57648c16f974803e9dca89365f1645e3958bc47b2aff2cde97fdae` |
| `extensions/src/mcp-app/widget/build-full-show.mjs` | 4097 | `461d447f04e83e1c2c1e0fc35366a73489d44e5520fecc01f73159530f3b69d1` |

### Compiled manifest pin — accepted

The native build first verifies the widget HTML hash and the current hash/length of every recorded physical source. It embeds the raw full-show manifest SHA-256 as a literal compile-time constant in the backend. The production entry supplies that constant to the artifact reader with fixed `/app/mcp` and `/app/web` roots.

The reader checks the compiled manifest pin before accepting manifest content. It validates the exact origin/CSP, renderer build identity, unique safe paths, HTML bytes and every public asset. Reads reject symlink parents, symlink/hardlink files, inconsistent descriptor identity and changes while reading. Resource reads and render permission subsequently reject any changed pinned file identity. Custom URLs remain denied, and a live exact-family principal is required alongside the real repository's authority checks.

This closes the specific substitution path where an attacker could otherwise replace both HTML and a self-consistent adjacent manifest before startup. A modified executable backend or privileged filesystem compromise is outside that artifact-substitution boundary.

Per-read checks are synchronous local metadata checks over the bounded artifact set. They do not hold an atomic filesystem lock until a later browser asset fetch. The pinned image and fixed artifact directories, with only the separate configuration tree mounted for customer writes, are therefore part of the release assumptions. No new authorization or tenant-isolation bypass was found.

### Actual qualification reported at this follow-up

The release owner reported six passing Windows loader tests and one platform-specific symlink test skipped on Windows. The Linux symlink test remains pending. These tests include compiled-pin substitution, HTML/asset tamper, post-start change, traversal/wildcard rejection and expired-principal rejection.

The release owner also ran the actual generated artifact through the production loader: approximately **2.716 MB of HTML and 77 public assets passed**. This is a local candidate-artifact acceptance result, not a production rollout or a browser/ChatGPT connection receipt.

### Mechanical production-capability cleanup

The reviewer changed only the production capability file and its focused test under explicit ownership from the release owner:

- The private immutable Set facade now supplies the modern read-only set composition/query methods. Composition results are independent Sets; they do not expose or mutate the private allowlist snapshot. Mutation methods remain absent.
- Trusted-default JSON cloning is typed as unknown before deep freezing. The test's authored JSON is validated through the existing native schema before mutation.
- A private supported-format set preserves runtime rejection of unexpected formats. String/template and callback-return changes are style/type corrections.
- No scopes, callbacks, principals, accepted media rights, native authoring semantics or repository checks were broadened.

Validation run directly by this reviewer with the existing pinned Node 24 runtime:

- Native-consent TypeScript check: passed.
- Five focused production-capability tests: 5/5 passed.
- Scoped oxlint: zero warnings and zero errors.
- Scoped Prettier check: passed.

The initial independent policy judgment remains unchanged. These mechanical edits are disclosed so this report is not represented as an entirely independent review of code authored by someone else.


## Final staging/deployment script review checkpoint

The later packaging review covered the version-2 release stager and the exact-Host clone probe update. These script pins supersede the earlier deployment-script pin in this report:

| Script | Accepted SHA-256 |
| --- | --- |
| `extensions/deployment/stage-mcp-site.py` | `0feb2e920e88ce3e08ead3469c41b4b5eae907d62aeebd548549f2e31cb0ffae` |
| `extensions/deployment/deploy-mcp-site.py` | `b99ce12f1ccebe40c947b1e6fcf7faebc073fe0bd5a5a60359a48b15081ed09a` |

The stager binds five qualification receipts to the exact source revision, source trees, backend/widget/web bytes, Linux launch result and Chromium/WebKit scenarios. It creates only a fresh private release directory/image and a synthetic configuration for a network-isolated smoke container. Private evidence, generated test keys and build logs are excluded from the Docker build context; the synthetic keys are created after the build. Existing runtime configuration is neither mounted nor overwritten by staging.

Two concrete review findings were corrected and rechecked:

1. Backend, HTML, raw manifest and Nginx bytes are now rechecked against the qualified pins immediately before copying. The previous stager could accept one set of bytes and copy changed build output later; the downstream backend pin would have rejected deployment, but staging could misleadingly finish successfully. The new focused changed-after-qualification witness rejects before writing the target.
2. Deployment now requires a version-2 stage manifest with `imageId` equal to the actual candidate image SHA, and requires the synthetic smoke file's hash and image identity to match the pinned stage manifest and candidate. This prevents pairing another same-revision image with the accepted staging receipt.

The clone smoke probe now uses raw Node HTTP to preserve the exact `Host: tadazz.com` boundary through local Nginx. It retains no-network/no-published-port isolation, fixed public-key checks and redacted output.

The script author reported five stager self-checks and seven deployment self-checks passing. The reviewer verified the corrected source and exact hashes. No remaining concrete source-level safety/contract blocker was found in these script paths; actual execution and resulting production/connection receipts remain the release owner's acceptance evidence.
