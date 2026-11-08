import { describe, expect, it } from "vitest"
import { votingPresentation } from "./voting-presentation"
import { computeShowScene } from "./presentation-scene"

describe("restored timed question", () => {
  it.each([20, 5, 0])(
    "keeps a circular clock when the server has %s seconds left",
    (remainingTime) => {
      const scene = computeShowScene({
        role: "spectator",
        isConnected: true,
        envelope: null,
        questionStates: { current: 6, total: 10 },
        status: {
          name: "SELECT_ANSWER",
          data: { question: "Q", answers: ["A", "B"], time: 20, remainingTime },
        },
      })
      expect(scene.kind).toBe("voting")
      if (scene.kind !== "voting") throw new Error("expected voting")
      expect(votingPresentation(scene.seconds)).toBe("countdown")
    },
  )
  it("recovers the configured duration from authoritative deadlines after replay", () => {
    const scene = computeShowScene({
      role: "manager",
      isConnected: true,
      envelope: null,
      questionStates: null,
      status: {
        name: "SELECT_ANSWER",
        data: {
          question: "Q",
          answers: ["A", "B"],
          remainingTime: 5,
          votingStartsAt: 1000,
          votingEndsAt: 21000,
        },
      },
    })
    expect(scene.kind === "voting" && scene.seconds).toBe(20)
  })
  it("preserves explicitly unlimited voting", () => {
    expect(votingPresentation(null)).toBe("voting-open")
    const scene = computeShowScene({
      role: "manager",
      isConnected: true,
      envelope: null,
      questionStates: null,
      status: {
        name: "SELECT_ANSWER",
        data: { question: "Q", answers: [], time: -1, remainingTime: 5 },
      },
    })
    expect(scene.kind === "voting" && scene.seconds).toBeNull()
  })
})
