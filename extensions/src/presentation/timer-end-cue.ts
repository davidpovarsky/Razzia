export interface TimerEndState {
  gameId: string
  questionId: string
  epoch: number
  ended: boolean
}
export function timerEndTransition(previous: TimerEndState | null, input: {
  enabled: boolean; gameId: string; questionId: string | null; epoch: number
  voting: boolean; results: boolean; paused: boolean
}): { state: TimerEndState | null; cue?: string } {
  if (!input.enabled) return { state: null }
  // The server response wins even if the independently delivered visual status
  // is still showing the voting screen for one render.
  if (input.results) {
    if (!input.paused && previous && !previous.ended && previous.gameId === input.gameId && previous.questionId === input.questionId) {
      return { state: { ...previous, ended: true }, cue: `${previous.gameId}:${previous.questionId}:${previous.epoch}:timer-ended` }
    }
    return { state: previous }
  }
  if (input.voting && input.questionId) {
    if (previous?.gameId === input.gameId && previous.questionId === input.questionId && previous.epoch === input.epoch) return { state: previous }
    return { state: { gameId: input.gameId, questionId: input.questionId, epoch: input.epoch, ended: false } }
  }
  return { state: previous }
}
