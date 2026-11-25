import { describe, expect, it } from "vitest"
import { buildTadazzParticles, tadazzArtScale } from "./tadazz-backdrop"

describe("Tadazz image/particle geometry", () => {
  it("covers 16:9 exactly and crops without stretching 4:3", () => {
    expect(tadazzArtScale(1920, 1080, "cover")).toBe(1)
    expect(tadazzArtScale(800, 600, "cover")).toBeCloseTo(600 / 1080)
    expect(tadazzArtScale(800, 600, "contain")).toBeCloseTo(800 / 1920)
    expect(tadazzArtScale(320, 568, "cover")).toBeCloseTo(568 / 1080)
  })
  it("keeps the original 34 deterministic particles", () => {
    const a = buildTadazzParticles()
    expect(a).toHaveLength(34)
    expect(buildTadazzParticles()).toEqual(a)
    expect(a.every((p) => p.alpha > 0 && p.speed > 0 && p.size > 0)).toBe(true)
  })
})
