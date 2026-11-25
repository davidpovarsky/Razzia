export interface PreviewStageIdentity {
  cardKey: string | null
  phase: string
  clockEpoch: number
  appearanceRevision: number
  renderer: string
  role: string
}

const order: Partial<Record<string, number>> = {
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
      const previousOrder = previous ? order[previous.phase] : undefined
      const nextOrder = order[next.phase]
      const sameQuestion = Boolean(
        previous &&
        next.cardKey &&
        previous.cardKey === next.cardKey &&
        previous.appearanceRevision === next.appearanceRevision &&
        previous.renderer === next.renderer &&
        previous.role === next.role &&
        previousOrder !== undefined &&
        nextOrder !== undefined,
      )
      const forward =
        sameQuestion &&
        previous !== null &&
        previousOrder !== undefined &&
        nextOrder !== undefined &&
        nextOrder > previousOrder
      const sameRequest =
        previous !== null &&
        previous.clockEpoch === next.clockEpoch &&
        previous.cardKey === next.cardKey &&
        previous.phase === next.phase &&
        previous.appearanceRevision === next.appearanceRevision &&
        previous.renderer === next.renderer &&
        previous.role === next.role

      if (!sameRequest && !forward) {
        generation += 1
      }

      previous = next

      return generation
    },
  }
}
