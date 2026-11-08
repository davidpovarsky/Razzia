/** Presentation-only TADAZZ V4 contracts. Does not import game or socket state. */
export const TADAZZ_V4_SCENES = [
  "question",
  "picture-answers",
  "voting-open",
  "countdown",
  "vote-locked",
  "chosen",
  "survey-results",
  "top-pick",
  "question-image",
  "leaderboard",
  "round-recap",
  "interlude",
  "z-wipe",
  "company-opening",
  "grand-opening",
  "representative-directory",
  "phone-instructions",
  "connection-readiness",
  "round-one",
  "story-progress",
  "tie-break",
  "story-assembly",
  "story-live",
  "round-two",
  "grand-finale",
] as const
export type TadazzV4Scene = (typeof TADAZZ_V4_SCENES)[number]
export const TADAZZ_V4_SHOW_SCENES = new Set<TadazzV4Scene>([
  "top-pick",
  "round-recap",
  "interlude",
  "z-wipe",
  "company-opening",
  "grand-opening",
  "round-one",
  "round-two",
  "story-assembly",
  "story-live",
  "grand-finale",
])
export const TADAZZ_V4_ASSET_BASE = "/tadazz-show/v4/"

export interface TadazzV4Answer {
  title: string
  imageUrl?: string | null
  alt?: string
}
export interface TadazzV4Team {
  id?: string
  name: string
  score: number
  icon?: string
  streak?: number
}
export interface TadazzV4Data {
  /** Stable question identity (questionId/epoch) used for continuous live-game transitions. */
  questionKey?: string
  /** Server-owned story clock including a frozen pause snapshot. */
  sceneStartedAt?: number
  sceneElapsedMs?: number
  scenePaused?: boolean
  question?: string
  eyebrow?: string
  note?: string
  number?: number
  round?: number
  totalQuestions?: number | null
  showQuestionNumber?: boolean
  answers?: TadazzV4Answer[]
  /** Authoritative counts; never filled with demo/example values. */
  counts?: number[]
  /** Authoritative server percentages. Only derive from counts when absent. */
  percentages?: number[]
  /** Server-authoritative winner indices, for ties and nonstandard scoring. */
  winnerIndices?: number[]
  /** Scoring mode: "survey" (default) uses audience-favourite styling; "quiz" uses correct/incorrect styling. */
  mode?: "survey" | "quiz"
  /** Authoritative correct option indices for scored quiz mode. */
  solutions?: number[]
  showPercentages?: boolean
  selectedIndex?: number | null
  selectedIndices?: number[]
  /** Interactive answer selection on player screen during active voting. */
  interactive?: boolean
  multiSelect?: boolean
  onSelectOption?: (index: number) => void
  onResolveTie?: (index: number) => void
  seconds?: number | null
  remainingSeconds?: number | null
  deadlineMs?: number
  questionImage?: string | null
  questionImageText?: string
  questionOptions?: Array<string | { title: string }>
  teams?: TadazzV4Team[]
  /** Team-mode leaderboard (TEAM LEADERBOARD title) vs. individual players (LEADERBOARD title). */
  teamMode?: boolean
  /** When the countdown floater is already parked in its corner (server drift resync), skip its entrance. */
  floaterAlreadyOnStage?: boolean
  /** Current page index (0-based) when displaying >4 leaderboard teams or >5 recap items. */
  page?: number
  /** Winners of a real question-range, in chronological order (not demo fixtures). */
  winners?: TadazzV4Answer[]
  topIndex?: number | null
  title?: string
  subtitle?: string
  photoAlt?: string
  emptyMessage?: string
  /** If true, question header & answer cards are already on stage and should not replay their initial entrance. */
  cardsAlreadyOnStage?: boolean
  labels?: Partial<TadazzV4Labels>
  /** Overrides only this scene's backdrop; supplied by the game settings. */
  backgroundUrl?: string | null
  backgroundFit?: "cover" | "contain"
}
export interface TadazzV4Labels {
  storyBuild: string
  storyReady: string
  storyTime: string
  storyUnfolds: string
  storyNow: string
  storyTitle: string
  storyRound: string
  nextQuestion: string
  audienceResults: string
  focus: string
  chooseOne: string
  votingOpen: string
  votesLocked: string
  choiceSelected: string
  audienceFavourite: string
  jointAudienceFavourite: string
  correctAnswer: string
  timeLeft: string
  mostChosenAnswer: string
  liveStandings: string
  teamLeaderboard: string
  leaderboard: string
  roundRecap: string
  storyBegin: string
  upNext: string
  lookClosely: string
  noVotes: string
  points: string
}
export const TADAZZ_V4_LABELS: TadazzV4Labels = {
  storyBuild: "LET THE STORY BEGIN",
  storyReady: "IT'S STORYTIME!",
  storyTime: "STORY TIME",
  storyUnfolds: "THE STORY UNFOLDS...",
  storyNow: "AND NOW...",
  storyTitle: "THE STORY",
  storyRound: "ROUND",
  nextQuestion: "THE NEXT QUESTION",
  audienceResults: "AUDIENCE RESULTS",
  focus: "THE QUESTION IS ON THE SCREEN",
  chooseOne: "CHOOSE ONE TO CONTINUE",
  votingOpen: "VOTING OPEN",
  votesLocked: "VOTES LOCKED",
  choiceSelected: "CHOICE SELECTED",
  audienceFavourite: "AUDIENCE FAVOURITE",
  jointAudienceFavourite: "JOINT AUDIENCE FAVOURITE",
  correctAnswer: "CORRECT ANSWER",
  timeLeft: "TIME LEFT",
  mostChosenAnswer: "THE MOST CHOSEN ANSWER",
  liveStandings: "THE LIVE STANDINGS",
  teamLeaderboard: "TEAM LEADERBOARD",
  leaderboard: "LEADERBOARD",
  roundRecap: "ROUND RECAP",
  storyBegin: "LET THE STORY BEGINâ€¦",
  upNext: "UP NEXT",
  lookClosely: "LOOK CLOSELY",
  noVotes: "NO VOTES YET",
  points: "PTS",
}
export interface TadazzV4Cue {
  name: string
  scene: TadazzV4Scene
  questionKey?: string
  questionNumber?: number
}
export interface TadazzV4StageHandle {
  play(scene: TadazzV4Scene, data: TadazzV4Data): Promise<boolean>
  /** Clear the active v4 scene so a custom/overlay screen is shown on the v4 stage backdrop. */
  clear(): void
  /** Overlay Z-wipe above the current scene; `onCovered` fires at the canonical `wipe-covered` cue (720ms). */
  wipe(onCovered?: () => void | Promise<void>): Promise<boolean>
  /** Update interactive/data properties without restarting WAAPI animations. */
  patchData(patch: Partial<TadazzV4Data>): void
  replay(): Promise<boolean>
  pause(): void
  resume(): void
  skipToEnd(): void
  stop(): void
  setPercentagesVisible(visible: boolean): void
}
export interface TadazzV4StageProps {
  initialScene?: TadazzV4Scene
  initialData?: TadazzV4Data
  assetBase?: string
  motionScale?: number
  showPercentages?: boolean
  reducedMotion?: boolean
  /** Recompute the 1920×1080 fit after host chrome/fullscreen changes. */
  fitRevision?: number
  className?: string
  underlay?: unknown
  overlay?: unknown
  customScreen?: unknown
  onCue?: (cue: TadazzV4Cue) => void
  onComplete?: (scene: TadazzV4Scene) => void
}

