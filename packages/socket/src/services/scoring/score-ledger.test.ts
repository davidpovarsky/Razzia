import {
  recomputeScoresFromLedger,
  type LedgerQuestionEntry,
} from "@razzia/extensions/server"
import { QUESTION_SCORING } from "@razzia/socket/services/scoring"
import { createPlayer, createQuestion } from "@razzia/socket/test/fixtures"
import { describe, expect, it } from "vitest"

describe("recomputeScoresFromLedger", () => {
  it("proves naive delta subtraction fails with penalty floor at 0 whereas ledger replay is correct", () => {
    // Q0: initial score +200
    // Q1: penalty of 300 points (floor engaged: 200 - 300 = -100 -> clamped to 0)
    // Q2: score +400 -> total score = 400
    //
    // If Q0 is revoted with +1000:
    // Naive delta: old Q0 was +200, new is +1000 -> delta = +800.
    // Naive final: 400 + 800 = 1200 (WRONG! Ignored that Q1's 300 penalty would now be fully absorbed!)
    // Ledger replay:
    // Q0: 1000
    // Q1: max(0, 1000 - 300) = 700
    // Q2: 700 + 400 = 1100 (CORRECT!)
    const q0 = createQuestion({ solutions: [0] })
    const q1 = createQuestion({ solutions: [0], penalty: 300 })
    const q2 = createQuestion({ solutions: [0] })

    const player = createPlayer({ id: "bob", username: "Bob", points: 0 })

    // Initial state after Q0, Q1, Q2
    const initialLedger: LedgerQuestionEntry[] = [
      {
        questionIndex: 0,
        question: q0,
        answers: [{ playerId: "bob", answerIds: [0], points: 200 }],
      },
      {
        questionIndex: 1,
        question: q1,
        // Wrong answer, penalty 300
        answers: [{ playerId: "bob", answerIds: [1], points: 800 }],
      },
      {
        questionIndex: 2,
        question: q2,
        answers: [{ playerId: "bob", answerIds: [0], points: 400 }],
      },
    ]

    const initialScored = recomputeScoresFromLedger(
      [player],
      initialLedger,
      QUESTION_SCORING,
    )
    expect(initialScored[0].points).toBe(400)

    // Revote Q0: Bob answers faster and gets 1000 points
    const revotedLedger: LedgerQuestionEntry[] = [
      {
        questionIndex: 0,
        question: q0,
        answers: [{ playerId: "bob", answerIds: [0], points: 1000 }],
      },
      {
        questionIndex: 1,
        question: q1,
        // Still wrong
        answers: [{ playerId: "bob", answerIds: [1], points: 800 }],
      },
      {
        questionIndex: 2,
        question: q2,
        answers: [{ playerId: "bob", answerIds: [0], points: 400 }],
      },
    ]

    const revotedScored = recomputeScoresFromLedger(
      [player],
      revotedLedger,
      QUESTION_SCORING,
    )
    expect(revotedScored[0].points).toBe(1100)
    // Explicitly rejects naive delta result!
    expect(revotedScored[0].points).not.toBe(1200)
  })

  it("recalculates streaks accurately when an earlier question is revoted", () => {
    // Q0: correct -> streak 1
    // Q1: correct -> streak 2
    // Q2: correct -> streak 3
    const q0 = createQuestion({ solutions: [0] })
    const q1 = createQuestion({ solutions: [0] })
    const q2 = createQuestion({ solutions: [0] })

    const player = createPlayer({ id: "alice", username: "Alice" })

    const initialLedger: LedgerQuestionEntry[] = [
      {
        questionIndex: 0,
        question: q0,
        answers: [{ playerId: "alice", answerIds: [0], points: 500 }],
      },
      {
        questionIndex: 1,
        question: q1,
        answers: [{ playerId: "alice", answerIds: [0], points: 500 }],
      },
      {
        questionIndex: 2,
        question: q2,
        answers: [{ playerId: "alice", answerIds: [0], points: 500 }],
      },
    ]

    const initialScored = recomputeScoresFromLedger(
      [player],
      initialLedger,
      QUESTION_SCORING,
    )
    expect(initialScored[0].streak).toBe(3)

    // Revote Q1: Alice changes answer to WRONG
    const revotedLedger: LedgerQuestionEntry[] = [
      {
        questionIndex: 0,
        question: q0,
        answers: [{ playerId: "alice", answerIds: [0], points: 500 }],
      },
      {
        questionIndex: 1,
        question: q1,
        // Wrong!
        answers: [{ playerId: "alice", answerIds: [1], points: 500 }],
      },
      {
        questionIndex: 2,
        question: q2,
        // Correct
        answers: [{ playerId: "alice", answerIds: [0], points: 500 }],
      },
    ]

    const revotedScored = recomputeScoresFromLedger(
      [player],
      revotedLedger,
      QUESTION_SCORING,
    )
    // Streak after Q0 is 1; reset to 0 at Q1; incremented to 1 at Q2. Final streak is 1, not 3!
    expect(revotedScored[0].streak).toBe(1)
  })

  it("handles survey questions neutrally without awarding points and preserves subsequent scores", () => {
    const surveyQ = createQuestion({
      playMode: "survey",
      answers: ["A", "B", "C", "D", "E"],
      solutions: [],
    })
    const triviaQ = createQuestion({ solutions: [0] })

    const player = createPlayer({ id: "bob", username: "Bob" })

    const ledger: LedgerQuestionEntry[] = [
      {
        questionIndex: 0,
        question: surveyQ,
        answers: [{ playerId: "bob", answerIds: [4], points: 1000 }],
      },
      {
        questionIndex: 1,
        question: triviaQ,
        answers: [{ playerId: "bob", answerIds: [0], points: 650 }],
      },
    ]

    const scored = recomputeScoresFromLedger([player], ledger, QUESTION_SCORING)
    // Survey awards 0 points; trivia awards 650
    expect(scored[0].points).toBe(650)
  })
})
