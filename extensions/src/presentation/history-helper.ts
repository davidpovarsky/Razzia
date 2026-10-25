export interface PlayerAnswerSummary {
  playerName: string
  answerIds: number[] | null
  correct?: boolean
  points?: number
}

export interface FormattedHistoryItem {
  questionIndex: number
  questionText: string
  questionType: string
  playerAnswersCount: number
  answers?: string[]
  solutions?: number[]
  skipped?: boolean
  skipReason?: string
  playerAnswers?: PlayerAnswerSummary[]
}

/**
 * Normalizes history data from either QuestionResult or HistorySummaryItem
 * into a uniform structure safely, preventing contract mismatch crashes.
 */
export function formatHistoryItem(
  raw: unknown,
  fallbackIndex = 0,
): FormattedHistoryItem | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const record = raw as Record<string, unknown>
  const {
    questionText: rawQuestionText,
    question: rawQuestion,
    questionType: rawQuestionType,
    type: rawType,
    playerAnswersCount: rawCount,
    playerAnswers: rawPlayerAnswers,
  } = record

  let questionText = ""

  if (typeof rawQuestionText === "string") {
    questionText = rawQuestionText
  } else if (typeof rawQuestion === "string") {
    questionText = rawQuestion
  }

  let questionType = "single"

  if (typeof rawQuestionType === "string") {
    questionType = rawQuestionType
  } else if (typeof rawType === "string") {
    questionType = rawType
  }

  let playerAnswersCount = 0

  if (typeof rawCount === "number") {
    playerAnswersCount = rawCount
  } else if (Array.isArray(rawPlayerAnswers)) {
    playerAnswersCount = rawPlayerAnswers.length
  }

  const questionIndex =
    typeof record.questionIndex === "number"
      ? record.questionIndex
      : fallbackIndex

  const answers = Array.isArray(record.answers)
    ? (record.answers as string[])
    : undefined

  const solutions = Array.isArray(record.solutions)
    ? (record.solutions as number[])
    : undefined

  const skipped = Boolean(record.skipped)
  const skipReason =
    typeof record.skipReason === "string" ? record.skipReason : undefined

  const playerAnswers = Array.isArray(rawPlayerAnswers)
    ? (rawPlayerAnswers as PlayerAnswerSummary[])
    : undefined

  return {
    questionIndex,
    questionText,
    questionType,
    playerAnswersCount,
    answers,
    solutions,
    skipped,
    skipReason,
    playerAnswers,
  }
}
