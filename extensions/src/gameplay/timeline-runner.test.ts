import { describe, expect, it } from "vitest"
import { TimelineRunner } from "./timeline-runner"
import type { TimelineItem, SceneConfig } from "../core/studio-timeline-schema"

describe("TimelineRunner", () => {
  const items: TimelineItem[] = [
    { id: "step-1", kind: "opening", sceneId: "scene-open" },
    { id: "step-2", kind: "question", questionId: "q-1" },
    { id: "step-3", kind: "transition", sceneId: "scene-trans" },
    { id: "step-4", kind: "question", questionId: "q-2" },
    { id: "step-5", kind: "closing", sceneId: "scene-close" },
  ]

  const scenes: Record<string, SceneConfig> = {
    "scene-open": {
      id: "scene-open",
      kind: "opening",
      title: "Welcome",
      durationMs: 10000,
      advance: "auto",
    },
    "scene-trans": {
      id: "scene-trans",
      kind: "transition",
      title: "Part 2",
      durationMs: 3000,
      advance: "manual",
    },
    "scene-close": {
      id: "scene-close",
      kind: "closing",
      title: "Thank you",
      durationMs: 15000,
      advance: "auto",
    },
  }

  it("initializes at step 0 with correct scene properties", () => {
    const runner = new TimelineRunner(items, scenes)
    expect(runner.index).toBe(0)
    expect(runner.length).toBe(5)
    expect(runner.isQuestion).toBe(false)
    expect(runner.canAcceptAnswers).toBe(false)
    expect(runner.getAdvanceMode()).toBe("auto")
    expect(runner.getDurationMs()).toBe(10000)

    const step = runner.getCurrentStep()
    expect(step?.item.kind).toBe("opening")
    expect(step?.scene?.title).toBe("Welcome")
  })

  it("advances to question step and permits answers", () => {
    const runner = new TimelineRunner(items, scenes)
    const { step, done } = runner.advance()
    expect(done).toBe(false)
    expect(runner.index).toBe(1)
    expect(runner.isQuestion).toBe(true)
    expect(runner.canAcceptAnswers).toBe(true)
    expect(step?.item.kind).toBe("question")
    expect(runner.getQuestionOrdinal()).toBe(1)
  })

  it("tracks transition scene after question without accepting answers", () => {
    const runner = new TimelineRunner(items, scenes)
    // Advance to q-1
    runner.advance()
    // Advance to transition
    runner.advance()
    expect(runner.isQuestion).toBe(false)
    expect(runner.canAcceptAnswers).toBe(false)
    expect(runner.getAdvanceMode()).toBe("manual")
    expect(runner.getDurationMs()).toBe(3000)
    expect(runner.getQuestionOrdinal()).toBe(1)
  })

  it("counts questions accurately across interleaved scenes", () => {
    const runner = new TimelineRunner(items, scenes)
    // Jump to Q-2
    runner.jumpTo(3)
    expect(runner.isQuestion).toBe(true)
    expect(runner.getQuestionOrdinal()).toBe(2)

    // Jump to Scene-close
    runner.jumpTo(4)
    expect(runner.isQuestion).toBe(false)
    expect(runner.getQuestionOrdinal()).toBe(2)
  })

  it("detects completion when advancing past last item", () => {
    const runner = new TimelineRunner(items, scenes)
    runner.jumpTo(4)
    const { step, done } = runner.advance()
    expect(done).toBe(true)
    expect(step).toBeNull()
  })
})
