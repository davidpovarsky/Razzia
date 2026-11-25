import { describe, expect, it } from "vitest"
import {
  chapterKeyTarget,
  isSeekableMediaTime,
} from "../components/game-preview/timeline-input"

describe("chapter input, no fictional elapsed-time conversion", () => {
  it.each([
    ["ArrowLeft", 2, 1],
    ["ArrowRight", 2, 3],
    ["ArrowUp", 2, 3],
    ["ArrowDown", 2, 1],
    ["Home", 2, 0],
    ["End", 2, 11],
    ["PageUp", 2, 7],
    ["PageDown", 7, 2],
    ["ArrowLeft", 0, 0],
    ["ArrowRight", 11, 11],
  ] as const)(
    "%s selects a bounded chapter position",
    (key, current, expected) => {
      expect(chapterKeyTarget(key, current, 12)).toBe(expected)
    },
  )

  it("ignores unrelated keys and absent/nonfinite chapters", () => {
    expect(chapterKeyTarget("Escape", 0, 3)).toBeNull()
    expect(chapterKeyTarget("toString", 0, 3)).toBeNull()
    expect(chapterKeyTarget("__proto__", 0, 3)).toBeNull()
    expect(chapterKeyTarget("Home", 0, 0)).toBeNull()
    expect(chapterKeyTarget("End", 0, Infinity)).toBeNull()
    expect(chapterKeyTarget("Home", NaN, 2)).toBeNull()
  })

  it("permits only a measured finite media range, including discontinuous ranges", () => {
    const media = {
      timeSeconds: 0,
      durationSeconds: 42,
      seekable: [
        [0, 12],
        [20, 42],
      ] as const,
    }
    expect(isSeekableMediaTime(media, 10)).toBe(true)
    expect(isSeekableMediaTime(media, 42)).toBe(true)
    expect(isSeekableMediaTime(media, 15)).toBe(false)
    expect(isSeekableMediaTime(media, 43)).toBe(false)
    expect(isSeekableMediaTime(media, -1)).toBe(false)
    expect(isSeekableMediaTime(media, NaN)).toBe(false)
    expect(isSeekableMediaTime(undefined, 0)).toBe(false)
    expect(isSeekableMediaTime({ ...media, seekable: [] }, 0)).toBe(false)
    expect(
      isSeekableMediaTime({ ...media, durationSeconds: Infinity }, 10),
    ).toBe(false)
    expect(isSeekableMediaTime({ ...media, durationSeconds: NaN }, 10)).toBe(
      false,
    )
    expect(
      isSeekableMediaTime({ ...media, seekable: [[0, Infinity]] }, 10),
    ).toBe(false)
  })
})
