# TADA Studio — P1 Implementation Baseline & State Machine Map

**Date:** 2026-10-30  
**Author:** Tomer (Backend / Core / Integration — Single Agent Execution)  
**Workspace:** `C:\Users\DAVID\Code\Razzia-worktrees\tomer`  
**Branch:** `agent/tomer/wave2`  
**Verified Baseline HEAD:** `7c0ec24734cce11455ecded0aff97200785df53c` (Clean working tree)

---

## 1. Scope & Objectives

Deliver the three mandatory P1 improvements defined in `TADA_ONE_AGENT_TOMER_COMPLETE_P0_2026-10-26.md`:
1. **Prominent, Stage-Readable 20-Second Countdown Timer:**
   - 2–3× apparent size at 1080p, Rubik typography, monospace digits.
   - Positioned in HUD above cards; preserves 3+2 PhotoCardGrid without covering art across 1920×1080, 1280×800, 1024×768, and mobile.
   - Synchronized across Host (`Answers.tsx`) and Spectator Projector (`/display/:gameId`).
   - Warning state at $\le 5$s; respects `prefers-reduced-motion`; no negative numbers; hidden during `NO_TIME_LIMIT`.
2. **True, One-Click Authoritative Previous Screen Navigation:**
   - Upper-left toolbar button opposite Next Screen.
   - Navigates immediately to preceding timeline step (scenes or prior completed question results).
   - Preserves History button separately.
   - Zero vote/score ledger corruption; read-only playback of scored rounds; disabled with explicit reason during active voting or at show start.
3. **Per-Quiz/Survey Question Entrance Animations:**
   - Curated stage-ready presets: `none`, `fade`, `slide-up`, `slide-side`, `zoom-soft`, `spotlight`, `curtain`.
   - Editor selector with interactive authentic live preview.
   - Executed once per question epoch on Host and Projector; does not restart on votes/ticks.
   - Full roundtrip persistence across Native Bundle, Friendly JSON (`TadaShowV1`), and 6-sheet Excel (`.xlsx`).

---

## 2. Show Coordinator & Round State Transition Graph

```mermaid
stateDiagram-v2
    [*] --> Lobby: Create / Join Game

    Lobby --> Step0_Scene: onShowStart (Step 0 Scene, e.g. Opening)
    Lobby --> Step0_Question: onShowStart (Step 0 Question)

    state "Studio Scene (e.g. Opening / Transition / Interim)" as SceneStep {
        [*] --> SceneActive
        SceneActive --> NextScene: NEXT_SCREEN
        SceneActive --> PrevScene: PREVIOUS_SCREEN (if stepIndex > 0)
    }

    state "Question Lifecycle" as QuestionStep {
        [*] --> SHOW_PREPARED: 2s Countdown
        SHOW_PREPARED --> SHOW_QUESTION: cooldown (3s)
        SHOW_QUESTION --> SELECT_ANSWER: 20s Answering (with Entrance Animation)
        
        note right of SELECT_ANSWER
          Active Voting:
          canPrevious = false
          canNext = false
          Host can click End Timer
        end note

        SELECT_ANSWER --> SHOW_RESPONSES: Timer expires or End Timer
        
        state "SHOW_RESPONSES (Reveal)" as RespState {
            note right of RespState
              canPrevious = true (returns to prior Scene or Question Results)
              canNext = true
              Read-only results / Plurality / Percentages
            end note
        }
        
        SHOW_RESPONSES --> SHOW_LEADERBOARD: NEXT_SCREEN (if quiz & enabled)
        SHOW_RESPONSES --> SHOW_INTERLUDE: NEXT_SCREEN (if survey or skipped LB)
        SHOW_RESPONSES --> NextTimelineStep: NEXT_SCREEN (if last round step)

        SHOW_LEADERBOARD --> SHOW_RESPONSES: PREVIOUS_SCREEN
        SHOW_LEADERBOARD --> SHOW_INTERLUDE: NEXT_SCREEN (if interlude enabled)
        SHOW_LEADERBOARD --> NextTimelineStep: NEXT_SCREEN (if last round step)

        SHOW_INTERLUDE --> SHOW_LEADERBOARD: PREVIOUS_SCREEN (or SHOW_RESPONSES)
        SHOW_INTERLUDE --> NextTimelineStep: NEXT_SCREEN
    }

    Step0_Scene --> SceneStep
    Step0_Question --> QuestionStep
    NextScene --> QuestionStep: Timeline item is Question
    NextScene --> SceneStep: Timeline item is Scene
    NextTimelineStep --> SceneStep: Next timeline item is Scene
    NextTimelineStep --> QuestionStep: Next timeline item is Question
    NextTimelineStep --> Finished: End of timeline

    PrevScene --> SceneStep: Prior item is Scene
    PrevScene --> QuestionStep: Prior item is Question (shows completed results read-only)
```

