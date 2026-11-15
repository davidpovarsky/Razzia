import { describe, expect, it, vi } from "vitest"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"
import { createDemoClock } from "./demo-clock"
import { prepareDemoFixture } from "./demo-fixture"
import { assertBoundPreviewStageMetadata, derivePreviewStageMetadata } from "../../core/show-library/stage-metadata"
import { projectedFrame } from "./projected-frame"
import { previewNativeLabels, type PreviewLocale } from "./i18n"
import { previewText } from "./ui-strings"
import { createPreviewTransitionOwner } from "./preview-transition-owner"
import { pausedPreviewSteps, previewSteps, validatePreviewFrame, type PreviewFrame } from "./stage-scene-adapter"

const frame = (): PreviewFrame => ({
  phase: "voting", role: "spectator", epoch: 1, revision: 1,
  question: { id: `preview-question-${"a".repeat(64)}`, text: "Question", type: "single", mode: "survey", ordinal: 2, totalQuestions: 5 },
  choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  clock: { elapsedMs: 5000, deadlineMs: 20000, paused: false }, seconds: 20,
})

describe("silent preview candidate", () => {
  it("initializes all eight isolated locales synchronously", () => {
    for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"] as PreviewLocale[]) {
      expect(previewText(locale)("unavailable")).not.toBe("unavailable")
      expect(previewNativeLabels(locale).v4Labels.noVotes).not.toBe("v4.noVotes")
    }
  })
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
    const wipe = vi.fn((covered?: () => void | Promise<void>) => { void Promise.resolve(covered?.()).catch(() => undefined); return Promise.resolve() })
    const stage = { showQuestion, playZZWipe: wipe } as unknown as TadazzStageHandle
    const owner = createPreviewTransitionOwner(stage)
    expect(await owner.run(prior.steps)).toBe(true)
    expect(await owner.run(next.steps)).toBe(true)
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(showQuestion).toHaveBeenLastCalledWith(expect.objectContaining({ key: second.question.id }))
  })

  it("waits for a covered entrance even when the native wipe finishes first", async () => {
    let rejectEntrance: (error: Error) => void = () => {}
    const entrance = new Promise<void>((_, reject) => { rejectEntrance = reject })
    const stage = { showQuestion: () => entrance, playZZWipe: (covered?: () => void | Promise<void>) => {
      void Promise.resolve(covered?.()).catch(() => undefined)
      return Promise.resolve()
    } } as unknown as TadazzStageHandle
    const owner = createPreviewTransitionOwner(stage)
    let settled = false
    const run = owner.run([{ op: "nextQuestion", question: { key: "q", question: "Q", number: 1, totalQuestions: 1, options: [] } }])
    void run.then(() => { settled = true }, () => { settled = true })
    await Promise.resolve(); await Promise.resolve()
    expect(settled).toBe(false)
    rejectEntrance(new Error("entrance failed"))
    await expect(run).rejects.toThrow("entrance failed")
  })

  it("invalidates voting entry during pause and derives the deadline at the call", async () => {
    let release: () => void = () => {}
    const entry = new Promise<void>((resolve) => { release = resolve })
    const openVoting = vi.fn(async () => {})
    let paused = false
    let wallNow = 1000
    const stage = { presentOptions: () => entry, openVoting } as unknown as TadazzStageHandle
    const owner = createPreviewTransitionOwner(stage, () => paused ? null : { seconds: 20, deadlineMs: wallNow + 15000 })
    const q = { key: "q", question: "Q", number: 1, totalQuestions: 1, options: [] }
    const old = owner.run([{ op: "presentOptions", question: q }, { op: "openVoting", seconds: 20, deadlineMs: 16000 }])
    paused = true; owner.invalidate(); wallNow += 60000
    release()
    expect(await old).toBe(false)
    expect(openVoting).not.toHaveBeenCalled()
    paused = false
    expect(await owner.run([{ op: "openVoting", seconds: 20, deadlineMs: 16000 }])).toBe(true)
    expect(openVoting).toHaveBeenLastCalledWith(20, 76000)
    // Re-anchoring an already-visible countdown uses the same latest clock path.
    wallNow += 10000
    expect(await owner.run([{ op: "openVoting", seconds: 20, deadlineMs: 16000 }])).toBe(true)
    expect(openVoting).toHaveBeenLastCalledWith(20, 86000)
  })

  it("drains a native lock before admitting only the latest question", async () => {
    let release: () => void = () => {}
    const lock = new Promise<void>((resolve) => { release = resolve })
    const showQuestion = vi.fn(async () => {})
    const stage = { lockVoting: () => lock, showQuestion } as unknown as TadazzStageHandle
    const owner = createPreviewTransitionOwner(stage)
    const old = owner.run([{ op: "lockVoting" }])
    owner.invalidate()
    const q = { key: "q", question: "Q", number: 1, totalQuestions: 1, options: [] }
    const superseded = owner.run([{ op: "showQuestion", question: { ...q, key: "middle" } }])
    const latest = owner.run([{ op: "showQuestion", question: { ...q, key: "latest" } }])
    expect(showQuestion).not.toHaveBeenCalled()
    release()
    expect(await old).toBe(false)
    expect(await superseded).toBe(false)
    expect(await latest).toBe(true)
    expect(showQuestion).toHaveBeenCalledTimes(1)
    expect(showQuestion).toHaveBeenCalledWith(expect.objectContaining({ key: "latest" }))
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

  it("projects genuine paused results using the bound controller clock", () => {
    const { draft, plan } = prepareDemoFixture("spectator", "en", false)
    const card = draft.show.cards[0]
    if (card.kind !== "quiz") throw new Error("unexpected fixture")
    const questionId = draft.input.identityMap.questions.find((q) => q.authoredKey === card.key)!.previewId
    const choices = card.answers.map((answer, index) => ({ id: `${questionId}.choice.${index + 1}`, label: answer.text }))
    const clock = { epoch: 1, sequence: 2, elapsedMs: 20000, deadlineMs: 20000, paused: true }
    const binding = { draft, plan, currentQuestionId: questionId, phase: "results" as const, clock }
    const metadata = derivePreviewStageMetadata(draft, plan, questionId)
    const snapshot = { portVersion: 3, identityRuleVersion: 2, source: "deterministic-fixture", phase: "results", clock,
      question: { id: questionId, text: card.question, questionType: card.questionType, playMode: card.kind, choices, solutionAnswerIds: [choices[0].id] },
      results: choices.map((choice, index) => ({ answerId: choice.id, count: 0, percent: 0, correct: index === 0 })), canAnswer: false, responders: 0, eligible: 0 }
    const output = projectedFrame(snapshot, draft.input.context, binding, metadata, 1, 20)
    expect(output.clock).toMatchObject({ elapsedMs: 20000, paused: true })
    expect(output.question).toMatchObject({ id: questionId, ordinal: 1, totalQuestions: 5 })
    expect(output.results?.map((r) => r.answerId)).toEqual(choices.map((c) => c.id))
    expect(() => projectedFrame({ ...snapshot, clock: { ...clock, elapsedMs: 1 } }, draft.input.context, binding, metadata, 1, 20)).toThrow()
    expect(() => projectedFrame(snapshot, draft.input.context, binding, structuredClone(metadata), 1, 20)).toThrow()
    const otherId = draft.input.identityMap.questions.find((q) => q.authoredKey !== card.key)!.previewId
    const other = derivePreviewStageMetadata(draft, plan, otherId)
    expect(() => projectedFrame(snapshot, draft.input.context, binding, other, 1, 20)).toThrow()
  })
})
