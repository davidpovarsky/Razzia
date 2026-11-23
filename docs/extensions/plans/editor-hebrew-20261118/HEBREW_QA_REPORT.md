# Hebrew, RTL and original typography QA

## Result

The editor now has a Hebrew locale, RTL document and component direction, original Rubik typography, localized live previews, and consistent labels for its question and scene controls. The original eight locales remain registered. The final core locale inventory is recorded in **hebrew-coverage.json**; extension dictionaries have equal keys and interpolation tokens in all nine languages.

Application source owned by this workstream is frozen. Release commit, full repository gates, immutable Linux artifact pins and deployment verification are root-owned and are not asserted by this report.

## Browser evidence

| Evidence directory | Latest accepted result                                                          | Scope                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| visual-he          | 79 screenshots, no JavaScript errors or document horizontal overflow            | Four editor tabs; choice/multi/estimate and quiz/survey; text/image/both answer modes; question preview phases and aspect ratios; translated portal dialogs; all nine generic scene kinds; desktop,390px and320px representative states |
| visual-he-final    | 14 screenshots, no JavaScript errors or document horizontal overflow            | Classic and Original Razzia native previews; narrow theme settings; all four narrow navigation controls; unsaved-exit cancel; numeric and time direction; aspect selector keyboard direction                                            |
| visual-he-roster   | 13 screenshots, no JavaScript errors or document horizontal overflow            | Hebrew form errors, duplicate phone, LTR phone data, CSV invalid row and missing header, valid Hebrew import, no-search state, tab roundtrip retaining in-memory rows                                                                   |
| visual-he-fullshow | 16 screenshots, no JavaScript errors or English caption leaks in checked states | All12 special FullShow scenes through actual StageSceneV4/FullShowSceneView, original CSS and Hebrew provider; four representative states scaled to320px                                                                                |
| font-proof         | 2 screenshots and decoded-font/network receipt                                  | Editor document Rubik Hebrew and Latin faces; computed font; all four320px tabs within viewport                                                                                                                                         |
| private-font-build | 2 inspected iframe screenshots,10 lifecycle checks                              | Actual temporary native renderer artifact in separate iframe documents and ShadowRoots; Rubik decode, applied family, reference counts, independent documents, early disposal, fallback and final cleanup                               |

The FullShow fixture is static native-component visual evidence. It is not live telephony, participant connectivity or live-game acceptance. The editor tests use isolated QA data; the roster audit keeps changes in memory. Root's functional audit separately owns save/reopen, persisted card order and server failure recovery.

The main matrix's optional development404 responses were branding/theme catalog fallbacks; they did not cause JavaScript or layout failures. Historical failed diagnostic images may still exist beside accepted receipts. Use each audit.json and its timestamp rather than counting directory images.

## Issues found and resolved

- Hebrew was absent from the registered editor locale sets and several preview schemas. Hebrew resources and language metadata now cover the editor, native labels and connected consumers; original languages remain supported.
- Root direction is applied on initialization and language changes. Radix controls inherit direction; explicit LTR is retained for phone, numeric, time and aspect-ratio controls where appropriate.
- Answer image controls were exposed for irrelevant answer modes. Root repaired the conditional controls and visible mode selectors; the Hebrew matrix verifies their visible behavior.
- Scene timeline cards exposed raw kinds and English actions and could have empty accessible names. Scene kind/title fallback, duplicate/delete labels and logical layout were repaired.
- Native preview labels such as question numbers, rounds, choices, votes and recap pages were localized. Providerless legacy SSR still receives interpolated English fallback text.
- The participants page passed extension keys into the common namespace. The site/Asana agent corrected namespace forwarding, dynamic validation labels, field associations and RTL table/form details.
- Preview geometry initially scaled twice and Classic countdown/recap used a smaller generic layout. The preview agent corrected local sizing and reused actual native countdown/recap screens. Accepted screenshots show the repaired full-stage result.
- The private native artifact did not include Rubik faces. Loading fonts in the parent editor document did not satisfy the isolated iframe. The artifact now imports the existing licensed @fontsource-variable/rubik CSS and embeds all six WOFF2 subsets.
- The original private stage also lacked the font-display class supplied by the live NativeGameFrame. The runtime's owned target now uses that same original class, so decoded Rubik is actually applied to Hebrew text.
- Font faces are bound to the renderer's ownerDocument, reference-counted across duplicate mounts and removed when the last mount closes. Disposal before font readiness does not reinstall faces. The fallback stylesheet parser is nonapplying and removed immediately.
- The renderer waits for font decode through its existing asynchronous update contract, retains bounded snapshot validation, catches render failure and settles pending updates. Private/CSP boundaries and live-authority exclusions remain unchanged.

## Private font proof

The accepted receipt is **private-font-build/iframe-font-proof.json**. The real built renderer executes inside two iframe documents; the parent has no font stylesheet and its FontFaceSet remains empty. Each active child has six decoded Rubik variable faces with300–900 weight range, including the Hebrew unicode range. The Hebrew question heading computes Rubik Variable. Duplicate mounts share the six owned faces. Closing one mount preserves the other; the last close removes the owned faces. A second iframe remains independent. Early disposal leaves no faces behind.

The fallback path is exercised by disabling CSSStyleSheet.replaceSync before mount. It renders the same Hebrew stage, leaves no temporary parser style and cleans up all owned faces. There are no CSP violations, JavaScript errors or external font requests. The original renderer and fallback screenshots have the same accepted image hash.

The temporary build writes only private-font-build/artifact and a copied audit manifest. **pin-safety.json** verifies that the committed application-preview-build.json was unchanged. These temporary hashes are evidence of this local probe, not release-admission pins. Root generates and verifies final immutable artifacts on Linux.

## Focused automated checks

- Private font lifecycle:5/5 tests pass, including descriptor preservation, duplicate ownership, cross-document independence, early disposal and decode failure cleanup.
- Final private font files: typed lint has0 warnings and0 errors; extensions/qa/phase2/tsconfig.json passes.
- Assigned locale regressions:46/46 tests pass across native preview locale acceptance, valid Unicode ellipsis and recap SSR/interpolation. Unsupported locales remain rejected.
- Web extension localization isolation:48/48 tests pass after tests use explicit locale instances.
- Additional Hebrew/native/FullShow/source-parity focused tests:22/22 pass. Other earlier suites overlap; their counts must not be summed into a unique total.
- All nine extension locale dictionaries have equal key sets and interpolation placeholders; exact counts are regenerated in hebrew-coverage.json.

## Keyboard reorder diagnosis

The isolated diagnostic completed three fresh successful reorder trials. The initial drag-over announcement can replace the pickup announcement immediately, so waiting for the exact transient pickup string was a racy harness assumption. After two animation frames for DndKit measurement, ArrowUp and Enter change the DOM order correctly. A dropped card removes aria-pressed rather than setting it to false. Root owns persisted order and question-ID proof.

## Ownership and reproducibility

Pre-edit paths, symbols and planned checks are recorded in **HEBREW_SCOPE.md**. Browser harnesses are under packages/e2e/editor-hebrew-*.mjs, packages/e2e/editor-keyboard-dnd-diagnostic.mjs and packages/e2e/editor-native-font-iframe-audit.mjs. The full-show rendering fixture is documented in native-he-scenes.fixture.test.ts and its adjacent config.

This report records observed states and focused checks. It does not imply that every possible authored media file, optional theme, browser engine, telephony provider or live-game branch has been exercised.
