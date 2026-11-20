export interface PreviewStageIdentity {
  cardKey: string | null
  phase: string
  clockEpoch: number
  appearanceRevision: number
  renderer: string
  role: string
}

const order: Record<string, number> = {
  question: 0,
  answerCards: 1,
  voting: 2,
  voteLocked: 3,
  results: 4,
  personalResult: 4,
}

/** Phase requests and DOM lifetime are different identities. Replay still resets. */
export function createPreviewStageContinuity() {
  let previous: PreviewStageIdentity | null = null
  let generation = 0
  return {
    select(next: PreviewStageIdentity): number {
      const sameQuestion = Boolean(
        previous && next.cardKey && previous.cardKey === next.cardKey &&
        previous.appearanceRevision === next.appearanceRevision &&
        previous.renderer === next.renderer && previous.role === next.role &&
        order[previous.phase] !== undefined && order[next.phase] !== undefined,
      )
      const forward = sameQuestion && previous !== null &&
        order[next.phase] > order[previous.phase]
      const sameRequest = previous !== null &&
        previous.clockEpoch === next.clockEpoch &&
        previous.cardKey === next.cardKey && previous.phase === next.phase &&
        previous.appearanceRevision === next.appearanceRevision &&
        previous.renderer === next.renderer && previous.role === next.role
      if (!sameRequest && !forward) generation += 1
      previous = next
      return generation
    },
  }
}
