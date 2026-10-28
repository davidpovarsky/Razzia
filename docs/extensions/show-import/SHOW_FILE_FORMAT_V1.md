# TADA Studio — Show File Format Specification (v1)

**Specification Version:** 1.0.0  
**Format Identifier:** `tada-show`  
**Schema Version:** 1  
**Last Updated:** 2026-10-28  

---

## 1. Overview

Tada Studio provides two human-authorable show definitions that map 1:1 to native Tada enhanced bundles:
1. **Friendly JSON (`.tada.json` or `.json` with `"format": "tada-show"`):** Optimized for direct LLM generation (e.g. ChatGPT, Claude) and developer scripting.
2. **Multi-Sheet Excel Workbook (`.xlsx`):** Designed for content creators, educators, and event producers using Microsoft Excel, Google Sheets, or LibreOffice.

Both formats represent a **complete, ordered show timeline** containing:
- All 10 Tada card kinds in exact presentation order (opening, countdown, quiz, survey, transition, animation, media, interim results, leaderboard, closing).
- Per-question parameters (question type, category, scoring, timer, cooldown, media attachments).
- Per-answer image URLs, display modes (`text`, `image`, `both`), and required accessibility `alt` text.
- Human 1-based answer indices (1, 2, 3, 4) mapped automatically to native 0-based indices.
- Studio defaults, leaderboard policies, audio cues, teams, and optional phone roster configuration.

---

## 2. Card Kinds & Behaviors

| Card Kind | Type | Native Mapping | Key Config Properties |
|---|---|---|---|
| `opening` | Scene | `SceneConfig (opening)` | `title` (1–120 chars, req), `subtitle`, `mediaUrl`, `durationMs` (500–60000), `advance` (`auto` \| `manual`) |
| `countdown` | Scene | `SceneConfig (countdown)` | `durationSeconds` (3–120s, default 10), `title`, `advance` (`auto` \| `manual`) |
| `quiz` | Question | `question` + `playMode: "quiz"` | `questionType`, `question`, `answers` (2–4), `correctAnswers` (1–4), `timeSeconds`, `cooldownSeconds`, `maxPoints`, `penalty`, `media`, `reveal` |
| `survey` | Question | `question` + `playMode: "survey"` | `questionType`, `question`, `answers` (2–4), no correct answers, `timeSeconds`, `cooldownSeconds`, `media`, `reveal` |
| `transition` | Scene | `SceneConfig (transition)` | `title`, `description`, `durationMs` (500–60000), `advance` (`auto` \| `manual`) |
| `animation` | Scene | `SceneConfig (animation)` | `preset` (e.g. `spotlight`, `confetti`, `curtain`, max 64 chars), `title`, `durationMs` (500–60000), `advance` (`auto` \| `manual`) |
| `media` | Scene | `SceneConfig (media)` | `mediaUrl` (safe HTTPS or `/media/`), `mediaType` (`image` \| `video`), `title`, `durationMs` (500–300000), `advance` (`auto` \| `manual`) |
| `interimResults` | Scene | `SceneConfig (interimResults)` | `title`, `durationMs` (500–60000), `advance` (`auto` \| `manual`) |
| `leaderboard` | Scene | `SceneConfig (leaderboard)` | `title`, `durationMs` (500–60000), `advance` (`auto` \| `manual`) |
| `closing` | Scene | `SceneConfig (closing)` | `title` (1–120 chars, req), `subtitle`, `mediaUrl`, `durationMs` (500–60000), `advance` (`auto` \| `manual`) |

---

## 3. Friendly JSON (`.tada.json`) Structure

