# Native authored background propagation — 2026-11-18

Authorized editor audit found that validated card background position and overlay opacity were saved but dropped by the native stage adapters and previews. Preserve original inherited backgrounds (center, no additional overlay); pass authored cover/contain, position, and opacity including zero through the existing runtime/preview paths. Render opacity on the background layer only, preserving foreground text and theme veils. Safe media URL validation remains unchanged.

Planned files: core/tadazz-appearance.ts and test; presentation/tadazz-show/presentation-scene.ts and test; tadazz-show/TadazzStage.tsx; tadazz-show/TadazzV4StageAdapter.tsx; tadazz-v4/types.ts and components.tsx; show-library-preview/application-preview-stage.tsx; web TadazzShowView.tsx. Inspect Original Razzia and incomplete-preview fallbacks for the same missing fields and apply only matching background propagation if necessary.

Verification: focused real resolver tests for authored/scene/inherited/unsafe backgrounds and zero/max opacity; native renderer output; actual unsaved editor preview controls with computed styles and screenshots for Classic and Original, preserving the default appearance. No missing catalog, new preset, color/gradient redesign, or source pin/release claim in this change.

## Verified outcome

53/53 focused tests pass: card-appearance10, tadazz-appearance10, presentation-scene31, actual StageBackdropV4 SSR2. Web TypeScript passes; typed lint over12 affected source/test files has0 warnings/errors; Prettier passes. The initial runner invocation used the wrong working directory and was corrected; one new fixture assetBase omitted its required trailing slash and was corrected without changing runtime behavior. Current final logs: backdrop-tests.log, backdrop-types.log, backdrop-lint.log and backdrop-gates.json.

Real browser receipt visual-preview/backdrop/audit.json passes10/10 with zero page errors and9screenshots. Classic and Original each verify inherited no-overlay defaults, authored top/bottom with explicit zero, and bottom with0.65 overlay; foreground opacity remains1. Existing legacy overlay slider updates0.2 to0.7 in the unsaved native preview; estimation fallback position is top. Position data is injected as a valid authored sidecar fixture because the modern theme controls do not expose a position input. This is disclosed fixture transport, not a claim of nonexistent UI. Four top/dark screenshots were actually viewed. Original and Classic current geometry/default look are preserved. Native fallback position-only changes in QuestionLivePreview/studio-scene-editor were completed by the preview agent.

Source integrated in frozen foundation af1d879431d3461c7f937a6c5f580eee97b073e2. Release runtime pins/build/deployment remain root-owned separate gates.
