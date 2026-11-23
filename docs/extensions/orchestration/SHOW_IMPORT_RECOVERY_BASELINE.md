# Show Import/Export Recovery Baseline Audit

**Author:** Tomer (Integration & Backend Engineer)  
**Date:** 2026-10-28  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tomer`  
**Branch:** `agent/tomer/wave2`  
**Starting Commit SHA:** `762dd73ed1bf526837c93b0711a19ea396d88d1b`  
**Asana Task:** `1219978038914440` (REOPENED for lossless recovery)

---

## 1. Environment & Process State

### 1.1 Git Status
- Branch: `agent/tomer/wave2`
- Commit: `762dd73ed1bf526837c93b0711a19ea396d88d1b`
- Working tree: clean (0 uncommitted changes prior to recovery session)

### 1.2 Service Port State
Verified via `Get-NetTCPConnection`:
- **Port 3000:** Active (PID 27364, Established / Listen) — **PROTECTED: DO NOT TOUCH**
- **Port 3001:** Active (PID 32744, Listen) — **PROTECTED: DO NOT TOUCH**
- **Port 38991:** Inactive / Isolated Telephony Simulator
- **Ports 3010 / 3011:** Free for isolated Playwright E2E testing (`playwright.wave1-acceptance.config.ts`)

---

## 2. Reproduced Defect Analysis

### 2.1 Gate S01: Media URL Validation Bypass
- **Observation:** `authoredQuizCardSchema` and `authoredSurveyCardSchema` only used `questionMediaValidator` from `@razzia/common/validators/quizz`.
- **Finding:** `questionMediaValidator` uses `z.url()`, which accepts `javascript:`, `file:`, `ftp:`, `data:`, and `http:`.
- **Finding:** Server-side `importEnhancedBundle` took `quizz` as `z.unknown()` without validating question media or answer/scene media URLs. A direct POST to `/api/extensions/import` would accept unsafe protocols.

### 2.2 Gate D01 & R01: Audio, Teams, Leaderboard & Settings Loss
- **Audio Cue Drop:** `nativeBundleToAuthoredShow` in `show-authoring-convert.ts` lacked any export logic for `extrasV2.audio`. Non-default audio cues (e.g. `volume: 0.37`, `loop: false`, `enabled: false`, custom `media` URLs) were lost and reverted to system defaults (`0.8`) upon roundtrip.
- **Configured Teams with `enabled: false`:** `nativeBundleToAuthoredShow` only exported `teams` when `extrasV2.teams.enabled === true`. Disabled teams with populated team definitions were discarded.
- **Leaderboard `afterQuestionIds` Orphan Bug:** `nativeBundleToAuthoredShow` exported raw native question UUIDs in `settings.afterQuestionIds`. On import, authored import mints fresh question UUIDs. Because `keyToQuestionId` looks up authored keys (e.g. `Q01`), the old UUID failed lookup and was kept as a stale, orphaned UUID in `afterQuestionIds`.
- **V2 Schema Missing Cross-Ref Validation:** `quizExtrasV2Schema.superRefine` validated `timeline` question IDs against `questionIds`, but did NOT validate `leaderboard.afterQuestionIds`.
- **Silent Dropping of Unknown Settings / `extraJson`:** Any unknown scope/property setting was accepted by schema but skipped during conversion without diagnostics. `extraJson` was accepted on card schemas but never mapped into native drafts.

### 2.3 Gate X01: Identical Template and Sample XLSX Files
- **Finding:** `TADA_Show_Template_v1.xlsx` and `SAMPLE.xlsx` in `docs/extensions/show-import/` had identical SHA-256 hashes (`3055AF3F2F9644CBEEB4614AFA2252F0F21019E30F13B1F4E51123B8450AD18B`).
- **Cause:** `show-workbook.test.ts` contained an incidental side effect writing `templateBytes` (prepopulated with 11 sample cards) to both file paths on every test run.

### 2.4 Gate L01: Pre-Modern Legacy Quizz Normalization
- **Finding:** `show-import-preflight.ts` ran `quizzValidator.safeParse(parsedJson)` directly. Older legacy quizzes without `gameMode`, questions without `type`, or scalar `solutions` failed preflight even though `normalizeLegacyQuizz` in `@razzia/common` could normalize them.

---

## 3. Native vs Authored Field Coverage Matrix

| Native Field / Sub-system | Friendly JSON Location | XLSX Location | Roundtrip Status in Baseline | Target Status in Recovery |
|---|---|---|---|---|
| `quizz.subject` | `title` | `Show!B4` | Supported | Full roundtrip |
| `quizz.gameMode` | `baseGameMode` | `Show!B8` | Supported | Full roundtrip |
| `quizz.questions[].question` | `cards[].question` | `Questions!D{row}` | Supported | Full roundtrip |
| `quizz.questions[].type` | `cards[].questionType` | `Questions!B{row}` | Supported | Full roundtrip |
| `quizz.questions[].playMode` | `cards[].kind` | `Questions!C{row}` | Supported | Full roundtrip |
| `quizz.questions[].media` | `cards[].media` | `Questions!K-L{row}` | Unsafe URLs permitted | **STRICT validation (Gate S01)** |
| `quizz.questions[].answers` | `cards[].answers[].text` | `Answers!C{row}` | Supported | Full roundtrip |
| `quizz.questions[].solutions` | `cards[].correctAnswers` | `Questions!M{row}` | Supported (1-based <-> 0-based) | Full roundtrip |
| `quizz.questions[].time` | `cards[].timeSeconds` | `Questions!G{row}` | Supported | Full roundtrip |
| `quizz.questions[].cooldown` | `cards[].cooldownSeconds` | `Questions!H{row}` | Supported | Full roundtrip |
| `quizz.questions[].maxPoints` | `cards[].maxPoints` | `Questions!I{row}` | Supported | Full roundtrip |
| `quizz.questions[].penalty` | `cards[].penalty` | `Questions!J{row}` | Supported | Full roundtrip |
| `quizz.questions[].options` | `cards[].options` | `Questions!N{row}` | Supported | Full roundtrip |
| `extras.defaults.*` | `defaults.*` | `Show!B5-B7` | Supported | Full roundtrip |
| `extras.timeline` (all 10 kinds) | `cards[].kind` | `Timeline!C{row}` | Supported | Full roundtrip |
| `extras.scenes` (configs) | `cards[]` | `Timeline!{row}` | Supported | Full roundtrip |
| `extras.perQuestion.answerVisuals` | `cards[].answers[].display/imageUrl/alt` | `Answers!D-F{row}` | Supported | Full roundtrip |
| `extras.perQuestion.reveal` | `cards[].reveal` | `Questions!O-R{row}` | Supported | Full roundtrip |
| `extras.leaderboard.mode/everyN` | `settings` (scope: leaderboard) | `Settings!{row}` | Supported | Full roundtrip |
| `extras.leaderboard.afterQuestionIds` | `settings` (scope: leaderboard) | `Settings!{row}` | **BROKEN: Stale UUID orphan** | **REMAP to card keys (Gate R01)** |
| `extras.teams` (enabled: true) | `settings` (scope: team) | `Settings!{row}` | Supported | Full roundtrip |
| `extras.teams` (enabled: false, with teams) | `settings` (scope: team) | `Settings!{row}` | **DROPPED in baseline** | **Preserve teams (Gate D01)** |
| `extras.audio.cues` | `settings` (scope: audio) | `Settings!{row}` | **DROPPED in baseline** | **Preserve cues (Gate D01)** |
| `extras.roster.participants` | `settings` (scope: roster) | `Settings!{row}` | PII risk | **Privacy policy (Gate D02)** |
| Unknown settings / `extraJson` | `settings` / `card.extraJson` | `Settings` / `Questions` | **Silently ignored** | **Reject with diagnostic (Gate T13)** |

---

## 4. Recovery Action Plan

1. **Gate S01:** Strengthen `isSafeMediaUrl` in `extensions/src/core/media.ts` to block protocol-relative URLs (`//`), custom schemes, backslashes, encoded traversal (`%2e`), and control characters. Add strict media validation to `authoredQuizCardSchema`, `authoredSurveyCardSchema`, `show-import-preflight.ts`, and server `importEnhancedBundle`.
2. **Gate D01 & R01:**
   - In `show-authoring-convert.ts`:
     - Map `leaderboard.afterQuestionIds` from native question UUIDs to authored card keys (e.g. `Q01`) on export, and resolve card keys to fresh question UUIDs on import. Fail with diagnostic if card key is unknown.
     - Add `afterQuestionIds` orphan check to `quizExtrasV2Schema.superRefine`.
     - Export `audio.cues` losslessly in `settings` (`scope: "audio", property: "cues"`).
     - Export `teams` even when `enabled: false` if teams definitions exist.
     - Validate all `settings` scope/property/valueJson and reject unknown scopes, properties, target keys, and unsupported `extraJson` with actionable error diagnostics.
3. **Gate D02:** Implement privacy-safe export by default (`roster.participants` omitted unless explicit authorized flag passed).
4. **Gate L01:** Apply `normalizeLegacyQuizz` in `show-import-preflight.ts` and in server import. Verify read-only legacy no-sidecar export.
5. **Gate X01:**
   - Implement `generateTadaShowWorkbookBlankTemplate()` producing a genuinely empty template with 6 sheets, zero sample questions.
   - Produce `SAMPLE.xlsx` matching `SAMPLE.tada.json`.
   - Remove file-writing side effects from `show-workbook.test.ts`.
   - Add cell coordinates (`Sheet!ColRow`) to all workbook parsing errors.
6. **Gate U01:** Add "Export as Tada JSON (.tada.json)" button to Manager Quizz row in `ConfigManageQuizz.tsx`.
7. **Verification:** Add tests T01–T18, run Playwright E2E on isolated ports, verify zero disk writes on cancel, run full test suite, generate documentation.
