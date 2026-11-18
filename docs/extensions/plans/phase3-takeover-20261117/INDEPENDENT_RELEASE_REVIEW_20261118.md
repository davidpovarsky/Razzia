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

## Semantic editing follow-up — working-tree verification, 18 November 2026

This section records implementation verification by this lane. The semantic
issuer implementation below was authored by this reviewer and separately
cross-reviewed by the Asana/acceptance lane; it is not represented as an
independent review of the reviewer's own code. Production integration and the
baseline checker were reviewed read-only. No production service, account data,
key material, or Git HEAD was changed by this lane.

### Implemented authority boundary

- Raw model JSON retains the original strict authoring admission. Server-owned
  persisted JSON uses a separate stored-state validator. Only a selected semantic
  command can introduce approved presentation fields.
- The actual issuer owns selected title/question changes, native voting volume,
  exact builtin theme selection, reviewed background/music refs and pictures for
  existing answers. Image selection never invents answer content or correctness.
- Every operation requires the issued principal, current account/grant scopes,
  owner database, compare-and-swap revision and durable per-grant idempotency.
  Authorized ledger replay precedes mutable draft lookup; digest binds the exact
  parsed command plus operation kind/version.
- Private undo receipts require the exact original after revision and canonical
  snapshot. Undo restores the selected change and appends a revision. Available
  undo discovery survives issuer restart.
- Raw content replacement preserves approved presentation and image settings.
  Native-save receipt/current-draft checks share stored validation and retain
  separate exact-revision human consent.
- URLs bind to exact current theme, purpose, operation, catalog hash and deployed
  bytes. Foreign root/card URLs, query variants and unrelated defaults reject.
  Theme switches preserve independent volume/card content; incompatible
  family-specific media rejects before any revision or content mutation.

### JSON reference export distinction

This supersedes earlier blanket statements that semantic media JSON export is
unavailable. `tada-json` returns canonical authored JSON; `enhanced-bundle` uses
the existing pure native converter and JSON serializer. Neither fetches,
packages or embeds asset bytes.

The explicit `json-reference-export` operation permits only reviewed public URL
references under exact family/purpose/hash/current-byte checks. Production's two
JSON formats use it. Generic `export`, theme-package redistribution and arbitrary
or customer asset-byte export remain denied. Current rights are checked again
at download and replay; successful earlier export does not preserve revoked
permission.

### Verification actually observed

Final Windows working-tree focused run using Node 24.22.1 and pinned tsx:

- `extensions/qa/phase3-full-show/semantic-edit.nodecheck.ts`: **13/13 PASS**.
- `extensions/qa/phase3-native-consent/builtin-asset-policy.nodecheck.ts`:
  **6/6 PASS** using actual repository bytes.
- `extensions/qa/phase3-native-consent/production-capabilities.nodecheck.ts`:
  **5/5 PASS**.
- Combined focused run: **24/24 PASS**, no skips.
- Full-show and native-consent TypeScript projects: **PASS**.
- New semantic contracts/helpers, authoring helper and production capability
  helper: scoped strict lint passed. The semantic test passed scoped lint.
- Four legacy integration files retain **431 historical diagnostics**. A
  read-only diff scan found **zero diagnostics starting on added lines**, after
  nine new integration style issues were corrected. This is not whole-repository
  lint success; the final baseline comparator is the required gate.
- Additional existing Windows regressions: **29/31 PASS**. Two POSIX-dependent
  checks remain for Linux: private 0600 mode is reported as 0666 on Windows, and
  a live WAL/SHM snapshot read raised EBUSY. Neither test was weakened.

The actual-issuer tests cover selected-only editing/no raw-source response,
ledger-first replay, reused keys, persistent undo/restart, native volume and
picture conversion, exact media context, bounded owner asset discovery, forged
principals/missing scope, cross-grant undo, concurrent CAS, revoked grants, real
JSON reference downloads for both formats and rights withdrawal at delivery,
foreign persisted-state rejection and safe theme switching.

### Read-only integration and remaining gates

The production loader still requires the backend-compiled manifest hash,
matching HTML/public-byte hashes and current file identities. The closed
builtin resolver reaches the production authoring policy. Preview checks
active/enabled/unexpired principal and exact family; the frame producer checks
each URL's purpose and rereads actual issuer state after asynchronous work.
No new concrete auth/tenant/media-path blocker was found in that source review.

