import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"
import { createDemoClock } from "../../presentation/show-library-preview/demo-clock.ts"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"

/** The native demo clock owns elapsed time; React only observes its snapshots. */
export function createFullShowPlayback(now?: () => number) {
  const clock = createDemoClock(now)
  let selected = ""
  let previousFrame: FullShowFrameV3 | null = null
  let userPaused = false
  let replaySequence = 0
  let audioEpoch = 0
  const snapshot = () => ({ clock: clock.snapshot(), audioEpoch })
  function reset(frame: FullShowFrameV3, carryMs = 0) {
    clock.replay()

    if (
      frame.content.kind === "question" &&
      frame.content.frame.phase === "voting" &&
      frame.content.frame.seconds !== null
    ) {
      clock.startVoting(frame.content.frame.seconds)
    }

    if (carryMs > 0) clock.seek(carryMs)

    if (!userPaused) {
      clock.play()
    }
  }

  return {
    snapshot,
    select(frame: FullShowFrameV3 | null, nextReplaySequence = replaySequence) {
      if (!frame) {
        selected = ""
        previousFrame = null
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

        const continuedQuestion = !replay &&
          previousFrame?.inventory.draftId === frame.inventory.draftId &&
          previousFrame.content.kind === "question" && frame.content.kind === "question" &&
          previousFrame.content.frame.question.id === frame.content.frame.question.id &&
          previousFrame.content.frame.phase === "question" && frame.content.frame.phase === "voting"
        const carryMs = continuedQuestion ? Math.max(0, clock.snapshot().elapsedMs - QUESTION_LEAD_IN_MS) : 0
        reset(frame, carryMs)
      }

      previousFrame = frame
      return snapshot()
    },
    pause() {
      userPaused = true
      clock.pause()

      return snapshot()
    },
    resume() {
      userPaused = false

      if (selected) {
        clock.play()
      }

      return snapshot()
    },
  }
}

export type FullShowPlaybackSnapshot = ReturnType<
  ReturnType<typeof createFullShowPlayback>["snapshot"]
>
