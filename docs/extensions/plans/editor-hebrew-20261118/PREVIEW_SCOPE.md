# Live editor preview scope — 18 November 2026

The owner explicitly requested live previews on every game editor card/screen while preserving original Razzia typography and controls. This scope supersedes the historical editor freeze only for these requested changes. Baseline: c9b2483b8719b4357852f105e91369e4ffb592e8. Isolated branch: codex/tadazz-editor-hebrew-20261118.

## Pre-edit ledger

- packages/web/src/features/quizz/components/QuestionEditor/QuestionLivePreview.tsx (new): current unsaved question/media/answers/results, original native game presentation components, original ToggleGroup/Button, scaled stage, optional controlled image reveal. Never saves a quiz, creates a game, joins a room, collects scores, or auto-plays sound.
- packages/web/src/features/quizz/components/QuestionEditor/EditorPreviewViewport.tsx (new): bounded, measured 16:9 / 4:3 native stage viewport; confines preview backgrounds to the card.
- packages/web/src/features/quizz/components/QuestionEditor/index.tsx: mount the live question preview and remove the fixed card-background overlay that currently covers the whole editor.
- packages/web/src/features/quizz/components/studio/studio-scene-editor.tsx: reuse the native ScenePresenter for non-cinematic scene previews; retain cinematic direct manipulation, render controls only for supported modes, provide aspect selection on every scene, mute preview media by default, and correct playback duration/clock controls.

Existing original Razzia NativeRazziaQuestion, QUESTION_PRESENTATIONS, ChoiceResultsView, NativeGameSurface, ScenePresenter, StageFitContainer, ShowThemeScope and palette/typography are reused; no parallel design system or game engine is introduced. Existing saved schema and wire format stay unchanged.

## Verification planned

Focused type/lint/format checks on new/edited files; actual browser checks using the root-owned isolated app on 3180/3181: unsaved text and answer updates, text/image/both modes, quiz/survey/multi/estimation, media and scene kinds, 16:9/4:3 and narrow layout, Hebrew RTL and stable keyboard focus while typing. Root integrates screenshots and task evidence. No completion is asserted from source inspection alone.

## Additional shared scene mapping (coordinated before edit)

- extensions/src/presentation/show-themes/scene.ts: export themeSlotForSceneKind and use it for authored nested scenes. Opening/closing/leaderboard/results cards must use the theme slot shown by the editor controls. Unknown legacy/media/transition/countdown retain interlude fallback.
- extensions/src/presentation/show-themes/scene.test.ts: exercise actual resolveShowTheme overrides against live scene selection, including original generic and legacy fallback.

## Exact selected-theme renderer (coordinated before edit)

- extensions/src/presentation/show-library-preview/live-editor-stage.tsx (new): call the same ApplicationPreviewStage with current unsaved authored content; keep current native presentation for incomplete drafts. No persistence/auth/session creation. Audio remains disabled.
- extensions/src/presentation/index.ts: public export of this small first-party editor adapter.
- QuestionLivePreview/studio-scene-editor: provide the existing nativeBundleToAuthoredShow conversion from current form/extras rather than introducing another schema/renderer.

## Browser evidence follow-through

- extensions/src/presentation/show-library-preview/application-preview-stage.tsx: use the shared themeSlotForSceneKind for non-question cards so inline and full-show native previews select the same runtime slot; add declarative renderer/slot evidence attributes.
- packages/e2e/editor-live-preview-audit.mjs (new): independent real Edge context against the root-owned isolated test application, current unsaved question/scene modes, both built-in theme engines, screenshots and renderer admission evidence.
- live-editor-stage.tsx: memoize the source revision separately from preview clock ticks.

## Completed-draft JSON boundary regression

- extensions/src/presentation/show-library-preview/editor-preview-snapshot.ts (new): validate and materialize an editor-only JSON snapshot before the existing full-show compiler; keep strict external admission untouched. Catch incomplete/legacy/cyclic/timeline mismatch locally.
- editor-preview-snapshot.test.ts (new): real native-to-authored converter output, Hebrew content, optional undefined fields, valid chapter compile, incomplete input and timeline mismatch.

## Actual mobile renderer fit regression

- extensions/src/presentation/show-library-preview/razzia-application-stage.tsx and extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx: measure local clientWidth/clientHeight for fit. getBoundingClientRect already includes the outer preview transform and caused a second shrink on narrow screens. Fit remains inside each supplied viewport; the editor applies its scale once. Real browser matrix checks inner stage geometry at desktop,390,320.

## Isolate the selected card from unrelated incomplete scenes

- editor-preview-snapshot.ts/test.ts and live-editor-stage.tsx: project only the selected card and schema-valid question context into the existing native engine. Preserve IDs/order/appearance and omit unrelated incomplete scene drafts; no writes or invented responses. Keep strict selected-card validation and scoped timeline alignment. Test with a valid unsaved question beside an empty-media draft.

The mixed persisted fixture confirms estimation, not blank media, caused sibling fallback: native estimation answers=[] and solution120 cannot pass the existing authored-v1 choice answer schema. Current preview projection keeps original question number/total separately and passes all real preceding-question recap/interim data to the same ScenePresenter. Selected estimation remains the existing native presentational renderer. Optional editor context props on ApplicationPreviewStage/RazziaApplicationStage do not change the public frame/admission wire contract.

