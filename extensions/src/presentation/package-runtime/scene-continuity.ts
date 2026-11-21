import type { ShowScene } from "../tadazz-show/presentation-scene"

export interface PackageScenePresentation {
  scene: ShowScene
  questionId: string
  epoch: number
  sequence: number
  remainingMs: number
  deadline: number | null
  backgroundUrl?: string
  phaseElapsedMs?: number
  revealStage?: "pending" | "audience" | "correct"
}

/**
 * Socket content, counters and extension envelopes arrive independently. A
 * pending coherence check is not a lobby or a new scene. Keep the last complete
 * public presentation until a complete replacement arrives; the caller disables
 * answer intents while it is holding. Never carry a frame across room/theme/role.
 */
export function createPackageSceneContinuity() {
  let context: string | null = null
  let current: PackageScenePresentation | null = null

  return {
    select(identity: string, next: PackageScenePresentation) {
      if (identity !== context) {
        context = identity
        current = null
      }

      const holding =
        next.scene.kind === "wait" && next.scene.key === "wait:question-content"

      if (!holding) {
        current = next
      }

      return { presentation: current ?? next, holding }
    },
  }
}
