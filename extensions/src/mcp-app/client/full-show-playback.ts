import { createDemoClock } from "../../presentation/show-library-preview/demo-clock.ts"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"

/** The native demo clock owns elapsed time; React only observes its snapshots. */
export function createFullShowPlayback(now?: () => number) {
  const clock = createDemoClock(now)
  let selected = ""
  let userPaused = false
  let replaySequence = 0
  let audioEpoch = 0
  const snapshot = () => ({ clock: clock.snapshot(), audioEpoch })
  function reset(frame: FullShowFrameV3) {
    clock.replay()

    if (
      frame.content.kind === "question" &&
      frame.content.frame.phase === "voting" &&
      frame.content.frame.seconds !== null
    ) {
      clock.startVoting(frame.content.frame.seconds)
    }

    if (!userPaused) {
      clock.play()
    }
  }

  return {
    snapshot,
    select(frame: FullShowFrameV3 | null, nextReplaySequence = replaySequence) {
      if (!frame) {
        selected = ""
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

        reset(frame)
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
