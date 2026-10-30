# PREVIOUS SCREEN — True Revote & Ledger-Based Score Replacement Design

## 1. Problem Statement & Historical Flaw
Prior to this contract (commit `a9b3cc8`), navigating backwards via `PREVIOUS_SCREEN` into a completed question invoked `showCompletedQuestionResults()`. This merely rendered historical, read-only results. The user explicitly rejected this behavior:
When navigating back to an already-played question (Quiz or Survey), the game must **reopen the question for a fresh, live voting round**, invalidate the previous attempt's answers and score contribution, restart the countdown timer from its full duration (e.g. 20s for Tzila), clear live vote tallies to 0, and allow all participants (web players and PSTN telephone callers) to submit new answers under a new monotonic epoch.

Crucially:
1. **Never append** the new result to the old result; the old attempt's contribution must be completely replaced.
2. **Never naively subtract delta points**: if a player incurred a penalty that was clamped at a floor of 0 (`Math.max(0, points + gain - penalty)`), or if streak bonuses or multipliers were awarded, simple delta subtraction (`player.points -= oldPoints`) produces mathematically invalid balances.
3. **Preserve unrelated questions**: all other completed questions (even those completed chronologically *after* the reopened question) must retain their authoritative answers and results.
4. **Active vote cancellation**: if `PREVIOUS_SCREEN` is triggered during active voting, an explicit confirmation is required if answers already arrived. The abandoned attempt is discarded cleanly without orphan timers or phantom votes.

---

## 2. Architecture: The Authoritative Question Ledger

### 2.1 Question Ledger Model
Rather than mutating a single accumulated score register with irreversible operations, `RoundManager` maintains an authoritative **Question Ledger**:

```ts
export interface QuestionLedgerEntry {
  questionIndex: number
  questionId: string
  question: Question
  epoch: number
  answers: Answer[] // raw submissions { playerId, answerIds, points, timestamp }
  skipped?: boolean
  skipReason?: string
  revealDistribution?: RevealDistributionSnapshot | null
  historyItem: QuestionResult
  scoredPlayers?: ScoredPlayer[]
}
```

- **One Active Entry per Question**: each `questionIndex` has at most one active entry in `questionLedger: Map<number, QuestionLedgerEntry>`.
- **Replacing instead of appending**: when question $Q_i$ completes its revote and results are revealed, its ledger entry is replaced, and `questionsHistory[i]` is updated in-place rather than appended with `.push()`.
- **Revote Invalidation**: when $Q_i$ is reopened for a fresh vote, `questionLedger.delete(i)` removes its contribution immediately. `questionsHistory[i]` is cleared so historical views do not report stale completed data for a currently open question.

### 2.2 Deterministic Score Recomputation (`recomputeScoresFromLedger`)
Whenever a question is reopened, or when a revoted question completes:
All players' scores, streaks, and verdicts are recomputed purely and deterministically from the remaining active entries in the ledger in chronological show order:

$$\text{Initial state for each player } p: \quad \text{points}_0(p) = 0, \quad \text{streak}_0(p) = 0$$

For each active question $k \in \text{sorted}(\text{activeLedgerKeys})$:
$$\text{multiplier} = \text{SCORING}[Q_k.\text{type}](Q_k, a_k(p).\text{answerIds})$$
$$\text{earnedPoints} = \lfloor a_k(p).\text{points} \times \text{multiplier} \rceil$$
$$\text{isCorrect} = \text{multiplier} > 0$$
$$\text{penalty} = (!\text{isCorrect} \land a_k(p) \ne \emptyset) \ ? \ (Q_k.\text{penalty} \lor 0) : 0$$
$$\text{points}_{k}(p) = \max\Big(0, \; \text{points}_{k-1}(p) + \text{earnedPoints} - \text{penalty}\Big)$$
$$\text{streak}_{k}(p) = \text{isCorrect} \ ? \ (\text{streak}_{k-1}(p) + 1) : 0$$