- packages/e2e/editor-live-preview-mixed-audit.mjs: real saved mixed native fixture, three answer display modes with decoded image, both exact built-in engines, valid estimation fallback wording, original3-question counts, complete recap context. Readonly editor interactions; no save.

- Actual preview screenshots exposed an inert Classic host Next control. Read-only ApplicationPreviewStage now withholds manager advance controls in ScenePresenter (no advance transport exists); editor transport stays in the preview toolbar. Scene editor heading/duration/time direction corrected per Hebrew visual QA.

## Native preset honesty and transition text fit

- extensions/src/presentation/tadazz-show/show-director.ts: extract existing media/lottie/overlay content predicate without changing live plan behavior. Editor uses it for built-in Classic opening/closing title semantics.
- extensions/src/presentation/tadazz-show/scene-preset-editor.test.ts (new): compare that predicate with actual showIntro/showFinale/custom runtime plans.
- studio-scene-editor.tsx: built-in Classic opening/closing without authored content use Card name+timeline hint; hide unused subtitle. Original Razzia and authored cinematic scenes retain title/subtitle.
- extensions/src/presentation/tadazz-v4/tadazz-v4.css: constrain and wrap native interlude title/subtitle within stage safe width while retaining existing typeface/palette.

- extensions/src/presentation/tadazz-v4/components.tsx: InterludeV4 uses the original166px title for short content and conservative128px/100px sizes beyond50/80characters, together with safe-width wrapping, so maximum120-character editor titles remain inside the native stage. Localized StageIdentityV4 edits preserved.

## Browser-confirmed Lottie source recovery

- extensions/src/presentation/lottie-player.tsx: clear runtimeError when src/inline data changes, allowing the actual DotLottie engine to mount and load a corrected URL after a404. Localize its existing error label. Before evidence records the stale old URL after validURLentry; WASM and bundledanimation bothHTTP200.
- studio-scene-editor.tsx: when no actualcatalog/selectedasset exists, Add animation opens the existinglibrary/upload picker; it no longer invents /media/overlay-animation.json. Strict overlay schema staysunchanged.
- packages/e2e/editor-lottie-source-recovery-audit.mjs: actualWASM readiness, frameprogress, and invalid→valid source recovery proof.

## Critical final native custom-scene parity repair

Fresh Hebrew countdown/recap screenshots show a generic ScenePresenter card in the 1920px Classic custom slot (max-width 1152px, auto height) rather than the live Classic screen. Before editing, inspected the actual runtime TadazzScreens.tsx and TadazzShowView.tsx scene dispatch. Scope: extract existing message/countdown/recap/title primitives to extensions/src/presentation/tadazz-show/native-scene-screens.tsx; re-export the exact same components from packages/web/src/features/game/components/tadazz-show/TadazzScreens.tsx; add controlled preview clock without changing authoritative live clock; mount native custom screens and the existing CinematicLayerStack from application-preview-stage.tsx via a read-only bridge. Retain native CSS geometry, no parallel visual system. Also replace raw Q prefix in owned recap selector with existing localized questionLabel. Browser verification must measure actual inner native screens at desktop/mobile, and inspect screenshots.

## Contextual recap page-size control

Parent authorized final concrete scope fix after exact native extraction exposed Classic native cap6 versus editor/schema max8. Add a shared pure recap-page-limit helper/constant used by unchanged native clamp and editor limit. Editor displays min(stored,limit), preserves legacy storedvalue until an explicit input change, clamps edits to1..limit, and passes max into the existing translated label (Hebrew agent maintains all9 dictionaries). Focused test guards both built-in renderer limits and bounds; browser switches Original8→Classic6→Original8 to prove storage preservation and actual contextualinput behavior.

## Asana1219846804642486 actual audio owner cleanup

Parent authorized focused AudioCuesSection stale-callback fix after read-only audit. Existing single ref/stop exists but old ended/error/play-rejection callbacks unconditionally clear current owner. Scope only extensions/src/editor/components/AudioCuesSection.tsx and real React browser lifecycle regression in packages/e2e/editor-audio-preview-lifecycle-{fixture,audit}.mjs. Regression uses controlled Audio transport to exercise queued callbacks/promises; no production sound or external services. Record current-source failure first, then source identity-guard/handler-detach/unmount cleanup patch and same regression passing.

Audio lifecycle harness module lives under packages/web/src/test/editor-audio-preview-lifecycle-fixture.mjs for actual Vite React dependency resolution; it imports real source by relative paths. E2E audit script routes a private local fixture URL, and includes the standard development refresh preamble. It is not an application entry or production runtime import.

## Backdrop propagation companion fallback fixes

Asana auditor owns the native/shared backdrop propagation repair. Requested narrow companion fixes in owned fallback UI: use authored per-question background.position in QuestionLivePreview and scene.background.position as objectPosition for the existing scene background image. Existing opacity/fit unchanged; no selector or renderer redesign.
