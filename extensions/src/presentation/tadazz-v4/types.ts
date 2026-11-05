/** Presentation-only TADAZZ V4 contracts. Does not import game or socket state. */
export const TADAZZ_V4_SCENES = [
  "question", "picture-answers", "voting-open", "countdown", "vote-locked",
  "chosen", "survey-results", "top-pick", "question-image", "leaderboard",
  "round-recap", "interlude", "z-wipe",
] as const
export type TadazzV4Scene = (typeof TADAZZ_V4_SCENES)[number]
export const TADAZZ_V4_SHOW_SCENES = new Set<TadazzV4Scene>(["top-pick", "round-recap", "interlude", "z-wipe"])
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
}
export interface TadazzV4Data {
  question?: string
  eyebrow?: string
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
  showPercentages?: boolean
  selectedIndex?: number | null
  seconds?: number | null
  remainingSeconds?: number | null
  deadlineMs?: number
  questionImage?: string | null
  questionImageText?: string
  questionOptions?: Array<string | { title: string }>
  teams?: TadazzV4Team[]
  /** Winners of a real question-range, in chronological order (not demo fixtures). */
  winners?: TadazzV4Answer[]
  topIndex?: number | null
  title?: string
  subtitle?: string
  photoAlt?: string
  emptyMessage?: string
  labels?: Partial<TadazzV4Labels>
  /** Overrides only this scene's backdrop; supplied by the game settings. */
  backgroundUrl?: string | null
  backgroundFit?: "cover" | "contain"
}
export interface TadazzV4Labels {
  nextQuestion: string
  audienceResults: string
  focus: string
  chooseOne: string
  votingOpen: string
  votesLocked: string
  choiceSelected: string
  audienceFavourite: string
  jointAudienceFavourite: string
  timeLeft: string
  mostChosenAnswer: string
  liveStandings: string
  teamLeaderboard: string
  roundRecap: string
  storyBegin: string
  upNext: string
  lookClosely: string
  noVotes: string
  points: string
}
export const TADAZZ_V4_LABELS: TadazzV4Labels = {
  nextQuestion: "THE NEXT QUESTION",
  audienceResults: "AUDIENCE RESULTS",
  focus: "THE QUESTION IS ON THE SCREEN",
  chooseOne: "CHOOSE ONE TO CONTINUE",
  votingOpen: "VOTING OPEN",
  votesLocked: "VOTES LOCKED",
  choiceSelected: "CHOICE SELECTED",
  audienceFavourite: "AUDIENCE FAVOURITE",
  jointAudienceFavourite: "JOINT AUDIENCE FAVOURITE",
  timeLeft: "TIME LEFT",
  mostChosenAnswer: "THE MOST CHOSEN ANSWER",
  liveStandings: "THE LIVE STANDINGS",
  teamLeaderboard: "TEAM LEADERBOARD",
  roundRecap: "ROUND RECAP",
  storyBegin: "LET THE STORY BEGIN…",
  upNext: "UP NEXT",
  lookClosely: "LOOK CLOSELY",
  noVotes: "NO VOTES YET",
  points: "PTS",
}
export interface TadazzV4Cue { name: string; scene: TadazzV4Scene }
export interface TadazzV4StageHandle {
  play(scene: TadazzV4Scene, data: TadazzV4Data): Promise<boolean>
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
  className?: string
  onCue?: (cue: TadazzV4Cue) => void
  onComplete?: (scene: TadazzV4Scene) => void
}

export function percentagesFor(data: TadazzV4Data, length: number): number[] {
  const counts = Array.from({ length }, (_, i) => Math.max(0, Number(data.counts?.[i]) || 0))
  const total = counts.reduce((a, b) => a + b, 0)
  return counts.map((count, i) => {
    const fromServer = data.percentages?.[i]
    return typeof fromServer === "number" && Number.isFinite(fromServer)
      ? Math.max(0, Math.min(100, fromServer))
      : total > 0 ? (100 * count) / total : 0
  })
}
export function topIndicesFor(data: TadazzV4Data, length: number): number[] {
  if (data.winnerIndices) return data.winnerIndices.filter((x) => Number.isInteger(x) && x >= 0 && x < length)
  const counts = Array.from({ length }, (_, i) => Math.max(0, Number(data.counts?.[i]) || 0))
  const max = Math.max(0, ...counts)
  return max > 0 ? counts.flatMap((v, i) => v === max ? [i] : []) : []
}
export function normalizeData(data: TadazzV4Data): TadazzV4Data {
  return {
    ...data,
    answers: (data.answers ?? []).slice(0, 5),
    winners: (data.winners ?? []).slice(0, 5),
    teams: [...(data.teams ?? [])].sort((a, b) => b.score - a.score).slice(0, 4),
  }
}
