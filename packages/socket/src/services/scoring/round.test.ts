import {
  countAnswers,
  recomputeScoresFromLedger,
  scoreQuestion,
  type LedgerQuestionEntry,
} from "@razzia/socket/services/scoring/round"
import { createPlayer, createQuestion } from "@razzia/socket/test/fixtures"
import { describe, expect, it } from "vitest"

const alice = () => createPlayer({ id: "alice", username: "Alice" })
const bob = () => createPlayer({ id: "bob", username: "Bob" })

describe("countAnswers", () => {
  it("counts how many players picked each answer", () => {
    const counts = countAnswers([
      { playerId: "alice", answerIds: [0, 1], points: 0 },
      { playerId: "bob", answerIds: [1], points: 0 },
    ])

    expect(counts).toEqual({ 0: 1, 1: 2 })
  })
})

describe("scoreQuestion", () => {
  it("adds the answer points to correct players and sorts by score", () => {
    const players = [alice(), bob()]
    const scored = scoreQuestion(createQuestion({ solutions: [0] }), players, [
      { playerId: "alice", answerIds: [1], points: 900 },
      { playerId: "bob", answerIds: [0], points: 800 },
    ])

    expect(scored.map((p) => [p.username, p.points, p.lastCorrect])).toEqual([
      ["Bob", 800, true],
      ["Alice", 0, false],
    ])
  })

  it("scales the points with partial scoring", () => {
    const question = createQuestion({ type: "multi", solutions: [0, 1] })
    const [scored] = scoreQuestion(
      question,
      [alice()],
      [{ playerId: "alice", answerIds: [0], points: 1000 }],
    )

    expect(scored.lastPoints).toBe(500)
  })

  it("applies the penalty to wrong answers only, never below zero", () => {
    const question = createQuestion({ solutions: [0], penalty: 300 })
    const players = [
      createPlayer({ id: "alice", points: 1000 }),
      createPlayer({ id: "bob", points: 100 }),
      createPlayer({ id: "carol", points: 500 }),
    ]

    const scored = scoreQuestion(question, players, [
      { playerId: "alice", answerIds: [1], points: 800 },
      { playerId: "bob", answerIds: [1], points: 800 },
    ])

    expect(scored.map((p) => [p.id, p.points])).toEqual([
      ["alice", 700],
      ["carol", 500],
      ["bob", 0],
    ])
    expect(scored[0].lastPoints).toBe(-300)
  })

  it("counts a right answer worth no points as correct", () => {
    const question = createQuestion({ solutions: [0], penalty: 300 })
    const [scored] = scoreQuestion(
      question,
      [alice()],
      [{ playerId: "alice", answerIds: [0], points: 0 }],
    )

    expect(scored).toMatchObject({ lastCorrect: true, points: 0, streak: 1 })
    expect(scored.lastPoints).toBe(0)
  })

  it("tracks the answer streak", () => {
    const player = createPlayer({ id: "alice", streak: 2 })
    const question = createQuestion({ solutions: [0] })

    scoreQuestion(
      question,
      [player],
      [{ playerId: "alice", answerIds: [0], points: 500 }],
    )

    expect(player.streak).toBe(3)

    scoreQuestion(question, [player], [])

    expect(player.streak).toBe(0)
  })
})

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
        answers: [{ playerId: "bob", answerIds: [1], points: 800 }], // wrong answer, penalty 300
      },
      {
        questionIndex: 2,
        question: q2,
        answers: [{ playerId: "bob", answerIds: [0], points: 400 }],
      },
    ]

    const initialScored = recomputeScoresFromLedger([player], initialLedger)
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
        answers: [{ playerId: "bob", answerIds: [1], points: 800 }], // still wrong
      },
      {
        questionIndex: 2,
        question: q2,
        answers: [{ playerId: "bob", answerIds: [0], points: 400 }],
      },
    ]

    const revotedScored = recomputeScoresFromLedger([player], revotedLedger)
    expect(revotedScored[0].points).toBe(1100)
    expect(revotedScored[0].points).not.toBe(1200) // Explicitly rejects naive delta result!
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

    const initialScored = recomputeScoresFromLedger([player], initialLedger)
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
        answers: [{ playerId: "alice", answerIds: [1], points: 500 }], // wrong!
      },
      {
        questionIndex: 2,
        question: q2,
        answers: [{ playerId: "alice", answerIds: [0], points: 500 }], // correct
      },
    ]

    const revotedScored = recomputeScoresFromLedger([player], revotedLedger)
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

    const scored = recomputeScoresFromLedger([player], ledger)
    // Survey awards 0 points; trivia awards 650
    expect(scored[0].points).toBe(650)
  })
})