export function percentagesFor(data: TadazzV4Data, length: number): number[] {
  const counts = Array.from({ length }, (_, i) =>
    Math.max(0, Number(data.counts?.[i]) || 0),
  )
  const total = counts.reduce((a, b) => a + b, 0)
  return counts.map((count, i) => {
    const fromServer = data.percentages?.[i]
    return typeof fromServer === "number" && Number.isFinite(fromServer)
      ? Math.max(0, Math.min(100, fromServer))
      : total > 0
        ? (100 * count) / total
        : 0
  })
}
export function topIndicesFor(data: TadazzV4Data, length: number): number[] {
  if (
    data.mode === "quiz" &&
    Array.isArray(data.solutions) &&
    data.solutions.length > 0
  ) {
    return data.solutions.filter(
      (x) => Number.isInteger(x) && x >= 0 && x < length,
    )
  }
  if (data.winnerIndices)
    return data.winnerIndices.filter(
      (x) => Number.isInteger(x) && x >= 0 && x < length,
    )
  const counts = Array.from({ length }, (_, i) =>
    Math.max(0, Number(data.counts?.[i]) || 0),
  )
  const max = Math.max(0, ...counts)
  return max > 0 ? counts.flatMap((v, i) => (v === max ? [i] : [])) : []
}
export function normalizeData(data: TadazzV4Data): TadazzV4Data {
  return {
    ...data,
    answers: [...(data.answers ?? [])],
    winners: [...(data.winners ?? [])],
    teams: [...(data.teams ?? [])].sort((a, b) => b.score - a.score),
  }
}
