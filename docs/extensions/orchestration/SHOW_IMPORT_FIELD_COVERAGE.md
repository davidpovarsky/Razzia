# Show Import/Export Field Coverage Specification

**Document:** Comprehensive field-by-field audit & mapping specification  
**Governance:** `extensions/src/core/show-authoring-schema.ts`, `show-authoring-convert.ts`, `show-workbook.ts`  
**Date:** 2026-10-28  

---

## 1. Field Mapping Matrix

| Category | Native Field | Friendly JSON Location | XLSX Location | Roundtrip Semantics | Privacy Class | Test Ref | Status |
|---|---|---|---|---|---|---|---|
| **Show Meta** | `quizz.subject` | `title` | `Show!B4` | Lossless string | Public | T01 | Verified |
| **Show Meta** | `quizz.gameMode` | `baseGameMode` | `Show!B8` | Lossless enum: `"quiz" \| "survey"` | Public | T01 | Verified |
| **Show Meta** | `extras.authoring.showNote` | `note` | `Show!B9` | Lossless string preserved across Studio editor save/reopen without altering `quizz.subject` | Public | C02 | Verified |
| **Defaults** | `extras.defaults.newQuestionMode` | `defaults.newQuestionMode` | `Show!B5` | Lossless enum: `"quiz" \| "survey"` | Public | T01 | Verified |
| **Defaults** | `extras.defaults.leaderboardPolicy` | `defaults.leaderboardPolicy` | `Show!B6` | Lossless enum: `"cardOnly" \| "everyN" \| "upstream" \| "disabled"` | Public | T01 | Verified |
| **Defaults** | `extras.defaults.advanceMode` | `defaults.advanceMode` | `Show!B7` | Lossless enum: `"auto" \| "manual"` | Public | T01 | Verified |
| **Question** | `quizz.questions[].question` | `cards[].question` | `Questions!D{row}` | Lossless string | Public | T02 | Verified |
| **Question** | `quizz.questions[].type` | `cards[].questionType` | `Questions!B{row}` | Lossless enum: `"single" \| "multi" \| "estimation"` | Public | T02 | Verified |
| **Question** | `quizz.questions[].playMode` | `cards[].kind` | `Questions!C{row}` | Lossless enum: `"quiz" \| "survey"` | Public | T02 | Verified |
| **Question** | `quizz.questions[].category` | `cards[].category` | `Questions!E{row}` | Lossless string | Public | T02 | Verified |
| **Question** | `quizz.questions[].note` | `cards[].note` | `Questions!F{row}` | Lossless string | Public | T02 | Verified |
| **Question** | `quizz.questions[].time` | `cards[].timeSeconds` | `Questions!G{row}` | Lossless integer (-1 to 300) | Public | T02 | Verified |
| **Question** | `quizz.questions[].cooldown` | `cards[].cooldownSeconds` | `Questions!H{row}` | Lossless integer (3 to 15) | Public | T02 | Verified |
| **Question** | `quizz.questions[].maxPoints` | `cards[].maxPoints` | `Questions!I{row}` | Lossless integer (>= 0) | Public | T02 | Verified |
| **Question** | `quizz.questions[].penalty` | `cards[].penalty` | `Questions!J{row}` | Lossless integer (>= 0) | Public | T02 | Verified |
| **Question** | `quizz.questions[].media` | `cards[].media` | `Questions!K-L{row}` | Safe HTTPS or `/media/` only; validated on import | Public | T08 | Verified |
| **Question** | `quizz.questions[].answers` | `cards[].answers[].text` | `Answers!C{row}` | Lossless array of strings (2-4) | Public | T02 | Verified |
| **Question** | `quizz.questions[].solutions` | `cards[].correctAnswers` | `Questions!M{row}` | 1-based in authored <-> 0-based in native | Public | T02 | Verified |
| **Question** | `quizz.questions[].options` | `cards[].options` | `Questions!N{row}` | Multi / estimation options schema | Public | T02 | Verified |
| **PerQuestion**| `answerVisuals[].display` | `cards[].answers[].display` | `Answers!D{row}` | Lossless enum: `"text" \| "image" \| "both"` | Public | T02 | Verified |
| **PerQuestion**| `answerVisuals[].url` | `cards[].answers[].imageUrl` | `Answers!E{row}` | Safe HTTPS or `/media/` only | Public | T08 | Verified |
| **PerQuestion**| `answerVisuals[].alt` | `cards[].answers[].alt` | `Answers!F{row}` | Mandatory string if image present | Public | T02 | Verified |
| **PerQuestion**| `reveal.effect` | `cards[].reveal.effect` | `Questions!O{row}` | Lossless enum: `"none" \| "blur" \| "pixelate" \| "tiles" \| "zoom"` | Public | T03 | Verified |
| **PerQuestion**| `reveal.durationMs` | `cards[].reveal.durationMs` | `Questions!P{row}` | Lossless integer (250-15000) | Public | T03 | Verified |
| **PerQuestion**| `reveal.trigger` | `cards[].reveal.trigger` | `Questions!Q{row}` | Lossless enum: `"automatic" \| "manual"` | Public | T03 | Verified |
| **PerQuestion**| `reveal.audience` | `cards[].reveal.audience` | `Questions!R{row}` | Lossless enum: `"manager" \| "all"` | Public | T03 | Verified |
| **PerQuestion**| `perQuestion[id].interlude` | `cards[].interlude` | `Questions!T{row}` | Lossless object adhering to `interludeSchema` (`kind`, `title`, `url`, `durationMs`, `advance`, `audioCue`) | Public | C01 | Verified |
| **Timeline** | (10 card kinds) | `cards[].kind` | `Timeline!C{row}` | Ordered: `opening`, `countdown`, `quiz`, `survey`, `transition`, `animation`, `media`, `interimResults`, `leaderboard`, `closing` | Public | T01 | Verified |
| **Scenes** | `scenes[].title` | `cards[].title` | `Timeline!D{row}` | Lossless string | Public | T01 | Verified |
| **Scenes** | `scenes[].description` | `cards[].description` | `Timeline!E{row}` | Transition description | Public | T01 | Verified |
| **Scenes** | `scenes[].durationMs` | `cards[].durationMs` | `Timeline!H{row}` | Duration in milliseconds | Public | T01 | Verified |
| **Scenes** | `scenes[].durationSeconds`| `cards[].durationSeconds` | `Timeline!I{row}` | Countdown duration in seconds | Public | T01 | Verified |
| **Scenes** | `scenes[].advance` | `cards[].advance` | `Timeline!J{row}` | Lossless enum: `"auto" \| "manual"` | Public | T01 | Verified |
| **Scenes** | `scenes[].preset` | `cards[].preset` | `Timeline!K{row}` | Animation preset string | Public | T01 | Verified |
| **Scenes** | `scenes[].mediaType` | `cards[].mediaType` | `Timeline!L{row}` | Lossless enum: `"image" \| "video"` | Public | T01 | Verified |
| **Scenes** | `scenes[].mediaUrl` | `cards[].mediaUrl` | `Timeline!M{row}` | Safe HTTPS or `/media/` only | Public | T08 | Verified |
| **Scenes** | `scenes[].subtitle` | `cards[].subtitle` | `Timeline!N{row}` | Opening / closing subtitle | Public | T01 | Verified |
| **Leaderboard**| `leaderboard.mode` | `settings` (scope: leaderboard, prop: mode, targetKey: "show") | `Settings!{row}` | Lossless enum (targetKey must strictly be `"show"`) | Public | T05 | Verified |
| **Leaderboard**| `leaderboard.everyN` | `settings` (scope: leaderboard, prop: everyN, targetKey: "show") | `Settings!{row}` | Lossless integer (targetKey must strictly be `"show"`) | Public | T05 | Verified |
| **Leaderboard**| `leaderboard.afterQuestionIds` | `settings` (scope: leaderboard, prop: afterQuestionIds, targetKey: "show") | `Settings!{row}` | **Remapped to card keys (e.g. `["Q01", "Q03"]`) on export; resolved to fresh UUIDs on import** | Public | T05 | Verified |
| **Teams** | `teams.enabled` | `settings` (scope: team, prop: config, targetKey: "show") | `Settings!{row}` | Lossless boolean (targetKey must strictly be `"show"`) | Public | T06 | Verified |
| **Teams** | `teams.teams` | `settings` (scope: team, prop: config, targetKey: "show") | `Settings!{row}` | Array of `{ id, name, color }` (preserved even if `enabled: false`) | Public | T06 | Verified |
| **Audio** | `audio.cues` | `settings` (scope: audio, prop: cues, targetKey: "show") | `Settings!{row}` | All 9 cue IDs, volume, source, url, enabled, loop preserved | Public | T04 | Verified |
| **Roster** | `roster.phoneInviteOnly` | `settings` (scope: roster, prop: config, targetKey: "show") | `Settings!{row}` | Non-sensitive roster configuration | Non-PII | T14 | Verified |
| **Roster** | `roster.participants` | `settings` (scope: roster, prop: config, targetKey: "show") | `Settings!{row}` | **OMITTED by default for privacy; included only on explicit manager authorization** | Sensitive PII | T14 | Verified |
| **Validation** | Invalid `targetKey` | (rejected) | `Settings!B{row}` | Fails preflight with `invalidSettingTargetKey:Settings!B{row}` | N/A | C03 | Verified |
| **Validation** | Duplicate setting | (rejected) | `Settings!A{row}` | Fails preflight with `duplicateSetting:Settings!A{row}` | N/A | C03 | Verified |
| **Unsupported**| Unknown settings | (rejected) | `Settings!{row}` | Fails preflight with `INVALID_SETTING_PROPERTY` | N/A | T13 | Verified |
| **Unsupported**| Non-empty `extraJson` | (rejected) | `Questions!{row}` / `Timeline!{row}` | Fails preflight with `UNSUPPORTED_EXTRA_JSON` | N/A | T13 | Verified |

---

## 2. Privacy Policy & Default Redaction Rules

1. **Shareable Export (Default):**
   - Any export triggered via Manager `.xlsx` or `.tada.json` exports show configuration with `roster.participants: []`.
   - Protects player names, phone numbers (E.164), and device identifiers from unintentional disclosure when sharing game files.
   - UI explicitly notes: `"Exported shareable show (private participant rosters omitted for privacy)"`.

2. **Full Private Backup (Explicit Opt-In):**
   - Requires explicit manager authorization (`includePrivateRoster: true`).
   - If included, participants are validated via `rosterExtrasSchema` ensuring unique IDs and valid E.164 phone numbers.