The legacy lint comparator runs unchanged rules and dependencies against the
candidate and exact baseline `9c8b1081f07c608e03946deec14351d27d6cca57`.
Every diagnostic label must map to identical contiguous source lines, metadata
and multiplicity. The controller hashes both trees before/after and mounts the
baseline read-only; new helpers separately require zero errors. Source review
found no blocker; the final execution receipt remains required.

Remaining release proof: exact-final-SHA Linux POSIX/regression gates; enhanced
native-consent save/API snapshot/frozen-editor parity; corrected full-show
browser/audio run; final manifest/source pins; consistent backup and restored
candidate/controlled deployment receipts; and actual ChatGPT/Claude OAuth,
tools, widget, save and export acceptance. Earlier baseline QA does not replace
these final checks.

## Final site provenance and native-save platform review

This final read-only source review supplements the earlier checkpoints. Final
Linux/native-save, pinned Chromium/WebKit, production rollout and actual-host
acceptance receipts are still pending; none are inferred from this review.

### Site source provenance — accepted

The observed Windows site build had resolved first-party extension code from
an older sibling worktree through the shared dependency cache. The site config
now aliases `@razzia/extensions` to this checkout's real `extensions/src`.
The bundle guard resolves each existing physical module path through realpath
before testing containment in the selected checkout. External modules must be
in a `node_modules` dependency path and must not be first-party `@razzia` or
pnpm-encoded `@razzia+` packages. File-URL and Vite `/@fs/` IDs are handled;
virtual module IDs are excluded.

The former broad source-directory name classifier has been removed. The new
guard rejects the observed sibling-worktree and Linux cleanup-tree substitution
without treating unrelated third-party directory names as first-party source.
Qualified dependency-store hashes remain necessary for the external dependency
set; this module-graph guard supplements those immutable build gates.
No concrete blocker was found in the scoped source review. The release owner
reported the alias corrected the observed Windows site build; final qualification
must run the tighter guard on the pinned release source.

### Native-save Windows failure — expected fail-closed platform boundary

The enhanced Windows consent scenario reached create, five semantic changes
and trusted native browser approval, then its `save_game` retry returned failure.
Read inspection confirms the semantic authoring policy is propagated through
the QA host, first-party service, OAuth issuer and native-save adapter. Both
receipt and current-draft checks use the shared stored-state validator.

The native-save retry intentionally calls `operations.lookup` before reading
the mutable draft. In `server/storage/creation-reservation.ts`, `lookupOperation`
begins with `requireLinuxFences()`. In `server/storage/durable-files.ts`, that
guard rejects non-Linux hosts because C1 depends on qualified hard links and
directory fsync. The original native-host E2E test explicitly expects
`DEPENDENCY_UNAVAILABLE` for the final save on Windows, while Linux is required
to exercise successful publication and the revision-conflict gate.

Consequently this Windows failure does not establish a new semantic admission
defect. It is not a positive native-save result either. No runtime platform guard
or test assertion was relaxed. The enhanced real-browser positive scenario,
including exact edited revision and frozen-editor roundtrip, remains a required
Linux/ext4 gate.

### Final matrix stager and selected-text check

The final stager's required full-show outcomes are now bound to the containing
browser engine, not only a global set of names. The added negative witness
moves a WebKit outcome into the Chromium bucket while retaining all names and
is rejected. This closes the concrete engine-attribution gap found in review.
Semantic test membership, strict new-file lint/type checks, exact legacy
baseline comparison and source/widget/web artifact pins remain required.

Selected question/title/answer strings in the reviewed native Stage, V4 leaf
components and original AnswerButton/QuestionEntrance paths use React children
or React attributes. No raw-HTML interpolation sink was found in that bounded
path. Asset URL authorization remains a separate enforced boundary.

A separate image-only presentation discrepancy was identified: the classic V4
answer caption falls back to alt text if title is empty. The engineering lane
has queued explicit display-mode propagation and an initial-volume correction
after the current pinned browser run. Those focused diffs and their relevant
proof must be reviewed before claiming the visual acceptance is complete.

Source pins at this checkpoint:

- Site config SHA-256: 54bc638b86de70e1de6163790ccc98db4da66f585924fe84f4f055e650acf833
- Final stager SHA-256: 2474ee6e7e2b2d25288a83fe5a2d7f63f0a541ec865125bf93c9b4f7c3e2d503

