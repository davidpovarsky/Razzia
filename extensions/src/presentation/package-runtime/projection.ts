import type { RuntimeSnapshot } from "../../core/packages/protocol"
import type { PublicFullShowData } from "../../core/studio-timeline-schema"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import { storyElapsedSeconds } from "../tadazz-v4/reference-story/story-clock"

export interface PackageSceneProjectionInput {
  scene: ShowScene
  voteLocked?: boolean
  /** Synchronized server time, never a customer-owned game clock. */
  serverTime: number
  paused: boolean
  images?: Readonly<Record<string, string>>
  backgroundUrl?: string
  /** Optional canonical timeline metadata supplied by the trusted host. */
  questionNumber?: number
  questionCount?: number | null
  finalLeaderboard?: boolean
  phaseElapsedMs?: number
  revealStage?: RuntimeSnapshot["revealStage"]
  /** Only the already-public lobby directory, never raw roster records. */
  lobby?: Pick<PublicFullShowData, "dialNumber" | "instructions" | "roster">
}

export type PackageSceneProjection = Pick<
  RuntimeSnapshot,
  | "phase"
  | "title"
  | "question"
  | "questionNumber"
  | "questionCount"
  | "cardKind"
  | "cardTitle"
  | "finalLeaderboard"
  | "phaseElapsedMs"
  | "revealStage"
  | "questionImage"
  | "backgroundImage"
  | "answers"
  | "leaders"
  | "personalResult"
  | "joinPhoneNumber"
  | "lobbyInstructions"
  | "roster"
>

/** Reading time is root-owned and must not appear as a voting countdown. */
export function projectPackageClock(
  clock: Pick<RuntimeSnapshot, "phase" | "deadline" | "remainingMs">,
): Pick<RuntimeSnapshot, "deadline" | "remainingMs"> {
  return clock.phase === "question"
    ? { deadline: null, remainingMs: 0 }
    : { deadline: clock.deadline, remainingMs: clock.remainingMs }
}

/** Match native authored scene semantics instead of flattening every card to interlude. */
export function packageRuntimePhase(
  scene: ShowScene,
  voteLocked = false,
): RuntimeSnapshot["phase"] {
  if ((scene.kind === "wait" || scene.kind === "voting") && voteLocked) {
    return "voteLocked"
  }

  switch (scene.kind) {
    case "scene":
      switch (scene.scene.kind) {
        case "opening":

        case "closing":

        case "leaderboard":
          return scene.scene.kind

        case "interimResults":
          return "results"

        default:
          return "interlude"
      }

    case "start":
      return "opening"

    case "prepared":
      return "answerCards"

    case "player-result":
      return "personalResult"

    case "finale":

    case "summary":
      return "closing"

    case "question":

    case "voting":

    case "results":

    case "leaderboard":

    case "lobby":

    case "interlude":
      return scene.kind

    default:
      return "lobby"
  }
}

/**
 * Explicit public projection shared by native games and unsaved package previews.
 * Never spread a question, envelope, account record or answer solution into a frame.
 */
