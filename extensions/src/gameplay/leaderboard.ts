import type { LeaderboardExtras } from "../core/index"

export interface LeaderboardDecisionParams {
  policy: LeaderboardExtras
  gameMode: string
  currentQuestionIndex: number
  totalQuestions: number
  currentQuestionId: string
  nextQuestionId?: string
  currentCategory?: string
  nextCategory?: string
  isManualRequested?: boolean
}

/**
 * Pure function determining whether to show an intermediate leaderboard
 * after question results and before next question or interlude.
 *
 * Rules:
 * - Survey mode NEVER shows a scored leaderboard (GAME04).
 * - Never shows leaderboard after the final question; final podium remains (GAME01, GAME02).
 * - Mode 'upstream': shows between different categories, skips if same category next.
 * - Mode 'everyN': shows every N questions (e.g. Q2, Q4).
 * - Mode 'selected': shows only after explicitly selected question IDs.
 * - Mode 'categoryEnd': shows at the end of each category run.
 * - Mode 'manual': shows only when manager explicitly requested it.
 */
export const shouldShowLeaderboard = (
  params: LeaderboardDecisionParams,
): boolean => {
  const {
    policy,
    gameMode,
    currentQuestionIndex,
    totalQuestions,
    currentQuestionId,
    currentCategory,
    nextCategory,
    isManualRequested,
  } = params

  // 1. Survey mode never shows scored leaderboard
  if (gameMode !== "quiz") {
    return false
  }

  // 2. Never show leaderboard after final question (podium handles final)
  if (currentQuestionIndex >= totalQuestions - 1) {
    return false
  }

  // 3. Manual override if manager requested on results screen
  if (isManualRequested) {
    return true
  }

  // 4. Policy-based rules
  switch (policy.mode) {
    case "everyN": {
      const n = policy.everyN ?? 1

      if (n <= 0) {
        return false
      }

      const questionNumber = currentQuestionIndex + 1

      return questionNumber % n === 0
    }

    case "selected": {
      if (!policy.afterQuestionIds || policy.afterQuestionIds.length === 0) {
        return false
      }

      return policy.afterQuestionIds.includes(currentQuestionId)
    }

    case "categoryEnd": {
      if (!currentCategory) {
        return false
      }

      return currentCategory !== nextCategory
    }

    case "manual": {
      return Boolean(isManualRequested)
    }

    case "upstream": {
      // Upstream Razzia behavior: skip if next question is same category
      const isSameCategoryNext =
        Boolean(currentCategory) &&
        Boolean(nextCategory) &&
        currentCategory === nextCategory

      return !isSameCategoryNext
    }

    default: {
      const isSameCategoryNext =
        Boolean(currentCategory) &&
        Boolean(nextCategory) &&
        currentCategory === nextCategory

      return !isSameCategoryNext
    }
  }
}