## Final backend acceptance and peer review checkpoint

### Independent implementation review by the release owner

The release owner independently inspected the semantic-edit contract,
oauth-semantic-drafts, semantic-state and semantic-drafts implementations and
their issuer/store/authoring/drafts/capability/dispatch/factory/HTTP integration.
The review followed authority checks before and after the owner transaction;
grant/client/account/scopes/expiry; owner and revision CAS; operation digests;
durable replay and undo reproduction; bounded receipts; selected-question
identity mapping; stored-state versus raw-model admission; media
theme/purpose/hash checks; JSON-reference export; and tracked HTTP work.
The release owner reported no concrete blocking issue in that bounded review.

The same reviewer inspected the builtin resolver and reviewed allowlist:
fixed HTTPS origin, safe exact paths, hash/length pins, immutable copied
manifest records, family/version/purpose binding, current-byte verification,
generated refs, alias deduplication and explicit store/preview/reference-export
permissions. No blocking implementation gap was reported. Raw runtime callers
must continue to enter through parsed contracts. Neither review is represented
as an independent test result or proof of deployed bytes.

### MCP02/03/04 coverage corrections and observed tests

The existing SDK protocol and HTTP discovery tests still expected eight tools.
They now independently require the fourteen supported names, exact scope
metadata, model/app visibility, mutation annotations, strict inputs and both
strict success/error output envelopes. With no installed UI artifact, no tool
may advertise a UI resource. Raw draft read/write remains model-only.

Two new tests use the actual account-backed issuer with two preregistered public
clients. A registered foreign client cannot consume a code, rotate a refresh
token or revoke the other client's grant; wrong-resource refresh does not
consume the valid token. Correct revocation invalidates that grant's old/new
access while the second grant remains valid. Synthetic grant-store bytes are
checked for raw access/refresh/native tokens and request tickets.

The second case verifies same-account native-session proof isolation, ticket
nonce substitution, foreign-origin denial, exact callback state/issuer and
rejection of approval replay. The existing six signed-token checks independently
exercise issuer/audience, signature/header, expiry, scope, account/grant
substitution and immediate revocation/cache boundaries.

The semantic export test now sends both supported JSON formats through the
actual native import/conversion path and compares complete ordered card content
and defaults after native keys are reassigned. Approved background, audio and
answer-image references survive; no media bytes are embedded. Existing
permission-withdrawal and replay checks remain. Eight existing draft/integrity/
boundary cases were added to the final required gate because authoring and
dispatch changed, including the explicit answer-count admission limits and
fail-closed inconsistent repository results.

Observed Windows checkpoint: **39/39 passed**, with **zero failures, skipped,
cancelled or todo cases**. All listed backend and QA source hashes matched
before and after the retained run. Native-consent and full-show TypeScript
checks passed; the new helper/OAuth QA and modified semantic QA passed scoped
lint and formatting. This is a working-tree checkpoint, not an immutable
release receipt or a Windows native-save qualification.

Evidence directory:

`docs/extensions/plans/phase3-takeover-20261117/backend-acceptance-development-20261118-7ba08e42/`

- Receipt: `receipt.json`
- Receipt SHA-256: `319852379a44de7f3e3b28ded13b720b2618a0da2cfd7ebf8f6d1211439d36d5`
- Log: `tests-verified.log`
- Pins: `source-before.json` and `source-after.json`
- Sentinel execution: `job_8d3c92dc6a814a6a92d3270ccef5e967`

The receipt contains the exact test arguments and scoped source identities,
and explicitly records `immutableRelease:false` and `productionChanged:false`.
The gate owner has added whole protocol/HTTP/token/two-client and
draft/integrity/boundary files to the final Linux/staging requirements, without
test-name filtering.

### Focused visual/transport source follow-up

The image-only display flag now travels through the native classic adapter
into AnswerSlotV4; the visible caption is suppressed while alt/aria text and
legacy unspecified behavior remain. Voting volume is initialized from the
same native theme/audio resolver used by playback. The new transport delegates
time to the existing demo clock, samples it through RAF, preserves paused
elapsed time and uses explicit replay epochs. Optional continuous-playback
props preserve existing callers' behavior. No concrete blocker was found in
this scoped read review. Real browser animation/audio/image-only acceptance
for the final artifact is still required.

### Bounded post-deployment observer — corrected and accepted

