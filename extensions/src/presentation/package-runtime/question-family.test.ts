import { describe, expect, it } from "vitest"
import {
  RUNTIME_PHASES,
  type RuntimeSnapshot,
} from "../../core/packages/protocol"
import {
  createPackageQuestionAdmission,
  packageQuestionContentSupported,
  packageUsesSandboxForPhase,
  selectPackageFrame,
} from "./question-family"
import { STATUS } from "@razzia/common/types/game/status"
import { computeShowScene } from "../tadazz-show/presentation-scene"
import { projectPackageClock } from "./projection"

const questionPhases: Array<RuntimeSnapshot["phase"]> = [
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "results",
  "personalResult",
]

function completeSlots(): Record<
  RuntimeSnapshot["phase"],
  "implemented" | "classic"
> {
  return Object.fromEntries(
    RUNTIME_PHASES.map((phase) => [phase, "implemented"]),
  ) as Record<RuntimeSnapshot["phase"], "implemented" | "classic">
}

describe("package question document lifetime", () => {
  it("retains the matching prepared frame through voting and results", () => {
    const lobby = selectPackageFrame(null, "host", { kind: "other" })
    const prepared = selectPackageFrame(lobby, "host", {
      kind: "prepared",
      number: 1,
    })
    expect(prepared.generation).not.toBe(lobby.generation)
    const question = { kind: "question", number: 1, identity: "q1" } as const
    const reading = selectPackageFrame(prepared, "host", question)
    expect(reading.generation).toBe(prepared.generation)
    expect(selectPackageFrame(reading, "host", question)).toBe(reading)
    expect(
      selectPackageFrame(reading, "host", { kind: "question", identity: "q1" }),
    ).toBe(reading)
  })

  it("does not carry a document to a different question, replay, or room role", () => {
    const prepared = selectPackageFrame(null, "host", {
      kind: "prepared",
      number: 1,
    })
    const question = { kind: "question", number: 2, identity: "q2" } as const
    const reading = selectPackageFrame(prepared, "host", question)
    expect(reading.generation).not.toBe(prepared.generation)
    expect(
      selectPackageFrame(reading, "host", { kind: "prepared", number: 2 })
        .generation,
    ).not.toBe(reading.generation)
    expect(
      selectPackageFrame(reading, "host", { kind: "question", identity: "q3" })
        .generation,
    ).not.toBe(reading.generation)
    expect(selectPackageFrame(reading, "spectator", question).scope).toBe(
      "spectator",
    )
  })
})

describe("package question renderer admission", () => {
  it("keeps a complete sandbox package for the whole question and its results", () => {
    const slots = Object.freeze(completeSlots())
    expect(
      questionPhases.map((phase) => packageUsesSandboxForPhase(slots, phase)),
    ).toEqual(questionPhases.map(() => true))
  })

  it.each(questionPhases)(
    "keeps every question phase native when %s belongs to the native renderer",
    (nativePhase) => {
      const slots = Object.freeze({
        ...completeSlots(),
        [nativePhase]: "classic" as const,
      })
      expect(
        questionPhases.map((phase) => packageUsesSandboxForPhase(slots, phase)),
      ).toEqual(questionPhases.map(() => false))
      expect(packageUsesSandboxForPhase(slots, "lobby")).toBe(true)
      expect(packageUsesSandboxForPhase(slots, "leaderboard")).toBe(true)
      expect(slots[nativePhase]).toBe("classic")
    },
  )

  it("treats an omitted family slot as incomplete without changing other scenes", () => {
    const slots = completeSlots()
    const { results: _results, ...incomplete } = slots
    expect(packageUsesSandboxForPhase(incomplete, "question")).toBe(false)
    expect(packageUsesSandboxForPhase(incomplete, "voting")).toBe(false)
    expect(packageUsesSandboxForPhase(incomplete, "interlude")).toBe(true)
    expect(packageUsesSandboxForPhase(undefined, "question")).toBe(false)
  })

  it("retains the explicit native choice for an unrelated scene", () => {
    const slots = { ...completeSlots(), lobby: "classic" as const }
    expect(packageUsesSandboxForPhase(slots, "lobby")).toBe(false)
    expect(packageUsesSandboxForPhase(slots, "question")).toBe(true)
    expect(packageUsesSandboxForPhase(slots, "voting")).toBe(true)
  })
})

