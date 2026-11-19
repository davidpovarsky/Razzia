import { afterEach, describe, expect, it, vi } from "vitest"
import { PresentationLaunch } from "./presentation-launch"
import {
  PLATFORM_CURTAIN_DURATION_MS,
  PLATFORM_CLOSING_DURATION_MS,
  PLATFORM_CLOSING_HOLD_MS,
  platformClosingFrame,
  readTerminalFinaleStartedAt,
  PLATFORM_OPENING_DURATION_MS,
  PLATFORM_OPENING_VIDEO_DURATION_MS,
  platformOpeningFrame,
  readPlatformOpening,
} from "../../core/platform-opening"

afterEach(() => vi.useRealTimers())

describe("platform opening", () => {
  it("waits for Start, covers the entire curtain/video, then reveals the lobby", () => {
    vi.useFakeTimers()
    vi.setSystemTime(100000)
    const changed = vi.fn()
    const launch = new PresentationLaunch(changed)
    vi.advanceTimersByTime(50000)
    expect(launch.snapshot(false)).toEqual({
      stage: "standby",
      startedAt: null,
    })
    expect(launch.advance()).toBe(true)
    expect(launch.snapshot(false)).toEqual({
      stage: "opening",
      startedAt: 150000,
    })
    vi.advanceTimersByTime(PLATFORM_CURTAIN_DURATION_MS)
    expect(launch.snapshot(false).stage).toBe("opening")
    vi.advanceTimersByTime(PLATFORM_OPENING_VIDEO_DURATION_MS - 1)
    expect(launch.snapshot(false).stage).toBe("opening")
    vi.advanceTimersByTime(1)
    expect(launch.snapshot(false).stage).toBe("lobby")
    expect(launch.advance()).toBe(false)
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it("freezes curtain/video time for every viewer and resumes only the remainder", () => {
    vi.useFakeTimers()
    vi.setSystemTime(100000)
    const launch = new PresentationLaunch(vi.fn())
    launch.advance()
    vi.advanceTimersByTime(4000)
    expect(launch.pause()).toBe(true)
    const frozen = launch.getPauseSnapshot()
    expect(frozen).toEqual({
      paused: true,
      remainingMs: PLATFORM_OPENING_DURATION_MS - 4000,
      deadline: null,
    })
    vi.advanceTimersByTime(30000)
    expect(launch.snapshot(false).stage).toBe("opening")
    expect(launch.getPauseSnapshot()).toEqual(frozen)
    expect(
      platformOpeningFrame(
        launch.snapshot(false),
        Date.now(),
        frozen.remainingMs,
      ).elapsedMs,
    ).toBe(4000)
    expect(launch.resume()).toBe(true)
    expect(launch.snapshot(false).startedAt).toBe(130000)
    vi.advanceTimersByTime(PLATFORM_OPENING_DURATION_MS - 4001)
    expect(launch.snapshot(false).stage).toBe("opening")
    vi.advanceTimersByTime(1)
    expect(launch.snapshot(false).stage).toBe("lobby")
  })

  it("skips only the opening, and never replays a running or completed room", () => {
    vi.useFakeTimers()
    vi.setSystemTime(100000)
    const changed = vi.fn()
    const launch = new PresentationLaunch(changed)
    launch.advance()
    launch.advance()
    expect(launch.snapshot(false).stage).toBe("lobby")
    expect(launch.snapshot(true).stage).toBe("running")
    vi.advanceTimersByTime(PLATFORM_OPENING_DURATION_MS * 2)
    expect(changed).toHaveBeenCalledTimes(2)
    expect(launch.pause()).toBe(false)
  })

  it("seeks a late audience to the same product frame without replaying the curtain", () => {
    const launch = { stage: "opening" as const, startedAt: 100000 }
    const frame = platformOpeningFrame(launch, 105000)
    expect(frame.curtainProgress).toBe(1)
    expect(frame.videoVisible).toBe(true)
    expect(frame.videoElapsedMs).toBe(5000 - PLATFORM_CURTAIN_DURATION_MS)
    expect(platformOpeningFrame(launch, 99000).elapsedMs).toBe(0)
    expect(platformOpeningFrame(launch, 999999).elapsedMs).toBe(
      PLATFORM_OPENING_DURATION_MS,
    )
  })

  it("ignores malformed launch state and cancels completion when a room closes", () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const launch = new PresentationLaunch(changed)
    launch.advance()
    launch.dispose()
    vi.advanceTimersByTime(PLATFORM_OPENING_DURATION_MS * 2)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(readPlatformOpening({ stage: "opening", startedAt: NaN })).toBeNull()
    expect(readPlatformOpening({ stage: "anything", startedAt: 1 })).toBeNull()
    expect(readPlatformOpening({ stage: "standby", startedAt: null })).toEqual({
      stage: "standby",
      startedAt: null,
    })
  })
})

describe("platform closing", () => {
  it("ends generic rooms once, keeps the closed curtain on reconnect, and consumes extra advances", () => {
    vi.useFakeTimers()
    vi.setSystemTime(100000)
    const changed = vi.fn()
    const launch = new PresentationLaunch(changed)
    launch.close()
    const initial = launch.snapshot(false)
    expect(initial).toEqual({ stage: "closing", startedAt: 100000 })
    vi.advanceTimersByTime(1000)
    launch.close()
    expect(launch.snapshot(false)).toEqual(initial)
    vi.advanceTimersByTime(PLATFORM_CLOSING_DURATION_MS - 1000)
    expect(launch.snapshot(false)).toEqual({
      stage: "closed",
      startedAt: 100000,
    })
    expect(launch.advance()).toBe(true)
    expect(launch.snapshot(false).stage).toBe("closed")
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it("continues an authored finale without a second curtain or a restarted hold", () => {
    vi.useFakeTimers()
    vi.setSystemTime(109200)
    const launch = new PresentationLaunch(vi.fn())
    launch.close(100000)
    expect(launch.snapshot(false)).toEqual({
      stage: "closed",
      startedAt: 100000,
    })
    launch.close()
    expect(launch.snapshot(false)).toEqual({
      stage: "closed",
      startedAt: 100000,
    })
    expect(launch.getPauseSnapshot().remainingMs).toBeNull()
  })

  it("freezes a generic ending and reopens the existing room for history replay", () => {
    vi.useFakeTimers()
    vi.setSystemTime(100000)
    const launch = new PresentationLaunch(vi.fn())
    launch.close()
    vi.advanceTimersByTime(PLATFORM_CLOSING_HOLD_MS + 500)
    expect(launch.pause()).toBe(true)
    const frozen = launch.getPauseSnapshot()
    vi.advanceTimersByTime(20000)
    expect(launch.getPauseSnapshot()).toEqual(frozen)
    expect(launch.snapshot(false).stage).toBe("closing")
    expect(launch.resume()).toBe(true)
    vi.advanceTimersByTime(frozen.remainingMs ?? 0)
    expect(launch.snapshot(false).stage).toBe("closed")
    launch.resumeRunning()
    expect(launch.snapshot(true).stage).toBe("running")
    expect(launch.advance()).toBe(false)
    launch.close()
    expect(launch.snapshot(false)).toEqual({
      stage: "closing",
      startedAt: Date.now(),
    })
  })

  it("keeps existing finale timing and only hands the terminal built-in scene to the product", () => {
    expect(platformClosingFrame(PLATFORM_CLOSING_HOLD_MS).curtainProgress).toBe(
      0,
    )
    const moving = platformClosingFrame(PLATFORM_CLOSING_HOLD_MS + 1090)
    expect(moving.curtainProgress).toBeGreaterThan(0)
    expect(moving.curtainProgress).toBeLessThan(1)
    expect(platformClosingFrame(PLATFORM_CLOSING_DURATION_MS)).toMatchObject({
      curtainProgress: 1,
      closed: true,
    })
    const step = {
      scene: { kind: "animation", preset: "grand-finale" },
      stepIndex: 4,
      totalSteps: 5,
      startedAt: 100000,
    }
    expect(readTerminalFinaleStartedAt(step)).toBe(100000)
    expect(readTerminalFinaleStartedAt({ ...step, stepIndex: 1 })).toBeNull()
    expect(readTerminalFinaleStartedAt({ ...step, startedAt: NaN })).toBeNull()
    expect(
      readPlatformOpening({ stage: "closed", startedAt: 100000 })?.stage,
    ).toBe("closed")
  })
})