`extensions/deployment/observe-mcp-site.py` was reviewed at SHA-256
`0057bf915a6df3a673c99345ca6e18f07eb94adbca86f56b97221f0125fb5fce`.
It performs bounded unauthenticated public-route probes and reads sanitized
log aggregates. It emits no raw response bodies, credentials, private
configuration or raw logs, and does not change services or data.

A concrete observation gap was corrected: an ending container/gateway snapshot
is now taken after the last HTTP/log reads. Exact container/image/running state
and gateway identity are rechecked, and the final restart delta is calculated
from this ending snapshot. A restart during the last probe batch cannot
silently produce a zero-restart pass. The aggregate log counters do not claim
a complete traffic error rate, and the observer does not establish installed
host or long-term reliability.

### Remaining acceptance

Final immutable Linux tests must pass, including the POSIX native save and
semantic edit → trusted browser approval → Studio/frozen-editor roundtrip.
The final browser artifact/CSP/audio/transport scenarios, restored-clone boot,
production TLS/MCP/OAuth probes, bounded post-deployment observation and actual
ChatGPT/Claude connection/use remain separate pending gates. Component source
readiness and the 39-case development checkpoint do not close those gates.

## Final immutable gate readiness review

The final bounded source review is complete. No concrete blocker was found in
the changed gate coverage, fixture attribution or aspect-ratio UI delta. This
is readiness to run the immutable qualification, not a passing qualification
or deployment claim.

| Reviewed file | SHA-256 |
| --- | --- |
| `extensions/deployment/stage-mcp-site.py` | `e3cf36665328ad7ca636e336aa96bd6b5b93a5fd59511145d3805910ce943e84` |
| `extensions/qa/phase3-recovery/linux-verify.py` | `4b2dfb35953c2cc046a2f6c254eb6c85f8ae86e05a3e7cb2eabeb56d44f0e1d6` |
| `extensions/qa/phase3-full-show/native-parity-fixtures.ts` | `3821b6a6923ee51b0657749f7a99854060a9538ab73115feba160e8807632d2a` |

The controller and stager require the complete agreed protocol, HTTP,
signed-token, two-client OAuth, draft, integrity and boundary test files,
alongside the existing issuer/native/semantic suites. The reviewer confirmed
these memberships directly in the final source; no additional broad test run
was needed for this read-only review.

The stager independently requires forty browser scenario names across two
engines and two native families, retaining the engine-attribution check. It
also requires exactly eleven declared renderer fixture IDs for each
engine/family pair, yielding forty-four fixture evidence rows. Each row must
have explicit `renderer-only-synthetic-fixture` attribution, the accepted
artifact renderer build ID, well-formed source/frame/definition hashes,
consistent family definition, the declared native source modules and a
successful observed result. Missing/duplicate rows, raw frame inclusion and
an issuer-result claim are rejected.

The fixture helper receives an admitted real source frame and preserves its
theme and existing public asset references. It introduces synthetic zero-vote,
tie, image-only, independent media/motion and declared empty-scene inputs only
inside QA. The browser harness clearly distinguishes this renderer input
substitution from its real issuer calls and clears fixture mode after the
successful fixture sequence. Any failed fixture leaves the overall gate failed.
These checks do not establish live voting, real scoring, every possible scene
preset, account installation or production consent.

The final aspect selector is local UI state limited to `16 / 9` or `4 / 3`.
It changes the outer surface CSS aspect ratio and keeps the existing native
fit/renderer. No new authoring, asset or authorization input is introduced.
Its actual responsive and keyboard behavior remains part of the forty-scenario
browser proof.

Final Linux/native-save, browser and live/installed-host receipts remain
pending and must be recorded by the release owner before completion claims.


## Final proxy privacy review and bounded correction (2026-11-18)

The exact running application container and image were rechecked before reading only effective configuration. Nginx inherited `access_log /var/log/nginx/access.log main` with `$request` and Referer, and an error log at warning level. The new protected location covered `/oauth/downloads/*`. The export download endpoint accepts a short-lived encrypted URL capability without a separate bearer header and then rechecks the live account, session, grant and export rights. Recording the entire request target would therefore persist a reusable capability during its validity window. Authorization-request tickets and native-save request IDs are more constrained and are not themselves an authentication bypass. No production download URL, token or raw production log was read; no evidence of an actual customer disclosure is asserted.