describe("package question content and lifetime", () => {
  it.each([
    { questionType: "estimation" },
    { questionType: "single", mediaType: "video" },
    { questionType: "multi", mediaType: "video" },
  ])("keeps unsupported content native through every phase: %j", (content) => {
    const admission = createPackageQuestionAdmission()
    const supported = packageQuestionContentSupported(content)
    expect(supported).toBe(false)

    for (const phase of questionPhases) {
      expect(
        admission.select({
          identity: "room/question/theme/manager",
          supported: phase === "question" ? supported : undefined,
          available: packageUsesSandboxForPhase(completeSlots(), phase),
        }),
      ).toBe(false)
    }
  })

  it.each([
    { questionType: "single" },
    { questionType: "multi" },
    { questionType: "single", mediaType: "image" },
    { questionType: "multi", mediaType: "audio" },
  ])(
    "keeps supported content and later metadata-free phases in sandbox: %j",
    (content) => {
      const admission = createPackageQuestionAdmission()
      const supported = packageQuestionContentSupported(content)
      expect(supported).toBe(true)

      for (const phase of questionPhases) {
        expect(
          admission.select({
            identity: "room/question/theme/player",
            supported: phase === "question" ? supported : undefined,
            available: packageUsesSandboxForPhase(completeSlots(), phase),
          }),
        ).toBe(true)
      }
    },
  )

  it("never promotes unknown legacy content mid-question and resets for a new question", () => {
    const admission = createPackageQuestionAdmission()
    expect(packageQuestionContentSupported(undefined)).toBeUndefined()
    expect(
      admission.select({
        identity: "q1",
        supported: undefined,
        available: true,
      }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q2", supported: true, available: true }),
    ).toBe(true)
  })

  it("latches an actual renderer failure until a fresh question and ignores stale failures", () => {
    const admission = createPackageQuestionAdmission()
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(true)
    expect(admission.reject("q1")).toBe(true)
    expect(
      admission.select({
        identity: "q1",
        supported: undefined,
        available: true,
      }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q2", supported: true, available: true }),
    ).toBe(true)
    expect(admission.reject("q1")).toBe(false)
    expect(
      admission.select({
        identity: "q2",
        supported: undefined,
        available: true,
      }),
    ).toBe(true)
  })

  it.each([
    {
      name: STATUS.SHOW_QUESTION,
      data: {
        question: "Restored question",
        questionType: "single",
        totalAnswers: 2,
        cooldown: 2,
      },
    },
    {
      name: STATUS.SHOW_RESPONSES,
      data: {
        question: "Restored results",
        type: "single",
        answers: ["A", "B"],
        responses: {},
      },
    },
  ])(
    "admits a cold restored $name after its capability and media are ready",
    (status) => {
      const scene = computeShowScene({
        role: "spectator",
        isConnected: true,
        status,
        envelope: { questionId: "q1", extras: {} },
        questionStates: { current: 1, total: 1 },
      })
      const supported = packageQuestionContentSupported(
        "questionType" in scene
          ? {
              questionType: scene.questionType,
              mediaType: scene.questionMediaType,
            }
          : undefined,
      )
      const admission = createPackageQuestionAdmission()
      expect(supported).toBe(true)

      // The capability may finish before media, or the other way around.
      for (const pending of [true, true, false]) {
        expect(
          admission.select({
            identity: "room/q1/theme/spectator",
            supported,
            available: !pending,
            pending,
          }),
        ).toBe(!pending)
      }

      expect(
        admission.select({
          identity: "room/q1/theme/spectator",
          supported: undefined,
          available: true,
        }),
      ).toBe(true)
    },
  )

  it("latches a settled dependency failure after initially pending acquisition", () => {
    const admission = createPackageQuestionAdmission()
    expect(
      admission.select({
        identity: "q1",
        supported: true,
        available: false,
        pending: true,
      }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q1", supported: true, available: false }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q2", supported: true, available: true }),
    ).toBe(true)
  })

  it.each([undefined, false])(
    "does not defer the native decision for unknown or unsupported content: %s",
    (supported) => {
      const admission = createPackageQuestionAdmission()
      expect(
        admission.select({
          identity: "q1",
          supported,
          available: false,
          pending: true,
        }),
      ).toBe(false)
      expect(
        admission.select({ identity: "q1", supported: true, available: true }),
      ).toBe(false)
    },
  )

  it("keeps an admitted renderer while later phase media loads and latches real failure", () => {
    const admission = createPackageQuestionAdmission()
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(true)
    expect(
      admission.select({
        identity: "q1",
        supported: undefined,
        available: false,
        pending: true,
      }),
    ).toBe(true)
    expect(
      admission.select({
        identity: "q1",
        supported: undefined,
        available: true,
      }),
    ).toBe(true)
    expect(
      admission.select({
        identity: "q1",
        supported: undefined,
        available: false,
      }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(false)
  })

  it("keeps a settled native fallback for the remaining question", () => {
    const admission = createPackageQuestionAdmission()
    expect(
      admission.select({ identity: "q1", supported: true, available: false }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q1", supported: true, available: true }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q2", supported: true, available: true }),
    ).toBe(true)
    expect(
      admission.select({
        identity: "q2",
        supported: undefined,
        available: false,
      }),
    ).toBe(false)
    expect(
      admission.select({ identity: "q2", supported: true, available: true }),
    ).toBe(false)
  })

  it.each([
    {
      name: STATUS.SHOW_QUESTION,
      data: {
        question: "Video question",
        questionType: "single",
        questionMediaType: "video",
        totalAnswers: 4,
        cooldown: 2,
      },
    },
    {
      name: STATUS.SELECT_ANSWER,
      data: {
        question: "Video question",
        questionType: "single",
        media: { type: "video", url: "/media/question.mp4" },
        answers: ["A", "B", "C", "D"],
        time: 20,
      },
    },
    {
      name: STATUS.SHOW_RESPONSES,
      data: {
        question: "Video question",
        type: "single",
        media: { type: "video", url: "/media/question.mp4" },
        answers: ["A", "B", "C", "D"],
        responses: {},
      },
    },
  ])("projects safe content identity for $name", (status) => {
    const scene = computeShowScene({
      role: "manager",
      isConnected: true,
      status,
      envelope: { questionId: "q1", extras: {} },
      questionStates: { current: 1, total: 1 },
    })
    expect(scene).toMatchObject({
      questionType: "single",
      questionMediaType: "video",
    })
  })
})

describe("package public question clock", () => {
  it.each([
    { deadline: 102_000, remainingMs: 2000 },
    { deadline: null, remainingMs: 750 },
  ])("withholds the active or paused reading clock: %j", (readingClock) => {
    const input = Object.freeze({ phase: "question" as const, ...readingClock })
    expect(projectPackageClock(input)).toEqual({
      deadline: null,
      remainingMs: 0,
    })
    expect(input).toEqual({ phase: "question", ...readingClock })
  })

  it("preserves the authoritative voting deadline and full remaining duration", () => {
    expect(
      projectPackageClock({
        phase: "voting",
        deadline: 122_000,
        remainingMs: 20_000,
      }),
    ).toEqual({ deadline: 122_000, remainingMs: 20_000 })
  })

  it("preserves paused and untimed voting without creating a second timer", () => {
    expect(
      projectPackageClock({
        phase: "voting",
        deadline: null,
        remainingMs: 14_250,
      }),
    ).toEqual({ deadline: null, remainingMs: 14_250 })
    expect(
      projectPackageClock({ phase: "voting", deadline: null, remainingMs: 0 }),
    ).toEqual({ deadline: null, remainingMs: 0 })
  })
})
