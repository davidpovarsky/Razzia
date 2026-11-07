import { describe, expect, it } from "vitest"
import { resolveMonotonicCooldownDeadline } from "./cooldown-sync"

describe("TADAZZ authoritative countdown synchronization", () => {
  it("accepts the first server deadline", () => {
    expect(resolveMonotonicCooldownDeadline(null, 20_000)).toBe(20_000)
  })

  it("accepts an earlier correction without allowing a delayed tick to add time", () => {
    expect(resolveMonotonicCooldownDeadline(20_000, 18_500)).toBe(18_500)
    expect(resolveMonotonicCooldownDeadline(18_500, 19_800)).toBe(18_500)
  })

  it("allows pause/resume to establish a new deadline after the caller resets it", () => {
    expect(resolveMonotonicCooldownDeadline(null, 28_000)).toBe(28_000)
  })
})
