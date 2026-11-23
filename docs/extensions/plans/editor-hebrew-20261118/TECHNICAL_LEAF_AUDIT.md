# Technical leaf closure audit

Read-only source review on2026-11-18. This audit covers three Asana leaves assigned after the private iframe font fix. It does not mutate Asana and does not report source-level test definitions as newly executed tests. Root's final repository gate supplies current execution status.

##1219846911627698 — Shared picker at editor entry points

**Technical implementation is supported by current source and existing regression coverage.**

The actual shared component is packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/index.tsx. Existing entry points use that same component with a constrained accepted media type:

| Entry point                                                                  | Consumer and behavior                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global show audio, including opening, voting, reveal, leaderboard and podium | studio/show-theme-settings.tsx maps SHOW_THEME_AUDIO_EVENTS to ThemeAudioOptions; studio/theme-audio-options.tsx opens shared MediaLibrary with acceptType audio and limits built-in URLs to the selected event's declared variants |
| Per-question and survey audio                                                | QuestionEditorConfig/CardAudioConfig.tsx selects ThemeScopeControls in the current manifest path; theme-scope-controls.tsx reuses ThemeAudioOptions for local event overrides                                                       |
| Legacy card or scene audio                                                   | LegacyCardAudioConfig renders the same MediaLibrary with acceptType audio                                                                                                                                                           |
| Question media                                                               | QuestionEditorMedia.tsx opens the same MediaLibrary; existing question media remains separate from answer visuals                                                                                                                   |
| Answer image                                                                 | QuestionEditorAnswers.tsx opens the same component for the selected answer; image-only/both controls are conditional in the current editor                                                                                          |
| Scene/interlude/opening/closing media                                        | studio/studio-scene-editor.tsx uses the same component with pickerAcceptType appropriate to the active operation                                                                                                                    |
| Global/per-card background                                                   | show-theme-settings.tsx, theme-scope-controls.tsx, CardBackgroundConfig.tsx and the legacy studio settings branch use the same component with acceptType image                                                                      |

ThemeAudioOptions converts an approved built-in URL back to its declared variantId and stores a mediaUrl for an uploaded choice. Buttons remain conditional on manifest custom-media capability. A slot that does not permit custom media intentionally does not expose an upload action.

Existing packages/web/src/features/quizz/extensions-ui.test.ts includes assertions for answer-image selection preserving question.media, interlude selection preserving question.media, media type mismatch rejection, deleted target question safety, reference reconciliation after media deletion, and Browse/select updating extras without replacing base question media. The current Hebrew browser matrix covers image-picker portal direction and conditional image controls; root's functional audit separately covers an actual decoded upload and save/reopen.

The legacy-only built-in label table was localized in the existing shared picker hook after root authorization. All nine CueId/URL/type records remain unchanged, all81 existing locale captions were verified, typed lint is clean and the web TypeScript check passes. Evidence: legacy-audio-label-checks.json.

##1219846882835217 — Asset identifiers, safe paths and media resolution

**The existing technical contract is substantially implemented. The boundary distinctions below should remain in the closure note.**

| Criterion                                       | Source evidence                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical built-in cue identity and default URL | extensions/src/core/audio-catalog.ts defines CANONICAL_BUILT_IN_SOUNDS and DEFAULT_CUE_URLS, keyed by CueId                                                                                                                                                                             |
| Exact modern native asset reference             | extensions/src/core/show-library/native-media-library.ts keys entries by assetId plus sha256, preserves declarations/aliases and rejects identity conflicts; findNativeAssetLibraryEntry parses the exact ref                                                                           |
| Built-in versus upload persistence              | theme-audio-options.tsx stores variantId for approved native choices and mediaUrl for uploaded selections; use-media-library-extensions.ts tracks uploaded catalog records and associations                                                                                             |
| Safe local paths and optional HTTPS             | extensions/src/core/media.ts isSafeMediaUrl rejects unsupported schemes, protocol-relative values, backslashes, traversal and whitespace/control characters; show-themes/selection.ts additionally validates declared theme URLs and rejects credentials/hash in HTTPS theme asset URLs |
| Uploaded MIME and names                         | packages/socket/src/services/media.ts saveMedia uses fileTypeFromBuffer on actual bytes, accepts only declared MIME types, derives canonical extension and normalizes generated names; listing/deletion constrain filenames and regular files                                           |
| Manager-only mutation                           | packages/socket/src/api/routes/media.ts applies requireManager before list/upload/delete; upload has body-size and form validation. The raw room-media read uses a separate existing room-visibility handler                                                                            |
| Account/native preview isolation                | account-preview-source.ts resolves current tenant assets; account-preview-source.test.ts covers foreign URLs and traversal; application-preview-input.test.ts rejects missing media, duplicate grants, traversal and invented revisions                                                 |
| Default/inherit and persisted draft             | core/card-appearance.ts resolveEffectiveAudioCue has scene/card/global/default precedence; card-appearance.test.ts roundtrips background/audio/mediaCatalog through bundle, authored JSON and XLSX                                                                                      |

Existing tests include core/core.test.ts safe/unsafe URL cases, audio-catalog.test.ts canonical cue completeness and real nonempty bundled files, native-media-library.test.ts exact reference/declaration mapping, packages/socket/src/services/media.test.ts rejection of invalid media and constrained listing/deletion, and extensions/server/api/routes.test.ts unauthenticated rejection.

**Security boundary:** optional external HTTPS media in the legacy/general schema is a browser media URL. The inspected upload/import/native-preview paths do not fetch an arbitrary user media URL on the server. This is not a claim that the general URL validator contains an IP-range denylist or validates the remote server's MIME response. The stricter account-native preview path binds admitted current-tenant/built-in bytes. Do not describe these different contracts as one universal remote URL/MIME or SSRF filter.

##1219846703492318 — Background lighting and contrast

**Partial implementation; the complete acceptance text is not proven and should not be closed as fully accepted by this audit.**

Supported behavior:

- core/card-appearance.ts defines manual background overlay opacity, fit and position, defaults a custom card overlay to0.35, and resolves fallback to branding/default background.
- LegacyStageBackdrops in packages/web/src/features/game/components/tadazz-show/legacy-stage-elements.tsx renders the custom image with decorative empty alt, chosen object-fit/object-position and separate black overlay. Image failure is recorded so the parent can fall back.
- GameBackground.tsx falls back from branding image failure to the original background.
- core/tadazz-appearance.ts suppresses ambient motion for reduced-motion or paused state and falls back when the animated image is unavailable.
- Native V4 CSS has reduced-motion paths. The Hebrew editor/native matrix exercises desktop and narrow preview fit.
- Meaningful answer visuals use required alt text via answerVisualSchema; existing UI tests verify accessible text and reject empty image alt.

The Asana agent owns a current correction for native position/overlay propagation, because the serialized values were previously dropped before the renderer. Its new tests and final screenshots should be attached separately.

Not established in the inspected schema/runtime:

- Authored background brightness and blur controls.
- Automatic luminance or content-aware contrast adjustment.
- A measured contrast acceptance matrix for2/3/4 answers against busy custom backgrounds.
- Actual projector readability acceptance.
- A unified image-failure acceptance proof across every native theme stage and arbitrary uploaded background.

These are concrete acceptance gaps, not a missing curated asset pack. The shared-picker and safe-asset code leaves should not be blocked solely by those separate visual/contrast requirements.
