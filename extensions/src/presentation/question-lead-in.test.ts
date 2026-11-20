import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"
import { createQuestionLeadIn } from "./question-lead-in"
import { createDemoClock } from "./show-library-preview/demo-clock"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe("platform question reading interval", () => {
  it("opens exactly at2000ms and returns that same voting authority", async () => {
    const owner = createQuestionLeadIn()
    let result: number | null | undefined = undefined
    const pending = owner.wait().then((at) => {
      result = at
    })
    await vi.advanceTimersByTimeAsync(QUESTION_LEAD_IN_MS - 1)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(result).toBe(3000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels stale questions and settles their waiters without opening voting", async () => {
    const owner = createQuestionLeadIn()
    const first = owner.wait()
    await vi.advanceTimersByTimeAsync(750)
    const second = owner.wait()
    await expect(first).resolves.toBeNull()
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
