import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"
import { createQuestionLeadIn, observePresentedFrame } from "./question-lead-in"
import { createDemoClock } from "./show-library-preview/demo-clock"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("platform question reading interval", () => {
  it("opens exactly at 2000 ms after presentation and returns that voting authority", async () => {
    const owner = createQuestionLeadIn()
    let result: number | null | undefined = undefined
    const pending = owner.wait("first").then((at) => {
      result = at
    })
    expect(owner.present("first")).toBe(true)
    await vi.advanceTimersByTimeAsync(QUESTION_LEAD_IN_MS - 1)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(result).toBe(3000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not charge delayed rendering against the two visible reading seconds", async () => {
    const owner = createQuestionLeadIn()
    let result: number | null | undefined = undefined
    const pending = owner.wait("delayed").then((at) => {
      result = at
    })
    await vi.advanceTimersByTimeAsync(750)
    expect(result).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
    expect(owner.present("other")).toBe(false)
    expect(owner.present("delayed")).toBe(true)
    expect(owner.present("delayed")).toBe(false)
    await vi.advanceTimersByTimeAsync(QUESTION_LEAD_IN_MS - 1)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(result).toBe(3750)
  })

  it("cancels stale questions and settles their waiters without opening voting", async () => {
    const owner = createQuestionLeadIn()
    const first = owner.wait("first")
    owner.present("first")
    await vi.advanceTimersByTimeAsync(750)
    const second = owner.wait("second")
    await expect(first).resolves.toBeNull()
    expect(owner.present("first")).toBe(false)
    expect(owner.present("second")).toBe(true)
    await vi.advanceTimersByTimeAsync(1999)
    let opened = false
    void second.then(() => {
      opened = true
    })
    await Promise.resolve()
    expect(opened).toBe(false)
    owner.cancel()
    await expect(second).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels before presentation without allowing a late callback to open voting", async () => {
    const owner = createQuestionLeadIn()
    const pending = owner.wait("unmounted")
    owner.cancel()
    expect(owner.present("unmounted")).toBe(false)
    await expect(pending).resolves.toBeNull()
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("starts only from a presented frame and cancels a superseded frame observer", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    )
    vi.stubGlobal(
      "cancelAnimationFrame",
      (frame: ReturnType<typeof setTimeout>) => clearTimeout(frame),
    )
    let painted = false
    let presentedAt = 0
    const stale = vi.fn()
    const cancelStale = observePresentedFrame(() => painted, stale)
    const owner = createQuestionLeadIn()
    const pending = owner.wait("painted")
    const presented = vi.fn(() => {
      presentedAt = Date.now()
      owner.present("painted")
    })
    const cancel = observePresentedFrame(() => painted, presented)
    await vi.advanceTimersByTimeAsync(5000)
    expect(presented).not.toHaveBeenCalled()
    cancelStale()
    painted = true
    await vi.advanceTimersByTimeAsync(16)
    expect(stale).not.toHaveBeenCalled()
    expect(presented).toHaveBeenCalledTimes(1)
    const opensAt = presentedAt + QUESTION_LEAD_IN_MS
    await vi.advanceTimersByTimeAsync(opensAt - Date.now() - 1)
    let opened = false
    void pending.then(() => {
      opened = true
    })
    await Promise.resolve()
    expect(opened).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe(opensAt)
    cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps the editor replay clock at zero until its question is visibly presented", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    )
    vi.stubGlobal(
      "cancelAnimationFrame",
      (frame: ReturnType<typeof setTimeout>) => clearTimeout(frame),
    )
    const clock = createDemoClock(Date.now)
    clock.replay()
    clock.startVoting(20, QUESTION_LEAD_IN_MS)
    let painted = false
    const cancel = observePresentedFrame(
      () => painted,
      () => {
        clock.play()
      },
    )
    await vi.advanceTimersByTimeAsync(8000)
    expect(clock.snapshot()).toMatchObject({
      elapsedMs: 0,
      deadlineMs: 22000,
      paused: true,
    })
    painted = true
    await vi.advanceTimersByTimeAsync(16)
    expect(clock.snapshot()).toMatchObject({ elapsedMs: 0, paused: false })
    await vi.advanceTimersByTimeAsync(1999)
    expect(clock.snapshot().elapsedMs).toBe(1999)
    await vi.advanceTimersByTimeAsync(1)
    expect(clock.snapshot().elapsedMs).toBe(QUESTION_LEAD_IN_MS)
    expect(clock.snapshot().deadlineMs! - clock.snapshot().elapsedMs).toBe(
      20000,
    )
    cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not open voting when presentation publication cancels the question", async () => {
    const owner = createQuestionLeadIn()
    const pending = owner.wait("leaving")
    expect(owner.present("leaving", () => owner.cancel())).toBe(false)
    await expect(pending).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("uses the same monotonic clock for reading, pause and the voting deadline", () => {
    let now = 0
    const clock = createDemoClock(() => now)
    clock.replay()
    clock.startVoting(20, QUESTION_LEAD_IN_MS)
    clock.play()
    now = 750
    clock.pause()
    now = 10750
    expect(clock.snapshot().elapsedMs).toBe(750)
    expect(clock.snapshot().deadlineMs).toBe(22000)
    clock.play()
    now += 1250
    expect(clock.snapshot().elapsedMs).toBe(QUESTION_LEAD_IN_MS)
    expect(clock.snapshot().deadlineMs! - clock.snapshot().elapsedMs).toBe(
      20000,
    )
  })
})
