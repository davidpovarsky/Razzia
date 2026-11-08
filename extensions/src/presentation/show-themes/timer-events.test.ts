import { describe, expect, it } from "vitest"
import { themeTimerTransition } from "./timer-events"

const input = {
  enabled: true,
  gameId: "game",
  questionId: "q",
  epoch: 1,
  voting: true,
  results: false,
  paused: false,
  deadline: 10_000,
  now: 0,
}
describe("theme timer event ownership", () => {
  it("emits expiry exactly once at the real deadline", () => {
    const armed = themeTimerTransition(null, input).state
    const result = themeTimerTransition(armed, {
      ...input,
      results: true,
      now: 10_000,
      reason: "elapsed",
    })
    expect(result.event).toBe("timer-ended")
    expect(
      themeTimerTransition(result.state, {
        ...input,
        results: true,
        now: 11_000,
      }).cue,
    ).toBeUndefined()
  })
  it("uses lock completion for manual end/all answered, never expiry", () => {
    const armed = themeTimerTransition(null, input).state
    expect(
      themeTimerTransition(armed, { ...input, results: true, now: 1000 }).event,
    ).toBe("vote-locked")
    expect(
      themeTimerTransition(armed, {
        ...input,
        voting: false,
        results: false,
        now: 1000,
      }).state,
    ).toBeNull()
  })
  it("does not replay on refresh/history or a paused completion", () => {
    expect(
      themeTimerTransition(null, { ...input, results: true }).cue,
    ).toBeUndefined()
    const armed = themeTimerTransition(null, input).state
    expect(
      themeTimerTransition(armed, { ...input, epoch: 2, results: true }).cue,
    ).toBeUndefined()
    const paused = themeTimerTransition(armed, {
      ...input,
      paused: true,
      results: true,
      now: 20_000,
    })
    expect(paused.cue).toBeUndefined()
    expect(
      themeTimerTransition(paused.state, {
        ...input,
        results: true,
        now: 20_001,
      }).cue,
    ).toBeUndefined()
  })
  it("uses the authoritative resumed deadline and rearms on a new epoch", () => {
    const armed = themeTimerTransition(null, input).state
    const resumed = themeTimerTransition(armed, {
      ...input,
      deadline: 20_000,
      now: 5000,
    }).state
    expect(
      themeTimerTransition(resumed, { ...input, results: true, now: 12_000 })
        .event,
    ).toBe("vote-locked")
    const restarted = themeTimerTransition(resumed, {
      ...input,
      epoch: 2,
      deadline: 30_000,
    }).state
    expect(
      themeTimerTransition(restarted, {
        ...input,
        epoch: 2,
        results: true,
        now: 30_000,
        reason: "elapsed",
      }).event,
    ).toBe("timer-ended")
  })
})
