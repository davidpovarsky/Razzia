import { describe, expect, it } from "vitest"
import motion from "./motion-spec-v4.json"
import { TADAZZ_V4_SCENES } from "./types"

describe("v4 studio asset parity metadata", () => {
  it("preserves the 13 canonical v4 animation composition names", () => {
    expect(motion.scenes).toEqual(TADAZZ_V4_SCENES.slice(0, 13))
  })
  it("uses the unmodified source 1920x1080 grid and exact critical timings", () => {
    expect(motion.size).toEqual([1920, 1080])
    expect(motion.motionsMs.answerCardEnter).toBe(1180)
    expect(motion.motionsMs.countdownFloaterEnter).toBe(1120)
    expect(motion.motionsMs.zWipeRight).toBe(1570)
    expect(motion.particles.big).toBe(55)
  })
})
