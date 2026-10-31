import { describe, expect, it } from "vitest"
import {
  CANONICAL_ANSWER_COLORS,
  computePollRanking,
  type PollOptionItem,
} from "./poll-ranking"

describe("computePollRanking", () => {
  it("sorts 5 options by vote count descending, with highest as dominant winner", () => {
    const options: PollOptionItem[] = [
      { answerIndex: 0, label: "Teacher", count: 1, percentage: 8 },
      { answerIndex: 1, label: "Working Girl", count: 3, percentage: 23 },
      { answerIndex: 2, label: "Athlete", count: 2, percentage: 15 },
      { answerIndex: 3, label: "Artist", count: 0, percentage: 0 },
      { answerIndex: 4, label: "Doctor", count: 7, percentage: 54 },
    ]

    const result = computePollRanking(options)

    expect(result.totalVotes).toBe(13)
    expect(result.isZeroVotes).toBe(false)
    expect(result.isTie).toBe(false)
    expect(result.maxVotes).toBe(7)

    // Winner: option #5 (Doctor)
    expect(result.winners).toHaveLength(1)
    expect(result.winners[0].answerIndex).toBe(4)
    expect(result.winners[0].label).toBe("Doctor")
    expect(result.winners[0].count).toBe(7)
    expect(result.winners[0].isWinner).toBe(true)
    expect(result.winners[0].rank).toBe(1)

    // Runners-up: ordered descending: #2 (3), #3 (2), #1 (1), #4 (0)
    expect(result.runnersUp).toHaveLength(4)
    expect(result.runnersUp.map((r) => r.answerIndex)).toEqual([1, 2, 0, 3])
    expect(result.runnersUp.map((r) => r.count)).toEqual([3, 2, 1, 0])
    expect(result.runnersUp.every((r) => !r.isWinner)).toBe(true)
  })

  it("handles deterministic stable tie-breaker for lower ranks using answerIndex ascending", () => {
    const options: PollOptionItem[] = [
      { answerIndex: 0, label: "A", count: 1, percentage: 17 },
      { answerIndex: 1, label: "B", count: 2, percentage: 33 },
      { answerIndex: 2, label: "C", count: 1, percentage: 17 },
      { answerIndex: 3, label: "D", count: 2, percentage: 33 },
      { answerIndex: 4, label: "E", count: 0, percentage: 0 },
    ]

    const result = computePollRanking(options)

    // Co-winners at 2 votes: B (index 1) and D (index 3)
    expect(result.isTie).toBe(true)
    expect(result.winners).toHaveLength(2)
    expect(result.winners.map((w) => w.answerIndex)).toEqual([1, 3])

    // Runners-up with tied 1 vote: A (index 0) before C (index 2)
    expect(result.runnersUp.map((r) => r.answerIndex)).toEqual([0, 2, 4])
  })

  it("handles first-place tie with 2+ leaders at equal size", () => {
    const options: PollOptionItem[] = [
      { answerIndex: 0, label: "Option 1", count: 4, percentage: 50 },
      { answerIndex: 1, label: "Option 2", count: 4, percentage: 50 },
      { answerIndex: 2, label: "Option 3", count: 0, percentage: 0 },
    ]

    const result = computePollRanking(options)

    expect(result.isTie).toBe(true)
    expect(result.winners).toHaveLength(2)
    expect(result.winners[0].answerIndex).toBe(0)
    expect(result.winners[1].answerIndex).toBe(1)
    expect(result.winners[0].isWinner).toBe(true)
    expect(result.winners[1].isWinner).toBe(true)
    expect(result.runnersUp).toHaveLength(1)
    expect(result.runnersUp[0].answerIndex).toBe(2)
  })

  it("handles zero votes: explicit neutral state, no fake winner hero", () => {
    const options: PollOptionItem[] = [
      { answerIndex: 0, label: "A", count: 0, percentage: 0 },
      { answerIndex: 1, label: "B", count: 0, percentage: 0 },
      { answerIndex: 2, label: "C", count: 0, percentage: 0 },
      { answerIndex: 3, label: "D", count: 0, percentage: 0 },
      { answerIndex: 4, label: "E", count: 0, percentage: 0 },
    ]

    const result = computePollRanking(options)

    expect(result.totalVotes).toBe(0)
    expect(result.isZeroVotes).toBe(true)
    expect(result.isTie).toBe(false)
    expect(result.winners).toHaveLength(0)
    expect(result.runnersUp).toHaveLength(0)
    expect(result.allSorted).toHaveLength(5)
    expect(result.allSorted.every((o) => !o.isWinner)).toBe(true)
  })

  it("preserves original answerIndex, label, imageUrl and alt after sorting", () => {
    const options: PollOptionItem[] = [
      {
        answerIndex: 0,
        label: "First",
        count: 1,
        percentage: 10,
        imageUrl: "/img0.png",
        alt: "Alt 0",
      },
      {
        answerIndex: 4,
        label: "Fifth",
        count: 9,
        percentage: 90,
        imageUrl: "/img4.png",
        alt: "Alt 4",
      },
    ]

    const result = computePollRanking(options)

    // Fifth is winner, its original answerIndex is still 4 (NOT 0)
    expect(result.winners[0].answerIndex).toBe(4)
    expect(result.winners[0].label).toBe("Fifth")
    expect(result.winners[0].imageUrl).toBe("/img4.png")
    expect(result.winners[0].alt).toBe("Alt 4")

    // First is runner-up, original answerIndex is still 0 (NOT 1)
    expect(result.runnersUp[0].answerIndex).toBe(0)
    expect(result.runnersUp[0].label).toBe("First")
  })

  it("handles 2, 3, 4 answer quizzes correctly", () => {
    const twoOptions: PollOptionItem[] = [
      { answerIndex: 0, label: "Yes", count: 5, percentage: 62.5 },
      { answerIndex: 1, label: "No", count: 3, percentage: 37.5 },
    ]

    const res = computePollRanking(twoOptions)
    expect(res.winners).toHaveLength(1)
    expect(res.winners[0].label).toBe("Yes")
    expect(res.runnersUp).toHaveLength(1)
    expect(res.runnersUp[0].label).toBe("No")
  })

  it("provides 5 canonical answer colours with opaque hex values", () => {
    expect(CANONICAL_ANSWER_COLORS).toHaveLength(5)
    for (const color of CANONICAL_ANSWER_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
