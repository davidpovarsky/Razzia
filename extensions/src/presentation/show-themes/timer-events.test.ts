import { describe, expect, it } from "vitest"
import { startCountdownCue, themeTimerTransition } from "./timer-events"

describe("shared start countdown audio", () => {
  const start = {
    gameId: "game",
    epoch: 3,
    seconds: 5,
    role: "manager" as const,
    paused: false,
  }

  it("uses one identity for duplicate server ticks and re-renders", () => {
    const initial = startCountdownCue(start)
    expect(initial?.name).toBe("timer-start")
    expect(startCountdownCue({ ...start })?.identity).toBe(initial?.identity)
    expect(startCountdownCue({ ...start, seconds: 4 })?.identity).not.toBe(
      initial?.identity,
    )
    expect(startCountdownCue({ ...start, epoch: 4 })?.identity).not.toBe(
      initial?.identity,
    )
  })

  it("keeps player views, paused shows and expired ticks silent", () => {
    expect(startCountdownCue({ ...start, role: "player" })).toBeNull()
    expect(startCountdownCue({ ...start, paused: true })).toBeNull()
    for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(startCountdownCue({ ...start, seconds })).toBeNull()
    }
    expect(startCountdownCue({ ...start, role: "spectator" })).not.toBeNull()
  })
})

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
  it("keeps automatic all-answered completion distinct from a timer end", () => {
    const armed = themeTimerTransition(null, input).state
    expect(
      themeTimerTransition(armed, {
        ...input,
        results: true,
        now: 1000,
        reason: "allAnswered",
      }).event,
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

  it("plays the timer-end cue once when the host ends voting early", () => {
    const armed = themeTimerTransition(null, input).state
    const result = themeTimerTransition(armed, {
      ...input,
      results: true,
      now: 1000,
      reason: "manual",
    })
    expect(result.event).toBe("timer-ended")
    expect(result.cue).toBe("game:q:1:timer-ended")
    expect(
      themeTimerTransition(result.state, {
        ...input,
        results: true,
        now: 10_000,
        reason: "elapsed",
      }).cue,
    ).toBeUndefined()
  })
  it("retains the observed timer through a split status and result snapshot", () => {
    const armed = themeTimerTransition(null, input).state
    const waiting = themeTimerTransition(armed, {
      ...input,
      voting: false,
      awaitingCompletion: true,
    })
    expect(waiting.state).toEqual(armed)
    expect(waiting.cue).toBeUndefined()
    expect(
      themeTimerTransition(waiting.state, {
        ...input,
        voting: false,
        results: true,
        reason: "manual",
        now: 1000,
      }).event,
    ).toBe("timer-ended")
    expect(
      themeTimerTransition(armed, {
        ...input,
        voting: false,
        awaitingCompletion: true,
        questionId: "other",
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
      reason: "manual",
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
