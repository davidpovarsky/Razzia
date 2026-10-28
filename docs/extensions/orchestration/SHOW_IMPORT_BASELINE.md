# TADA Studio — Show Import/Export Baseline Audit

**Date:** 2026-10-28  
**Agent:** Tomer (Single-agent execution)  
**Branch:** `agent/tomer/wave2`  
**Commit:** `ad63bbe5292db23c5acb53d68e331b726bbbac00`  
**Asana Task:** `1219978038914440` (Parent: `1219882771107539`)

---

## 1. Existing Integration Points Audit

### 1.1 `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx`
- **Current File Input:** `<input type="file" accept=".json" className="hidden" onChange={handleImport} />`.
- **Import Handler:** Uses `FileReader.readAsText`, parses with `JSON.parse`. Checks `isEnhancedBundle(parsed)`.
  - If enhanced bundle: calls `client.importQuizBundle(parsed)`.
  - If standard JSON: calls `importQuizz(parsed as QuizzValidated)` via TanStack Query mutation (`createQuizz`).
  - Error handling: catches all errors into a generic `toast.error("Invalid JSON file")`, masking actual parse, schema, and network errors.
- **Export Affordances:**
  - Legacy export button: downloads `${quizz.subject}.json`.
  - Enhanced export button: downloads `${subject}.bundle.json` with `isEnhancedBundle` payload via `CompositeApiClient.exportQuizBundle(id)`.
- **Styling & UI Tokens:** Uses original Razzia primitives: `Button`, `AlertDialog`, Lucide icons (`Upload`, `Download`, `Sparkles`, `SquarePen`, `Trash2`), Tailwind classes, and `useTranslation`.

### 1.2 `extensions/src/core/bundle.ts`
- `bundleVersion`: literal `1`.
- `enhancedBundleSchema`: Strict object `{ bundleVersion: 1, quizz: unknown, extras: QuizExtrasV1 | QuizExtrasV2 }`.
- `isEnhancedBundle(data)`: Validates bundle shape and sidecar schema.
- **Note:** `bundleVersion` is separate from `extras.schemaVersion` (which is 1 or 2).

### 1.3 `extensions/src/core/studio-timeline-schema.ts`
- **Item Kinds:** 10 kinds:
  - `quiz` (represented in timeline as `{ kind: "question", questionId }` with `playMode: "quiz"`)
  - `survey` (represented in timeline as `{ kind: "question", questionId }` with `playMode: "survey"`)
  - Non-question kinds: `transition`, `animation`, `media`, `leaderboard`, `interimResults`, `countdown`, `opening`, `closing`.
- **Non-question Timeline Items:** `{ id: UUID, kind: <Kind>, sceneId: UUID }`.
- **Scene Configs:** Stored in `extras.scenes[sceneId]`, discriminated by `kind`:
  - `transition`: `{ id, kind, title?, description?, durationMs (500-60000, def 5000), advance ("auto"|"manual", def "auto") }`
  - `animation`: `{ id, kind, preset (max 64, def "spotlight"), title?, durationMs (500-60000, def 3000), advance ("auto"|"manual", def "auto") }`
  - `media`: `{ id, kind, mediaUrl, mediaType ("image"|"video", def "image"), title?, durationMs (500-300000, def 5000), advance ("auto"|"manual", def "auto") }`
  - `leaderboard`: `{ id, kind, title?, durationMs (500-60000, def 5000), advance ("auto"|"manual", def "auto") }`
  - `interimResults`: `{ id, kind, title?, durationMs (500-60000, def 5000), advance ("auto"|"manual", def "auto") }`
  - `countdown`: `{ id, kind, durationSeconds (3-120, def 10), title?, advance ("auto"|"manual", def "auto") }`
  - `opening`: `{ id, kind, title (1-120 chars), subtitle?, mediaUrl?, durationMs (500-60000, def 5000), advance ("auto"|"manual", def "auto") }`
  - `closing`: `{ id, kind, title (1-120 chars), subtitle?, mediaUrl?, durationMs (500-60000, def 5000), advance ("auto"|"manual", def "auto") }`
- **Studio Defaults:** `newQuestionMode` ("quiz"|"survey"), `leaderboardPolicy` ("upstream"|"everyN"|"cardOnly"|"disabled"), `advanceMode` ("auto"|"manual").
- **Referential Integrity Constraints:**
  - `questionIds` must be unique and non-empty.
  - Timeline item IDs must be unique.
  - Every `questionId` in `questionIds` must appear in timeline and vice versa.
  - Every `sceneId` must exist in `scenes` with matching `kind`.
  - Every `perQuestion` key must be in `questionIds`.

### 1.4 `packages/common/src/validators/quizz.ts` & `constants.ts`
- **Base Question:** `{ type, playMode, question, category, note, media, answers, solutions, cooldown, time, maxPoints, penalty, options }`.
  - `type`: `single`, `multi`, `estimation`.
  - `playMode`: `quiz` or `survey`.
  - `answers`: array of strings (min 2, max 4).
  - `solutions`: array of numbers (zero-based indices into `answers`). For `quiz`, must have at least 1 solution. For `survey`, solutions are not required.
  - `media`: `{ type: "image"|"video"|"audio", url }`.
- **Quizz Validator:** Requires `gameMode` ("quiz"|"survey"), `subject`, and at least 1 question.

### 1.5 `extensions/src/core/quiz-extras.ts` & `media.ts`
- **Answer Visuals:** `perQuestion[questionId].answerVisuals[]`:
  - `answerIndex`: number (zero-based, 0 to 3).
  - `display`: `"text" | "image" | "both"`.
  - `url`: safe media URL (required if display is `image` or `both`).
  - `alt`: string (required if display is `image` or `both`).
- **Question Reveal:** `perQuestion[questionId].reveal`:
  - `effect`: `"none" | "blur" | "pixelate" | "tiles" | "zoom"`.
  - `durationMs`: integer 250 to 15000.
  - `trigger`: `"automatic" | "manual"`.
  - `audience`: `"manager" | "all"`.
- **Media URL Safety:** `isSafeMediaUrl(url)`:
  - Allowed: root-relative `/media/...` without `..`, or valid `https://` URL.
  - Disallowed: `javascript:`, `data:`, `file:`, `vbscript:`, path traversal `..`.

### 1.6 `extensions/src/server/storage/service.ts`
- `saveCompositeQuiz`: Saves base quiz and sidecar atomically with revision check and staged journal rollback.
- `importEnhancedBundle`: Remaps question IDs to fresh UUIDs, remaps `perQuestion` keys, remaps timeline question IDs, computes new canonical base digest, and mints fresh quiz ID.
- **Identified Defect:** If `extras.leaderboard?.afterQuestionIds` is present in an enhanced bundle, the old IDs are not remapped to the fresh question IDs, causing validation failure. This will be fixed cleanly with an isolated regression test.

### 1.7 `extensions/src/core/roster-import.ts`
- Built-in pure TypeScript ZIP reader/writer and XML parser.
- Currently parses only the first worksheet (`xl/worksheets/sheet1.xml`) and generates only a single sheet ("Participants").
- Can be shared/extracted cleanly to support multi-sheet workbooks (`Show`, `Timeline`, `Questions`, `Answers`, `Settings`, `Help`) with strict security bounds, cell formula rejection, and zip traversal protection.

### 1.8 Baseline Test Status
- All 20 test files and 191 unit/integration tests in `@razzia/extensions` pass cleanly.
- Workspace TypeScript check (`pnpm -r exec tsc --noEmit`) passes with 0 errors.
