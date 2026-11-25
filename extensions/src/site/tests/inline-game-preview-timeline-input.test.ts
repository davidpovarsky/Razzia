import { describe, expect, it } from "vitest"
import {
  chapterKeyTarget,
  isSeekableMediaTime,
  previewNavigation,
} from "../components/game-preview/timeline-input"
import type {
  PreviewChapter,
  PreviewSource,
} from "../components/game-preview/contracts"

describe("chapter input, no fictional elapsed-time conversion", () => {
  it("jumps to voting in public demos and preserves the editor's exact phases", () => {
    const chapters: PreviewChapter[] = [
      ["intro", "opening"],
      ["q1", "question"],
      ["q1", "answerCards"],
      ["q1", "voting"],
      ["q1", "results"],
      ["q2", "question"],
      ["q2", "answerCards"],
      ["q2", "voting"],
    ].map(([authoredKey, phase]) => ({
      authoredKey,
      phase,
      id: `${authoredKey}:${phase}`,
      title: authoredKey,
      duration: { kind: "manual" },
      seek: "chapter-only",
    }))
    const demo: PreviewSource = {
      kind: "published-demo",
      catalogueId: "great-guessoff",
      immutableRevision: "test",
    }
    const publicNavigation = previewNavigation({ chapters, source: demo })

    expect(publicNavigation.stops.map(({ id }) => id)).toEqual([
      "intro:opening",
      "q1:voting",
      "q1:results",
      "q2:voting",
    ])
    expect(publicNavigation.indexOf("q1:question")).toBe(1)
    expect(publicNavigation.indexOf("q2:answerCards")).toBe(3)
    expect(publicNavigation.indexOf("q1:results")).toBe(2)

    const ownerNavigation = previewNavigation({
      chapters,
      source: {
        kind: "account-owned",
        quizId: "owner",
        immutableRevision: "test",
      },
    })
    expect(ownerNavigation.stops).toBe(chapters)
    expect(ownerNavigation.indexOf("q2:question")).toBe(5)
  })

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
