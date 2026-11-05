import type { Status } from "@razzia/common/types/game/status"
import type {
  ActiveSceneData,
  PublicRankEntry,
} from "../../core/studio-timeline-schema"
import type { AnswerVisual, Interlude } from "../../core/media"
import type { RevealDistributionSnapshot } from "../../core/reveal"
import type { TeamDefinition } from "../../core"
import {
  resolveEffectiveCardBackground,
  type CardBackgroundOverride,
} from "../../core/card-appearance"
import { calculateAggregatePercentages } from "../reveal-timeline"
import { projectTeamScores } from "../team-scoring"
import type {
  StageLeaderEntry,
  StageQuestion,
  StageRevealInput,
  StageWinner,
} from "./TadazzStage"

export type ShowRole = "manager" | "player" | "spectator"

/** Minimal shape of the authoritative extension envelope used by the show. */
export interface ShowEnvelope {
  gameId?: string
  epoch?: number
  seq?: number
  phase?: string
  questionId?: string | null
  startedAt?: number
  extras: Record<string, unknown>
}

export interface ShowInput {
  role: ShowRole
  isConnected: boolean
  status: { name: Status; data: Record<string, unknown> } | null
  envelope: ShowEnvelope | null
  questionStates: { current: number; total: number | null } | null
}

export interface SceneDescriptor {
  id?: string
  kind: string
  title?: string
  subtitle?: string
  description?: string
  mediaUrl?: string
  mediaType?: "image" | "video" | "audio"
  mediaFit?: "contain" | "cover"
  muted?: boolean
  loop?: boolean
  volume?: number
  durationMs?: number
  durationSeconds?: number
  advance?: string
  lottieUrl?: string
  lottieFit?: "contain" | "cover"
  lottieLoop?: boolean
  lottieSpeed?: number
  overlayAnimations?: unknown[]
  endBehavior?: "holdFrame" | "advanceNext" | "fadeToTitle"
  background?: { mode?: string; url?: string; fit?: "cover" | "contain" }
  stageLayout?: "card" | "cinema"
}

export type ShowScene =
  | { kind: "connecting"; key: string }
  | { kind: "lobby"; key: string; inviteCode?: string; text?: string }
  | { kind: "wait"; key: string; text: string }
  | { kind: "start"; key: string; subject: string; time: number }
  | { kind: "prepared"; key: string; questionNumber: number; totalAnswers: number }
  | { kind: "question"; key: string; question: StageQuestion; media?: QuestionMediaRef }
  | {
      kind: "voting"
      key: string
      question: StageQuestion
      questionType: string
      seconds: number | null
      remainingSeconds: number | null
      totalPlayers: number
      answers: string[]
      options?: unknown
      media?: QuestionMediaRef
      answersOnly?: boolean
      fullQuestion?: string
    }
  | {
      kind: "results"
      key: string
      question: StageQuestion
      questionType: string
      reveal: StageRevealInput
      estimation?: RevealDistributionSnapshot["estimation"]
      responders?: { responders: number; eligible: number }
      note?: string
    }
  | {
      kind: "player-result"
      key: string
      correct: boolean
      message: string
      points: number
      myPoints: number
      rank: number
      aheadOfMe: string | null
    }
  | { kind: "leaderboard"; key: string; previous: StageLeaderEntry[]; entries: StageLeaderEntry[] }
  | { kind: "finale"; key: string; winner: StageWinner | null; rank?: number; subject?: string }
  | { kind: "summary"; key: string; subject: string; totalPlayers: number; totalQuestions: number }
  | {
      kind: "scene"
      key: string
      scene: SceneDescriptor
      activeSceneData?: ActiveSceneData
      startedAt?: number
      stepIndex?: number
    }
  | { kind: "interlude"; key: string; interlude: Interlude; startedAt?: number }

