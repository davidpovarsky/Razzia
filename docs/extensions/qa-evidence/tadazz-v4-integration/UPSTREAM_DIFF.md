# TADAZZ v4 Native Integration — Upstream Diff & Source Protection Audit

## 1. Compliance Standard: P0 Hard Stop (2026-11-03)
Baseline commit is upstream Razzia v4.0.1: `5161eb7022144ee26d46a5f94cdbc714ec8b560d`.
Policy rules:
- Default is ZERO edits to protected files.
- All new Tada logic must reside in `extensions/**` and dedicated downstream show components.
- Zero business logic added to original source.
- No push or merge to `main` without explicit owner authorization.

---

## 2. Active Session Upstream Touches Audit

Running `git status --short packages/` confirms:
```
 M packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx
 M packages/web/src/features/game/components/tadazz-show/useTadazzLabels.ts
```

### Analysis of Touched Files:
1. `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`:
   - **Type:** Added file (Downstream TADAZZ Show view component; not part of upstream baseline `5161eb7`).
   - **Modifications:** Added `TadazzV4StageAdapter` rendering when `isTadazzV4Active(extensionState)` is true; preserved fallback to `TadazzStage` when `motionKit === "goldy-20261105"` or `"legacy"`. Protected question frame during player status `WAIT`.
2. `packages/web/src/features/game/components/tadazz-show/useTadazzLabels.ts`:
   - **Type:** Added file (Downstream TADAZZ Show hook; not part of upstream baseline `5161eb7`).
   - **Modifications:** Added `useTadazzV4Labels()` hook providing i18n label dictionary for v4 stage components.

### Protected Upstream File Touches in Current Task:
- `packages/socket/**`: **0 files modified**
- `packages/common/**`: **0 files modified**
- Upstream `packages/web/src/**` (existing components): **0 files modified**
- Total protected upstream modifications in current task: **ZERO (0)**

---

## 3. Extension-Level Files Modified / Added

All new integration code was placed cleanly in `extensions/`:

- `extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx`: Native React adapter connecting `TadazzStageHandle` to `TadazzV4Stage`, managing continuous question flow, chosen player animations, and custom screens.
- `extensions/src/presentation/tadazz-v4/components.tsx`: Test IDs, interactive card selection, monologue/monogram fallback, explanation note, leaderboard individual/team title support.
- `extensions/src/presentation/tadazz-v4/types.ts`: Extended data interface (`questionKey`, `solutions`, `selectedIndices`, `interactive`, `note`, `page`, `cardsAlreadyOnStage`), eliminated truncation.
- `extensions/src/presentation/tadazz-v4/motion.ts`: Added deterministic finish queue, reduced motion toggle, continuous card transitions.
- `extensions/src/presentation/tadazz-v4/tadazz-v4.css`: Interactive states, focus visibility, wipe layer overlay, stage pointer events.
- `extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx`: Handle methods (`clear`, `wipe`, `patchData`), Z-wipe execution and blade removal.
- `extensions/src/locales/*/extensions.json`: Added `extensions:tadazzShow.v4.*` keys across all 8 supported languages (`en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`).
- `extensions/src/core/studio-timeline-schema.ts`: Added `"tadazz-v4"` to `motionKit` enum; reconciled `PublicAnswerRecapQuestionItem` optional fields.
