export const SCHEMA_VERSION = 1 as const

export const DEFAULT_REVISION = 1 as const

export const CUE_IDS = [
  "start",
  "showQuestion",
  "answersMusic",
  "answerPressed",
  "revealResults",
  "leaderboard",
  "podium1",
  "podium2",
  "podium3",
] as const

export type CueId = (typeof CUE_IDS)[number]

export const LEADERBOARD_MODES = [
  "upstream",
  "everyN",
  "selected",
  "categoryEnd",
  "manual",
] as const

export type LeaderboardMode = (typeof LEADERBOARD_MODES)[number]

export const REVEAL_EFFECTS = [
  "none",
  "blur",
  "pixelate",
  "tiles",
  "zoom",
] as const

export type RevealEffect = (typeof REVEAL_EFFECTS)[number]

export const REVEAL_TRIGGERS = ["automatic", "manual"] as const

export type RevealTrigger = (typeof REVEAL_TRIGGERS)[number]

export const REVEAL_AUDIENCES = ["manager", "all"] as const

export type RevealAudience = (typeof REVEAL_AUDIENCES)[number]

export const INTERLUDE_KINDS = ["title", "image", "video", "countdown"] as const

export type InterludeKind = (typeof INTERLUDE_KINDS)[number]

export const INTERLUDE_ADVANCES = ["auto", "manual"] as const

export type InterludeAdvance = (typeof INTERLUDE_ADVANCES)[number]

export const ANSWER_DISPLAYS = ["text", "image", "both"] as const

export type AnswerDisplay = (typeof ANSWER_DISPLAYS)[number]

export const EXTENSION_PHASES = [
  "lobby",
  "prepared",
  "question",
  "answers",
  "responses",
  "leaderboard",
  "interlude",
  "scene",
  "finished",
] as const

export type ExtensionPhase = (typeof EXTENSION_PHASES)[number]

export const COMMAND_ACTIONS = [
  "SHOW_LEADERBOARD",
  "SKIP_INTERLUDE",
  "REVEAL_MEDIA",
  "ASSIGN_TEAM",
  "END_ANSWER_TIMER",
  "NEXT_SCREEN",
  "SKIP_QUESTION",
  "VIEW_HISTORY",
  "REPLAY_FROM_CHECKPOINT",
  "END_OR_SKIP_INTERLUDE",
  "ADVANCE_TIMELINE_SCENE",
  "SKIP_TIMELINE_SCENE",
] as const

export type CommandAction = (typeof COMMAND_ACTIONS)[number]

export const EXTENSION_EVENTS = {
  STATE: "extensions:state",
  COMMAND: "extensions:command",
} as const
