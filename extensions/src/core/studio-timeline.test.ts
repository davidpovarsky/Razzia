import { describe, expect, it } from "vitest"
import {
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
  upgradeLegacyExtrasToV2,
  projectLegacyCompat,
  isQuizExtrasV2,
  isQuizExtrasV1,
  type QuizExtrasV2,
  type SceneConfig,
} from "./index"
import { createDefaultQuizExtras } from "./quiz-extras"

describe("Studio Timeline V2 Schema & Migration", () => {
  const quizId = "test-quiz-123"
  const qId1 = crypto.randomUUID()
  const qId2 = crypto.randomUUID()
  const qId3 = crypto.randomUUID()
  const baseDigest = "0".repeat(64)

  it("creates a valid default V2 extras payload", () => {
    const v2 = createDefaultQuizExtrasV2(quizId, [qId1, qId2], baseDigest)
    expect(v2.schemaVersion).toBe(2)
    expect(v2.timeline.length).toBe(2)
    expect(v2.timeline[0].kind).toBe("question")
    expect(v2.timeline[1].kind).toBe("question")
    expect(isQuizExtrasV2(v2)).toBe(true)
    expect(isQuizExtrasV1(v2)).toBe(false)

    const parseResult = quizExtrasV2Schema.safeParse(v2)
    expect(parseResult.success).toBe(true)
  })

  it("validates a mixed timeline containing question, transition, survey, media, and closing", () => {
    const sceneId1 = crypto.randomUUID()
    const sceneId2 = crypto.randomUUID()
    const sceneId3 = crypto.randomUUID()

    const scenes: Record<string, SceneConfig> = {
      [sceneId1]: {
        id: sceneId1,
        kind: "transition",
        title: "Half Time Transition",
        durationMs: 4000,
        advance: "auto",
      },
      [sceneId2]: {
        id: sceneId2,
        kind: "media",
        mediaUrl: "/media/video.mp4",
        mediaType: "video",
        title: "Sponsor Video",
        durationMs: 8000,
        advance: "manual",
      },
      [sceneId3]: {
        id: sceneId3,
        kind: "closing",
        title: "Thank you for playing!",
        durationMs: 5000,
        advance: "manual",
      },
    }

    const v2: QuizExtrasV2 = {
      ...createDefaultQuizExtrasV2(quizId, [qId1, qId2, qId3], baseDigest),
      timeline: [
        { id: crypto.randomUUID(), kind: "question", questionId: qId1 },
        { id: crypto.randomUUID(), kind: "transition", sceneId: sceneId1 },
        { id: crypto.randomUUID(), kind: "question", questionId: qId2 },
        { id: crypto.randomUUID(), kind: "media", sceneId: sceneId2 },
        { id: crypto.randomUUID(), kind: "question", questionId: qId3 },
        { id: crypto.randomUUID(), kind: "closing", sceneId: sceneId3 },
      ],
      scenes,
    }

    const parseResult = quizExtrasV2Schema.safeParse(v2)
    expect(parseResult.success).toBe(true)
  })

  it("rejects duplicate timeline IDs", () => {
    const sharedId = crypto.randomUUID()
    const v2 = createDefaultQuizExtrasV2(quizId, [qId1, qId2], baseDigest)
    v2.timeline[0].id = sharedId
    v2.timeline[1].id = sharedId

    const parseResult = quizExtrasV2Schema.safeParse(v2)
    expect(parseResult.success).toBe(false)
    expect(parseResult.error?.issues.some((i) => i.path.includes("id"))).toBe(
      true,
    )
  })

  it("rejects orphan questionId in timeline", () => {
    const v2 = createDefaultQuizExtrasV2(quizId, [qId1], baseDigest)
    // Not in questionIds
    v2.timeline.push({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: crypto.randomUUID(),
    })

    const parseResult = quizExtrasV2Schema.safeParse(v2)
    expect(parseResult.success).toBe(false)
  })

  it("rejects orphan sceneId in timeline", () => {
    const v2 = createDefaultQuizExtrasV2(quizId, [qId1], baseDigest)
    // Not in scenes
    v2.timeline.push({
      id: crypto.randomUUID(),
      kind: "transition",
      sceneId: crypto.randomUUID(),
    })

    const parseResult = quizExtrasV2Schema.safeParse(v2)
    expect(parseResult.success).toBe(false)
  })

  it("rejects timeline with zero questions", () => {
    const sceneId = crypto.randomUUID()
    const v2: QuizExtrasV2 = {
      ...createDefaultQuizExtrasV2(quizId, [], baseDigest),
      timeline: [{ id: crypto.randomUUID(), kind: "transition", sceneId }],
      scenes: {
        [sceneId]: {
          id: sceneId,
          kind: "transition",
          durationMs: 3000,
          advance: "auto",
        },
      },
    }

    const parseResult = quizExtrasV2Schema.safeParse(v2)
    expect(parseResult.success).toBe(false)
  })

  it("upgrades legacy V1 with per-question interludes to V2 correctly", () => {
    const v1 = createDefaultQuizExtras(quizId, [qId1, qId2, qId3], baseDigest)
    v1.perQuestion[qId1] = {
      interlude: {
        kind: "image",
        url: "/media/photo.png",
        title: "Interlude 1",
        durationMs: 4000,
        advance: "auto",
      },
    }
    // Interlude on last question should NOT be synthesized into reachable step (legacy skip rule)
    v1.perQuestion[qId3] = {
      interlude: {
        kind: "title",
        title: "Unreachable Last Interlude",
        durationMs: 3000,
        advance: "auto",
      },
    }

    const upgraded = upgradeLegacyExtrasToV2({ questions: [{}, {}, {}] }, v1, {
      quizId,
      baseDigest,
    })
    expect(upgraded.schemaVersion).toBe(2)
    expect(upgraded.questionIds).toEqual([qId1, qId2, qId3])

    // Should have 3 questions + 1 interlude after Q1 = 4 timeline items
    expect(upgraded.timeline.length).toBe(4)
    expect(upgraded.timeline[0].kind).toBe("question")
    expect(upgraded.timeline[1].kind).toBe("media")
    expect(upgraded.timeline[2].kind).toBe("question")
    expect(upgraded.timeline[3].kind).toBe("question")

    const parseResult = quizExtrasV2Schema.safeParse(upgraded)
    expect(parseResult.success).toBe(true)
  })

  it("projects V2 back to V1 shape for legacy consumers", () => {
    const v2 = createDefaultQuizExtrasV2(quizId, [qId1, qId2], baseDigest)
    const projected = projectLegacyCompat(v2)
    expect(projected.schemaVersion).toBe(1)
    expect(isQuizExtrasV1(projected)).toBe(true)
    expect(projected.questionIds).toEqual([qId1, qId2])
  })

  it("validates answerRecap scene with preceding startQuestionId and rejects forward or orphan startQuestionId", () => {
    const recapId = crypto.randomUUID()
    const validV2: QuizExtrasV2 = {
      ...createDefaultQuizExtrasV2(quizId, [qId1, qId2], baseDigest),
      timeline: [
        { id: crypto.randomUUID(), kind: "question", questionId: qId1 },
        { id: crypto.randomUUID(), kind: "answerRecap", sceneId: recapId },
        { id: crypto.randomUUID(), kind: "question", questionId: qId2 },
      ],
      scenes: {
        [recapId]: {
          id: recapId,
          kind: "answerRecap",
          title: "Mid-Show Answer Recap",
          startQuestionId: qId1,
          mode: "mostSelected",
          maxItemsPerPage: 4,
          showCounts: true,
          showPercentages: true,
          durationMs: 8000,
          advance: "manual",
        },
      },
    }

    expect(quizExtrasV2Schema.safeParse(validV2).success).toBe(true)

    // Forward reference (qId2 appears AFTER recapId in timeline) must be rejected
    const forwardRefV2: QuizExtrasV2 = {
      ...validV2,
      scenes: {
        [recapId]: {
          ...(validV2.scenes[recapId] as Extract<
            QuizExtrasV2["scenes"][string],
            { kind: "answerRecap" }
          >),
          kind: "answerRecap" as const,
          startQuestionId: qId2,
        },
      },
    }
    const forwardParse = quizExtrasV2Schema.safeParse(forwardRefV2)
    expect(forwardParse.success).toBe(false)
    expect(
      forwardParse.error?.issues.some((i) =>
        i.message.includes("recapStartAfterRecap"),
      ),
    ).toBe(true)

    // Orphan startQuestionId must be rejected
    const orphanRefV2: QuizExtrasV2 = {
      ...validV2,
      scenes: {
        [recapId]: {
          ...(validV2.scenes[recapId] as Extract<
            QuizExtrasV2["scenes"][string],
            { kind: "answerRecap" }
          >),
          kind: "answerRecap" as const,
          startQuestionId: crypto.randomUUID(),
        },
      },
    }
    const orphanParse = quizExtrasV2Schema.safeParse(orphanRefV2)
    expect(orphanParse.success).toBe(false)
    expect(
      orphanParse.error?.issues.some((i) =>
        i.message.includes("invalidRecapStartQuestion"),
      ),
    ).toBe(true)
  })
})
