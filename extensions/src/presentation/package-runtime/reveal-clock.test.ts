import { describe, expect, it } from "vitest"
import {
  advancePackageRevealClock,
  packageRevealAudioTransition,
  packageRevealStage,
  packageTimerAudioTransition,
} from "./reveal-clock"

describe("host-owned package result milestones", () => {
  it("reveals audience first and correctness later, with no invented survey solution", () => {
    const stage = (elapsedMs: number, hasCorrectAnswer = true) =>
      packageRevealStage({ elapsedMs, hasCorrectAnswer })
    expect(stage(0)).toBe("pending")
    expect(stage(199)).toBe("pending")
    expect(stage(200)).toBe("audience")
    expect(stage(1449)).toBe("audience")
    expect(stage(1450)).toBe("correct")
    expect(stage(9000, false)).toBe("audience")
    expect(
      packageRevealStage({
        elapsedMs: 0,
        hasCorrectAnswer: true,
        reducedMotion: true,
      }),
    ).toBe("correct")
  })

  it("anchors a new result to server time and ignores later snapshot timestamps", () => {
    const initial = advancePackageRevealClock(null, {
      identity: "game:q:7",
      startedAt: 1000,
      now: 1100,
      paused: false,
    })
    expect(initial.elapsedMs).toBe(100)
    const presenceUpdate = advancePackageRevealClock(initial, {
      identity: "game:q:7",
      startedAt: 1200,
      now: 1300,
      paused: false,
    })
    expect(presenceUpdate.elapsedMs).toBe(300)
    const replay = advancePackageRevealClock(presenceUpdate, {
      identity: "game:q:8",
      startedAt: 1500,
      now: 1500,
      paused: false,
    })
    expect(replay.elapsedMs).toBe(0)
  })

  it("freezes on pause, resumes from the same milestone and tolerates clock correction", () => {
    let clock = advancePackageRevealClock(null, {
      identity: "q:1",
      startedAt: 1000,
      now: 1200,
      paused: false,
    })
    clock = advancePackageRevealClock(clock, {
      identity: "q:1",
      now: 1300,
      paused: true,
    })
    expect(clock.elapsedMs).toBe(300)
    clock = advancePackageRevealClock(clock, {
      identity: "q:1",
      now: 5000,
      paused: true,
    })
    expect(clock.elapsedMs).toBe(300)
    clock = advancePackageRevealClock(clock, {
      identity: "q:1",
      now: 6000,
      paused: false,
    })
    expect(clock.elapsedMs).toBe(300)
    clock = advancePackageRevealClock(clock, {
      identity: "q:1",
      now: 6100,
      paused: false,
    })
    expect(clock.elapsedMs).toBe(400)
    expect(
      advancePackageRevealClock(clock, {
        identity: "q:1",
        now: 6090,
        paused: false,
      }).elapsedMs,
    ).toBe(400)
  })

  it("emits each reveal once and never replays old cues on reconnect or background catch-up", () => {
    const input = {
      identity: "q:1",
      enabled: true,
      paused: false,
    }
    const initial = packageRevealAudioTransition(null, {
      ...input,
      stage: "pending",
      elapsedMs: 0,
    })
    expect(initial.cue).toBeUndefined()
    const audience = packageRevealAudioTransition(initial.state, {
      ...input,
      stage: "audience",
      elapsedMs: 201,
    })
    expect(audience.cue).toBe("survey-reveal")
    expect(
      packageRevealAudioTransition(audience.state, {
        ...input,
        stage: "audience",
        elapsedMs: 999,
      }).cue,
    ).toBeUndefined()
    const correct = packageRevealAudioTransition(audience.state, {
      ...input,
      stage: "correct",
      elapsedMs: 1451,
    })
    expect(correct.cue).toBe("top-pick-reveal")
    expect(
      packageRevealAudioTransition(null, {
        ...input,
        stage: "correct",
        elapsedMs: 9000,
      }).cue,
    ).toBeUndefined()
    expect(
      packageRevealAudioTransition(initial.state, {
        ...input,
        stage: "correct",
        elapsedMs: 9000,
      }).cue,
    ).toBeUndefined()
  })

  it("does not queue paused, muted or reduced-motion milestones for later playback", () => {
    for (const control of [
      { enabled: false, paused: false },
      { enabled: true, paused: true },
      { enabled: true, paused: false, reducedMotion: true },
    ]) {
      const skipped = packageRevealAudioTransition(
        { identity: "q:1", stage: "pending" },
        {
          identity: "q:1",
          stage: "audience",
          elapsedMs: 201,
          ...control,
        },
      )
      expect(skipped.cue).toBeUndefined()
      expect(
        packageRevealAudioTransition(skipped.state, {
          identity: "q:1",
          stage: "audience",
          elapsedMs: 250,
          enabled: true,
          paused: false,
        }).cue,
      ).toBeUndefined()
    }
  })
})

describe("package preview native audio clock", () => {
  const input = {
    cardKey: "q",
    epoch: 3,
    phase: "voting",
    enabled: true,
    paused: false,
  }

  it("uses the native remaining seconds once and skips missed ticks", () => {
    const first = packageTimerAudioTransition(null, {
      ...input,
      remainingMs: 9000,
    })
    expect(first.cue).toBe("timer-tick")
    expect(
      packageTimerAudioTransition(first.state, {
        ...input,
        remainingMs: 8999,
      }).cue,
    ).toBeUndefined()
    const urgent = packageTimerAudioTransition(first.state, {
      ...input,
      remainingMs: 5000,
    })
    expect(urgent.cue).toBe("timer-urgent")
    const final = packageTimerAudioTransition(urgent.state, {
      ...input,
      remainingMs: 2000,
    })
    expect(final.cue).toBe("timer-final")
    expect(final.volume).toBe(0.42)
  })

  it("plays timer end once after expiry, or vote lock on an early finish", () => {
    const voting = packageTimerAudioTransition(null, {
      ...input,
      remainingMs: 500,
    }).state
    const end = packageTimerAudioTransition(voting, {
      ...input,
      epoch: 4,
      phase: "results",
      remainingMs: 0,
    })
    expect(end.cue).toBe("timer-ended")
    expect(
      packageTimerAudioTransition(end.state, {
        ...input,
        epoch: 4,
        phase: "results",
        remainingMs: 0,
      }).cue,
    ).toBeUndefined()
    expect(
      packageTimerAudioTransition(
        { ...voting, seconds: 15 },
        {
          ...input,
          phase: "voteLocked",
          remainingMs: 0,
        },
      ).cue,
    ).toBe("vote-locked")
    expect(
      packageTimerAudioTransition(null, {
        ...input,
        phase: "results",
        remainingMs: 0,
      }).cue,
    ).toBeUndefined()
  })

  it("keeps silent, paused and player previews silent", () => {
    for (const control of [
      { enabled: false, paused: false },
      { enabled: true, paused: true },
    ]) {
      expect(
        packageTimerAudioTransition(null, {
          ...input,
          ...control,
          remainingMs: 2000,
        }).cue,
      ).toBeUndefined()
    }
  })
})
