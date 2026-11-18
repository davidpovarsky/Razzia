import { describe, expect, it } from "vitest"
import type { FullShowInventoryV3 } from "../contracts/full-show-selection.ts"
import type { FullShowPlaybackSnapshot } from "./full-show-playback.ts"
import {
  fullShowAutomaticChapter,
  fullShowCardNavigation,
} from "./full-show-navigation.ts"

const chapters = [
  ["opening", "opening", { kind: "known", milliseconds: 1500 }],
  ["q1", "question", { kind: "known", milliseconds: 2000 }],
  ["q1", "answerCards", { kind: "manual" }],
  ["q1", "voting", { kind: "known", milliseconds: 5000 }],
  ["q1", "voteLocked", { kind: "manual" }],
  ["q1", "results", { kind: "manual" }],
  ["transition", "transition", { kind: "known", milliseconds: 700 }],
  ["q2", "question", { kind: "known", milliseconds: 0 }],
  ["q2", "voting", { kind: "infinite" }],
  ["q2", "results", { kind: "manual" }],
  ["closing", "closing", { kind: "unknown" }],
].map(([cardId, kind, duration], index) => ({
  id: `${cardId}:${kind}`,
  cardId,
  kind,
  duration,
  index,
  cardOrdinal: [1, 2, 2, 2, 2, 2, 3, 4, 4, 4, 5][index],
  questionOrdinal: String(cardId).startsWith("q")
    ? Number(String(cardId).slice(1))
    : null,
})) as FullShowInventoryV3["chapters"]

function inventory(selectedChapterId: string) {
  return { chapters, selectedChapterId } as FullShowInventoryV3
}
function playback(elapsedMs: number, paused = false): FullShowPlaybackSnapshot {
  return {
    clock: { epoch: 1, sequence: 1, elapsedMs, paused, deadlineMs: null },
    audioEpoch: 0,
  }
}

describe("full-show authored-card navigation", () => {
  it("counts each question once and navigates from every internal phase", () => {
    for (const phase of [
      "question",
      "answerCards",
      "voting",
      "voteLocked",
      "results",
    ]) {
      const navigation = fullShowCardNavigation(inventory(`q1:${phase}`))
      expect(navigation.cards).toHaveLength(5)
      expect(navigation.index).toBe(1)
      expect(navigation.current?.id).toBe("q1:question")
      expect(navigation.previous?.id).toBe("opening:opening")
      expect(navigation.next?.id).toBe("transition:transition")
    }
  })

  it("preserves the first and last card boundaries", () => {
    expect(
      fullShowCardNavigation(inventory("opening:opening")).previous,
    ).toBeUndefined()
    expect(
      fullShowCardNavigation(inventory("closing:closing")).next,
    ).toBeUndefined()
  })

  it("reveals answer choices at the actual cooldown deadline", () => {
    expect(
      fullShowAutomaticChapter(inventory("q1:question"), playback(1999)),
    ).toBeUndefined()
    expect(
      fullShowAutomaticChapter(inventory("q1:question"), playback(2000))?.id,
    ).toBe("q1:voting")
    expect(
      fullShowAutomaticChapter(inventory("q2:question"), playback(0))?.id,
    ).toBe("q2:voting")
  })

  it("requests results only after finite voting expires", () => {
    expect(
      fullShowAutomaticChapter(inventory("q1:voting"), playback(4999)),
    ).toBeUndefined()
    expect(
      fullShowAutomaticChapter(inventory("q1:voting"), playback(5000))?.id,
    ).toBe("q1:results")
    expect(
      fullShowAutomaticChapter(inventory("q2:voting"), playback(999999)),
    ).toBeUndefined()
  })

  it("honors pause and manual or unknown-duration scenes", () => {
    expect(
      fullShowAutomaticChapter(
        inventory("q1:question"),
        playback(999999, true),
      ),
    ).toBeUndefined()
    for (const id of ["q1:results", "q1:answerCards", "closing:closing"]) {
      expect(
        fullShowAutomaticChapter(inventory(id), playback(999999)),
      ).toBeUndefined()
    }
  })

  it("advances timed scenes into the next authored card", () => {
    expect(
      fullShowAutomaticChapter(
        inventory("transition:transition"),
        playback(700),
      )?.id,
    ).toBe("q2:question")
    expect(
      fullShowAutomaticChapter(inventory("opening:opening"), playback(1500))
        ?.id,
    ).toBe("q1:question")
  })

  it("cannot navigate from an invalid stale selection", () => {
    const navigation = fullShowCardNavigation(inventory("removed:question"))
    expect(navigation.index).toBe(-1)
    expect(navigation.current).toBeUndefined()
    expect(navigation.next).toBeUndefined()
    expect(
      fullShowAutomaticChapter(inventory("removed:question"), playback(999999)),
    ).toBeUndefined()
  })
})
