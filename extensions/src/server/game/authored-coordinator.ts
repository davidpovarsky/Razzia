import { isQuizExtrasV2, type AnyQuizExtras } from "../../core/index"
import type { ExtensionGameSession } from "./session"
import {
  StudioShowCoordinator,
  type StudioCoordinatorCallbacks,
} from "./studio-show-coordinator"

/** Authored timeline and tie policy are isolated from the upstream game constructor. */
export function createAuthoredCoordinator(
  extras: AnyQuizExtras | null,
  session: ExtensionGameSession | null,
  callbacks: StudioCoordinatorCallbacks,
): StudioShowCoordinator | null {
  if (!extras || !isQuizExtrasV2(extras)) {
    return null
  }

  const coordinator = new StudioShowCoordinator({
    timeline: extras.timeline,
    scenes: extras.scenes,
    questionIds: extras.questionIds,
    defaults: extras.defaults,
    callbacks: {
      ...callbacks,
      onBroadcastState: () => {
        const scene = coordinator.currentScene

        if (
          scene?.kind === "animation" &&
          scene.preset === "tie-break" &&
          !session?.hasUnresolvedStoryTie()
        ) {
          coordinator.advanceScene()

          return
        }

        callbacks.onBroadcastState()
      },
    },
  })
  session?.setShowCoordinator(coordinator)

  return coordinator
}
