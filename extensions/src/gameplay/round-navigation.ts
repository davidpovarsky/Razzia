export interface PreviousScreenCheck {
  can: boolean
  reason?: string
  willReopenQuestion?: boolean
  answersReceived?: number
}

export interface PreviousScreenState {
  started: boolean
  acceptingAnswers: boolean
  currentQuestion: number
  currentStep: number
  answersReceived: number
  canPreviousTimelineStep?: () => PreviousScreenCheck
}

/** Navigation eligibility is show policy; applying it remains the round engine's job. */
export function evaluatePreviousScreen({
  started,
  acceptingAnswers,
  currentQuestion,
  currentStep,
  answersReceived,
  canPreviousTimelineStep,
}: PreviousScreenState): PreviousScreenCheck {
  if (!started) {
    return { can: false, reason: "Game not started" }
  }

  if (acceptingAnswers) {
    if (canPreviousTimelineStep) {
      const timelineCheck = canPreviousTimelineStep()

      if (timelineCheck.can) {
        return {
          can: true,
          willReopenQuestion: timelineCheck.willReopenQuestion ?? true,
          answersReceived,
        }
      }
    }

    if (currentQuestion > 0) {
      return { can: true, willReopenQuestion: true, answersReceived }
    }

    return { can: false, reason: "At start of show" }
  }

  if (currentStep < 0) {
    if (canPreviousTimelineStep) {
      return canPreviousTimelineStep()
    }

    return { can: false, reason: "Question starting" }
  }

  // Step 0: reveal/results. Moving back reopens this question!
  if (currentStep === 0) {
    return { can: true, willReopenQuestion: true, answersReceived: 0 }
  }

  // Step 1: leaderboard, Step 2: interlude. Navigates back within question
  if (currentStep > 0) {
    return { can: true, willReopenQuestion: false, answersReceived: 0 }
  }

  if (canPreviousTimelineStep) {
    return canPreviousTimelineStep()
  }

  if (currentQuestion > 0) {
    return { can: true, willReopenQuestion: true, answersReceived: 0 }
  }

  return { can: false, reason: "At start of show" }
}
