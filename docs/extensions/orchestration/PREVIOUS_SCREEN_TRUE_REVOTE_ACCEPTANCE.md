# TADA Studio — P0 Previous Screen True Revote & Rescoring Acceptance Report

**Author / Implementer:** Tomer (`[תומר | INT] [MAIN_SESSION]`)  
**Date:** 30 October 2026  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tomer`  
**Branch:** `agent/tomer/wave2`  
**Baseline Commit:** `a9b3cc85690ef6a14a77eaf4b5ebd48a925a159e`  
**Asana Target Task:** `1220039361899970` (P0 Previous Screen True Revote)  
**Asana QA Gate:** `1219895230228235` (Independent Acceptance Gate)  
**Design Reference:** [`docs/extensions/orchestration/PREVIOUS_SCREEN_TRUE_REVOTE_DESIGN.md`](file:///C:/Users/DAVID/Code/Razzia-worktrees/tomer/docs/extensions/orchestration/PREVIOUS_SCREEN_TRUE_REVOTE_DESIGN.md)

---

## 1. Executive Summary & Core Owner UX Verification

Per the 30 October 2026 Owner Decision:
> **Previous Screen must reopen an already-played question for a fresh vote, replace its score contribution, restart its countdown timer with 0 starting votes, and allow all participants (web and telephony callers) to answer again in a new monotonic epoch.**
> **All read-only historical results navigation is completely superseded.**

All non-negotiable requirements have been implemented, verified mathematically, and proven across unit, integration, and live Playwright E2E suites:

1. **Reopen From Reveal/Results:** Pressing `PREVIOUS_SCREEN` from the results/reveal screen of a question reopens that question for a brand-new voting attempt. Starting live votes reset to `0`, the countdown timer is restarted with its full configured duration (e.g. 20s for Tzila), and the previous winner/tie state is cleared.
2. **Deterministic Score Ledger Replay:** Naive delta subtraction (`currentScore - oldScore + newScore`) is mathematically invalid when scores hit the non-linear floor `Math.max(0, points - penalty)` or when streaks change. We implemented `recomputeScoresFromLedger`, which deterministically recalculates all player cumulative scores, streaks, and rank placements from scratch across all remaining active question attempts in chronological order.
3. **Subsequent Questions Preserved:** Reopening an earlier question (e.g. Q0) does NOT delete or invalidate later completed questions (e.g. Q1, Q2). Their answers and scores remain fully intact with zero double-counting.
4. **Active Voting Cancellation:** Navigating back while answering is live is not permanently disabled. If answers have arrived, the host is prompted with a localized confirmation dialog (`reopenConfirmTitle`/`cancelActiveVoteConfirmTitle`). Upon confirmation, the active vote is cancelled, its timer is aborted, submitted answers are discarded without scoring, and the session returns to the preceding screen.
5. **Monotonic Epoch & Stale Vote Immunity:** Every question start and reopen bumps `generation` / `currentEpoch`. Stale DTMF or WebSocket votes bearing an old epoch are rejected with `stale_question_epoch`.
6. **Projector & Host Full Synchrony:** The public audience projector (`/display/$gameId`) and the manager interface display synchronized question titles, fresh timers, 5 photo cards, 0 live votes, and newly calculated winners.

---

## 2. Gate-by-Gate Verification Matrix

| Gate | Category | Description | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- |
| **G01** | Architecture | Ledger-based replay vs naive delta subtraction at zero penalty floor | Vitest `round.test.ts` | **PASSED** |
| **G02** | Core Engine | In-place question history replacement (`questionsHistory[i] = ...`) without duplicate push | Vitest `round-manager.ts` & `game.test.ts` | **PASSED** |
| **G03** | Gameplay | Reopening completed question resets votes to 0 and restarts countdown timer | Vitest `game.test.ts` & Playwright E2E | **PASSED** |
| **G04** | Telephony | DTMF phone revote in new epoch with duplicate prevention in same epoch | Vitest `pilot-phone.test.ts` & Playwright E2E | **PASSED** |
| **G05** | UI / Host | AlertDialog confirmation when navigating back during active or completed voting | Playwright Chromium E2E | **PASSED** |
| **G06** | Localization | All 8 supported locales have valid confirmation strings (`en, de, es, fr, it, ja, tr, vi`) | Vitest `locales.test.ts` | **PASSED** |
| **G07** | Display | Projector `/display/$gameId` displays 0 votes, fresh timer, 5 cards, new winner | Playwright Chromium E2E | **PASSED** |
| **G08** | Multi-Viewport | Responsive display across 1920x1080, 1280x800, 1024x768, and mobile 390x844 | Playwright Screenshots | **PASSED** |
| **G09** | Physical PSTN | Real external telecom carrier / live physical phone numbers | Scope boundary (no live telecom changes) | **PENDING INDEPENDENT QA** |

---

## 3. Mathematical Proof: Ledger Replay vs. Naive Delta Subtraction

### The Flaw of Naive Delta Subtraction
Suppose a player plays three questions under penalty scoring (`penalty: 300`):
- Initial score: **0**
- **Question 0:** Player earns **+200** points. Balance = 200.
- **Question 1:** Player answers incorrectly with a **300** penalty.  
  Formula: `Math.max(0, 200 - 300) = 0`.  
  *(Note: 100 points of penalty was absorbed by the zero floor).*
- **Question 2:** Player earns **+400** points. Balance = 400.

Now Question 0 is reopened for a revote. This time the player earns **+1000** points on Question 0.
- **Naive Delta Subtraction:**  
  $\text{Delta} = \text{newPoints} - \text{oldPoints} = 1000 - 200 = +800$.  
  $\text{Final Score} = \text{currentScore} + \text{Delta} = 400 + 800 = \mathbf{1200}$.  
  *(This is mathematically WRONG because it failed to account for the fact that Question 1's 300-point penalty is now fully absorbed by the 1000 points).*
- **Pure Ledger Chronological Recomputation (`recomputeScoresFromLedger`):**  
  - Q0 (revoted): 1000 points. Balance = 1000.  
  - Q1 (penalty 300): `Math.max(0, 1000 - 300) = 700`. Balance = 700.  
  - Q2 (+400): `700 + 400 = \mathbf{1100}`.  
  **Exact mathematically correct score: 1100.**  
  *(Naive delta is off by +100 points).*

This proof is codified and permanently asserted in `packages/socket/src/services/scoring/round.test.ts`.

---

## 4. Multi-Participant Score Progression Table

Scenario tested in `packages/socket/src/services/game/game.test.ts` and `round.test.ts`:

| Step / Action | Alice Score | Bob Score | Notes |
| :--- | :---: | :---: | :--- |
| **1. Q0 Initial Play** | **850** (Correct) | **0** (Wrong) | Alice leads |
| **2. Advance Q1** | 850 | 0 | Q1 starts |
| **3. Q1 Play** | **1700** (+850) | **750** (+750) | Both answer correctly |
| **4. Previous Screen (Reopen Q0)** | **850** | **750** | **Old Q0 score wiped; Q1 score (850 / 750) preserved** |
| **5. Q0 Revote Active** | 850 | 750 | Fresh 20s timer; 0 votes recorded |
| **6. Q0 Revote Scored** | **850** (Wrong) | **1650** (+900) | Bob answers correctly; Alice wrong |
| **7. Final Standing** | **850** | **1650** | **Bob leads (Q1: 750 + Q0 revote: 900 = 1650)** |

---

## 5. Playwright E2E Chromium Acceptance Screenshots

All 12 screenshots generated during the live E2E run (`playwright.p0-acceptance.config.ts`) are stored in `packages/e2e/test-results/p0-acceptance/`:

| Screenshot Filename | Viewport | Description |
| :--- | :--- | :--- |
| `01_host_question_with_image_cards.png` | Desktop | Manager toolbar with 5 Tzila photo cards and timer |
| `02_spectator_question_cards.png` | 1920x1080 | Spectator clean view: 5 photo cards with badges 1–5 |
| `03_spectator_result_with_winner.png` | 1920x1080 | Q1 initial winner: Option 5 (Doctor) with 2 votes |
| `04_spectator_result_tie.png` | 1920x1080 | Q2 tie result: exactly 2 winners highlighted |
| `05_spectator_result_zero_votes.png` | 1920x1080 | Neutral zero votes state (no fake winner) |
| `06_spectator_clean_projector.png` | 1920x1080 | Clean projector full-screen without manager controls |
| `06b_spectator_1024x768.png` | 1024x768 | Responsive 4:3 projector resolution |
| `07_host_reopen_confirm_dialog.png` | Desktop | Host confirmation modal: "Going back will reopen this question..." |
| `08_spectator_q1_reopened_fresh_timer.png` | 1920x1080 | Reopened Q1: 0 votes, fresh 20-second timer restarted |
| `09_spectator_q1_revoted_new_winner.png` | 1920x1080 | Q1 revote winner: Option 2 (Working Girl) with 2 votes |
| `10_spectator_1280x800.png` | 1280x800 | 16:10 laptop presentation viewport |
| `11_spectator_mobile_390x844.png` | 390x844 | Mobile responsive viewport |

---

## 6. Authoritative Test Suite Results

All six required test commands passed with exit code 0:

```powershell
# 1. Extensions test suite (24 files, 260 tests)
$env:NODE_OPTIONS="--experimental-strip-types"; pnpm --filter @razzia/extensions test
# Result: 24 passed (24), 260 passed (260) — Duration 17.81s — Exit code 0

# 2. Workspace root test suite (22 files, 312 tests)
$env:NODE_OPTIONS="--experimental-strip-types"; pnpm test
# Result: 22 passed (22), 312 passed (312) — Duration 8.81s — Exit code 0

# 3. TypeScript compilation across all packages
pnpm -r exec tsc --noEmit
# Result: Clean, 0 errors — Exit code 0

# 4. Web bundle build
pnpm --filter @razzia/web build
# Result: vite v8.3.4 client environment built in 2.10s — Exit code 0

# 5. Socket server build
pnpm --filter @razzia/socket build
# Result: rolldown v1.2.13 finished in 329.83ms — Exit code 0

# 6. Real Chromium Playwright E2E Acceptance
pnpm --filter @razzia/e2e test --config playwright.p0-acceptance.config.ts
# Result: 2 passed (2) — Duration 41.6s — Exit code 0
```

---

## 7. Asana Policy & Next Steps

Per the named-team execution policy and the user's instructions:
- Asana task `1220039361899970` and QA task `1219895230228235` remain **INCOMPLETE** pending independent QA verification.
- No remote pushes, no merges to main, and no deployment have been performed.
- All live telephony ports and services remain untouched.
