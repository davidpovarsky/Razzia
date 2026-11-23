import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"
import { createDemoClock } from "../../presentation/show-library-preview/demo-clock.ts"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"

export interface FullShowQuestionPresentation {
  readonly draftId: string
  readonly chapterId: string
  readonly questionId: string
  readonly revision: number
  readonly epoch: number
}

/** The native demo clock owns elapsed time; React only observes its snapshots. */
export function createFullShowPlayback(now?: () => number) {
  const clock = createDemoClock(now)
  let selected = ""
  let previousFrame: FullShowFrameV3 | null = null
  let userPaused = false
  let replaySequence = 0
  let audioEpoch = 0
  let questionPresentation: FullShowQuestionPresentation | null = null
  const snapshot = () => ({
    clock: clock.snapshot(),
    audioEpoch,
    userPaused,
    questionPresentation,
  })
  function presentationFor(frame: FullShowFrameV3) {
    return frame.content.kind === "question" &&
      frame.content.frame.phase === "question"
      ? {
          draftId: frame.inventory.draftId,
          chapterId: frame.inventory.selectedChapterId,
          questionId: frame.content.frame.question.id,
          revision: frame.inventory.revision,
          epoch: clock.snapshot().epoch,
        }
      : null
  }
  function reset(frame: FullShowFrameV3, carryMs = 0) {
    clock.replay()
    questionPresentation = presentationFor(frame)

    if (
      frame.content.kind === "question" &&
      frame.content.frame.phase === "voting" &&
      frame.content.frame.seconds !== null
    ) {
      clock.startVoting(frame.content.frame.seconds)
    }

    if (carryMs > 0) {
      clock.seek(carryMs)
    }

    // Rendering and entrance time must not consume a new question's reading
    // interval. Explicit non-question chapter selections keep their own clock.
    if (!userPaused && !questionPresentation) {
      clock.play()
    }
  }

  return {
    snapshot,
    select(frame: FullShowFrameV3 | null, nextReplaySequence = replaySequence) {
      if (!frame) {
        selected = ""
        previousFrame = null
        questionPresentation = null
        clock.pause()

        return snapshot()
      }

      const identity = `${frame.inventory.draftId}:${frame.inventory.selectedChapterId}`
      const replay = nextReplaySequence !== replaySequence
      replaySequence = nextReplaySequence

      if (identity !== selected || replay) {
        selected = identity

        if (replay) {
          audioEpoch += 1
        }

        const continuedQuestion =
          !replay &&
          previousFrame?.inventory.draftId === frame.inventory.draftId &&
          previousFrame.content.kind === "question" &&
          frame.content.kind === "question" &&
          previousFrame.content.frame.question.id ===
            frame.content.frame.question.id &&
          previousFrame.content.frame.phase === "question" &&
          frame.content.frame.phase === "voting"
        const carryMs = continuedQuestion
          ? Math.max(0, clock.snapshot().elapsedMs - QUESTION_LEAD_IN_MS)
          : 0
        reset(frame, carryMs)
      } else if (
        questionPresentation &&
        questionPresentation.revision !== frame.inventory.revision
      ) {
        // An edit while the first frame is pending replaces its readiness
        // ticket without restarting an already presented question's clock.
        questionPresentation = presentationFor(frame)
      }

      previousFrame = frame

      return snapshot()
    },
    questionPresented(presentation: FullShowQuestionPresentation) {
      // Object ownership rejects stale same-key replay, revision, navigation
      // and teardown acknowledgements from the independently rendered root.
      if (presentation !== questionPresentation) {
        return snapshot()
      }

      questionPresentation = null

      if (!userPaused && selected) {
        clock.play()
      }

      return snapshot()
    },
    pause() {
      userPaused = true
      clock.pause()

      return snapshot()
    },
    resume() {
      userPaused = false

      if (selected && !questionPresentation) {
        clock.play()
      }

      return snapshot()
    },
  }
}

export type FullShowPlaybackSnapshot = ReturnType<
  ReturnType<typeof createFullShowPlayback>["snapshot"]
>
