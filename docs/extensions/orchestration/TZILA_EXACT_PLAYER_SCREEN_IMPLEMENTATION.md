# Architectural Record: Unification of Public Audience Display to Exact Player Game Screen

**Author:** Tomer (Backend / Core / Integration)  
**Date:** 2026-11-01  
**Target:** Elimination of duplicate `/display` component tree; direct reuse of the authoritative Player Game Screen.

---

## 1. Context and Problem Statement

Previously, `/display/$gameId.tsx` maintained its own independent state machine, timer countdown, and visual layout. It manually rendered duplicate components:
- Its own `ScenePresenter` branch
- A standalone `QuestionEntrance` with custom headings
- An independent `AnswerCountdown` variant
- A separate `PhotoCardGrid` invocation
- Custom reveal and lobby branches

This violated the owner's non-negotiable architectural invariant:
> **"Public audience screen IS the player screen, just without the name/player info at the bottom."**

Having two divergent JSX trees created layout drift, divergent responsive behaviors, potential timing discrepancies, and maintenance duplication.

---

## 2. Before / After Rendering Graph

### BEFORE (Duplicate Visual Trees)

```
[ /party/$gameId ] (Player Route)
  │
  ├── Auth: EVENTS.PLAYER.LOGIN / RECONNECT
  ├── Store: usePlayerStore (player, joinTicket, points)
  └── Render:
        GameWrapper (with Player bottom footer)
          └── GAME_STATE_COMPONENTS[status.name]
                ├── STATUS.SELECT_ANSWER  ──> Answers.tsx ──> SingleAnswers ──> PhotoCardGrid
                ├── STATUS.SHOW_QUESTION  ──> Question.tsx
                ├── STATUS.WAIT           ──> Wait.tsx
                └── (Scene Phase)         ──> GameWrapper: ScenePresenter

[ /display/$gameId ] (Spectator Route — WRONG DUPLICATE)
  │
  ├── Transport: EVENTS.SPECTATOR.JOIN
  └── Render:
        Custom <main data-testid="audience-display">
          ├── Independent Fullscreen Button
          ├── Independent ScenePresenter branch
          ├── Independent QuestionEntrance + custom h1
          ├── Independent AnswerCountdown
          ├── Independent PhotoCardGrid for SELECT_ANSWER
          ├── Independent PhotoCardGrid for SHOW_RESPONSES
          └── Independent Room / Lobby JSX
```

---

### AFTER (Single Authoritative Player Game Screen)

```
[ /party/$gameId ] (Player Route)
  │
  ├── Auth: EVENTS.PLAYER.LOGIN / RECONNECT
  ├── Store: usePlayerStore (player: { username, points })
  └── Component: <PlayerGameView status={status} viewRole="player" />
                   │
                   ▼
       ╔═══════════════════════════════════════════════════════════╗
       ║                  PlayerGameView.tsx                       ║
       ║  - Unified presentation container                         ║
       ║  - Canonical GAME_STATE_COMPONENTS dispatch               ║
       ║  - STATUS.SHOW_ROOM maps to Wait (same as player lobby)   ║
       ╚═══════════════════════════════════════════════════════════╝
                   │
                   ├── ViewRoleContext.Provider (value="player")
                   │
                   ▼
       ╔═══════════════════════════════════════════════════════════╗
       ║                  GameWrapper.tsx                          ║
       ║  - Header: Question counter (e.g. 1 / 3)                  ║
       ║  - Stage: GAME_STATE_COMPONENTS[status.name]              ║
       ║           (or ScenePresenter when phase="scene")          ║
       ║  - Audio: AudioCuePlayer (authoritative audio cues)       ║
       ║  - Bottom Footer:                                         ║
       ║      * If manager: Host Control Toolbar                   ║
       ║      * If player: Bottom white player identity footer     ║
       ║      * If spectator: OMITTED (null)                       ║
       ╚═══════════════════════════════════════════════════════════╝
                   │
                   ├── Answers.tsx (via GAME_STATE_COMPONENTS)
                   │     - Visual mode: isVisualPlayerMode = true (both player & spectator)
                   │     - Submission: canSubmit = true ONLY for real authenticated player
                   │     - Timer: AnswerCountdown variant="player", server-synced remaining
                   │     - Cards: PhotoCardGrid (identical colors, layout, images, font)
                   │
[ /display/$gameId ] (Spectator Route — Clean Read-Only Adapter)
  │
  ├── Transport: EVENTS.SPECTATOR.JOIN (read-only, no player login/ticket)
  ├── State: Sanitized status, no fake player, no roster alteration
  └── Component: <div data-testid="audience-display" data-role="spectator">
                   <PlayerGameView status={status} viewRole="spectator" />
                 </div>
```

