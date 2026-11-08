import type {
  ResolvedShowTheme,
  ShowThemeSlotId,
} from "../../core/show-themes/index"
import type { ShowScene } from "../tadazz-show/presentation-scene"

export function themeSlotForScene(scene: ShowScene): ShowThemeSlotId {
  if (scene.kind === "connecting") {
    return "firstPaint"
  }

  if (scene.kind === "lobby") {
    return "lobby"
  }

  if (scene.kind === "voting") {
    return "voting"
  }

  if (scene.kind === "results") {
    return "resultsReveal"
  }

  if (scene.kind === "leaderboard") {
    return "leaderboard"
  }

  if (scene.kind === "scene" || scene.kind === "interlude") {
    return "interlude"
  }

  if (scene.kind === "finale" || scene.kind === "summary") {
    return "closing"
  }

  return "question"
}

/** Old metadata survives storage, but unadopted legacy effects cannot enter Classic. */
export function reconcileThemeScene(
  scene: ShowScene,
  theme: ResolvedShowTheme,
): ShowScene {
  if (scene.kind !== "scene" || scene.scene.kind !== "animation") {
    return scene
  }

  if (
    theme.definition.capabilities.animationPresets.includes(
      scene.scene.preset ?? "",
    )
  ) {
    return scene
  }

  return { ...scene, scene: { ...scene.scene, preset: "interlude" } }
}
