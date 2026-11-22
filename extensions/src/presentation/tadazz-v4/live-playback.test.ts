import { describe, expect, it } from "vitest"
import {
  pausedCountdownRemainingMsFor,
  scenePlaybackFor,
} from "./live-playback"
import { TADAZZ_V4_SCENES } from "./types"

describe("authoritative live pause during scene reconstruction", () => {
  it("settles a late paused result and every other non-countdown snapshot", () => {
    for (const scene of TADAZZ_V4_SCENES.filter(
      (value) => value !== "countdown",
    )) {
      expect(
        scenePlaybackFor(scene, {
          reducedMotion: false,
          livePlayback: { paused: true },
        }),
      ).toEqual({
        reducedMotion: true,
        settleScene: true,
        pauseAfterCommit: false,
        countdownRemainingMs: undefined,
      })
    }
  })

  it("finishes countdown decoration while retaining the exact frozen real clock", () => {
    for (const countdownRemainingMs of [0, 14250, 30000]) {
      expect(
        scenePlaybackFor("countdown", {
          reducedMotion: false,
          livePlayback: { paused: true, countdownRemainingMs },
        }),
      ).toEqual({
        reducedMotion: true,
        settleScene: false,
        pauseAfterCommit: true,
        countdownRemainingMs,
      })
    }
  })

  it("also holds a live countdown while its remainder snapshot is absent", () => {
    expect(
      scenePlaybackFor("countdown", {
        reducedMotion: false,
        livePlayback: { paused: true },
      }),
    ).toMatchObject({
      settleScene: false,
      pauseAfterCommit: true,
      countdownRemainingMs: undefined,
    })
  })

  it("restores normal question motion after resume without a stale frozen clock", () => {
    expect(
      scenePlaybackFor("question", {
        reducedMotion: false,
        livePlayback: { paused: false, countdownRemainingMs: 14250 },
        imperativeRemainingMs: 12000,
      }),
    ).toEqual({
      reducedMotion: false,
      settleScene: false,
      pauseAfterCommit: false,
      countdownRemainingMs: undefined,
    })
    expect(
      pausedCountdownRemainingMsFor(
        { paused: true, countdownRemainingMs: 0 },
        12000,
      ),
    ).toBe(0)
  })

  it("preserves the user's reduced-motion preference after live resume", () => {
    expect(
      scenePlaybackFor("question", {
        reducedMotion: true,
        livePlayback: { paused: false },
      }),
    ).toMatchObject({
      reducedMotion: true,
      settleScene: false,
      pauseAfterCommit: false,
    })
  })

  it("does not make preview no-argument pause sticky across seek reconstruction", () => {
    for (const scene of ["question", "survey-results", "countdown"] as const) {
      expect(scenePlaybackFor(scene, { reducedMotion: false })).toEqual({
        reducedMotion: false,
        settleScene: false,
        pauseAfterCommit: false,
        countdownRemainingMs: undefined,
      })
    }
  })

  it("retains the existing explicit countdown-pause remainder for other callers", () => {
    for (const countdownRemainingMs of [0, 14250]) {
      expect(
        scenePlaybackFor("countdown", {
          reducedMotion: false,
          imperativeRemainingMs: countdownRemainingMs,
        }),
      ).toEqual({
        reducedMotion: false,
        settleScene: false,
        pauseAfterCommit: true,
        countdownRemainingMs,
      })
    }
  })
})
