import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { normalizeApplicationPreviewDraft } from "../../core/show-library/application-preview-input"
import { resolveApplicationPreviewPlan } from "../../core/show-library/application-preview-resolve"
import { authoredFixture } from "../../core/show-library/preview-fixtures"
import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import { createApplicationPreviewSession } from "../components/game-preview/application-session"
import type { GamePreviewSession } from "../components/game-preview/contracts"

const sessions: GamePreviewSession[] = []
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
  })
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }))
})
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.dispose()
  }
  vi.clearAllTimers()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function fixture(withPreviousScene = false) {
  const authored = authoredFixture(4, 2)
  const draft = normalizeApplicationPreviewDraft(
    {
      source: {
        kind: "account-owned",
        quizId: "reading-clock-fixture",
        immutableRevision: "a".repeat(64),
      },
      show: {
        ...authored,
        cards: [
          ...(withPreviousScene
            ? [
                {
                  key: "previous",
                  kind: "transition",
                  durationMs: 500,
                  advance: "auto",
                },
              ]
            : []),
          ...authored.cards,
        ],
      },
      assets: [],
    },
    { locale: "en", reducedMotion: false, role: "spectator" },
  )
  const plan = resolveApplicationPreviewPlan(draft)
  expect(plan.resolution.kind).toBe("exact")
  let waitForFrame:
    | ((frame: ApplicationPreviewFrame) => Promise<void> | undefined)
    | undefined = undefined
  const frames: ApplicationPreviewFrame[] = []
  const session = createApplicationPreviewSession({
    source: draft.source,
    show: draft.show,
    plan,
    preferences: { locale: "en", reducedMotion: false },
    revalidate: () => Promise.resolve(),
    authorizeMedia: () => Promise.resolve([]),
    runtime: {
      mount: () => ({
        update: (frame) => {
          frames.push(frame)

          return waitForFrame?.(frame) ?? Promise.resolve()
        },
        mediaElement: () => null,
        dispose: () => undefined,
      }),
      dispose: () => undefined,
    },
  })
  sessions.push(session)
  const holdNext = (matches: (frame: ApplicationPreviewFrame) => boolean) => {
    const entered = Promise.withResolvers<ApplicationPreviewFrame>()
    const released = Promise.withResolvers<undefined>()
    waitForFrame = (frame) => {
      if (!matches(frame)) {
        return undefined
      }

      waitForFrame = undefined
      entered.resolve(frame)

      return released.promise
    }

    return {
      entered: entered.promise,
      release: () => released.resolve(undefined),
    }
  }
  const phase = () =>
    session.chapters.find(
      (chapter) => chapter.id === session.snapshot().chapterId,
    )?.phase

  return { session, holdNext, phase, frames }
}

// These tests exercise the real session clock and cancellation owner. The small
// renderer port delays its actual completion; no DOM or renderer is simulated.
describe("application preview presented-question reading clock", () => {
  it("waits for the presented question before its full reading interval and voting deadline", async () => {
    const { session, holdNext, phase } = fixture()
    await session.mount({} as HTMLElement, { muted: true })
    const presentation = holdNext((frame) => !frame.clock.paused)
    const play = session.play()
    const projected = await presentation.entered
    expect(projected.clock.paused).toBe(false)
    await vi.advanceTimersByTimeAsync(750)
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: true,
    })
    presentation.release()
    await play
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: false,
    })
    await vi.advanceTimersByTimeAsync(1999)
    expect(phase()).toBe("question")
    await vi.advanceTimersByTimeAsync(1)
    expect(phase()).toBe("voting")
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      deadlineMs: 20000,
    })
  })

  it("does not charge a late previous-scene tick or delayed render to a new question", async () => {
    const { session, holdNext, phase } = fixture(true)
    await session.mount({} as HTMLElement, { muted: true })
    await session.play()
    const previous = holdNext(
      (frame) => frame.chapterIndex === 0 && frame.clock.elapsedMs >= 100,
    )
    await vi.advanceTimersByTimeAsync(100)
    await previous.entered
    await vi.advanceTimersByTimeAsync(1000)
    const question = holdNext(
      (frame) => frame.chapterIndex === 1 && !frame.clock.paused,
    )
    previous.release()
    await vi.advanceTimersByTimeAsync(1)
    await question.entered
    expect(phase()).toBe("question")
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: true,
    })
    await vi.advanceTimersByTimeAsync(900)
    question.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: false,
    })
    await vi.advanceTimersByTimeAsync(1999)
    expect(phase()).toBe("question")
    await vi.advanceTimersByTimeAsync(1)
    expect(phase()).toBe("voting")
    expect(session.snapshot().clock.deadlineMs).toBe(20000)
  })

  it("keeps an intentional pause authoritative over a late presented callback", async () => {
    const { session, holdNext } = fixture()
    await session.mount({} as HTMLElement, { muted: true })
    const presentation = holdNext((frame) => !frame.clock.paused)
    const play = session.play()
    await presentation.entered
    await session.pause()
    presentation.release()
    await play
    await vi.advanceTimersByTimeAsync(5000)
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 0,
      paused: true,
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("retains earned reading time across pause and resume without charging renderer delay", async () => {
    const { session, holdNext, phase } = fixture()
    await session.mount({} as HTMLElement, { muted: true })
    await session.play()
    await vi.advanceTimersByTimeAsync(500)
    await session.pause()
    const presentation = holdNext((frame) => !frame.clock.paused)
    const play = session.play()
    await presentation.entered
    await vi.advanceTimersByTimeAsync(3000)
    expect(session.snapshot().clock).toMatchObject({
      elapsedMs: 500,
      paused: true,
    })
    presentation.release()
    await play
    await vi.advanceTimersByTimeAsync(1499)
    expect(phase()).toBe("question")
    await vi.advanceTimersByTimeAsync(1)
    expect(phase()).toBe("voting")
  })

  it("preserves question-to-voting overshoot and rejects stale work after navigation", async () => {
    const { session, holdNext, phase } = fixture()
    await session.mount({} as HTMLElement, { muted: true })
    await session.play()
    const lastQuestionFrame = holdNext(
      (frame) => frame.chapterIndex === 0 && frame.clock.elapsedMs >= 1900,
    )
    await vi.advanceTimersByTimeAsync(1900)
    await lastQuestionFrame.entered
    await vi.advanceTimersByTimeAsync(250)
    lastQuestionFrame.release()
    await vi.advanceTimersByTimeAsync(1)
    expect(phase()).toBe("voting")
    expect(session.snapshot().clock.elapsedMs).toBeGreaterThanOrEqual(150)
    expect(session.snapshot().clock.deadlineMs).toBe(20000)

    const first = session.chapters.find(
      (chapter) => chapter.phase === "question",
    )!
    const second = session.chapters.find(
      (chapter) => chapter.phase === "question" && chapter.id !== first.id,
    )!
    await session.seekChapter(first.id, new AbortController().signal)
    const presentation = holdNext((frame) => !frame.clock.paused)
    const play = session.play()
    await presentation.entered
    await session.seekChapter(second.id, new AbortController().signal)
    presentation.release()
    await play
    await vi.advanceTimersByTimeAsync(5000)
    expect(session.snapshot()).toMatchObject({
      chapterId: second.id,
      clock: { elapsedMs: 0, paused: true },
    })
    expect(vi.getTimerCount()).toBe(0)
  })
})