The Nginx include now disables access logging and directs error logging to `/dev/null` only inside the protected MCP/OAuth/consent location. Application structured audit events are unchanged. Config SHA256: `cca96c0e9ad8b8c456ec0ef641aafd524e8795513bdf4721ac9ffd12015f8ae7`. The exact production-image TLS Nginx test now enables inherited ordinary access/error logging, exercises synthetic protected success and denial, stops only its isolated upstream, and exercises protected 502 failures. Separate ordinary-route access and upstream-error controls must actually appear; protected capability/query/Referer markers must be absent. It emits a bounded nine-field privacy proof only after those assertions. Test SHA256: `8433bfaf8a5fce7db637e320d6059029bc914ccc943a693fa7a0b91a8d12394b`. Scoped lint/format and native-consent TypeScript passed. The exact final immutable Linux proxy receipt remains required; Windows cannot qualify this Linux-only test.

The actual outer ingress is Caddy, not host Nginx. Read-only active configuration showed no access logger, but default runtime logging was still enabled. An isolated same-installed-binary witness on Caddy 2.6.2, running as an unprivileged user on loopback with a deliberately unavailable synthetic upstream, proved that the default 502 error record included the synthetic capability URI and Referer. A filter deleting only `request>uri` and `request>headers>Referer` removed both while retaining the 502/error record. It loaded no live configuration, read no production logs and changed no service. Evidence: `/home/ubuntu/tadazz-caddy-log-privacy-20261118-73642f/receipt.json`, SHA256 `41620153d9e7d998a6a6059b566e53b727a07c61c3cffa023260bd4c0ea17bcb`. Reproducible QA script: `extensions/qa/phase3-native-consent/caddy-log-privacy.py`, SHA256 `12d1976615535bcda83adee189fc429124f1c28e8ec1c7c38743070531127761`.

The persisted `/etc/caddy/Caddyfile` and active adapted JSON matched before the fix. The private candidate changes only the default logging encoder: no route, level, output, credential, application or request-rewrite change. The candidate passed adaptation and validation as the real `caddy` service user. Before SHA256: `d4c77ac56bfe8d66e51707718de3dfd6c7da77a878929c7137dcd9cccf47e055`; candidate SHA256: `101381b7b10b99f72573584de230498119639e6c26ec8bf8439aeed4a534ba24`. Candidate/backup/receipt are in `/var/tmp/tadazz-caddy-privacy-candidate-20261118-73642f/`; receipt SHA256 `261d35135395b825b3ef5a688bbc751f84fcbfd5f7dde01fdd6e0c9c5d921668`. An initial candidate under `/home/ubuntu` could not be traversed by the service user; that validation failure was retained and only the private staging location changed, without relaxing existing permissions.

Release owner reports successful atomic installation/reload at `2026-11-18T06:30:47Z` (Sentinel job `4095661cdaff`): original owner/mode preserved, active JSON equal to the reviewed candidate, public and loopback health passed, and exact application/phone-gateway container identities unchanged. Applied receipt: `/var/tmp/tadazz-caddy-privacy-candidate-20261118-73642f/caddy-log-privacy-applied.json`. This live application checkpoint is attributed to root's execution; the independent witness above is a separate isolated test. The application MCP deployment and final immutable proxy qualification are still separate gates.

## Model question-address directory and final gate review

A bounded read-only review of root's `questionRefs` delta found no blocking issue. Model-only `get_game_draft` now supplies a strict directory of at most 25 `{questionNumber, publicQuestionId}` pairs after its existing authorized draft read. It follows authored quiz/survey order and resolves each key through the native preview identity mapping, rather than indexing the identity map's sorted storage. It adds no iframe visibility, mutation permission or CAS change. The real-issuer QA case uses nonlexical authored keys, consumes the returned third-question reference for text and picture edits, checks stable references after edits and verifies foreign-account denial. This is source/QA-design review; the root-owned actual test result and final immutable run are separate evidence.

The updated proxy controller/stager binding was inspected: final staging requires a fifth immutable proxy receipt with full before/after source manifests, exact config/test/controller hashes, the production runner image, read-only source and overlay, network isolation, the same verified SDK cache, whole unfiltered TAP success with no skips, and exactly one matching bounded privacy proof. Precommit overlays remain explicitly `combinedImmutableGate:false`.

