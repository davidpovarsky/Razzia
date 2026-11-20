import { describe, expect, it } from "vitest"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"
import { fullShowAutomaticChapter } from "./full-show-navigation.ts"
import { createFullShowPlayback } from "./full-show-playback.ts"

type Playback = ReturnType<typeof createFullShowPlayback>

function question(
  id = "q1",
  phase: "question" | "voting" | "results" = "question",
  revision = 1,
): FullShowFrameV3 {
  return {
    inventory: {
      draftId: "draft-one",
      revision,
      selectedChapterId: id + ":" + phase,
      chapters: [
        {
          id: id + ":question",
          cardId: id,
          kind: "question",
          duration: { kind: "known", milliseconds: 2000 },
        },
        {
          id: id + ":voting",
          cardId: id,
          kind: "voting",
          duration: { kind: "known", milliseconds: 5000 },
        },
        {
          id: id + ":results",
          cardId: id,
          kind: "results",
          duration: { kind: "manual" },
        },
      ],
    },
    content: {
      kind: "question",
      frame: { question: { id }, phase, seconds: 5 },
    },
  } as FullShowFrameV3
}

function pending(owner: Playback) {
  const presentation = owner.snapshot().questionPresentation

  if (!presentation) {
    throw new Error("Expected an unpresented question")
  }

  return presentation
}

describe("full-show question presentation readiness", () => {
  it("excludes delayed child rendering and cannot resume past the readiness hold", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    const frame = question()
    owner.select(frame)
    const presentation = pending(owner)
    now = 6000
    owner.resume()
    now = 9000

    expect(owner.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: true,
    })
    expect(owner.snapshot().userPaused).toBe(false)
    expect(
      fullShowAutomaticChapter(frame.inventory, owner.snapshot()),
    ).toBeUndefined()

    owner.questionPresented(presentation)
    now += 1999
    expect(
      fullShowAutomaticChapter(frame.inventory, owner.snapshot()),
    ).toBeUndefined()
    now += 1
    expect(
      fullShowAutomaticChapter(frame.inventory, owner.snapshot())?.id,
    ).toBe("q1:voting")
  })

  it("gives a new question its full interval after a late preceding chapter", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question())
    owner.questionPresented(pending(owner))
    now = 9000
    const next = question("q2")
    owner.select(next)
    const presentation = pending(owner)
    now = 15000

    expect(owner.snapshot().clock.elapsedMs).toBe(0)
    expect(
      fullShowAutomaticChapter(next.inventory, owner.snapshot()),
    ).toBeUndefined()

    owner.questionPresented(presentation)
    now += 1999
    expect(
      fullShowAutomaticChapter(next.inventory, owner.snapshot()),
    ).toBeUndefined()
    now += 1
    expect(fullShowAutomaticChapter(next.inventory, owner.snapshot())?.id).toBe(
      "q2:voting",
    )
  })

  it("rejects stale previous-question and same-key replay acknowledgements", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question())
    const previous = pending(owner)
    const next = question("q2")
    owner.select(next)
    const replaced = pending(owner)
    owner.questionPresented(previous)
    expect(owner.snapshot().questionPresentation).toBe(replaced)

    owner.select(next, 1)
    const replayed = pending(owner)
    expect(replayed.epoch).not.toBe(replaced.epoch)
    owner.questionPresented(replaced)
    now = 5000
    expect(owner.snapshot().questionPresentation).toBe(replayed)
    expect(owner.snapshot().clock.elapsedMs).toBe(0)

    owner.questionPresented(replayed)
    now += 250
    expect(owner.snapshot().clock.elapsedMs).toBe(250)
  })

  it("revokes a pending acknowledgement when the selection is torn down", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question())
    const presentation = pending(owner)
    owner.select(null)
    owner.questionPresented(presentation)
    owner.resume()
    now = 9000

    expect(owner.snapshot().questionPresentation).toBeNull()
    expect(owner.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: true,
    })
  })

  it("replaces pending revision ownership without accepting an old rendered frame", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question())
    const previous = pending(owner)
    now = 750
    owner.select(question("q1", "question", 2))
    const revised = pending(owner)

    expect(revised.revision).toBe(2)
    expect(revised.epoch).toBe(previous.epoch)
    owner.questionPresented(previous)
    now = 4000
    expect(owner.snapshot().questionPresentation).toBe(revised)
    expect(owner.snapshot().clock.elapsedMs).toBe(0)

    owner.questionPresented(revised)
    now += 500
    expect(owner.snapshot().clock.elapsedMs).toBe(500)
  })

  it("retains user pause before readiness and the remaining reading budget on resume", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    const frame = question()
    owner.pause()
    owner.select(frame)
    now = 5000
    owner.questionPresented(pending(owner))

    expect(owner.snapshot().questionPresentation).toBeNull()
    expect(owner.snapshot().userPaused).toBe(true)
    expect(owner.snapshot().clock.paused).toBe(true)
    now = 9000
    expect(owner.snapshot().clock.elapsedMs).toBe(0)

    owner.resume()
    now += 800
    owner.pause()
    now += 6000
    expect(owner.snapshot().clock.elapsedMs).toBe(800)
    owner.resume()
    now += 1199
    expect(
      fullShowAutomaticChapter(frame.inventory, owner.snapshot()),
    ).toBeUndefined()
    now += 1
    expect(
      fullShowAutomaticChapter(frame.inventory, owner.snapshot())?.id,
    ).toBe("q1:voting")
  })

  it("keeps already presented progress through duplicate receipts and acknowledged edits", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question())
    const presentation = pending(owner)
    owner.questionPresented(presentation)
    now = 900
    const revised = question("q1", "question", 2)
    owner.select(revised)
    owner.questionPresented(presentation)

    expect(owner.snapshot().questionPresentation).toBeNull()
    expect(owner.snapshot().clock.elapsedMs).toBe(900)
    now = 2000
    expect(
      fullShowAutomaticChapter(revised.inventory, owner.snapshot())?.id,
    ).toBe("q1:voting")
  })

  it("carries only within-question request latency after the visible reading interval", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question())
    const presentation = pending(owner)
    now = 10000
    owner.questionPresented(presentation)
    now += 2250
    owner.select(question("q1", "voting"))

    expect(owner.snapshot().questionPresentation).toBeNull()
    expect(owner.snapshot().clock).toMatchObject({
      elapsedMs: 250,
      deadlineMs: 5000,
      paused: false,
    })
  })

  it("preserves explicit voting selection, continuing edits and paused replay", () => {
    let now = 0
    const owner = createFullShowPlayback(() => now)
    owner.select(question("q1", "voting"))
    expect(owner.snapshot().questionPresentation).toBeNull()
    expect(owner.snapshot().clock).toMatchObject({
      deadlineMs: 5000,
      paused: false,
    })
    now = 600
    const revised = question("q1", "voting", 2)
    owner.select(revised)
    expect(owner.snapshot().clock.elapsedMs).toBe(600)

    owner.pause()
    const audioEpoch = owner.snapshot().audioEpoch
    owner.select(revised, 1)
    expect(owner.snapshot().questionPresentation).toBeNull()
    expect(owner.snapshot().userPaused).toBe(true)
    expect(owner.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      deadlineMs: 5000,
      paused: true,
    })
    expect(owner.snapshot().audioEpoch).toBe(audioEpoch + 1)
  })
})
