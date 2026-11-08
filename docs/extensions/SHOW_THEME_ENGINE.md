# Show Theme Engine — 8 November 2026

## Scope and ownership

The one installed family is **TADAZZ Classic 1.0.0**, using the current native Goldy/v4 renderer. No Kids/Elegant/Battle entries or runtime HTML/iframe exist. The theme seam adds a React context and selects a compiled adapter; it owns no scores, participants, room lifecycle, authorization or telephony. Canonical motion keyframes, durations and easing remain in the trusted Classic adapter unchanged.

`extensions/src/core/show-themes/` contains the strict versioned manifest, selection schemas, immutable registry, pure resolver, media references and audio mapping. `extensions/src/presentation/show-themes/` supplies the renderer context and presentation-only scene/timer-event helpers. The web adapter table connects the trusted renderer ID to the existing `TadazzShowView`. New definitions do not add conditionals to GameWrapper.

The manifest has 15 visual slots, 16 audio events, finite namespaced variants, role/capability declarations, asset URLs/bytes/SHA256/rights/provenance, palette/font/layout/effects identifiers and native choreography-to-event mappings. `adapterAssets` exposes the canonical question/show backdrops and brand logo. Classic adopts 31 actual repository assets. It declares canonical Inter/system stage typography and square cover photos; the editor retains upstream Rubik. There are no invented sound files. Existing repository attribution is retained; this is not a new license grant.

## Persistence and resolution

Shows save `defaults.showTheme = {id, version, overrides, legacyPolicy?}`. Cards/scenes save `{themeId, themeVersion, overrides, history?}` in `themeOverrides`. Roles and keys are finite Zod enums, not arbitrary CSS/code. An absent selection resolves to Classic. An explicit old `motionKit: legacy` without a modern selection remains a technical rollback path and is excluded from the modern theme picker.

Precedence for each slot/event is theme default → show → show-role → matching card/scene → card-role. A new source selection replaces the inherited source and its volume/fit/mute; a volume-only choice inherits its source. Custom media is permitted only at manifest-approved slots/events, using safe media-library or HTTPS URLs. Cinema continues to own its foreground/video layer. Native backgrounds include a same-adapter background underneath a failed custom image.

Unknown IDs/versions and incompatible variants are preserved in saved data. Runtime uses Classic for display and a localized manager-only warning; it never registers customer code or silently rewrites the saved ID. Missing/foreign variants fall back to the active theme default. Host and public/player roles receive the same server-owned defaults and scoped selection.

Theme changes require a warning when there are customizations. Global settings and local scopes retain bounded histories of 32 versions. An archive at capacity blocks replacement instead of evicting edits. Returning to a version restores its compatible selections. Section reset clears only that section, including role overrides; motion reset retains background media. Archived media references participate in delete preflight and explicit force-detach.

Native bundles, authored TadaShowV1 JSON, optional XLSX columns and existing creation/migration paths preserve theme selections, histories and old metadata. The manual defaults copy that dropped `motionKit` was removed. Workbook format remains `tada-show` version 1; older sheets without theme columns continue to parse. Existing formula-injection protection stays intact.

## Studio and preview

Studio Settings lists only the installed Classic card, version, poster, screen/background options and audio events. Single-option visual lists have no meaningless select. Existing per-card background/audio/motion controls route to the active manifest; original controls remain behind explicit legacy rollback. The existing MediaLibrary accepts event-specific approved built-ins and existing uploads.

The native preview uses the selected question, its actual answer visuals and zero sample votes. It has question/results/transition modes, reduced motion, no live game mutation, no socket/telephony owner and no autoplay. Audio Preview/Stop runs only following the user's action, stops on a source change and releases its element on unmount. All new labels cover en/fr/de/es/it/ja/tr/vi.

## Audio and the only server observation

The existing `AudioCuePlayer` remains the music/effect owner. Theme events map to its existing cue/soundtrack and native milestone paths. Player answer-selection/submission effects use its event-only role mode instead of `useSound`. Default roles permit host/display show audio and player interaction audio; themes can mute or specialize these within their manifest. Scope choices can select only that event's variants.