The latest renderer-fixture metadata adjustment is also bounded: the shared source set is augmented with the actual Classic native-stage sources or the Razzia native PhotoCardGrid/stage-fit sources, and the stager checks the family-specific set. The 40 ordinary browser scenarios and 44 explicitly renderer-only fixture witnesses remain separate requirements; metadata is not an issuer or real-host acceptance claim. Exact final source/hash qualification still belongs to the frozen release run.


### Actual Nginx development witness

The new production-image TLS Nginx test passed on the preserved `9c8b1081f07c608e03946deec14351d27d6cca57` source plus the exact current config/test overlay. Result: 1/1 test, zero failures, skips, cancellations or todo; all nine bounded privacy-proof fields true. Ordinary access and upstream-error controls were present, while synthetic protected path/query/Referer values were absent during successful consent-page responses, invalid-download denial and actual unavailable-upstream 502 responses. All 1,706 preserved source files, both overlaid inputs and the SDK cache stayed identical. The runner was the exact production image `sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346` with network disabled and no customer mount.

Evidence: `docs/extensions/plans/phase3-takeover-20261117/tadazz-codex-proxy-9c8b1081f07c-e6d1a70e/receipt.json`, SHA256 `5cb676383b699dac35ba6793a278595bbe3edc93d76dfc2fa92d0bc1eba104cd`; Sentinel job `job_ec375e38b018`. Controller SHA256 `187354c776642905060094a43888769f67c3f8d9034606349cd5c32e5e7f07b1`. `combinedImmutableGate:false` is intentional: this is a development overlay proof, and the final exact-commit proxy receipt remains mandatory. An initial launcher attempt invoked the system32 `python` stub and executed no test; the successful run used `C:\Users\DAVID\AppData\Local\Programs\Python\Python312\python.exe` explicitly.

## Sanitized Caddy evidence retained with the release source

Only the following three JSON receipts were copied byte-for-byte into `docs/extensions/plans/phase3-takeover-20261117/caddy-privacy-evidence-20261118-73642f/` and verified against their remote SHA256 values:

| Receipt | Bytes | SHA256 |
| --- | ---: | --- |
| `caddy-isolated-receipt.json` | 1,295 | `41620153d9e7d998a6a6059b566e53b727a07c61c3cffa023260bd4c0ea17bcb` |
| `caddy-candidate-metadata.json` | 1,359 | `261d35135395b825b3ef5a688bbc751f84fcbfd5f7dde01fdd6e0c9c5d921668` |
| `caddy-applied-receipt.json` | 1,212 | `0b268409e776bcdb337e61fce996e67cd1d76499c1fa61317c0961fae7dfbf00` |

The field review found only hashes, minimal public logging-filter metadata, timestamps and result flags, binary/service paths, ownership/mode metadata, and references to private backup locations. The Caddyfile, private backup contents, full active configuration, raw logs, request headers, credentials and customer data were not copied. The applied receipt independently preserves root's successful live logging-only change as distinct from the isolated synthetic witness and candidate validation. No service was changed by this evidence-copy operation.

## Final native picture, viewport and audio-control review

Read-only inspection of the final `NativeRazziaPreviewV2`, `NativeStageViewportV3`, full-show stage/entry/audio components and the narrow native utility stylesheet found no concrete blocking issue in this delta. The Razzia branch now supplies selected, already-admitted picture references and projected result counts to the original `PhotoCardGrid`, with `readOnly` and no submission callback. The no-picture path retains the original `AnswerButton`. Text and alternative text remain React-rendered values; this adapter adds no media authority, source-data read or authoring mutation.

The widget retains one unkeyed `AudioCuePlayer` within the existing theme owner. Only its controls are portaled to the stable widget-toolbar element outside the native canvas. The explicit browser-click unlock, native audio ownership, existing clock input and cleanup remain in place; switching presentation branches does not introduce a second audio owner.

The new viewport observes layout and image-load events, applies bounded uniform scale, and caps each fit attempt sequence at eight steps with a factor no greater than eight. Exceeding that bound reports unavailable. It disconnects the resize observer, removes the load listener and cancels its animation frame on teardown. It does not advance playback time or change authored composition. This is bounded source inspection, not a replacement for the already-required actual browser card/image geometry, pause/resume and native-audio checks. No additional optional tests or runtime edits were performed by the reviewer.

## Exact native PhotoCardGrid import seam

