# Editor live-preview verification — 18 November 2026

## Implemented behavior

The open editor now previews the current unsaved question and every non-question timeline card. Questions expose visible Question / Answers / Results controls, 16:9 / 4:3 aspect controls, hide/show, and replay. Scene cards use the native stage with a controlled playback clock; timers, scrubbing and replay appear only for timed kinds. Opening, closing and cinematic media retain a separate Edit layers mode for actual draggable Lottie overlays. No save, live room or production game session is required. Editor playback remains muted unless the user explicitly auditions an audio cue.

The original Razzia editor chrome, native Button/ToggleGroup controls and Rubik typography are retained. Selected preview language and direction are supplied explicitly. Phase controls inherit RTL; physical aspect selection and elapsed/total time remain LTR.

The preview path is `nativeBundleToAuthoredShow` → `createEditorPreviewSnapshot` → `LiveEditorStagePreview` → the shared `ApplicationPreviewStage`. The adapter materializes an actual JSON snapshot, safely admits the current card and valid question context, and does not let a separate unfinished card disable a valid current card. Original question numbering is retained. Native recap context includes all preceding questions, including numerical estimation, with zero collected votes rather than invented participants or results.

Built-in Razzia Original uses the native Razzia stage. Classic uses the actual native Classic choreography and shared custom-screen components. `native-scene-screens.tsx` contains the exact message/countdown/recap/title primitives extracted from the live game; the game re-exports these same components. The preview no longer places a small generic ScenePresenter card inside the Classic1920×1080 custom stage. Cinematic content uses the existing CinematicLayerStack.

Incomplete drafts remain visible with native presentation primitives. The current authored-v1 schema cannot represent a complete native estimation question with an empty choice list and numeric solution, so estimation uses the actual native estimation question/answer/result primitives. It is not reported as exact Classic choreography. An installed composition requires its admitted composition document; the in-editor adapter does not execute an unadmitted pin and retains native fallback for that case. These are intentional, explicit boundaries of this in-editor adapter; public/private admitted full-show preview remains a separate path.

## Concrete defects corrected during inspection

- Undefined native-to-authored properties crashed strict preview compilation; the editor snapshot boundary now cleans JSON and catches invalid snapshots without crashing the editor.
- An eager shared-renderer import exposed an AnswerComponent registry cycle; lazy stage mounting resolves the cycle while preserving actual renderers.
- Nested native stages measured already transformed bounds and shrank twice; local client dimensions now produce one physical scale at desktop and320/390px.
- Classic countdown/recap used the wrong inner renderer; shared actual native screens now fill the full stage at all tested sizes.
- Text-only answer presentation retained a hidden image URL; native StageOption now only forwards image data for image/both display modes.
- Question scope/numbering was lost when unrelated native estimation cards could not enter authored-v1; selected-card admission retains original positions and actual recap context.
- Opening/finale preset title fields could imply stage text that the preset ignores; controls use the actual runtime predicate and identify that title as a timeline card name.
- Long native transition titles overflowed; original styling is retained with bounded wrapping and a size reduction for the allowed longest titles.
- A nonexistent default Lottie URL caused404, and the error blocked a subsequently corrected URL. Add animation now opens the existing library/upload picker when no asset exists; changing source clears the old error and reloads the actual engine.
- Classic recap offers6 rows while Original offers8. The editor now shows the actual contextual maximum, preserves stored legacy values until an explicit edit, and uses the same native Classic cap constant.
- AudioCuesSection detached neither old callbacks nor stale promise completions. It now relinquishes ownership before stopping, detaches ended/error handlers, and guards every completion by the current Audio instance. Switching, repeated click and unmount use the same cleanup.

## Executed browser verification

All browser tests used real Edge through Playwright, candidate Vite3180 and isolated backend3181. They did not start a game session. Saved-fixture tests only edited existing fixture data in memory unless otherwise stated by the root functional audit.