Voting track identity includes game/card/epoch/URL: a new question or replay starts from zero once; ordinary ticks and vote-count updates preserve the element/position. Pause/resume retains identity. Redundant play calls are suppressed. Explicit one-shot result alternatives are played by native reveal choreography; looping alternatives are background beds and are not replayed as SFX. Story tracks are also resolved through the manifest. Master gain, media ducking, timer protection and crossfades remain in the existing owner. Rejected autoplay presents Enable sound, retains the intended track/effect, and waits for a user gesture instead of retrying on every state update.

Client timestamps cannot reliably distinguish natural expiry from a delayed manual stop. The documented minimal server seam records the reason `elapsed | manual | allAnswered` around existing timer completion paths and emits it in extension extras. It changes no timer schedule, scoring or common wire schema. A native expiry effect is emitted once per matching question epoch only for `elapsed`; manual/all-answered uses vote-lock completion. Refresh, history and skip do not synthesize expiry. Real Game tests exercise all three reasons and scoring preservation.

## Authoring tools and future installation boundary

The repository-local skill is `.agents/skills/tadazz-theme-creator/SKILL.md`. It includes a client brief, generated JSON Schema, live-contract/security/QA references and a Python wrapper around the live TypeScript validator. The separately referenced handoff ZIP was unavailable locally; it was not imported or represented as tested. The implementation uses the actual Zod contract.

Run from the repository root with Node 24 and installed workspace dependencies:

```powershell
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts scaffold C:/temp/customer-theme customer-theme
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts schema
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts validate extensions/src/core/show-themes/classic.manifest.json packages/web/public --trusted-repository
```

Scaffold writes a new, unregistered declarative draft with Classic references; it never overwrites an existing manifest. It is a starting point, not a newly designed customer family. Customer assets must replace/review rights and provenance. `--trusted-repository` is exclusively for existing source-controlled assets; normal customer validation rejects `repository-existing` rights.

Validation checks strict structure, whitelist/namespace/reference integrity, safe local paths, symlinks, byte/hash/signature budgets, media formats and bounded Lottie expressions/resources. Bounded embedded raster images in canonical Lottie are allowed; external resources/code are rejected. Validation does not download remote URLs. Directory inspection rejects executable/nested archive payloads; no ZIP extractor or customer SVG/dotlottie sanitizer is implemented. JSON Schema cannot encode every Zod refinement: the live validator is mandatory.

`ThemeReviewWorkspace` is a **tested in-process reference**, not an authenticated HTTP installer or durable production service. It isolates two tenant namespaces, rejects self-review, requires review before signing immutable versions, gates code-backed review on platform permission/build evidence and supports signed rollback/audit. Its callers must supply trusted principals and validation receipts; customer JSON does not supply grants/tenant authority. Production still needs authenticated Hono routes, private durable storage/media authorization, CI evidence verification, signing-key management, audit retention and an authorized preview/publishing UI. No draft/stage/publish endpoint was exposed or deployed here.

For a new code-backed family: add reviewed React/TSX, isolated CSS and motion adapter; extend the trusted renderer enum and typed adapter table; provide a complete manifest, licensed hashed assets and all locales; pass schema/roundtrip/browser/audio/visual/accessibility/performance review; then register the immutable version in a trusted build. Never eval/dynamically import customer TSX/JS from a ZIP or database. A declarative family can use only already compiled renderers and the bounded tokens they actually support.

## Verification and limits

See the dated QA report and evidence under `docs/extensions/qa-evidence/theme-engine-20261108/` for commands, actual results, failure-name comparison, screenshots and audio event traces. Browser tests launch their own 3170/3171 servers with a fresh temporary CONFIG_PATH; they never reuse operational configuration or another server.

Chromium/WebKit emulation does not replace physical iPad testing or manual listening. Content/photoflash/accessibility/licensing review and perfect pixel parity across every historical show cannot be inferred from static validation or the focused E2E matrix. Those unexecuted gates must remain NOT TESTED. Existing extension-suite failures are reported against the measured baseline, not called green. Nothing was pushed, deployed or merged to main.