export interface QuestionMediaRef {
  type: string
  url: string
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {}

const NO_TIME_LIMIT = -1

/** Build the stage question from authoritative status + answerVisuals (by answerIndex). */
export function buildStageQuestion(input: {
  text: string
  keyText?: string
  answers: string[]
  visuals?: AnswerVisual[]
  questionId?: string | null
  questionStates: ShowInput["questionStates"]
  note?: string
}): StageQuestion {
  const { text, keyText, answers, visuals, questionStates, note } = input
  const number = questionStates?.current ?? 1
  return {
    key: `${keyText ?? text}#${number}`,
    question: text,
    number,
    totalQuestions: questionStates?.total ?? null,
    round: null,
    ...(note ? { note } : {}),
    options: answers.map((label, index) => {
      const visual = visuals?.find((v) => v.answerIndex === index)
      const showImage =
        visual?.url && (visual.display === "image" || visual.display === "both")
      return {
        label,
        image: showImage ? visual.url : undefined,
        alt: visual?.alt || label,
      }
    }),
  }
}

/** Answer visuals are only trusted when they belong to the current answer set. */
export function currentAnswerVisuals(
  envelope: ShowEnvelope | null,
  answersCount: number,
): AnswerVisual[] | undefined {
  const raw = envelope?.extras.answerVisuals as AnswerVisual[] | undefined
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  if (raw.some((v) => v.answerIndex >= answersCount)) return undefined
  return raw
}

/** Counts/percentages for a reveal — server snapshot first, otherwise responses. */
export function buildReveal(input: {
  answersCount: number
  responses: Record<number, number>
  solutions?: number[]
  snapshot?: RevealDistributionSnapshot
  note?: string
}): StageRevealInput {
  const { answersCount, responses, solutions, snapshot, note } = input
  const counts = Array.from({ length: answersCount }, (_, i) => {
    const fromSnapshot = snapshot?.options?.[i]?.count
    return Math.max(0, Number(fromSnapshot ?? responses[i] ?? 0) || 0)
  })
  let percentages: number[]
  if (snapshot?.options) {
    percentages = counts.map((_, i) => Number(snapshot.options?.[i]?.percentage ?? 0))
  } else {
    const denominator =
      snapshot && snapshot.totalResponders > 0
        ? snapshot.totalResponders
        : snapshot && snapshot.eligiblePlayers > 0
          ? snapshot.eligiblePlayers
          : undefined
    const map = calculateAggregatePercentages(responses, denominator)
    percentages = counts.map((_, i) => Number(map[i] ?? 0))
  }
  const sol = solutions ?? snapshot?.solutions
  const isQuiz = Array.isArray(sol) && sol.length > 0
  return {
    counts,
    percentages,
    mode: isQuiz ? "quiz" : "survey",
    solutions: isQuiz ? sol : undefined,
    ...(note ? { note } : {}),
  }
}

interface TeamsExtras {
  enabled?: boolean
  teams?: TeamDefinition[]
  assignments?: Record<string, string>
}

interface PlayerLike {
  id: string
  clientId?: string
  username: string
  points: number
  streak?: number
  connected?: boolean
}

/** Individual or team leaderboard entries from authoritative players. */
export function leaderboardEntries(
  players: PlayerLike[],
  teams: TeamsExtras | undefined,
): StageLeaderEntry[] {
  if (teams?.enabled && teams.teams && teams.teams.length >= 2) {
    return projectTeamScores(teams.teams, players, teams.assignments ?? {}).map((t) => ({
      id: `team:${t.team.id}`,
      name: t.team.name,
      score: t.totalPoints,
    }))
  }
  return players.map((p) => ({
    id: p.id,
    name: p.username,
    score: Number(p.points) || 0,
    ...(typeof p.streak === "number" ? { streak: p.streak } : {}),
  }))
}

export function sceneRankEntries(entries: PublicRankEntry[] | undefined): StageLeaderEntry[] {
  return (entries ?? []).map((e) => ({ id: `rank:${e.displayName}`, name: e.displayName, score: e.points }))
}

/** Winner (or joint winners) from ranked entries; null when nobody scored. */
export function resolveWinner(ranked: Array<{ name: string; score: number }>): StageWinner | null {
  const sorted = [...ranked].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  if (!best || !(best.score > 0)) return null
  const joint = sorted.filter((e) => e.score === best.score).map((e) => e.name)
  return { name: joint.join(" & "), score: best.score }
}

function sceneKey(envelope: ShowEnvelope | null, suffix: string): string {
  return `${envelope?.gameId ?? ""}:${envelope?.epoch ?? 0}:${suffix}`
}

/**
 * Computes the single authoritative presentation scene. Server timeline
 * scenes/interludes take precedence over the Razzia status (same rule as the
 * legacy GameWrapper). Every Razzia status maps to a TADAZZ screen; there is
 * no fallback to the legacy UI.
 */
export function computeShowScene(input: ShowInput): ShowScene {
  const { envelope, status, role, questionStates } = input
  const extras = envelope?.extras ?? {}

  if (envelope?.phase === "scene") {
    const scene = extras.currentScene as SceneDescriptor | undefined
    const step = extras.activeTimelineStep as { kind?: string; stepIndex?: number; sceneId?: string } | undefined
    if (scene || (step && step.kind !== "question")) {
      const descriptor: SceneDescriptor = scene ?? { kind: step?.kind ?? "transition", id: step?.sceneId }
      return {
        kind: "scene",
        key: sceneKey(envelope, `scene:${descriptor.id ?? descriptor.kind}:${step?.stepIndex ?? ""}`),
        scene: descriptor,
        activeSceneData: extras.activeSceneData as ActiveSceneData | undefined,
        startedAt: envelope.startedAt,
        stepIndex: step?.stepIndex,
      }
    }
  }

  if (envelope?.phase === "interlude" && extras.interlude) {
    return {
      kind: "interlude",
      key: sceneKey(envelope, "interlude"),
      interlude: extras.interlude as Interlude,
      startedAt: envelope.startedAt,
    }
  }

  if (!status) {
    return input.isConnected
      ? { kind: "wait", key: "wait:initial", text: "game:waitingForPlayers" }
      : { kind: "connecting", key: "connecting" }
  }

  const data = asRecord(status.data)
  const qNumber = questionStates?.current ?? 0

  switch (status.name) {
    case "SHOW_ROOM":
      if (role === "player") {
        return { kind: "wait", key: "wait:room", text: typeof data.text === "string" ? data.text : "game:waitingForPlayers" }
      }
      return {
        kind: "lobby",
        key: "lobby",
        inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : undefined,
        text: typeof data.text === "string" ? data.text : undefined,
      }
    case "WAIT":
      return { kind: "wait", key: `wait:${String(data.text ?? "")}:${qNumber}`, text: String(data.text ?? "") }
    case "SHOW_START":
      return { kind: "start", key: "start", subject: String(data.subject ?? ""), time: Number(data.time) || 0 }
    case "SHOW_PREPARED":
      return {
        kind: "prepared",
        key: `prepared:${Number(data.questionNumber) || qNumber}`,
        questionNumber: Number(data.questionNumber) || qNumber,
        totalAnswers: Number(data.totalAnswers) || 0,
      }
    case "SHOW_QUESTION": {
      const question = buildStageQuestion({
        text: String(data.question ?? ""),
        answers: [],
        questionId: envelope?.questionId,
        questionStates,
      })
      const media = asRecord(data.media)
      return {
        kind: "question",
        key: `question:${question.key}`,
        question,
        media: typeof media.url === "string" ? { type: String(media.type ?? ""), url: media.url } : undefined,
      }
    }
    case "SELECT_ANSWER": {
      const answers = Array.isArray(data.answers) ? (data.answers as string[]) : []
      const fullQuestion = String(data.question ?? "")
      const answersOnly = Boolean(data.answersOnly)
      const question = buildStageQuestion({
        text: role === "player" && answersOnly ? "" : fullQuestion,
        keyText: fullQuestion,
        answers,
        visuals: currentAnswerVisuals(envelope, answers.length),
        questionId: envelope?.questionId,
        questionStates,
      })
      const time = Number(data.time)
      const media = asRecord(data.media)
      return {
        kind: "voting",
        key: `voting:${question.key}`,
        question,
        questionType: String(data.questionType ?? "single"),
        seconds: Number.isFinite(time) && time !== NO_TIME_LIMIT && time > 0 ? time : null,
        remainingSeconds: typeof data.remainingTime === "number" ? data.remainingTime : null,
        totalPlayers: Number(data.totalPlayer) || 0,
        answers,
        options: data.options,
        media: typeof media.url === "string" ? { type: String(media.type ?? ""), url: media.url } : undefined,
        answersOnly,
        fullQuestion,
      }
    }
    case "SHOW_RESPONSES": {
      const answers = Array.isArray(data.answers) ? (data.answers as string[]) : []
      const note = typeof data.note === "string" ? data.note : undefined
      const question = buildStageQuestion({
        text: String(data.question ?? ""),
        answers,
        visuals: currentAnswerVisuals(envelope, answers.length),
        questionId: envelope?.questionId,
        questionStates,
        note,
      })
      const rawSnapshot = extras.revealDistribution as RevealDistributionSnapshot | undefined
      const snapshotValid =
        rawSnapshot &&
        (questionStates ? rawSnapshot.questionIndex === questionStates.current - 1 : true) &&
        (!rawSnapshot.questionId || !envelope?.questionId || rawSnapshot.questionId === envelope.questionId)
      const snapshot = snapshotValid ? rawSnapshot : undefined
      return {
        kind: "results",
        key: `results:${question.key}`,
        question,
        questionType: String(data.type ?? "single"),
        reveal: buildReveal({
          answersCount: answers.length,
          responses: asRecord(data.responses) as Record<number, number>,
          solutions: Array.isArray(data.solutions) ? (data.solutions as number[]) : undefined,
          snapshot,
          note,
        }),
        estimation: snapshot?.estimation,
        responders: snapshot ? { responders: snapshot.totalResponders, eligible: snapshot.eligiblePlayers } : undefined,
        note,
      }
    }
    case "SHOW_RESULT":
      return {
        kind: "player-result",
        key: `result:${qNumber}`,
        correct: Boolean(data.correct),
        message: String(data.message ?? ""),
        points: Number(data.points) || 0,
        myPoints: Number(data.myPoints) || 0,
        rank: Number(data.rank) || 0,
        aheadOfMe: typeof data.aheadOfMe === "string" ? data.aheadOfMe : null,
      }
    case "SHOW_LEADERBOARD": {
      const teams = extras.teams as TeamsExtras | undefined
      const previous = leaderboardEntries((data.oldLeaderboard as PlayerLike[]) ?? [], teams)
      const entries = leaderboardEntries((data.leaderboard as PlayerLike[]) ?? [], teams)
      return { kind: "leaderboard", key: `leaderboard:${qNumber}`, previous, entries }
    }
    case "FINISHED": {
      const top = Array.isArray(data.top) ? (data.top as Array<{ username: string; points: number }>) : []
      return {
        kind: "finale",
        key: "finale",
        winner: resolveWinner(top.map((p) => ({ name: p.username, score: Number(p.points) || 0 }))),
        rank: role === "player" && typeof data.rank === "number" ? data.rank : undefined,
        subject: typeof data.subject === "string" ? data.subject : undefined,
      }
    }
    case "SUMMARY":
      return {
        kind: "summary",
        key: "summary",
        subject: String(data.subject ?? ""),
        totalPlayers: Number(data.totalPlayers) || 0,
        totalQuestions: Number(data.totalQuestions) || 0,
      }
    default:
      return { kind: "wait", key: `wait:unknown:${String(status.name)}`, text: "" }
  }
}

/** Per-card / per-scene authored background (card mode) overrides the show backdrop. */
export function resolveStageBackdrop(envelope: ShowEnvelope | null): { url: string; fit: "cover" | "contain" } | null {
  const extras = envelope?.extras ?? {}
  const scene = extras.currentScene as SceneDescriptor | undefined
  const raw = (extras.cardBackground as CardBackgroundOverride | undefined) ?? (scene?.background as CardBackgroundOverride | undefined)
  const effective = resolveEffectiveCardBackground(raw)
  if (effective.mode !== "card" || !effective.url) return null
  return { url: effective.url, fit: effective.fit === "contain" ? "contain" : "cover" }
}

/** Global show activation: on for every game unless the show opts back to legacy. */
export function isTadazzShowActive(envelope: ShowEnvelope | null | undefined): boolean {
  const defaults = envelope?.extras?.defaults as { motionKit?: string } | undefined
  return defaults?.motionKit !== "legacy"
}