| Evidence                                    | Result                                                     | What it establishes                                                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual-preview/audit.json`                 | 83/83 checks,0 page errors,39 screenshots                  | Both built-in themes; all9 scene kinds; question phases; live unsaved text/options; aspect/hide/replay; actual inner sizing320/390; timed scrub/play/reset; real Lottie layer readiness plus keyboard/drag |
| `visual-preview/mixed/audit.json`           | 16/16 checks,0 page errors                                 | Persisted mixed fixture; image/both/text; exact valid choice card alongside estimation; correct1/3 and2/3 counters; native estimation3 phases; all3 preceding questions in native recap                    |
| `visual-preview/native-scenes/audit.json`   | 6/6 checks,0 page errors                                   | Hebrew RTL countdown and recap at1440,390,320; actual inner screen x/y/width/height equal the native stage bounds                                                                                          |
| `visual-preview/lottie/after-fix.json`      | 3/3 checks,0 page errors                                   | WASM200 and animation200; real controlled frames60→120; deliberate bad404 followed by valid source recovers ready=true without reload                                                                      |
| `visual-preview/recap-cap/audit.json`       | 5/5 checks,0 page errors                                   | Original8→Classic effective6→Original stored8; explicit Classic edit clamps/persists6; translated contextual range                                                                                         |
| `visual-preview/audio-lifecycle/after.json` | 7/7 checks,0 page errors                                   | Actual React AudioCuesSection with native Button and controlled Audio transport; no mount autoplay, switching, old callbacks/rejection isolation, same-cue stop, current completion and unmount cleanup    |
| `stable-id-witness/result.json`             | Historical1 pass/7 failures; current8/8 pass;0 page errors | Real historical RHF-ID bug and current stable-UUID implementation, tested with the same actual React lifecycle/preview/save assertions                                                                     |

The first five preview groups total113 passing browser checks; audio adds7. Historical-current UUID adds8 current passing checks and a separate, intentionally failing historical comparison. These counts describe distinct focused checks, not one aggregate production test suite.

Main preview network failures were only the local optional branding/theme catalog404 paths. The Lottie recovery test intentionally requests one nonexistent animation. The isolated lifecycle fixture also records Edge’s blocked development HMR WebSocket warning; component modules and lifecycle assertions execute normally. No warning is hidden or counted as a game-runtime success.

## Focused automated tests and static checks

`preview-snapshot-tests.log` records23 passing tests: JSON snapshot and selected-card admission7, scene-to-theme-slot mapping11, actual opening/finale preset predicate5. `preview-recap-tests.log` adds3 passing tests for renderer capacity, legacy-value display and integer input bounds. Relevant owned source groups were formatted and typed-linted with zero warnings/errors (`preview-native-scene-lint.log`, `preview-recap-lint.log`, `preview-lottie-lint.log`, `audio-preview-lifecycle-lint.log`). Root owns the complete repository gates, final source pin, commit and deployment.

## Historical UUID and audio red/green evidence

The UUID witness archives the exact provider source from git5d94754 and its SHA256. Installed esbuild0.28.2 transpiles that source without behavior edits; URL mapping and CommonJS interoperability connect it to the same real React/RHF dependencies as the current provider. The exact same enhancement panel and eight assertions run against both. The historical provider reports ephemeral field IDs and loses the real saved visual/interlude preview through async load, real refresh, add, reorder, remove and save/reload. Current source preserves the stored UUID and preview. CompositeApiClient performs actual JSON serialization against an isolated fixture fetch transport. This is not a claimed recreation of a full historical backend or dependency build. All raw source, compiled module, dependency URLs, hashes and executable audit are preserved under `stable-id-witness/`.

Audio uses the same actual component and controlled transport before and after the focused fix. `audio-lifecycle/before.json` records the genuine failure: queued old ended/error/rejected-play callbacks turn the new cue from Stop to Play. The after receipt records seven passing lifecycle checks and the changed source hash. Both receipts include page errors and network observations.

## Visually inspected evidence

Inspection included Original/Classic question answers/results, mobile320/390, opening/finale presets, maximal120-character Classic transition, actual rendered Lottie overlay after recovery, Hebrew full-stage countdown1440 and recap320, and the historical/current saved-UUID preview pair. Screenshots distinguish historical failing evidence from current successful results. A visible outer frame alone was not accepted as proof of native fit or Lottie readiness.

## Integration status

All work is in the isolated `codex/tadazz-editor-hebrew-20261118` worktree. No commit, push, deployment or production release was performed by this subagent. Root coordinates the final source freeze and release. The Asana auditor owns task mutation; evidence for stable-ID leaves1219846882048365,1219846882047259,1219846702608329 and audio leaf1219846804642486 has been supplied to that agent.

## Final authored backdrop propagation proof

`visual-preview/backdrop/audit.json` records **10/10 passing real Edge browser checks and zero page errors** against the frozen application source. `packages/e2e/editor-backdrop-propagation-audit.mjs` is the reproducible driver. Nine screenshots cover both built-in themes and the visible legacy opacity control.

For Classic and Original separately, the actual native renderer was checked with inherited background, authored top position and zero opacity, authored bottom position and zero opacity, and authored bottom position with 0.65 overlay. Computed CSS confirms top (`50% 0%`) and bottom (`50% 100%`); inherited and explicit zero introduce no overlay gradient; positive overlay is a background-only gradient. The native surface and foreground question both retain computed opacity 1. Top and dark-bottom screenshots for both themes were opened and visually inspected; the asymmetric existing 1122×1402 Tadazz Z image clearly changes crop and darkness while the foreground remains unchanged.

The reachable legacy `card-bg-overlay-input` was edited from 0.2 to 0.7 and the actual native Classic stage updated immediately without save. The native estimation fallback also honors the authored top position. Companion fallback changes are limited to `QuestionLivePreview.tsx` backgroundPosition and the scene editor image objectPosition; the shared/native/Original propagation is owned by the Asana audit agent.

**Proof boundary:** top/bottom and inherited values were staged into the read-only response for the existing saved native fixture's sidecar, with strict valid background fields and no backend write. Current modern appearance UI does not expose a position control, and the legacy appearance UI exposes opacity but also no position control. These checks prove persisted authored data is rendered and the existing reachable opacity control works; they do not claim an absent position selector was tested. Existing optional `/branding/theme.json` and `/api/themes/catalog` 404s remain classified separately from media failures.

The first harness attempt mistakenly added an unsupported background mode field, which correctly caused strict-snapshot fallback; it was corrected in test data only. A later fallback selector incorrectly searched a descendant although the background is a sibling; its 9-pass receipt and screenshot remain as `before-fallback-locator-correction.*`. The final corrected harness is formatted and passes all 10 checks. Neither test correction required application changes.

With this addition, the preview, scene, media, recap, audio, and backdrop groups in this report total **130 passing browser assertions**, plus the separate 8-pass current stable-ID regression witness (the historical comparison intentionally fails 7 of 8 assertions). These are scoped proof counts, not a claim of exhaustive coverage of every possible show configuration.
