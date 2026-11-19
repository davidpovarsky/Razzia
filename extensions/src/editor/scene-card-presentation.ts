import type { CREATING_WORLDS_PRESETS } from "../core/creating-worlds-show"

type ShowPreset = (typeof CREATING_WORLDS_PRESETS)[number]

export type SceneCardIcon =
  | "animation"
  | "transition"
  | "image"
  | "video"
  | "audio"
  | "leaderboard"
  | "results"
  | "recap"
  | "countdown"
  | "opening"
  | "closing"
  | "company"
  | "participants"
  | "phone"
  | "ready"
  | "round"
  | "tie"
  | "assembly"
  | "story"
  | "winner"
  | "interlude"

export interface SceneCardMetadata {
  preset?: string
  title?: string
  subtitle?: string
  description?: string
  mediaType?: "image" | "video" | "audio"
  advance?: "auto" | "manual" | "onMediaEnd"
}

interface SceneRole {
  icon: SceneCardIcon
  description: string
}

const SHOW_PRESET_ROLES = {
  "company-opening": { icon: "company", description: "opening" },
  "grand-opening": { icon: "opening", description: "opening" },
  "representative-directory": {
    icon: "participants",
    description: "joinDirectory",
  },
  "phone-instructions": { icon: "phone", description: "joinInstructions" },
  "connection-readiness": { icon: "ready", description: "joinReadiness" },
  "round-one": { icon: "round", description: "roundIntro" },
  "story-progress": { icon: "recap", description: "storyProgress" },
  "tie-break": { icon: "tie", description: "tieBreak" },
  "story-assembly": { icon: "assembly", description: "storyAssembly" },
  "story-live": { icon: "story", description: "storyLive" },
  "round-two": { icon: "round", description: "roundIntro" },
  "grand-finale": { icon: "leaderboard", description: "closing" },
  "top-pick": { icon: "winner", description: "winner" },
  "round-recap": { icon: "recap", description: "roundRecap" },
  interlude: { icon: "interlude", description: "interlude" },
  "z-wipe": { icon: "transition", description: "transition" },
} satisfies Record<ShowPreset, SceneRole>

const NATIVE_ROLES: Record<string, SceneRole | undefined> = {
  transition: { icon: "transition", description: "transition" },
  animation: { icon: "animation", description: "animation" },
  media: { icon: "image", description: "media" },
  leaderboard: { icon: "leaderboard", description: "leaderboard" },
  interimResults: { icon: "results", description: "interimResults" },
  answerRecap: { icon: "recap", description: "answerRecap" },
  countdown: { icon: "countdown", description: "countdown" },
  opening: { icon: "opening", description: "opening" },
  closing: { icon: "closing", description: "closing" },
}

/** Describe the saved scene's purpose without changing its persisted kind. */
export function getSceneCardPresentation(
  kind: string,
  scene: SceneCardMetadata = {},
) {
  const preset = kind === "animation" ? scene.preset : undefined
  const presetRole =
    preset && Object.hasOwn(SHOW_PRESET_ROLES, preset)
      ? SHOW_PRESET_ROLES[preset as ShowPreset]
      : undefined
  const nativeRole = Object.hasOwn(NATIVE_ROLES, kind)
    ? NATIVE_ROLES[kind]
    : undefined
  const role = presetRole ?? nativeRole
  const icon: SceneCardIcon =
    kind === "media" && scene.mediaType
      ? scene.mediaType
      : (role?.icon ?? "transition")

  return {
    semanticKind: presetRole ? preset : kind,
    icon,
    labelKey: presetRole
      ? `extensions:themes.presets.${preset}`
      : `extensions:timeline.${kind}`,
    descriptionKey: role
      ? `extensions:timeline.sceneDescriptions.${role.description}`
      : undefined,
    authoredTitle: scene.title?.trim() || undefined,
    authoredDescription:
      scene.subtitle?.trim() || scene.description?.trim() || undefined,
    advanceLabelKey:
      scene.advance === "manual"
        ? "extensions:timeline.waitForHost"
        : scene.advance === "onMediaEnd"
          ? "extensions:timeline.afterMedia"
          : undefined,
  }
}
