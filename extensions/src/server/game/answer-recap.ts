// oxlint-disable typescript/no-unnecessary-condition -- Timeline/history arrays may be sparse at runtime.
import {
  resolveQuestionPlayMode,
  type Quizz,
  type QuestionResult,
} from "@razzia/common/types/game"
import {
  isQuizExtrasV2,
  type AnyQuizExtras,
  type SceneConfig,
  type PublicAnswerRecap,
} from "../../core/index"

export interface AnswerRecapInput {
  scene: SceneConfig
  timelineStepIndex: number
  extras: AnyQuizExtras | null
  quizz: Quizz
  history: QuestionResult[]
  getLedger(
    index: number,
  ):
    | { skipped?: boolean; answers: ReadonlyArray<{ answerIds: number[] }> }
    | undefined
}

/** A pure projection of authored timeline and canonical answer history. */
export function buildAnswerRecap(
  input: AnswerRecapInput,
): PublicAnswerRecap | null {
  const { scene: inputScene, timelineStepIndex, quizz } = input
  const getQuestionId = (index: number) => input.extras?.questionIds[index]

  const scene =
    inputScene.kind === "animation"
      ? {
          id: inputScene.id,
          kind: "answerRecap" as const,
          title: inputScene.title,
          mode: "mostSelected" as const,
          startQuestionId: getQuestionId(((inputScene.round ?? 1) - 1) * 5),
          maxItemsPerPage: 5,
          showCounts: true,
          showPercentages: true,
        }
      : inputScene

  if (scene.kind !== "answerRecap") {
    return null
  }

  const { extras } = input

  if (!extras || !isQuizExtrasV2(extras)) {
    return null
  }

  const { timeline } = extras
  const boundIndex = Math.min(timelineStepIndex, timeline.length)

  const precedingQuestions: Array<{
    questionId: string
    questionIndex: number
    questionNumber: number
  }> = []

  let qOrdinal = 0
  for (let i = 0; i < boundIndex; i += 1) {
    const item = timeline[i]

    if (item?.kind === "question") {
      qOrdinal += 1
      const qIdx = extras.questionIds.indexOf(item.questionId)

      if (qIdx >= 0 && qIdx < quizz.questions.length) {
        precedingQuestions.push({
          questionId: item.questionId,
          questionIndex: qIdx,
          questionNumber: qOrdinal,
        })
      }
    }
  }

  let startPos = 0

  if (scene.startQuestionId) {
    const foundPos = precedingQuestions.findIndex(
      (pq) => pq.questionId === scene.startQuestionId,
    )

    if (foundPos >= 0) {
      startPos = foundPos
    }
  }

  const selectedRange = precedingQuestions.slice(startPos)
  const historyAll = input.history

  const items = []
  for (const pq of selectedRange) {
    const q = quizz.questions[pq.questionIndex]
    const hist = historyAll[pq.questionIndex]
    const ledger = input.getLedger(pq.questionIndex)

    if (!q) {
      continue
    }

    // Authored round recaps retain every question's position, even a
    // skipped or empty vote. Other recap cards keep their legacy range.
    if (
      inputScene.kind !== "animation" &&
      (hist?.skipped || ledger?.skipped || (!hist && !ledger))
    ) {
      continue
    }

    const qExtras = extras.perQuestion?.[pq.questionId]
    const answerVisuals = qExtras?.answerVisuals ?? []
    const playMode = resolveQuestionPlayMode(q, quizz.gameMode)

    // Tally votes per option index from authoritative ledger or history
    const optionCounts = new Array<number>(q.answers.length).fill(0)
    let totalResponders = 0

    if (ledger && !ledger.skipped) {
      totalResponders = ledger.answers.length
      for (const ans of ledger.answers) {
        for (const aid of ans.answerIds) {
          if (aid >= 0 && aid < optionCounts.length) {
            optionCounts[aid] += 1
          }
        }
      }
    } else if (hist) {
      const answeredPlayers = (hist.playerAnswers ?? []).filter(
        (pa) => Array.isArray(pa.answerIds) && pa.answerIds.length > 0,
      )
      totalResponders =
        typeof hist.playerAnswersCount === "number"
          ? hist.playerAnswersCount
          : answeredPlayers.length
      for (const pa of answeredPlayers) {
        for (const aid of pa.answerIds ?? []) {
          if (aid >= 0 && aid < optionCounts.length) {
            optionCounts[aid] += 1
          }
        }
      }
    }

    let maxCount = 0
    for (const c of optionCounts) {
      if (c > maxCount) {
        maxCount = c
      }
    }

    const useCorrectAnswer =
      scene.mode === "correctAnswer" &&
      playMode === "quiz" &&
      Array.isArray(q.solutions) &&
      q.solutions.length > 0

    let winningIdxList: number[] = []
    let badgeType:
      "mostSelected" | "correctAnswer" | "tiedMostSelected" | "noResponses" =
      "mostSelected"
    let isTie = false

    if (useCorrectAnswer) {
      winningIdxList = (q.solutions ?? []).filter(
        (idx) => idx >= 0 && idx < q.answers.length,
      )
      badgeType = "correctAnswer"
      isTie = winningIdxList.length > 1
    } else if (totalResponders === 0 || maxCount === 0) {
      winningIdxList = []
      badgeType = "noResponses"
      isTie = false
    } else {
      for (let idx = 0; idx < optionCounts.length; idx += 1) {
        if (optionCounts[idx] === maxCount) {
          winningIdxList.push(idx)
        }
      }
      isTie = winningIdxList.length > 1
      badgeType = isTie ? "tiedMostSelected" : "mostSelected"
    }

    const winningOptions = winningIdxList.map((idx) => {
      const count = optionCounts[idx] ?? 0
      const percentage =
        totalResponders > 0 ? Math.round((count / totalResponders) * 100) : 0
      const visual = answerVisuals.find((v) => v.answerIndex === idx)

      return {
        answerIndex: idx,
        label: q.answers[idx] ?? `Option ${idx + 1}`,
        count,
        percentage,
        imageUrl: visual?.url,
        alt: visual?.alt,
      }
    })

    items.push({
      questionId: pq.questionId,
      questionNumber: pq.questionNumber,
      questionText: q.question,
      questionImageUrl: q.media?.type === "image" ? q.media.url : undefined,
      playMode,
      badgeType,
      totalResponders,
      isTie,
      winningOptions,
    })
  }

  return {
    title: scene.title,
    subtitle: "subtitle" in scene ? scene.subtitle : undefined,
    totalQuestionsInRange: selectedRange.length,
    completedQuestionsCount: items.length,
    startQuestionId:
      scene.startQuestionId ?? selectedRange[0]?.questionId ?? null,
    endQuestionId: selectedRange[selectedRange.length - 1]?.questionId ?? null,
    mode: scene.mode ?? "mostSelected",
    maxItemsPerPage: scene.maxItemsPerPage ?? 4,
    showCounts: scene.showCounts ?? true,
    showPercentages: scene.showPercentages ?? true,
    items,
  }
}