```json
{
  "format": "tada-show",
  "version": 1,
  "title": "Interactive Trivia Gala",
  "note": "Optional producer note",
  "baseGameMode": "quiz",
  "defaults": {
    "newQuestionMode": "quiz",
    "leaderboardPolicy": "cardOnly",
    "advanceMode": "auto"
  },
  "cards": [
    {
      "key": "INTRO",
      "kind": "opening",
      "title": "Welcome to Tada Gala!",
      "subtitle": "Get your buzzers ready",
      "durationMs": 4000,
      "advance": "auto"
    },
    {
      "key": "COUNT1",
      "kind": "countdown",
      "title": "Starting in...",
      "durationSeconds": 5,
      "advance": "auto"
    },
    {
      "key": "Q01",
      "kind": "quiz",
      "questionType": "single",
      "question": "Which planet is known as the Red Planet?",
      "category": "Science",
      "timeSeconds": 20,
      "cooldownSeconds": 3,
      "maxPoints": 1000,
      "penalty": 0,
      "media": {
        "type": "image",
        "url": "https://example.com/mars.jpg"
      },
      "answers": [
        { "text": "Venus", "display": "text" },
        { "text": "Mars", "display": "both", "imageUrl": "https://example.com/mars-thumb.jpg", "alt": "Mars surface" },
        { "text": "Jupiter", "display": "text" },
        { "text": "Saturn", "display": "text" }
      ],
      "correctAnswers": [2],
      "reveal": {
        "effect": "blur",
        "durationMs": 2000,
        "trigger": "automatic",
        "audience": "all"
      }
    },
    {
      "key": "TRANS1",
      "kind": "transition",
      "title": "Audience Survey",
      "description": "No wrong answers here!",
      "durationMs": 3000,
      "advance": "auto"
    },
    {
      "key": "POLL01",
      "kind": "survey",
      "questionType": "single",
      "question": "What is your favorite season?",
      "category": "Lifestyle",
      "timeSeconds": 15,
      "cooldownSeconds": 3,
      "answers": [
        { "text": "Spring" },
        { "text": "Summer" },
        { "text": "Autumn" },
        { "text": "Winter" }
      ]
    },
    {
      "key": "RESULTS1",
      "kind": "interimResults",
      "title": "Poll Breakdown",
      "durationMs": 5000,
      "advance": "manual"
    },
    {
      "key": "LEADER1",
      "kind": "leaderboard",
      "title": "Top Scores",
      "durationMs": 6000,
      "advance": "manual"
    },
    {
      "key": "OUTRO",
      "kind": "closing",
      "title": "Thank you for playing!",
      "subtitle": "See you next time",
      "durationMs": 5000,
      "advance": "auto"
    }
  ],
  "settings": []
}
```

---

## 4. Multi-Sheet Excel Workbook (`.xlsx`) Specification

An official Tada Show workbook has five data sheets plus an informational help sheet:

### 4.1 Sheet `Show` (Key/Value)
2 columns: `key`, `value`.

| Key | Description | Allowed Values / Default |
|---|---|---|
| `format` | Must be `tada-show` | `tada-show` |
| `version` | Format version | `1` |
| `title` | Show/Quiz title | String (e.g. `Friday Trivia Show`) |
| `defaultQuestionMode` | Default question mode | `quiz` \| `survey` (default: `quiz`) |
| `defaultAdvance` | Default card advance mode | `auto` \| `manual` (default: `auto`) |
| `leaderboardPolicy` | Leaderboard policy | `cardOnly` \| `everyN` \| `upstream` \| `disabled` (default: `cardOnly`) |
| `baseGameMode` | Fallback game mode | `quiz` \| `survey` (default: `quiz`) |
| `note` | Producer/Author note | Optional string |

### 4.2 Sheet `Timeline` (One row per card)
Exact headers:
`order`, `cardKey`, `kind`, `title`, `description`, `questionKey`, `playMode`, `durationMs`, `durationSeconds`, `advance`, `preset`, `mediaType`, `mediaUrl`, `subtitle`, `extraJson`

