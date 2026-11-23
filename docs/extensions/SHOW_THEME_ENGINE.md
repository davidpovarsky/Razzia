# Show Theme Engine — 8 November 2026

## Scope and ownership

The one bundled production family is **TADAZZ Classic 1.0.0**, using the current native Goldy/v4 renderer. The authenticated installer is OFF by default. Independent customer packages are exercised in disposable remote QA databases. The explicitly authorized, isolated persistent theme lab also offers two operator-owned declarative demos through `TADAZZ_DEMO_CATALOG_ENABLED=true`; that flag defaults OFF and does not bypass customer publication review. See [the theme lab deployment record](THEME_LAB_2026-11-08.md). No fake catalog entries or runtime HTML/iframe exist. The theme seam adds a React context and selects a compiled adapter; it owns no scores, participants, room lifecycle, authorization or telephony. Canonical motion keyframes, durations and easing remain in the trusted Classic adapter unchanged.

`extensions/src/core/show-themes/` contains the strict versioned manifest, selection schemas, immutable registry, pure resolver, media references and audio mapping. `extensions/src/presentation/show-themes/` supplies the renderer context and presentation-only scene/timer-event helpers. The web adapter table connects the trusted renderer ID to the existing `TadazzShowView`. New definitions do not add conditionals to GameWrapper.

The manifest has 15 visual slots, 16 audio events, finite namespaced variants, role/capability declarations, asset URLs/bytes/SHA256/rights/provenance, palette/font/layout/effects identifiers and native choreography-to-event mappings. `adapterAssets` exposes the canonical question/show backdrops and brand logo. Classic adopts 31 actual repository assets. It declares canonical Inter/system stage typography and square cover photos; the editor retains upstream Rubik. There are no invented sound files. Existing repository attribution is retained; this is not a new license grant.

## Persistence and resolution

Shows save `defaults.showTheme = {id, version, overrides, legacyPolicy?}`. Cards/scenes save `{themeId, themeVersion, overrides, history?}` in `themeOverrides`. Roles and keys are finite Zod enums, not arbitrary CSS/code. An absent selection resolves to Classic. An explicit old `motionKit: legacy` without a modern selection remains a technical rollback path and is excluded from the modern theme picker.

Precedence for each slot/event is theme default → show → show-role → matching card/scene → card-role. A new source selection replaces the inherited source and its volume/fit/mute; a volume-only choice inherits its source. Custom media is permitted only at manifest-approved slots/events, using safe media-library or HTTPS URLs. Cinema continues to own its foreground/video layer. Native backgrounds include a same-adapter background underneath a failed custom image.

Unknown IDs/versions and incompatible variants are preserved in saved data. Runtime uses Classic for display and a localized manager-only warning; it never registers customer code or silently rewrites the saved ID. Missing/foreign variants fall back to the active theme default. Host and public/player roles receive the same server-owned defaults and scoped selection.

Theme changes require a warning when there are customizations. Global settings and local scopes retain bounded histories of 32 versions. An archive at capacity blocks replacement instead of evicting edits. Returning to a version restores its compatible selections. Section reset clears only that section, including role overrides; motion reset retains background media. Archived media references participate in delete preflight and explicit force-detach.

Native bundles, authored TadaShowV1 JSON, optional XLSX columns and existing creation/migration paths preserve theme selections, histories and old metadata. The manual defaults copy that dropped `motionKit` was removed. Workbook format remains `tada-show` version 1; older sheets without theme columns continue to parse. Existing formula-injection protection stays intact.

## Studio and preview

Studio Settings lists bundled Classic and the account's authorized published active versions, with version, poster, screen/background options and audio events. Previously pinned published versions remain resolvable after rollback. The per-account provider never mutates the global registry. Single-option visual lists have no meaningless select. Existing per-card background/audio/motion controls route to the active manifest; original controls remain behind explicit legacy rollback. The existing MediaLibrary accepts event-specific approved built-ins and existing uploads.

The native preview uses the selected question, its actual answer visuals and zero sample votes. It has question/results/transition modes, reduced motion, no live game mutation, no socket/telephony owner and no autoplay. Audio Preview/Stop runs only following the user's action, stops on a source change and releases its element on unmount. All new labels cover en/fr/de/es/it/ja/tr/vi.

## Audio and the only server observation

The existing `AudioCuePlayer` remains the music/effect owner. Theme events map to its existing cue/soundtrack and native milestone paths. Player answer-selection/submission effects use its event-only role mode instead of `useSound`. Default roles permit host/display show audio and player interaction audio; themes can mute or specialize these within their manifest. Scope choices can select only that event's variants.

Voting track identity includes game/card/epoch/URL: a new question or replay starts from zero once; ordinary ticks and vote-count updates preserve the element/position. Pause/resume retains identity. Redundant play calls are suppressed. Explicit one-shot result alternatives are played by native reveal choreography; looping alternatives are background beds and are not replayed as SFX. Story tracks are also resolved through the manifest. Master gain, media ducking, timer protection and crossfades remain in the existing owner. Rejected autoplay presents Enable sound, retains the intended track/effect, and waits for a user gesture instead of retrying on every state update.

Client timestamps cannot reliably distinguish natural expiry from a delayed manual stop. The documented minimal server seam records the reason `elapsed | manual | allAnswered` around existing timer completion paths and emits it in extension extras. It changes no timer schedule, scoring or common wire schema. A native expiry effect is emitted once per matching question epoch only for `elapsed`; manual/all-answered uses vote-lock completion. Refresh, history and skip do not synthesize expiry. Real Game tests exercise all three reasons and scoring preservation.

