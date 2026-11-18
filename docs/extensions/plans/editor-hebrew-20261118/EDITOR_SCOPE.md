# Editor audit mandate — 18 November 2026

Owner explicitly requested current-branch editor audit, conditional controls, visible mode selectors, live preview every card/screen, Hebrew/RTL, Asana updates, code/build/deployment. Baseline c9b2483b8719b4357852f105e91369e4ffb592e8 fetched and verified; isolated codex/tadazz-editor-hebrew-20261118. The older editor-freeze and no-Hebrew initiative restrictions are superseded for this requested scope only. Existing branches/untracked work and data are preserved.

## Root pre-edit ledger
- QuestionEditor/AnswerVisualControls: gate image controls to image/both, accessible original ToggleGroup, labelled media/alt controls; browser tests text/image/both transitions.
- QuestionEditor/use-answer-visual-editor: preserve chosen mode when clearing media, safe localized option labels and stale picker protection; save/reopen and card-switch browser checks.
- QuestionEditor/QuestionEditorAnswers: contextual text/alt labelling and image-only display; quiz/survey correct-answer visibility.
- QuestionEditor/QuestionEditorConfig/index.tsx and BaseConfig.tsx: visible answer/scoring mode selectors using native ToggleGroup; hide scoring for surveys; directional units.
- QuestionEditor/QuestionEditorMedia.tsx: accessible keyboard upload, logical direction, correct media actions and compact optional-media layout as visual audit warrants.
- studio/header-controls.tsx, QuizzEditorHeader/Sidebar/Card, studio-shell: selected semantic tabs, localized card-kind labels, contextual card toolbar, 320..1920 layout and RTL.
- studio/theme-scope-controls.tsx and theme-audio-options.tsx only if source/browser audit confirms conditional-action defects.
- packages/e2e: isolated real-app audit and regression suite/screenshots against temporary fixture store on ports3180/3181. Never use production/customer fixture data.

Original Razzia Rubik font, Tailwind theme tokens, Button/Input/Switch/ToggleGroup/Radix primitives, logos and existing data schemas remain. Live preview agent owns QuestionEditor/index and studio-scene-editor; Hebrew agent owns locales, generic direction and locale contracts. Root coordinates commits and release.

## Additional source findings before edits
EstimationConfig/EstimationEditor: resolve per-card play mode so numeric surveys hide correct answer and scoring margin; visible input type selector. ThemeScopeControls: use shared scene-kind slot mapping and only applicable theme audio cues. Root changes below validated against the original exact source before atomic file writes.

## Save and launch findings before edits
use-quizz-extras/contexts: retain loaded sidecar baseline, initialize empty legacy sidecar after verified fetch, expose extrasStatus/isExtrasDirty. studio-launch-page: block launch on unsaved scene/default/roster/image-only edits, pending/failed extras load, or missing scene media. use-composite-quizz-save and header: disable duplicate saves during active mutation; reload conflict updates persisted baseline. Real browser save/reopen/unsaved-launch tests required.

## Follow-up: browser accessibility and localized context
Localized all DnD instructions/announcements and seconds labels, fixed Enter drop + cancelled-drag state, localized default mode interpolation, exposed the two binary settings as native ToggleGroup, and made authored question direction automatic.

## Empty-media readiness follow-up
New scene cards must not reference nonexistent /media/background.png. Use an empty media draft so launch readiness correctly asks for media. Opening and closing defaults use localized runtime copy.

## Metadata and unsaved navigation integrity
Block editing and saves until sidecar metadata loads, show retry on load failure, retain initial question IDs for retry. Use native router blocker and original AlertDialog to protect Exit/back/reload with unsaved form or sidecar changes. Success saves bypass the blocker.

## Verified selection, mobile themes, and media accessibility fixes
Functional saved-quiz inspection found stale selected timeline IDs after sidecar load: reconcile selection against the loaded IDs so active card affordances stay visible. Screenshot320 showed squeezed theme descriptions: stack theme posters and content at narrow widths. Media search/file inputs gain keyboard access and logical RTL alignment; type-locked image pickers omit a noninteractive filter.

## Native renderer pin preparation
Use committed source in a fresh offline Linux build with cached dependencies mounted read-only. Copy only the generated preview manifest back, then require existing immutable source, browser, staging, backup and deployment gates on the resulting committed revision. No release gate is bypassed.

## Final gate reconciliation — native controls and stable QA

The full extension suite exposed pre-existing raw feature buttons in five full-show widget files and two native presentation adapters. Replace those with the actual Razzia Button, preserving handlers, disabled conditions, content, and existing layout. Do not expand the primitive allowlist. Also update the fifth-answer token assertion to the canonical isolated answer-style module and retain the live-module re-export assertion. Keyboard browser QA waits for actual aria-pressed drag state and DndKit layout measurements, rather than a transient announcement overwritten by onDragOver.

- `extensions/src/mcp-app/widget/full-show-audio.tsx`
- `extensions/src/mcp-app/widget/full-show-demo-question.tsx`
- `extensions/src/mcp-app/widget/full-show-editor.tsx`
- `extensions/src/mcp-app/widget/full-show-entry.tsx`
- `extensions/src/mcp-app/widget/full-show-save.tsx`
- `extensions/src/presentation/show-library-preview/application-preview-stage.tsx`
- `extensions/src/presentation/show-library-preview/native-room-panel.tsx`
- `extensions/src/core/tzila-show-acceptance.test.ts`
- `packages/e2e/editor-functional-audit.mjs`

### Narrow navigation visibility correction
Actual320px settings screenshot showed Launch offscreen in a horizontal tabstrip with hidden scrollbar. Use the same Razzia buttons in a visible2×2 mobile navigation grid, keeping title and Save/Exit on the first row; desktop pill navigation remains. Browser QA will assert all four navigation bounds are inside viewport before interaction.

### Legacy entrance localization audit
The rollback-only QuestionEntranceConfig had three raw English upload notifications. Reused shared localized upload failure and added two translated animation file/status captions in all nine locales; replaced physical icon margins and set authored Lottie URL direction LTR. Manifest-controlled current motion UI was already contextual.
