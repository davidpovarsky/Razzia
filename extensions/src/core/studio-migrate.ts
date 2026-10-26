import {
  type PerQuestionItem,
  type QuizExtrasV1,
  createDefaultQuizExtras,
} from "./quiz-extras"
import {
  type QuizExtrasV2,
  type SceneConfig,
  type TimelineItem,
  createDefaultQuizExtrasV2,
} from "./studio-timeline-schema"
import { createDefaultRosterExtras } from "./phone-roster"

export type AnyQuizExtras = QuizExtrasV1 | QuizExtrasV2

export const isQuizExtrasV2 = (extras: unknown): extras is QuizExtrasV2 => {
  if (!extras || typeof extras !== "object") {return false}

  const r = extras as Record<string, unknown>

  return r.schemaVersion === 2 && Array.isArray(r.timeline)
}

export const isQuizExtrasV1 = (extras: unknown): extras is QuizExtrasV1 => {
  if (!extras || typeof extras !== "object") {return false}

  const r = extras as Record<string, unknown>

  return r.schemaVersion === 1
}

export interface MigrateMeta {
  quizId: string
  baseDigest: string
}

/**
 * Pure upgrade function that transforms a V1 QuizExtras (or null)
 * into a valid QuizExtrasV2 structure, preserving interludes immediately
 * after their corresponding question (except last question, adhering to legacy Razzia rule).
 */
export const upgradeLegacyExtrasToV2 = (
  baseQuizz: { questions?: unknown[] },
  v1: QuizExtrasV1 | null,
  meta: MigrateMeta,
): QuizExtrasV2 => {
  const { quizId, baseDigest } = meta
  const baseQuestions = Array.isArray(baseQuizz.questions)
    ? baseQuizz.questions
    : []

  if (!v1) {
    const qIds =
      baseQuestions.length > 0
        ? baseQuestions.map(() => crypto.randomUUID())
        : [crypto.randomUUID()]

    return createDefaultQuizExtrasV2(quizId, qIds, baseDigest)
  }

  const scenes: Record<string, SceneConfig> = {}
  const timeline: TimelineItem[] = []

  const questionIds =
    Array.isArray(v1.questionIds) && v1.questionIds.length > 0
      ? v1.questionIds
      : baseQuestions.map(() => crypto.randomUUID())

  for (let i = 0; i < questionIds.length; i += 1) {
    const qId = questionIds[i]

    // 1. Add question item
    timeline.push({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: qId,
    })

    // 2. Migrate perQuestion interlude if present and not last question (CORE/MIGRATE requirement)
    const perQ = v1.perQuestion[qId] as PerQuestionItem | undefined

    if (
      perQ?.interlude &&
      i < questionIds.length - 1
    ) {
      const sceneId = crypto.randomUUID()
      const mediaUrl = perQ.interlude.url
      const isMedia = Boolean(mediaUrl && (perQ.interlude.kind === "image" || perQ.interlude.kind === "video"))

      if (isMedia && mediaUrl) {
        const mediaScene: SceneConfig = {
          id: sceneId,
          kind: "media",
          mediaUrl,
          mediaType: perQ.interlude.kind === "video" ? "video" : "image",
          title: perQ.interlude.title ?? undefined,
          durationMs: perQ.interlude.durationMs,
          advance: perQ.interlude.advance,
        }
        scenes[sceneId] = mediaScene
        timeline.push({
          id: crypto.randomUUID(),
          kind: "media",
          sceneId,
        })
      } else {
        const transitionScene: SceneConfig = {
          id: sceneId,
          kind: "transition",
          title: perQ.interlude.title ?? undefined,
          description: undefined,
          durationMs: perQ.interlude.durationMs,
          advance: perQ.interlude.advance,
        }
        scenes[sceneId] = transitionScene
        timeline.push({
          id: crypto.randomUUID(),
          kind: "transition",
          sceneId,
        })
      }
    }
  }

  return {
    schemaVersion: 2,
    revision: v1.revision,
    quizId: v1.quizId || quizId,
    baseDigest,
    questionIds,
    timeline,
    scenes,
    defaults: {
      newQuestionMode: "quiz",
      leaderboardPolicy:
        v1.leaderboard.mode === "everyN" ? "everyN" : "cardOnly",
      advanceMode: "auto",
    },
    leaderboard: v1.leaderboard,
    teams: v1.teams,
    audio: v1.audio,
    perQuestion: v1.perQuestion,
    roster: v1.roster ?? createDefaultRosterExtras(),
  }
}

/**
 * Projects a V2 extras object into a valid V1 shape for backwards compatibility.
 */
export const projectLegacyCompat = (v2: QuizExtrasV2): QuizExtrasV1 => {
  const baseV1 = createDefaultQuizExtras(
    v2.quizId,
    v2.questionIds,
    v2.baseDigest,
  )

  return {
    ...baseV1,
    revision: v2.revision,
    audio: v2.audio,
    teams: v2.teams,
    roster: v2.roster,
    perQuestion: v2.perQuestion,
    leaderboard: v2.leaderboard ?? baseV1.leaderboard,
  }
}