#### Why Delta Subtraction Fails (Concrete Proof)
Suppose $Q_1$ has penalty 50. Player starts at 0 points.
1. $Q_1$: Player answers wrong. Points = $\max(0, 0 - 50) = 0$.
2. $Q_2$: Player answers correctly. Points = $\max(0, 0 + 100) = 100$.
If host navigates back to $Q_1$:
- **Naive subtraction**: subtracting old $Q_1$ delta ($-50$) yields $100 - (-50) = 150$ points! Player gained 50 phantom points due to the zero floor.
- **Ledger recomputation**: active ledger contains only $Q_2$. Replay gives $0 + 100 = 100$ points. When $Q_1$ is revoted correctly (+100), total is $0 + 100 + 100 = 200$ points. If revoted wrong (-50), total is $\max(0, 0 - 50) + 100 = 100$ points.

---

## 3. Screen Transitions & State Machine

| Origin Screen | Action | Destination | Vote/Score Effect |
|---|---|---|---|
| **Scene A** (e.g. Intro/Media) | Previous | Preceding Scene | None. Pointer moves 1 step back. No question or votes touched. |
| **Scene B** (following $Q_1$) | Previous | $Q_1$ Question Card | **Reopens $Q_1$**. Old $Q_1$ votes cleared; scores recomputed without $Q_1$; full timer starts from 20s (or configured); participants vote afresh. |
| **Question $Q_1$ Results / Reveal** | Previous | $Q_1$ Question Card | **Reopens $Q_1$**. Same as above: resets votes and timer to 0/full duration. |
| **Question $Q_1$ Leaderboard** | Previous | $Q_1$ Results / Reveal | Navigates back within question cycle to reveal distribution. |
| **Later $Q_2$ active / results** | Previous $\to$ Previous | Earlier $Q_1$ | Reopens $Q_1$. $Q_2$ results and contributions **remain safely preserved in ledger**; derived totals reflect $Q_2$. Forward navigation preserves $Q_2$. |
| **Active voting on $Q_i$** (answers arrived) | Previous | Preceding Screen | Prompts confirmation. Upon confirmation, current attempt is aborted, pending timer cleared, answers discarded, proceeds to preceding screen. |

---

## 4. Telephony (DTMF), Roster, and Monotonic Epoch

1. **Monotonic Epoch**: every navigation step advances `epoch += 1`.
2. **Stale Callback & Race Rejection**:
   - `submitPhoneAnswerByRosterId`: validates current `epoch`. If an incoming DTMF callback or delayed network request bears an older epoch, it is rejected with reason `stale_call` / `not_accepting_answers`.
   - `generation`: each `newQuestion()` call increments internal `generation += 1`. All asynchronous timer resolutions verify `this.generation === gen` before running steps.
3. **Stable Roster Identity**:
   - Roster entries (`rosterPlayerId`, `phoneE164`, `displayName`, `clientId`) are preserved.
   - Points are synced via `syncRosterScoresFromPlayers()`.
   - `lastVerdictByRosterId` is invalidated for the reopened question so callers polling phone status receive fresh state without stale correctness flags.
4. **PSTN / HTTP Endpoint `/api/games/pilot-phone`**:
   - Accepts action `answer` with `answerIndex` 0..4 (DTMF 1..5).
   - Once question is reopened, `hasPlayerAnswered(playerId)` returns false, permitting all connected callers to vote again.

---

## 5. Host UI & Projector Synchronization

1. **Manager Toolbar**:
   - Previous Screen button remains permanently visible at the top-left, opposite Next Screen on the right.
   - If previous step will reopen a question or cancel an active vote with submissions: displays localized `AlertDialog` with text:
     *“Going back will reopen this question, discard its previous votes, and replace its score. Continue?”*
   - Supported across all 8 languages: `en`, `de`, `fr`, `es`, `it`, `ja`, `tr`, `vi`.
   - Keyboard shortcut `Alt+ArrowLeft` guarded against form inputs and open dialogs.
2. **Projector (`/display/$gameId`)**:
   - Renders live Question state with 20s countdown and 5 photo cards at 0 votes.
   - Stale percentages, winner highlights, and tie indicators are cleared as soon as status returns to `SELECT_ANSWER`.
3. **Mobile Browser Players**:
   - Receive `SELECT_ANSWER` event with fresh question data.
   - Input buttons become clickable again with 0 selected answers.
