# Wave 1 Studio: Header Row Swap & Card-Creation Crash Recovery

**Author:** Tomer (AI Integration Engineer)  
**Date:** 2026-10-27  
**Branch:** `agent/tomer/wave2`  
**Scope:** P0 Wave 1 Header Row Swap, Card-Creation Crash Resolution, Direct 10-Kind Creation, and Browser Regression Telemetry (C01–C15).

---

## 1. Executive Summary & Root Cause Analysis

### A. The Crash: `Cannot read properties of undefined (reading 'answers')`
#### Observed Behavior & Stack Trace
During card addition, conversion, or rapid deletion/reordering, the UI threw an uncaught TypeError in the browser:
```
TypeError: Cannot read properties of undefined (reading 'answers')
    at choiceInitialValues (packages/web/src/features/questions/utils.ts)
    at QuestionEditorAnswers (packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorAnswers.tsx)
    at QuizzEditorSidebar (packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx)
    at QuestionEditor (packages/web/src/features/quizz/components/QuestionEditor/index.tsx)
```

#### Diagnostic & Root Cause Investigation
1. **Asynchronous Multi-Source State Desynchronization:**
   The quiz editor's state was split across three disparate systems:
   - React Hook Form (`useForm` and `useFieldArray` managing `questions`).
   - Local React state in `QuizzEditorContext` (`questionIds` string array).
   - Local React state in `StudioEditorContext` (`timeline` array of `{ id, kind, questionId | sceneId }`, `scenes` map, `selectedTimelineId`).
   
   Previously, operations like `addTimelineCard`, `removeTimelineCard`, and `executeConversion` made piecemeal updates (calling `append()` / `setValue()`, `setQuestionIds()`, `setTimeline()`, and `setExtras()`) in separate callbacks.
   
2. **Stale Closure in `syncToExtras`:**
   `syncToExtras` closed over `questionIds` from the component scope. During renders where `setQuestionIds` had just been queued, `syncToExtras` read the *old* `questionIds` array from the previous render. This desynchronized `extras.questionIds` with `timeline`, leaving orphaned timeline items.

3. **Fallback to Question on Undefined Selection in `StudioShell`:**
   In `studio-shell.tsx`:
   ```ts
   // BROKEN:
   const isQuestion = !selectedTimelineItem || selectedTimelineItem.kind === "question"
   ```
   When `selectedTimelineItem` was `undefined` (during card deletion, kind conversion, or timeline re-indexing), `isQuestion` evaluated to `true`, immediately mounting `<QuestionEditor />`.

4. **Unguarded Array Indexing in `QuizzEditorSidebar`:**
   In `QuizzEditorSidebar.tsx`:
   ```ts
   // BROKEN:
   const qIndex = questionIds.findIndex(id => id === item.questionId)
   const question = questions[qIndex]
   // During fast mutations, questions[qIndex] was undefined, but passed into SortableItem -> QuizzEditorCard, which crashed on question.answers.map(...)
   ```

5. **Unguarded Initializer in `choiceInitialValues`:**
   `choiceInitialValues(question)` assumed `question` and `question.answers` were always defined objects.

---

## 2. Implemented Architecture & Data Contract Fixes

### A. Atomic State Mutations (`applyStudioMutation`)
In `packages/web/src/features/quizz/components/studio/studio-editor-context.tsx`, we introduced an atomic mutation helper:
```ts
interface StudioMutationResult {
  nextQuestions: Question[]
  nextQuestionIds: string[]
  nextTimeline: TimelineItem[]
  nextScenes: Record<string, SceneConfig>
  nextSelectedId: string
  nextCurrentIndex: number
}
```
All state transitions (`executeConversion`, `addTimelineCard`, `removeTimelineCard`, `duplicateTimelineCard`, `reorderTimelineCards`) now compute the complete next snapshot synchronously, then commit:
1. `replaceQuestions(nextQuestions, nextQuestionIds)` via `useFieldArray.replace` on RHF.
2. `setTimeline(nextTimeline)`.
3. `setScenes(nextScenes)`.
4. `setSelectedTimelineId(nextSelectedId)`.
5. `setCurrentIndex(nextCurrentIndex)`.
6. `syncToExtras(nextTimeline, nextScenes, { targetQuestionIds: nextQuestionIds })`.