- `order`: Integer specifying card presentation order (e.g. 1, 2, 3...). Cards are sorted ascending by `order`.
- `cardKey`: Unique identifier for this card within the show (e.g. `INTRO`, `Q01`, `T01`).
- `kind`: One of `quiz`, `survey`, `transition`, `animation`, `media`, `leaderboard`, `interimResults`, `countdown`, `opening`, `closing`.
- For `quiz` and `survey`:
  - `questionKey` must refer to a valid `questionKey` in the `Questions` sheet.
  - `playMode` must match the card kind (`quiz` or `survey`).
- For scene kinds:
  - Fill relevant columns (`title`, `description`, `durationMs`, `durationSeconds`, `advance`, `preset`, `mediaType`, `mediaUrl`, `subtitle`).
  - `extraJson`: Optional strict JSON object for advanced scene properties.

### 4.3 Sheet `Questions` (One row per question)
Exact headers:
`questionKey`, `questionType`, `playMode`, `question`, `category`, `note`, `timeSeconds`, `cooldownSeconds`, `maxPoints`, `penalty`, `mediaType`, `mediaUrl`, `correctAnswers`, `optionsJson`, `revealEffect`, `revealDurationMs`, `revealTrigger`, `revealAudience`, `extraJson`

- `questionKey`: Unique identifier referenced by `Timeline` rows.
- `questionType`: `single`, `multi`, `estimation`.
- `playMode`: `quiz` or `survey`.
- `question`: Question text.
- `correctAnswers`: Semicolon-separated list of 1-based answer numbers (e.g. `2` or `1;3`). Left empty for `survey`.
- `timeSeconds`: Timer in seconds (default 20, or -1 for no limit).
- `cooldownSeconds`: 3 to 15 (default 3).
- `maxPoints`: Integer >= 0 (default 1000).
- `penalty`: Integer >= 0 (default 0).
- `revealEffect`: `none`, `blur`, `pixelate`, `tiles`, `zoom`.
- `revealDurationMs`: 250 to 15000.
- `revealTrigger`: `automatic`, `manual`.
- `revealAudience`: `manager`, `all`.

### 4.4 Sheet `Answers` (One row per answer)
Exact headers:
`questionKey`, `answerNumber`, `answerText`, `display`, `imageUrl`, `alt`

- `questionKey`: Points to a question in `Questions`.
- `answerNumber`: 1, 2, 3, or 4 (must be consecutive and unique within each question).
- `answerText`: Text of the answer option.
- `display`: `text`, `image`, or `both` (default: `text`).
- `imageUrl`: Safe HTTPS or `/media/` URL. Required when `display` is `image` or `both`.
- `alt`: Descriptive alt text for accessibility and telephony readout. Required when `display` is `image` or `both`.

### 4.5 Sheet `Settings` (Advanced lossless channels)
Exact headers:
`scope`, `targetKey`, `property`, `valueJson`

- `scope`: `show`, `question`, `scene`, `leaderboard`, `audio`, `team`, `roster`.
- `targetKey`: Card key, question key, or `show`.
- `property`: Name of the property (validated against allowlist).
- `valueJson`: Strict JSON literal (e.g. `true`, `42`, `{"volume": 0.5}`).

### 4.6 Sheet `Help`
Informational user documentation in English and Hebrew explaining:
- Allowed card kinds and fields.
- 1-based answer numbering.
- URL security policies (HTTPS and `/media/` only).
- Formula protection rules (formulas are rejected for safety).

---

## 5. Security & Validation Rules

1. **Strict Reject on Formulas:** Any spreadsheet cell containing `<f>` or formula prefix `=` is strictly rejected with a clear error. Formulas are never evaluated.
2. **Safe Media URLs:** Only `https://` URLs and root-relative `/media/` paths without directory traversal (`..`) are permitted. Unsafe schemes (`javascript:`, `data:`, `file:`) are rejected.
3. **Deterministic ID Generation:** During import, human keys (`cardKey`, `questionKey`) are converted to fresh UUIDs while preserving all relational attachments.
4. **Zero Silent Drops:** Unknown properties or invalid enum values fail preflight validation with row/column or JSON path details.