The final widget build exposed a concrete bundle-size failure: the unchanged native `PhotoCardGrid` imports the full presentation barrel, which brings unrelated site/editor modules and styles into the widget. The release owner authorized a downstream, widget-only resolver and a native-export facade. Readback of `extensions/src/mcp-app/widget/vite.config.ts` confirmed that this resolver requires both the exact normalized PhotoCardGrid importer path and equality of its real path to this checkout's original file. It accepts only the original `@razzia/extensions/presentation` specifier or its exact existing alias-expanded presentation directory; other importer/specifier combinations are untouched.

`extensions/src/mcp-app/widget/native-photo-card-port.ts` only re-exports `CANONICAL_ANSWER_COLORS` and `computePollRanking` from the real `presentation/poll-ranking.ts`, and `useStageFit` from the real `presentation/stage-fit.tsx`. Provider and consumer therefore use the same physical StageFit context. No native algorithm or component was copied, no package source was edited, and no new global alias was introduced. Required native component CSS remains explicitly imported and included by the narrow Tailwind source list; no required presentation-barrel side effect was identified in this bounded review.

The facade and its original implementations belong to the existing artifact physical-source traversal. Their actual inclusion and hashes in the Vite module-input receipt, the unchanged encoded-resource size bound, and subsequent browser acceptance remain build/runtime gates. Source review found no blocker to proceeding with that build; the review itself does not claim those gates have passed.

## Native import-leaf correction and actual development packaging

The second bundle-size failure was traced through the actual Vite input receipt: PhotoCardGrid's constants import eagerly loaded GAME_STATE_COMPONENTS and the unrelated room, leaderboard and answer-state modules. The original constants module only re-exports ANSWERS_LABELS from the import-free answer-style.ts leaf. The approved resolver now handles that second exact specifier only for the same exact PhotoCardGrid importer, retaining normalized-path and realpath equality checks, and points to the original answer-style.ts. The first three-export presentation facade is unchanged. Source readback found no copied native logic, broad alias, package edit or resource-limit increase.

Engineering reports an actual development build at full-show-fit-build-1794985115884 with HTML size 2,861,912 bytes, all five original/facade implementation hashes present in both the module-input receipt and artifact physicalSources, and no live room store/context/state imports. This is attributed to engineering's build result, not a final immutable release gate. Later integration changes require a new exact-source build.

## Direct app save action retains native consent

The security lane added only save_game to the existing app-visible tool set and changed the independent SDK discovery expectation accordingly. Its existing scopes, mutating/idempotent annotations, strict input/output schemas, native consent gate and issuer/storage implementation remain unchanged. The raw get/update authored JSON tools remain model-only.

The existing native-host integration now connects the official App and AppBridge to its real OAuth-authenticated MCP Client over an isolated app-message transport. All nine account-A save calls, including approved completion, drift denial, key-reuse denial and completed replay, travel through app.callServerTool. A new pending replay asserts that the same idempotency key returns the identical consent ID and URL, while the existing no-save-before-approval and real native browser/manager approval checks remain intact. No widget-created manager proof or native credential was introduced.

Windows development evidence: app-save-development-dc98464f05/receipt.json, Sentinel job job_3ac153497a0d. Native-consent TypeScript passed; the actual app/native-host integration and independent discovery passed 2/2, with zero failures, skips, cancellations or todo. Windows continues to reject the POSIX-only final durable write with DEPENDENCY_UNAVAILABLE. Successful durable app save/replay is therefore still required in the final whole-file Linux gate; the Windows result is not claimed as that proof.

A bounded independent read review of root's save helper and component confirmed exact artifact-base origin parsing, exact 54-character consent ID/path binding, exact 21-character native quiz ID/Studio path binding, acknowledged draft/revision validation, and retention of the same request key through consent and lost-response retries. The component is keyed by draft and revision and is retained across ordinary frame refresh. Root identified terminal host-context close as requiring selected-state clearing to remove stale links; that narrow follow-up is separate from ordinary retry continuity. The local demo-choice delta retains only a range-checked selected index, reads correctness from the actual selected result frame, and invokes only the same card's existing preview_show result selection on explicit reveal; it introduces no votes, scores or storage mutation.

## Studio projection of reviewed built-in assets