---

## 3. Transition & Edge Safety Matrix

| Current State / Screen | Command | Destination | Safety Policy / Ledger Rules |
|---|---|---|---|
| Step 0 Scene (`index === 0`) | `PREVIOUS_SCREEN` | Blocked (`canPrevious=false`) | Reason: "At start of show". No operation. |
| Scene Step $i > 0$ | `PREVIOUS_SCREEN` | Scene $i-1$ or Question $i-1$ | If step $i-1$ is Scene, activates it. If Question, displays completed read-only results. Cancels auto-advance timer. |
| Question: `SELECT_ANSWER` (voting active) | `PREVIOUS_SCREEN` | Blocked (`canPrevious=false`) | Reason: "Cannot navigate back during active voting". Prevents vote corruption. |
| Question: `SHOW_RESPONSES` | `PREVIOUS_SCREEN` | Timeline step $i-1$ | Returns to preceding Scene or preceding Question's read-only results. Current votes/scores remain in ledger. |
| Question: `SHOW_LEADERBOARD` | `PREVIOUS_SCREEN` | `SHOW_RESPONSES` (current question) | Re-displays current question's reveal without re-opening voting. |
| Question: `SHOW_INTERLUDE` | `PREVIOUS_SCREEN` | `SHOW_LEADERBOARD` or `SHOW_RESPONSES` | Steps back within current question without scoring mutation. |
| Finished / Summary | `PREVIOUS_SCREEN` | Blocked (`canPrevious=false`) | Show concluded. |

---

## 4. File Mapping

| Component | Target File | Nature of Change |
|---|---|---|
| Schema: Question Entrance | `extensions/src/core/quiz-extras.ts` | Define `questionEntranceSchema`, `QUESTION_ENTRANCE_PRESETS`, add to `perQuestionItemSchema`. |
| Schema: Friendly JSON | `extensions/src/core/show-authoring-schema.ts` | Add optional `questionEntrance` to `authoredQuizCardSchema` & `authoredSurveyCardSchema`. |
| Conversion: Friendly $\leftrightarrow$ Native | `extensions/src/core/show-authoring-convert.ts` | Two-way mapping for `questionEntrance` across quiz and survey cards. |
| Schema: Excel Workbook | `extensions/src/core/show-workbook.ts` | Add `entrancePreset` and `entranceDurationMs` columns to `Questions` sheet & `Help` sheet. |
| Command Schema | `extensions/src/core/commands.ts` | Add `previousScreenCommandSchema` (`PREVIOUS_SCREEN`). |
| Constants & Validators | `extensions/src/core/constants.ts`, `packages/common/src/validators/socket.ts` | Add `PREVIOUS_SCREEN` action. |
| Timeline Runner | `extensions/src/gameplay/timeline-runner.ts` | Add `canPrevious()` and `previous()` to step backward safely. |
| Show Coordinator | `extensions/src/server/game/studio-show-coordinator.ts` | Add `canPrevious()` and `previousScene()`, handling scene and question transitions. |
| Session & Delegate | `extensions/src/server/game/session.ts` | Handle `PREVIOUS_SCREEN`, expose `canPrevious` in `ExtensionStateEnvelope.extras`. |
| Round Manager | `packages/socket/src/services/game/round-manager.ts` | Add `canPrevious()` and `previousScreen()`, support read-only display of completed questions. |
| Prominent Timer UI | `packages/web/src/features/game/components/AnswerCountdown.tsx` | Reusable large countdown timer component with $\le 5$s warning and accessibility. |
| Host Timer Integration | `packages/web/src/features/game/components/states/Answers.tsx` | Use `AnswerCountdown` in HUD above cards; verify no clipping with 5 photo cards. |
| Spectator Timer Integration | `packages/web/src/pages/display/$gameId.tsx` | Use `AnswerCountdown` in spectator header. |
| Previous Button in Toolbar | `packages/web/src/features/game/components/ManagerControlToolbar.tsx` | Add upper-left Previous Screen button; retain separate History button. |
| Entrance Animation Engine | `packages/web/src/features/game/components/QuestionEntrance.tsx` | Pure CSS GPU-accelerated entrance effects with reduced-motion fallback. |
| Question Editor Selector & Preview | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorConfig/BaseConfig.tsx` | Add Entrance Animation section with preset selector, duration, and live preview. |
| Locales | `extensions/src/locales/*/extensions.json` | 8 languages: English, Hebrew, German, Spanish, French, Italian, Japanese, Turkish, Vietnamese. |
