import { describe, expect, it, vi } from "vitest"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"
import { createDemoClock } from "./demo-clock"
import { prepareDemoFixture } from "./demo-fixture"
import { assertBoundPreviewStageMetadata, derivePreviewStageMetadata } from "../../core/show-library/stage-metadata"
import { createPreviewTransitionOwner } from "./preview-transition-owner"
import { pausedPreviewSteps, previewSteps, validatePreviewFrame, type PreviewFrame } from "./stage-scene-adapter"

const frame = (): PreviewFrame => ({
  phase: "voting", role: "spectator", epoch: 1, revision: 1,
  question: { id: `preview-question-${"a".repeat(64)}`, text: "Question", type: "single", mode: "survey", ordinal: 2, totalQuestions: 5 },
  choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  clock: { elapsedMs: 5000, deadlineMs: 20000, paused: false }, seconds: 20,
})

describe("silent preview candidate", () => {
  it("uses one elapsed clock through pause, resume and replay", () => {
    let now = 1000
    const clock = createDemoClock(() => now)
    clock.play(); clock.startVoting(20); now += 5000
    expect(clock.pause()).toMatchObject({ elapsedMs: 5000, deadlineMs: 20000, paused: true })
    now += 5000
    expect(clock.snapshot().elapsedMs).toBe(5000)
    clock.play(); now += 1000
    expect(clock.snapshot().elapsedMs).toBe(6000)
    expect(clock.replay()).toMatchObject({ epoch: 1, elapsedMs: 0, deadlineMs: null, paused: true })
  })

  it("converts the relative deadline at the transition boundary", () => {
    const result = previewSteps(frame(), null, { mode: "idle", questionKey: null }, 100000)
    expect(result.steps.find((step) => step.op === "openVoting")).toMatchObject({ deadlineMs: 115000, seconds: 20 })
  })

  it("rejects visual references and results before reveal", () => {
    const input = frame()
    expect(() => validatePreviewFrame({ ...input, choices: [{ ...input.choices[0], asset: "https://example.invalid/a" }, input.choices[1]] } as PreviewFrame)).toThrow()
    expect(() => validatePreviewFrame({ ...input, results: [] })).toThrow()
  })

  it("does not forward a stale wipe-covered callback", async () => {
    let covered: (() => void | Promise<void>) | undefined
    let finish: (() => void) | undefined
    const showQuestion = vi.fn(async () => {})
    const stage = { showQuestion, playZZWipe: (callback: typeof covered) => { covered = callback; return new Promise<void>((resolve) => { finish = resolve }) } } as unknown as TadazzStageHandle
    const owner = createPreviewTransitionOwner(stage)
    const pending = owner.run([{ op: "nextQuestion", question: { key: "q", question: "Q", number: 1, totalQuestions: 1, options: [] } }])
    owner.invalidate()
    await covered?.(); finish?.()
    expect(await pending).toBe(false)
    expect(showQuestion).not.toHaveBeenCalled()
  })

  it("uses the same stage owner and guarded native wipe for a new question", async () => {
    const first = { ...frame(), phase: "question" as const, choices: [] }
    const second = { ...first, question: { ...first.question, id: `preview-question-${"b".repeat(64)}`, ordinal: 3 } }
    const prior = previewSteps(first, null, { mode: "idle", questionKey: null }, 1000)
    const next = previewSteps(second, prior.scene, { mode: "question", questionKey: first.question.id }, 2000)
    expect(next.steps.map((step) => step.op)).toEqual(["nextQuestion"])
    const showQuestion = vi.fn(async () => {})
    const wipe = vi.fn(async (covered?: () => void | Promise<void>) => { await covered?.() })
    const stage = { showQuestion, playZZWipe: wipe } as unknown as TadazzStageHandle
    const owner = createPreviewTransitionOwner(stage)
    expect(await owner.run(prior.steps)).toBe(true)
    expect(await owner.run(next.steps)).toBe(true)
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(showQuestion).toHaveBeenLastCalledWith(expect.objectContaining({ key: second.question.id }))
  })

  it("plans paused answer cards and locked state without opening voting", () => {
    const input = frame()
    for (const phase of ["answerCards", "voteLocked"] as const) {
      const result = pausedPreviewSteps({ ...input, phase, clock: { ...input.clock, paused: true } }, 1000)
      expect(result.steps.some((step) => step.op === "openVoting")).toBe(false)
      expect(result.steps[0].op).toBe("showQuestion")
      if (phase === "voteLocked") expect(result.steps.at(-1)?.op).toBe("lockVoting")
    }
  })

  it("rejects copied stage metadata as a producer binding", () => {
    const { draft, plan } = prepareDemoFixture("spectator", "en", false)
    const questionId = draft.input.identityMap.questions[0].previewId
    const metadata = derivePreviewStageMetadata(draft, plan, questionId)
    expect(metadata).toMatchObject({ ordinal: 1, totalQuestions: 5 })
    expect(() => assertBoundPreviewStageMetadata(draft, plan, questionId, structuredClone(metadata))).toThrow()
  })
})
