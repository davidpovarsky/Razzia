import { EVENTS } from "@razzia/common/constants"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CooldownTimer } from "./cooldown-timer"

describe("P0 CooldownTimer pause/resume", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("does not resolve or emit countdown ticks while paused", async () => {
    const fake = createFakeIo()
    const timer = new CooldownTimer(fake.io, "game")
    let ended = false
    void timer.start(10).then(() => {
      ended = true
    })

    await vi.advanceTimersByTimeAsync(3000)
    expect(timer.remaining).toBe(7)
    expect(timer.pause()).toBe(7000)
    const emittedBeforePause = fake.emitted.filter(
      (item) => item.event === EVENTS.GAME.COOLDOWN,
    ).length

    await vi.advanceTimersByTimeAsync(20000)
    expect(ended).toBe(false)
    expect(timer.remaining).toBe(7)
    expect(
      fake.emitted.filter((item) => item.event === EVENTS.GAME.COOLDOWN),
    ).toHaveLength(emittedBeforePause)

    expect(timer.resume()).toBe(true)
    await vi.advanceTimersByTimeAsync(7000)
    expect(ended).toBe(true)
    expect(timer.remaining).toBeNull()
  })

  it("resumes from a fractional millisecond deadline without adding a full tick", async () => {
    const fake = createFakeIo()
    const timer = new CooldownTimer(fake.io, "fractional")
    let ended = false
    void timer.start(5).then(() => {
      ended = true
    })

    await vi.advanceTimersByTimeAsync(3450)
    expect(timer.pause()).toBe(1550)
    await vi.advanceTimersByTimeAsync(5000)
    expect(ended).toBe(false)
    expect(timer.resume()).toBe(true)
    await vi.advanceTimersByTimeAsync(1549)
    expect(ended).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(ended).toBe(true)
  })
})
