import { describe, expect, it } from "vitest"
import {
  createPreviewStageContinuity,
  type PreviewStageIdentity,
} from "./preview-stage-continuity"

const frame = (
  phase: string,
  clockEpoch: number,
  cardKey = "Q1",
): PreviewStageIdentity => ({
  cardKey,
  phase,
  clockEpoch,
  appearanceRevision: 0,
  renderer: "cinematic",
  role: "manager",
})

describe("question DOM lifetime", () => {
  it("retains one mount across answer, voting, lock and result phase clocks", () => {
    const owner = createPreviewStageContinuity()
    const identity = owner.select(frame("question", 1))
    for (const [index, phase] of [
      "answerCards",
      "voting",
      "voteLocked",
      "results",
    ].entries()) {
      expect(owner.select(frame(phase, index + 2))).toBe(identity)
    }
  })

  it("does not reset for pause/resume/ticks of the same request", () => {
    const owner = createPreviewStageContinuity()
    const input = frame("question", 3)
    const before = JSON.stringify(input)
    const identity = owner.select(input)
    expect(owner.select({ ...input })).toBe(identity)
    expect(JSON.stringify(input)).toBe(before)
  })

  it("resets for deliberate replay, backwards navigation and another question", () => {
    const owner = createPreviewStageContinuity()
    const initial = owner.select(frame("question", 1))
    expect(owner.select(frame("question", 2))).toBeGreaterThan(initial)
    const voting = owner.select(frame("voting", 3))
    expect(owner.select(frame("question", 4))).toBeGreaterThan(voting)
    const replay = owner.select(frame("question", 4))
    expect(owner.select(frame("question", 5, "Q2"))).toBeGreaterThan(replay)
  })

  it("reconstructs an explicitly changed renderer or appearance", () => {
    const owner = createPreviewStageContinuity()
    const initial = owner.select(frame("question", 1))
    const native = owner.select({ ...frame("voting", 2), renderer: "razzia" })
    expect(native).toBeGreaterThan(initial)
    expect(
      owner.select({
        ...frame("results", 3),
        renderer: "razzia",
        appearanceRevision: 1,
      }),
    ).toBeGreaterThan(native)
  })
})