The security lane implemented the missing account-preview admission seam. The exact saved source bytes, absolute approved URLs and immutableRevision are retained. The pure parser permits a public binding only when it matches the copied immutable reviewed table, current native family/version, precise supported semantic field purpose, SHA256 and byte count. Only show-wide static background, answersMusic source and quiz/survey answer-picture fields receive this new admission. Unknown origins, path lookalikes, query/fragment additions, unrelated URL fields, wrong purposes/families and unused public bindings are denied. Existing tenant-media rules and the aggregate 256-item/200 MB budget remain.

The server calls the existing live deployment resolver and exact reference roundtrip after its existing account-owned source read. It fetches no URLs, invents no OAuth principal/grant and mutates no stored JSON. installAccountPreviewBuiltinAssets captures bound authority functions once and rejects a second installation; it has no production reset or eager native-runtime import. Isolated tests may inject the dependency directly. Root wires the same already-verified production builtinAssets resolver before native app startup, guarded by the private inline-preview flag; the native QA server uses its actual file-backed reviewed resolver. The existing HTTP route catches unsupported-source/changed-asset errors and returns only its bounded Preview unavailable body with status 422.

Root independently reviewed the new helper/authority/source/parser boundary and reported no blocking issue in the bounded code review. That review is distinct from the implementing lane's tests. The focused Windows receipt studio-builtins-development-82fa69d7ac/receipt.json (job_35bdcf7158f2) records 6/6 actual copied-source-byte/native-bundle tests, zero failures/skips/cancellations/todo, native-consent TypeScript exit0, strict type-aware lint with zero warnings/errors across all five touched files, and format pass. The cases cover successful exact native projection with unchanged saved hashes/revision, absent/revoked authority and changed bytes, origin/purpose/family/field denial, missing/tampered/unused bindings, foreign tenant source/media denial, and install-once behavior. The earlier development receipt retaining initial typing/style failures remains available; no failed run was relabeled successful.

Final focused source SHA256 values:

| File | SHA256 |
| --- | --- |
| core/show-library/reviewed-preview-assets.ts | df7803ce2053dec7a34893c24a55470f16c5a3393024ee51d875fd10533efcf3 |
| server/api/account-preview-builtins.ts | 1ab318b0d82f6e63fedc67ee720a8fad1c4fe0fd4da250c09da5c8acb7a25cb1 |
| server/api/account-preview-source.ts | 2e2b8f07f309bfeecf6014fb923c27928058efb9683195bfc271ab3593abfc95 |
| core/show-library/application-preview-input.ts | 7c09a28417eb658cc06f69acdc18af0cc16e5ea88679fe3b1c4b59c61ec8d96b |
| qa/phase3-native-consent/account-preview-builtins.nodecheck.ts | 471b96a98ad96a12a0142e97e9f4caf482cfe3c1a842baa068dd08f56ab8d7dd |

The source paths in the table are relative to extensions/src, except the qa path, which is relative to extensions. A separate read-only review accepted engineering's Studio background hookup: the shared native resolver now receives the saved show default, preserves per-card priority, preserves explicit scoped theme overrides, and retains the legacy fallback when no show setting exists. Actual saved-game Studio rendering remains part of the final Linux browser gate, not established by these unit/source checks.

## Private Studio packaging and release flags

Read-only inspection of the application-preview builder's new generate/verify distinction confirmed that --verify-manifest requires a previously committed available manifest, compares exact rebuilt manifest bytes, verifies the file remained unchanged during the build, and rejects a dependency cycle through its generated admission JSON. Final controller/stager logic separately requires that verify command, the runtime package probe, exact manifest/renderer/registry/toolchain/source hashes, backend inclusion of the committed manifest, and identical packaged web runtime files. A generation-only receipt cannot qualify the release. Source inspection of those gate changes found no blocking issue; their actual immutable execution remains pending.

The deployer's only new environment override is TADAZZ_INLINE_GAME_PREVIEW_ENABLED=true, alongside the three existing config/socket/MCP overrides. ThemeBuilder, public previews and installers are not enabled by this delta. Root reports the existing seven isolated deployer safety witnesses passed on SHA256 e6e541cfce552688b7eb47ea746dd808ab5e822356836715e1ebbf00c17e4cec, with no production mutation. Existing private backup, exact image/config pins and container-only rollback remain the deployment gates.

Final immutable Linux, full browser/geometry, native save-to-Studio, exact proxy, live TLS and actual connected-host acceptance still require the release owner's receipts. None of the development checkpoints above declares the project deployed or connected.