## Authoring tools and authenticated installation

The repository-local skill is `.agents/skills/tadazz-theme-creator/SKILL.md`. It includes a client brief, generated JSON Schema, live-contract/security/QA references and a Python wrapper around the live TypeScript validator. The separately referenced handoff ZIP was unavailable locally; it was not imported or represented as tested. The implementation uses the actual Zod contract.

Run from the repository root with Node 24 and installed workspace dependencies:

```powershell
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts scaffold C:/temp/customer-theme customer-theme
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts schema
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts validate extensions/src/core/show-themes/classic.manifest.json packages/web/public --trusted-repository
```

Scaffold writes a new, unregistered declarative draft with Classic references; it never overwrites an existing manifest. It is a starting point, not a newly designed customer family. Customer assets must replace/review rights and provenance. `--trusted-repository` is exclusively for existing source-controlled assets; normal customer validation rejects `repository-existing` rights.

Validation checks strict structure, whitelist/namespace/reference integrity, safe local paths, symlinks, byte/hash/signature budgets, media formats and bounded Lottie expressions/resources. Bounded embedded raster images in canonical Lottie are allowed; external resources/code are rejected. Validation does not download remote URLs. Directory inspection rejects executable/nested archive payloads; no ZIP extractor or customer SVG/dotlottie sanitizer is implemented. JSON Schema cannot encode every Zod refinement: the live validator is mandatory.

`ThemeInstallationStore` is the durable installation authority; `ThemeReviewWorkspace` remains an older in-memory reference only. The store uses private SQLite assets/manifests/audit and transactional immutable publication. The owned Hono adapter mounts under `/api/themes`, requires verified live manager sessions, derives workspace grants on the server, and keeps the whole installer disabled unless account mode and `TADAZZ_THEME_INSTALLER_ENABLED=true` are explicitly configured. This work does not activate it in production.

The actual CLI supports package/upload/list/revise/preview/qa/request-review/approve/reject/stage/publish/rollback/audit. Private drafts use CAS revisions. Rejection returns a draft for editing; revision clears assets and invalidates old preview tickets and approval receipts. Approval binds the exact revision, runtime-manifest SHA256 and QA evidence digest, plus explicit human review gates. Every contributor is excluded from self-approval. Platform publication requires separate assigned platform permission. Full commands and server grant examples are in `.agents/skills/tadazz-theme-creator/references/installation.md`.

The authenticated `/manager/themes/$tenantId/$artifactId` route renders fifteen native preview slots through the compiled preview-adapter table, with sixteen explicit audio controls, eight locale maps and reduced motion. It has no game transport or publication controls. A short-lived HttpOnly cookie binds media access to the verified session, workspace, artifact and revision. All private asset responses use no-store/nosniff headers; byte ranges are supported. Published room snapshots capture one immutable definition at construction and use the existing room-authorized media route. Draft preview Lottie is reauthorized rather than cached globally. The Vite accounts-mode media proxy enforces the same server boundary as nginx.

Packages are bounded JSON containing individually verified media bytes, not executable ZIPs. The server verifies hashes, MIME signatures, image/animation decoded budgets and embedded-only bounded Lottie resources. SVG, archives, uploaded scripts and external Lottie resources/expressions are rejected. Declared ownership does not replace a real human rights/content/accessibility/performance review. Remote QA accounts check synthetic approval assertions; no actual customer approval is claimed.

Publication signs server identity, definition, revision, contributors, reviewer, approval and trusted build metadata. A persistent configured server secret is required; no new credentials are written by this task. Rollback changes active catalog choices while keeping historical versions resolvable and running rooms pinned. API access and mutations are audited without recording bearer tokens or request bodies. Operational backup, access administration and retention remain deployment responsibilities.

For a new code-backed family: add reviewed React/TSX, isolated CSS and motion adapter; extend the trusted renderer enum, runtime adapter table and native preview adapter table; provide a complete manifest, licensed hashed assets and all locales; pass schema/roundtrip/browser/audio/visual/accessibility/performance review; then add the exact normalized manifest digest and CI build digest to the source-controlled `TRUSTED_THEME_BUILDS` map in the socket installation adapter. That map is currently empty, so uploaded code-backed additions fail closed. Unit fixtures prove both rejection and an exact trusted-record match; no new code-backed production family is claimed. Never eval/dynamically import customer TSX/JS from a ZIP or database. A declarative family can use only already compiled renderers and the bounded tokens they actually support.

## Verification and limits

See the current dated QA report and `docs/extensions/qa-evidence/remote-cleanup-theme-20261108/` for commands, actual results, source hashes, screenshots and audio event traces. All further executable verification runs on Oracle in disposable quota-limited Docker containers, with no published ports, production storage or provider credentials. Remote-only Playwright guards prevent accidental Windows game/browser runs. Dedicated test servers use fresh temporary configuration; they never reuse operational configuration or another server.

Chromium/WebKit emulation does not replace physical iPad testing or manual listening. Content/photoflash/accessibility/licensing review and perfect pixel parity across every historical show cannot be inferred from static validation or the E2E matrix. Those unexecuted human/device gates remain NOT TESTED. Current unit/build/browser results replace historical baseline claims in the dated report. Nothing was pushed, activated in production or merged to main.
