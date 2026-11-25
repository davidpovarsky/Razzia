import { describe, expect, it } from "vitest"
import { acceptsQuestionMilestone } from "./tadazz-sfx-policy"

describe("question audio milestones", () => {
  const reveal = {
    name: "survey-reveal",
    paintedScene: "survey-results",
    paintedQuestion: 2,
    currentQuestion: 2,
    currentKind: "results",
    currentPhase: "responses",
  }
  it("accepts the current reveal even when the same-question spotlight has just arrived", () => {
    expect(acceptsQuestionMilestone(reveal)).toBe(true)
    expect(
      acceptsQuestionMilestone({
        ...reveal,
        currentKind: "scene",
        currentPhase: "scene",
        currentPreset: "top-pick",
      }),
    ).toBe(true)
  })
  it("rejects stale reveals after moving questions, restarting or returning to voting", () => {
    expect(acceptsQuestionMilestone({ ...reveal, currentQuestion: 3 })).toBe(
      false,
    )
    expect(
      acceptsQuestionMilestone({
        ...reveal,
        currentKind: "voting",
        currentPhase: "question",
      }),
    ).toBe(false)
  })
  it("only accepts spotlight confirmation on the matching winning-picture scene", () => {
    const cue = {
      ...reveal,
      name: "top-pick-reveal",
      paintedScene: "top-pick",
      currentKind: "scene",
      currentPreset: "top-pick",
    }
    expect(acceptsQuestionMilestone(cue)).toBe(true)
    expect(acceptsQuestionMilestone({ ...cue, currentQuestion: 3 })).toBe(false)
    expect(acceptsQuestionMilestone({ ...cue, currentKind: "voting" })).toBe(
      false,
    )
  })
  it("does not reject unrelated scene audio using a previous question counter", () => {
    expect(
      acceptsQuestionMilestone({
        ...reveal,
        name: "round-launch",
        currentQuestion: 6,
      }),
    ).toBe(true)
  })
  it("uses the real completed question after a tie even if a reconstructed spotlight has a fallback number", () => {
    const cue = {
      ...reveal,
      name: "top-pick-reveal",
      paintedScene: "top-pick",
      paintedQuestion: 1,
      currentQuestion: 3,
      paintedQuestionKey: "Which era?#1",
      currentQuestionText: "Which era?",
      currentKind: "scene",
      currentPreset: "top-pick",
    }
    expect(acceptsQuestionMilestone(cue)).toBe(true)
    expect(
      acceptsQuestionMilestone({ ...cue, currentQuestionText: "Who?" }),
    ).toBe(false)
  })
})
