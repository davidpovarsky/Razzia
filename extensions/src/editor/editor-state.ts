// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import {
  duplicateQuestion,
  generateQuestionId,
  removeQuestion,
  reorderQuestionIds,
  type AnswerVisual,
  type AudioExtras,
  type Interlude,
  type LeaderboardExtras,
  type QuestionReveal,
  type QuizExtrasV1,
  type SceneConfig,
  type TeamsExtras,
  type TimelineItem,
} from "@razzia/extensions/core"

/**
 * Ensures questionIds array matches the current questions count.
 * Synthesizes stable UUIDs for any missing questions.
 */
export const synchronizeQuestionIds = (
  currentIds: string[],
  targetLength: number,
): string[] => {
  const result = [...currentIds]

  while (result.length < targetLength) {
    result.push(generateQuestionId())
  }

  if (result.length > targetLength) {
    return result.slice(0, targetLength)
  }

  return result
}

/**
 * Pure state reducer helpers for managing QuizExtrasV1 during quiz authoring.
 */
export const updateLeaderboardPolicy = (
  extras: QuizExtrasV1,
  policy: LeaderboardExtras,
): QuizExtrasV1 => ({
  ...extras,
  leaderboard: policy,
})

export const updateTeamsExtras = (
  extras: QuizExtrasV1,
  teams: TeamsExtras,
): QuizExtrasV1 => ({
  ...extras,
  teams,
})

export const updateAudioExtras = (
  extras: QuizExtrasV1,
  audio: AudioExtras,
): QuizExtrasV1 => ({
  ...extras,
  audio,
})

/**
 * Question reordering: reorders stable UUID array while preserving attachments in perQuestion.
 * (CORE02)
 */
export const reorderQuestionsInExtras = (
  extras: QuizExtrasV1,
  fromIndex: number,
  toIndex: number,
): QuizExtrasV1 => {
  const nextQuestionIds = reorderQuestionIds(
    extras.questionIds,
    fromIndex,
    toIndex,
  )

  return {
    ...extras,
    questionIds: nextQuestionIds,
  }
}

/**
 * Question duplication: creates fresh UUID and clones perQuestion attachments without collision.
 * (CORE03)
 */
export const duplicateQuestionInExtras = (
  extras: QuizExtrasV1,
  targetIndex: number,
): { extras: QuizExtrasV1; newQuestionId: string } => {
  const { questionIds, perQuestion, newQuestionId } = duplicateQuestion(
    extras.questionIds,
    extras.perQuestion,
    targetIndex,
  )

  return {
    extras: {
      ...extras,
      questionIds,
      perQuestion,
    },
    newQuestionId,
  }
}

/**
 * Question removal: removes target UUID and completely deletes perQuestion attachments to avoid orphans.
 * (CORE03)
 */
export const removeQuestionFromExtras = (
  extras: QuizExtrasV1,
  targetIndex: number,
): QuizExtrasV1 => {
  const { questionIds, perQuestion } = removeQuestion(
    extras.questionIds,
    extras.perQuestion,
    targetIndex,
  )

  return {
    ...extras,
    questionIds,
    perQuestion,
  }
}

/**
 * Per-question attachment updates.
 */
export const updateQuestionVisuals = (
  extras: QuizExtrasV1,
  questionId: string,
  answerVisuals: AnswerVisual[] | undefined,
): QuizExtrasV1 => {
  const currentItem = extras.perQuestion[questionId] ?? {}

  return {
    ...extras,
    perQuestion: {
      ...extras.perQuestion,
      [questionId]: {
        ...currentItem,
        answerVisuals,
      },
    },
  }
}

export const updateQuestionReveal = (
  extras: QuizExtrasV1,
  questionId: string,
  reveal: QuestionReveal | undefined,
): QuizExtrasV1 => {
  const currentItem = extras.perQuestion[questionId] ?? {}

  return {
    ...extras,
    perQuestion: {
      ...extras.perQuestion,
      [questionId]: {
        ...currentItem,
        reveal,
      },
    },
  }
}

export const updateQuestionInterlude = (
  extras: QuizExtrasV1,
  questionId: string,
  interlude: Interlude | undefined,
): QuizExtrasV1 => {
  const currentItem = extras.perQuestion[questionId] ?? {}

  return {
    ...extras,
    perQuestion: {
      ...extras.perQuestion,
      [questionId]: {
        ...currentItem,
        interlude,
      },
    },
  }
}

/**
 * Normalizes `answerRecap` scenes' `startQuestionId` so that after question deletion or timeline
 * reordering, every `answerRecap` points to a valid question that precedes it in the timeline
 * (or `undefined` if no questions precede it).
 */
export const normalizeTimelineRecapReferences = (
  timeline: TimelineItem[],
  scenes: Record<string, SceneConfig>,
): Record<string, SceneConfig> => {
  const nextScenes: Record<string, SceneConfig> = { ...scenes }
  const seenQuestionIds: string[] = []

  for (const item of timeline) {
    if (item.kind === "question") {
      seenQuestionIds.push(item.questionId)

      continue
    }

    const scene = nextScenes[item.sceneId]

    if (scene?.kind === "answerRecap") {
      if (seenQuestionIds.length === 0) {
        if (scene.startQuestionId !== undefined) {
          nextScenes[item.sceneId] = {
            ...scene,
            startQuestionId: undefined,
          }
        }
      } else if (
        !scene.startQuestionId ||
        !seenQuestionIds.includes(scene.startQuestionId)
      ) {
        nextScenes[item.sceneId] = {
          ...scene,
          startQuestionId: seenQuestionIds[0],
        }
      }
    }
  }

  return nextScenes
}
