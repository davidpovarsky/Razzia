# Hebrew localization and RTL — scoped implementation ledger

User authorization: 18 November 2026 explicitly requests full Hebrew, correct RTL/layout, and editor improvements while preserving Razzia design. This supersedes older editor-freeze/no-Hebrew restrictions for this initiative only. Baseline c9b2483b8719b4357852f105e91369e4ffb592e8.

Owned source changes, recorded before editing:

- packages/web/src/locales/he/{common,errors,game,manager,quizz}.json: complete upstream UI translations (249 source keys), preserving all interpolation tokens and Hebrew plural categories.
- Existing packages/web/src/locales/*/common.json: Hebrew language selector label only.
- extensions/src/locales/he/extensions.json and Hebrew entries in billing.json, packages.json, host-additions.json: translated editor, host, roster, theme, media, account and validation text (858 source keys).
- extensions/src/locales/index.ts: register Hebrew as an additional supported extension locale.
- packages/web/src/i18n.ts: normalize supported locales, keep document lang and dir synchronized with language changes.
- packages/web/src/main.tsx and new language-direction provider: propagate direction through existing Radix primitives without changing typography or tokens.
- Generic controls and platform direction provider: localized direction plumbing and logical alignment only, after inspection.
- Focused locale/RTL tests: key/interpolation/plural parity, runtime locale changes, native direction.

No QuestionEditor, studio scene, editor shell, or preview edits owned here; root/preview agent handle those. No credentials, production data or historical worktrees modified. No change to game IDs, saved content semantics, wire identifiers or eight existing locales.

Validation plan: semantic locale coverage and placeholder parity; Hebrew plural forms; focused Vitest; integration build and real-browser desktop/mobile Hebrew plus English language-switch checks coordinated by root. Screenshots and checks must be real; no unsupported completeness claims.

## Implementation and verification checkpoint

Complete base Hebrew resources and extension/editor/roster/host/theme/billing/package resources are registered. Added labels for new live preview and mode-conversion controls in all nine locales. Hebrew ranks use the locale's ordinal categories. Preserved interpolation identifiers. Fixed the pre-existing missing errors:server.internal label in all nine languages by reusing each language's translated generic server-error text.

Document lang/dir changes together on initialization and language changes; native Radix direction provider and platform-scoped controls inherit the active direction. Existing Rubik includes a Hebrew font subset. Switch thumbs and recap arrow buttons mirror in RTL, mixed-language language-menu labels use bdi, and original font/tokens are unchanged.

Additional inspected source hooks: native PhotoCardGrid and scene-presenter hardcoded English now use translated resources, with English defaultValue for independent consumers; optional aria-label added to existing ToggleGroup; new-question title is localized without rewriting saved content. Preview/MCP locale schemas accept Hebrew. Built-in Razzia manifest has Hebrew labels; legacy manifests remain valid with their original eight required languages and optional Hebrew. The theme-installation fixture gains a Hebrew display name for the extended language loop.

Actual Node 24.22.1 verification: web locale/rank/direction suite 61/61, extension locale/placeholder/theme-backcompat suite 17/17, formatting passed. Scoped lint delta: 139 baseline diagnostics and 139 current diagnostics, zero new diagnostics. Full app TypeScript output has no diagnostic in the owned Hebrew files; historical shared diagnostics and in-progress root header check are recorded separately, so full repository types are not claimed green here.

Receipts: hebrew-coverage.json, hebrew-web-tests.log, hebrew-extension-tests.log, hebrew-lint-delta.json, hebrew-types-app.log. Site, widget, consent, isolated preview translations are owned by the site localization agent and counted in its receipt. Integrated screenshots, build, release pin regeneration and final artifact verification are coordinated by root. No commits or deployment by this contributor.

Production-entry follow-up: extensions/src/site/bootstrap.tsx creates a separate root from packages/web/main.tsx. Added the same ApplicationDirection wrapper there so production/editor Radix and platform scopes receive RTL, not only the Vite native development entry. The site agent removes SiteMetadata stale lang/dir overrides.

## Hebrew visual and RTL QA (2026-11-18)

- Owned new harness: packages/e2e/editor-hebrew-rtl-audit.mjs. Runs Edge against isolated local candidate3180/backend3181 only and closes browser in finally.
- Evidence: docs/extensions/plans/editor-hebrew-20261118/visual-he/*.png and audit.json. Checks html lang/dir, desktop and 390/320 layouts, question/scene controls, dialog direction, keyboard and mixed script inputs.
- Source fixes remain limited to owned localization/direction files; editor layout findings go to root.

- QA scope extension: packages/e2e/editor-hebrew-roster-audit.mjs checks translated participant forms, duplicate prevention, Hebrew CSV diagnostics and RTL data isolation against in-memory isolated QA rows only; no quiz save. Evidence visual-he-roster/.

## Deterministic conflict-dialog locale regression

- Root assigned failing packages/web/src/features/quizz/extensions-ui.test.ts fallback-label assertion. It assumed OS-detected language was English; Hebrew is now supported and the Windows test host detects he.
- Planned edit: bind only the localized fallback test to cloned explicit en/he i18n instances via I18nextProvider, verify both known translations, leave application language detection untouched. Validation: focused extensions-ui suite.

## Timeline scene cards and exact stage localization

- Root assigned extensions/src/editor/components/TimelineSceneCard.tsx: translate raw kind badge and action labels/confirmation; use trimmed title fallback; logical start/end positions; keep actions available on mobile and active card; stable scene kind/selector attributes. Browser selection and screenshots validate.
- Root assigned exact stage round/question label wiring after visible English found in Hebrew preview. Coordinate TadazzV4Stage ownership with preview agent; no changes to scaling logic. New label keys will preserve all nine locales.

## Mixed-direction control correction

- Add optional dir prop to generic ToggleGroup.tsx so numeric aspect controls can match their explicit LTR visual order while default groups inherit RTL.
- Input.tsx preserves explicit caller dir and defaults number/tel/email/url values to LTR, preventing misplaced negative signs and URL tokens in Hebrew forms; labels and layout still inherit RTL.
- Localize two final scene-presenter.tsx literals found in screenshots: interim-results no-votes text and remaining-seconds unit.

## Final targeted visual review

- New packages/e2e/editor-hebrew-final-review.mjs verifies fixes found by the full79-screen matrix: theme cards at320, exactClassic and originalRazzia native stage, scene heading/seconds/time direction, numericaspect keyboard LTR, negative numeric inputs, translated unsaved-exit confirmation. Saves screenshots and assertions in visual-he-final/.
- Broader matrix was executed successfully (79 screenshots; zero pageerrors/overflow at1440,390,320). Roster13-screen suite passed localized validation and CSV diagnostics.

## Final accessible overlay caption

- Root approved extensions/src/presentation/cinematic-overlay.tsx exact text/direction fix before source freeze: use existing studio.scene.overlays.layerDefaultLabel for empty accessible names, inherit logical-start alignment for selected overlay handle. Studio editor clone/timeline captions owned by preview agent.

## Static full-show caption visual fixture

- Docs-only native-he-scenes.config.ts and native-he-scenes.fixture.test.ts export actual FullShowSceneView under the real isolated Hebrew I18nextProvider and original CSS/bundled Rubik. packages/e2e/editor-hebrew-native-scenes.mjs captures all12 special full-show scenes and selected320 previews; no new product route or application source. Static rendering verification is reported separately from interactive editor acceptance.

## Full-suite localization gate follow-up

- Root assigned native-preview-frame.test.ts nine-locale acceptance and unsupported-language rejection, types.test.ts correct Unicode ellipsis, presentation.test.ts retained standalone recap and new Hebrew-provider pagination assertions.
- ScenePresenter three computed English defaultValue strings (vote count, question number, page indicator) preserve readable standalone rendering when no i18n provider exists; resource keys and interpolation parameters are unchanged in real localized applications.
- Read-only keyboard DnD diagnostic: new packages/e2e/editor-keyboard-dnd-diagnostic.mjs; three fresh unsaved trials and key/DOM/measurement receipts in keyboard-dnd. No application save or source mutation.

## Decoded Hebrew font receipt

- Root assigned font handoff proof: packages/e2e/editor-hebrew-font-audit.mjs reads document.fonts.ready, actual matching loaded FontFaces/unicode ranges, WOFF network statuses and decoded body sizes, plus Chromium CSS.getPlatformFontsForNode on the existing Hebrew Questions tab. Evidence font-proof/; no font pipeline or application changes.

## Isolated native document font correction (root approved before pin generation)

- application-runtime-entry.tsx imports existing licensed Rubik variable CSS into the immutable artifact; uses ownerDocument for stylesheet/DOM ownership; awaits actual font decoding before rendering an update, preserving generation/dispose cancellation.
- New native-fonts.ts parses compiled CSS font-face rules, registers embedded FontFaces in the target document (ShadowRoot rules alone do not provide reliable font loading), reference counts duplicate mounts and removes only owned faces on final dispose.
- native-fonts.test.ts covers duplicate mounts, separate iframe documents, decode failure, disposal before decode completion, and preservation of unrelated font faces. Actual iframe and ShadowRoot browser probe will use temporary artifact output and a copied manifest; committed pins remain untouched.

## Isolated native iframe font proof

Pre-edit ledger: add packages/e2e/editor-native-font-iframe-audit.mjs. Run the temporary artifact in two isolated iframe documents and ShadowRoots with the existing data-font CSP. Assert six decoded owned Rubik faces, original Hebrew computed font, no parent fonts, duplicate mount reference counts, disposal before readiness, style fallback without replaceSync, final cleanup, no external fonts or CSP violations. This is a renderer/lifecycle proof; release digest admission remains root-owned.

## Legacy built-in audio captions

Root-authorized final narrow addition: packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/use-media-library-extensions.ts, LEGACY_BUILT_IN_SOUNDS and its legacy mapping branch. Preserve all nine CueId/URL/type records; resolve only visible labels via the existing audio.cueStart/... locale keys. Check key existence in all nine locale resources, run typed lint and web TypeScript. No schema or new locale keys.
