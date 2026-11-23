import { describe, expect, it } from "vitest"
import { recapPageLimit, recapPageSize } from "./recap-page-limit"

describe("native recap page limits", () => {
  it("offers six rows for Classic and first-party families, eight for the Razzia stage", () => {
    expect(recapPageLimit("tadazz-classic-stage")).toBe(6)
    expect(recapPageLimit("tadazz-original-stage")).toBe(6)
    expect(recapPageLimit("razzia-native-stage")).toBe(8)
  })
  it("can display an existing eight-row value in either renderer without rewriting it", () => {
    const stored = 8
    expect(recapPageSize(stored, "tadazz-classic-stage")).toBe(6)
    expect(recapPageSize(stored, "tadazz-original-stage")).toBe(6)
    expect(recapPageSize(stored, "razzia-native-stage")).toBe(8)
  })
  it("keeps the four-row default and valid input bounds", () => {
    expect(recapPageSize(undefined, "tadazz-classic-stage")).toBe(4)
    expect(recapPageSize(undefined, "tadazz-original-stage")).toBe(4)
    expect(recapPageSize(5.9, "razzia-native-stage")).toBe(5)
    expect(recapPageSize(0, "tadazz-classic-stage")).toBe(1)
    expect(recapPageSize(-1, "tadazz-classic-stage")).toBe(1)
    expect(recapPageSize(9, "tadazz-classic-stage")).toBe(6)
    expect(recapPageSize(9, "tadazz-original-stage")).toBe(6)
    expect(recapPageSize(9, "razzia-native-stage")).toBe(8)
  })
})