---

## 3. Key Invariants & Safeguards

1. **Exact Component Tree Identity:**
   Both routes invoke `PlayerGameView` -> `GameWrapper` -> `GAME_STATE_COMPONENTS`. No spectator-specific CSS, no duplicate JSX, no parallel `PhotoCardGrid` in `/display`.
2. **Sole Visual Distinction:**
   In `GameWrapper`, `viewRole === "spectator"` omits the bottom player identity strip (`player?.username`, team tag, points). No replacement strip, no spacer bar, no fake banner.
3. **Strict Read-Only Transport:**
   The spectator socket joins `this.gameId` via `joinSpectator` and never registers in `PlayerManager`. If a synthetic `player:selectedAnswer` is emitted from a spectator socket, the server rejects it (`errors:auth.unauthorized`) because the socket clientId is absent from `game.players`.
4. **Time & Cooldown Parity:**
   On mid-voting join, `joinSpectator` provides `remainingTime` in `sanitized.data` and emits `GAME.COOLDOWN` with `round.getRemainingSeconds()`. `Answers` initializes `cooldown` directly from `remainingTime`, ensuring the timer starts at the exact remaining value (not reset to 20).
5. **Authoritative Reveal & Results:**
   Both views receive the authoritative studio timeline scenes (`ScenePresenter`) or standard quiz responses (`Responses`) via the same wrapper.

---

## 4. Planned File Changes

1. `packages/web/src/features/game/contexts/view-role-context.tsx`: Minimal context exposing `useViewRole()`.
2. `packages/web/src/features/game/components/GameWrapper.tsx`: Accept `viewRole`, supply context, omit bottom player footer for spectator.
3. `packages/web/src/features/game/components/PlayerGameView.tsx`: Shared presentational component for player screen dispatch.
4. `packages/web/src/pages/party/$gameId.tsx`: Delegate to `PlayerGameView` with `viewRole="player"`.
5. `packages/web/src/pages/display/$gameId.tsx`: Retire 300+ lines of duplicate JSX; delegate to `PlayerGameView` with `viewRole="spectator"`.
6. `packages/web/src/features/game/components/states/Answers.tsx`: Consume `viewRole` to keep visual mode identical (`isVisualPlayerMode = true`) while enforcing `canSubmit = false` and `readOnly = true` for spectators; initialize `cooldown` from `remainingTime`.
7. `packages/web/src/features/game/utils/constants.ts`: Ensure `STATUS.SHOW_RESPONSES` is in `GAME_STATE_COMPONENTS`.
8. `packages/socket/src/services/game/index.ts`: Pass `remainingTime` on mid-voting `joinSpectator` and `reconnect`, emit `UPDATE_QUESTION` on `joinSpectator`.
9. `packages/e2e/tests/tzila-public-stage-and-toolbar.spec.ts`: Fix conditional timer assertion into non-conditional assertion.
10. `packages/e2e/tests/tzila-exact-player-screen.spec.ts`: Dedicated E2E acceptance suite covering DOM markers, paired screenshots, viewports, late join, and server rejection.