export function projectPackageScene(
  input: PackageSceneProjectionInput,
): PackageSceneProjection {
  const { scene, images = {}, backgroundUrl } = input
  const question = "question" in scene ? scene.question : null
  const interim =
    scene.kind === "scene" && scene.scene.kind === "interimResults"
      ? scene.activeSceneData?.interimResults
      : undefined
  const title = (() => {
    if (scene.kind === "scene") {
      return scene.scene.title ?? ""
    }

    return "subject" in scene ? (scene.subject ?? "") : ""
  })()
  const questionImage =
    question?.questionImage ??
    ((scene.kind === "question" || scene.kind === "voting") &&
    scene.media?.type.toLowerCase() === "image"
      ? scene.media.url
      : undefined)
  const questionNumber =
    question?.number ??
    (scene.kind === "prepared" ? scene.questionNumber : input.questionNumber)
  const questionCount = question ? question.totalQuestions : input.questionCount
  const finalLeaderboard =
    input.finalLeaderboard ??
    (scene.kind === "scene" && scene.scene.kind === "leaderboard"
      ? scene.activeSceneData?.leaderboard?.isFinal
      : undefined)
  const phaseElapsedMs = (() => {
    if (input.phaseElapsedMs !== undefined) {
      return input.phaseElapsedMs
    }

    if (scene.kind === "scene") {
      return (
        storyElapsedSeconds(
          {
            sceneStartedAt: scene.startedAt,
            sceneElapsedMs: scene.elapsedMs,
            scenePaused: input.paused,
          },
          input.serverTime,
        ) * 1000
      )
    }

    return undefined
  })()
  const answers: RuntimeSnapshot["answers"] = interim
    ? interim.options.slice(0, 64).map((option, index) => ({
        id: String(option.answerIndex ?? index),
        label: option.label,
        percent: option.percentage,
        votes: option.count,
        ...(option.imageUrl && images[option.imageUrl]
          ? { image: images[option.imageUrl] }
          : {}),
        // Interim popularity/winner data is not a quiz-correctness assertion.
      }))
    : (question?.options ?? []).slice(0, 64).map((answer, index) => ({
        id: String(index),
        label: answer.label,
        ...(answer.image && images[answer.image]
          ? { image: images[answer.image] }
          : {}),
        ...(scene.kind === "results" && input.revealStage !== "pending"
          ? {
              percent:
                scene.reveal.percentages?.[index] ??
                (scene.reveal.counts.reduce((sum, count) => sum + count, 0) > 0
                  ? ((scene.reveal.counts[index] ?? 0) * 100) /
                    scene.reveal.counts.reduce((sum, count) => sum + count, 0)
                  : 0),
              votes: scene.reveal.counts[index] ?? 0,
              ...(scene.reveal.mode === "quiz" &&
              (input.revealStage === undefined ||
                input.revealStage === "correct")
                ? {
                    correct: scene.reveal.solutions?.includes(index) ?? false,
                  }
                : {}),
            }
          : {}),
      }))
  const leaders: RuntimeSnapshot["leaders"] = (() => {
    if (scene.kind === "leaderboard") {
      return scene.entries.slice(0, 100).map((entry, index) => ({
        label: entry.name,
        score: entry.score,
        rank: index + 1,
      }))
    }

    if (
      scene.kind === "scene" &&
      (scene.scene.kind === "leaderboard" || scene.scene.kind === "closing")
    ) {
      return (scene.activeSceneData?.leaderboard?.entries ?? [])
        .slice(0, 100)
        .map((entry) => ({
          label: entry.displayName,
          score: entry.points,
          rank: entry.rank,
        }))
    }

    if (scene.kind === "finale" && scene.winner) {
      return [{ label: scene.winner.name, score: scene.winner.score, rank: 1 }]
    }

    return []
  })()

  return {
    phase: packageRuntimePhase(scene, input.voteLocked),
    ...(scene.kind === "results" && input.revealStage
      ? { revealStage: input.revealStage }
      : {}),
    ...(scene.kind === "lobby" && input.lobby
      ? {
          ...(input.lobby.dialNumber
            ? { joinPhoneNumber: input.lobby.dialNumber }
            : {}),
          ...(input.lobby.instructions
            ? { lobbyInstructions: input.lobby.instructions.slice(0, 8) }
            : {}),
          ...(input.lobby.roster
            ? {
                roster: input.lobby.roster.slice(0, 2000).map((row) => ({
                  id: row.id,
                  label: row.label,
                  connected: row.connected,
                })),
              }
            : {}),
        }
      : {}),
    title,
    cardKind: scene.kind === "scene" ? scene.scene.kind : scene.kind,
    cardTitle: title,
    question: question?.question ?? interim?.questionText ?? "",
    ...(questionNumber !== undefined &&
    Number.isInteger(questionNumber) &&
    questionNumber > 0
      ? { questionNumber }
      : {}),
    ...(questionCount === null ||
    (questionCount !== undefined &&
      Number.isInteger(questionCount) &&
      questionCount >= 0)
      ? { questionCount }
      : {}),
    ...(finalLeaderboard === undefined ? {} : { finalLeaderboard }),
    ...(phaseElapsedMs !== undefined && Number.isFinite(phaseElapsedMs)
      ? { phaseElapsedMs: Math.max(0, Math.min(86_400_000, phaseElapsedMs)) }
      : {}),
    ...(questionImage && images[questionImage]
      ? { questionImage: images[questionImage] }
      : {}),
    ...(backgroundUrl && images[backgroundUrl]
      ? { backgroundImage: images[backgroundUrl] }
      : {}),
    answers,
    leaders,
    personalResult:
      scene.kind === "player-result"
        ? { correct: scene.correct, points: scene.points, rank: scene.rank }
        : null,
  }
}