### B. Header Row Swap (Original Razzia Design Language Preserved)
In `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx`:
- **Row 1 (Top):**
  - Original Quiz Title input (`w-44 sm:w-56 shrink-0`).
  - Studio navigation tabs (`Questions`, `Participants`, `Settings`, `Launch`) with active primary indicator pill.
  - Action buttons (`Exit`, `Save`) pinned with `shrink-0` and full viewport reachability across 1024, 1280, 1440, and 1920 viewports.
- **Row 2 (Directly below):**
  - Contextual card kind selector utilizing the original Razzia `ToggleGroup` expanded to all 10 kinds (`quiz`, `survey`, `transition`, `animation`, `media`, `leaderboard`, `interimResults`, `countdown`, `opening`, `closing`).
  - Rendered **strictly** when `activeTab === "questions"`, fully collapsed on `participants`, `settings`, and `launch`.
  - Wrapped in horizontal scroll container (`overflow-x-auto min-w-0`) ensuring all toggles remain pointer and keyboard accessible.

### C. Direct Card Creation in Sidebar Footer
In `packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx`:
- Added a localized `Select` dropdown (`data-testid="studio-card-kind-select"`) listing all 10 card kinds.
- Added an "Add card" `Button` (`data-testid="studio-add-card-btn"`) using localized string `t("extensions:studio.addCard", "Add card")`.
- Enables direct creation of non-question scene cards (Transitions, Leaderboards, Media, etc.) without mutating existing questions.
- Added translation keys to all 8 supported locales: `en`, `de`, `es`, `fr`, `it`, `ja`, `tr`, `vi`.

### D. Multi-Tiered Render Guards
- `studio-shell.tsx`: `<QuestionEditor />` is never rendered when `selectedTimelineItem` is undefined or not a question.
- `QuestionEditor/index.tsx`: Early return if `!hasCurrentQuestion || isRemoving`.
- `QuestionEditorAnswers.tsx`: Safe destructuring with fallback `{ answers = [] } = currentQuestion ?? {}`.
- `QuizzEditorCard.tsx`: Guarded against undefined `question` and `answers`.
- `questions/utils.ts`: Guarded `choiceInitialValues` with safe fallback.

---

## 3. Discrepancy Analysis: New Quiz Route `/manager/quizz`

- **Issue:** The user observed an old screen with `Quiz Enhancements` on `/manager/quizz`.
- **Finding:** Both `/manager/quizz/index.tsx` and `/manager/quizz/$quizzId.tsx` mount `<StudioShell />`. The discrepancy was verified to be a stale browser tab from prior to the Wave 1 build and HMR bundle reload.
- **Verification:** Verified via clean Playwright automated browser test C01 navigating directly to `/manager/quizz` in a fresh authenticated session: `StudioShell` with swapped rows and 10 card kinds renders immediately; zero old `Quiz Enhancements` elements exist.

---

## 4. Verification Evidence & Test Summary

| Check Suite | Command | Result |
|---|---|---|
| TypeScript Typecheck | `pnpm -r exec tsc --noEmit` | **Clean (0 errors)** |
| Oxlint Linter | `pnpm lint` | **Clean (0 errors, 1 pre-existing warning)** |
| Core Packages Unit Tests | `pnpm test` | **20 passed (287 tests)** |
| Extensions Unit Tests | `pnpm --filter @razzia/extensions test` | **20 passed (191 tests)** |
| Web & Socket Builds | `pnpm build` | **Clean builds (rolldown & vite)** |
| Browser E2E Suite | Playwright `playwright.wave1-acceptance.config.ts` | **21 passed (6 existing + 15 C01–C15)** |
