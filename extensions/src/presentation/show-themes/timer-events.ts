export interface ThemeTimerEndState {
  gameId: string
  questionId: string
  epoch: number
  deadline?: number
  emitted: boolean
}

/** Classify a presentation cue; never schedule, stop or change the game clock. */
export function themeTimerTransition(
  previous: ThemeTimerEndState | null,
  input: {
    enabled: boolean
    gameId: string
    questionId: string | null
    epoch: number
    voting: boolean
    results: boolean
    paused: boolean
    deadline?: number
    now: number
    reason?: "elapsed" | "manual" | "allAnswered" | null
  },
): {
  state: ThemeTimerEndState | null
  cue?: string
  event?: "timer-ended" | "vote-locked"
} {
  if (!input.enabled || !input.questionId) {
    return { state: null }
  }

  const same =
    previous?.gameId === input.gameId &&
    previous.questionId === input.questionId &&
    previous.epoch === input.epoch

  if (input.results) {
    if (!same || previous.emitted) {
      return { state: previous }
    }

    const state = { ...previous, emitted: true }

    if (input.paused) {
      return { state }
    }

    const event = input.reason === "elapsed" ? "timer-ended" : "vote-locked"

    return {
      state,
      event,
      cue: `${previous.gameId}:${previous.questionId}:${previous.epoch}:${event}`,
    }
  }

  if (!input.voting) {
    return { state: null }
  }

  if (same) {
    return {
      state: input.paused
        ? previous
        : { ...previous, deadline: input.deadline },
    }
  }

  return {
    state: {
      gameId: input.gameId,
      questionId: input.questionId,
      epoch: input.epoch,
      deadline: input.deadline,
      emitted: false,
    },
  }
}
