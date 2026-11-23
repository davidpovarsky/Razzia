# Site and preview Hebrew localization — pre-edit scope

Date: 2026-11-18. Base: c9b2483b8719b4357852f105e91369e4ffb592e8.
Branch: codex/tadazz-editor-hebrew-20261118.
Owner explicitly requested full Hebrew/RTL, editor audit and implementation. This scoped new request supersedes historical no-Hebrew/editor-freeze language; no security policy, legacy locale, renderer or customer content is changed by this localization slice.

## Owned files and necessity

- extensions/src/site/locales/he.json and index.ts: complete Hebrew site namespace and resource registration.
- extensions/src/site/components/game-preview/resources.ts and i18n.ts: Hebrew inline-preview labels and accepted locale lookup.
- extensions/src/presentation/show-library-preview/i18n.ts: import actual new Hebrew native dictionaries and register private preview labels.
- extensions/src/mcp-app/widget/i18n.ts: complete Hebrew widget label tables/locale selection.
- extensions/src/platform-ui/catalog/i18n.ts: include Hebrew among inspectable catalog locales.

Existing original eight language values remain unchanged. No upstream packages file is owned here. No second i18n or renderer implementation. No commits/push; root integrates.

## Coordination and verification

Hebrew agent owns upstream/base dictionaries, extension dictionary, global language/direction and locale schema contracts. Live-preview agent owns preview behavior/layout. Root owns editor controls and final verification.
Validate key and interpolation parity, every translated table row length, source syntax, and current tests when dependencies permit. Final browser Hebrew/RTL and saved-game preview checks belong to root integrated QA. Do not mark product acceptance complete from dictionary parity.
Asana source Hebrew/RTL: 1220663517383673. No test execution or PASS claimed at this pre-edit checkpoint.

## Narrow iframe language hooks (before editing)

- extensions/src/mcp-app/widget/Widget.tsx: root main has lang already; add dir from its private i18n instance so Hebrew does not rely on a parent iframe document.
- extensions/src/mcp-app/widget/full-show-entry.tsx: root main already has dir; add lang from the same active i18n locale for accessibility. No interaction or renderer changes.

## Additional locale table found by focused typecheck (before edit)

- extensions/src/components/theme-builder/strings.ts: PreviewLocale now includes he, but builder language tuple and strings contain only eight languages. Add actual Hebrew for every table row, preserve existing values/order, and add ninth tuple position. Typecheck exposed this missing consumer; no Theme Builder behavior/layout changes.

## Locale consumers and consent text (before edit)

- Theme Builder StudioThemeBuilder.tsx, PublishedCompositionSelect.tsx, OpenThemeBuilderLink.tsx, EditorReadonlyPreview.tsx: allow he through existing locale clamps; no workflow/layout change.
- oauth-consent/OAuthConsentPage.tsx and native-save-consent/NativeSaveConsentPage.tsx: allow he only after complete consent strings.ts translations exist. Permissions, consent semantics and APIs remain unchanged.
- site/tests/locales.test.ts and tests/browser/marketing-locales.spec.ts: include he in existing locale checks, retaining original8 cases. New Hebrew browser gate is not claimed run.

## SiteMetadata language ownership fix (before edit)

SiteMetadata.tsx forces LTR on marketing/Studio routes and restores stale lang/dir during navigation. Remove that redundant effect and its unused locale binding. New shared i18n.ts initialized/languageChanged listener is the single document lang+dir owner (confirmed with Hebrew owner). SiteMetadata retains translated title/description/canonical/brand responsibilities and useTranslation rerender subscription. This resolves a concrete RTL override without adding a second direction system.
