// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import { EVENTS, SESSION_ROLES } from "@razzia/common/constants"
import type {
  Player,
  Quizz,
  QuizzMode,
  GameUpdateQuestion,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type { AnyQuizExtras } from "../../core/index"
import type { PlayerScoreInfo } from "../../gameplay/index"
import type { ExtensionGameSession } from "./session"
import type { StudioShowCoordinator } from "./studio-show-coordinator"

interface StatusEnvelope {
  name: Status
  data: StatusDataMap[Status]
}

export interface AudienceConnection {
  socket: Socket
  gameId: string
  inviteCode: string
  gameMode: QuizzMode
  clientId: string
  managerStatus: StatusEnvelope | null
  lastBroadcastStatus: StatusEnvelope | null
  started: boolean
  acceptingAnswers: boolean
  remainingSeconds: number
  reconnectInfo: GameUpdateQuestion | null
  survey: boolean
  session: ExtensionGameSession | null
  players: Player[]
}

export function sanitizeAudienceStatus<T extends Status>(
  statusData: {
    name: T
    data: StatusDataMap[T]
  },
  survey: boolean,
): { name: T; data: StatusDataMap[T] } {
  if (!statusData || typeof statusData !== "object" || !statusData.data) {
    return statusData
  }

  const cleanData = { ...statusData.data } as Record<string, unknown>

  // Policy: Never expose editorial/backstage note to audience or players
  if ("note" in cleanData) {
    delete cleanData.note
  }

  // In SELECT_ANSWER: never leak solutions
  if (
    statusData.name === STATUS.SELECT_ANSWER ||
    statusData.name === STATUS.SHOW_QUESTION
  ) {
    if ("solutions" in cleanData) {
      delete cleanData.solutions
    }
  }

  // For survey questions: solutions must be undefined
  if (survey && "solutions" in cleanData) {
    delete cleanData.solutions
  }

  return {
    name: statusData.name,
    data: cleanData as StatusDataMap[T],
  }
}

export function canViewReferencedMedia(
  quizz: Quizz,
  extras: AnyQuizExtras | null,
  name: string,
): boolean {
  const content = JSON.stringify([quizz, extras ?? {}])
  const referenced = new Set(
    Array.from(
      content.matchAll(new RegExp("/media/([A-Za-z0-9_.-]+)", "g")),
      (match) => match[1],
    ),
  )

  return referenced.has(name)
}

export function syncSessionStatus({
  session,
  coordinator,
  questionIndex,
  status,
}: {
  session: ExtensionGameSession | null
  coordinator: StudioShowCoordinator | null
  questionIndex: number
  status: Status
}) {
  if (!session) {
    return
  }

  if (
    status === STATUS.SHOW_QUESTION ||
    (status === STATUS.SELECT_ANSWER &&
      coordinator?.currentPhase === "question" &&
      (session.currentPhase !== "question" ||
        session.getCurrentQuestionId() !==
          session.getQuestionId(questionIndex)))
  ) {
    // The picture-led show skips SHOW_QUESTION: initialize its authoritative
    // per-question visuals when the five-card voting screen first opens.
    session.onQuestionStart(questionIndex)
  } else {
    const phaseMap: Partial<
      Record<
        Status,
        | "lobby"
        | "prepared"
        | "question"
        | "responses"
        | "leaderboard"
        | "finished"
      >
    > = {
      [STATUS.SHOW_ROOM]: "lobby",
      [STATUS.SHOW_START]: "prepared",
      [STATUS.SHOW_PREPARED]: "prepared",
      [STATUS.SELECT_ANSWER]: "question",
      [STATUS.SHOW_RESULT]: "responses",
      [STATUS.SHOW_RESPONSES]: "responses",
      [STATUS.SHOW_LEADERBOARD]: "leaderboard",
      [STATUS.FINISHED]: "finished",
      [STATUS.SUMMARY]: "finished",
    }

    const phase = phaseMap[status]

    if (phase) {
      session.setPhase(phase)
    }
  }
}

export function broadcastSessionSnapshot({
  session,
  io,
  managerId,
  players,
  spectatorIds,
}: {
  session: ExtensionGameSession | null
  io: Server
  managerId: string
  players: Player[]
  spectatorIds: Iterable<string>
}) {
  if (!session) {
    return
  }

  const playerScores: PlayerScoreInfo[] = players.map((p) => ({
    clientId: p.clientId,
    score: p.points,
    isConnected: p.connected,
  }))

  if (managerId) {
    io.to(managerId).emit(
      EVENTS.EXTENSIONS.STATE,
      session.getStateSnapshot("manager", playerScores),
    )
  }

  const playerSnapshot = session.getStateSnapshot("player", playerScores)

  for (const player of players) {
    io.to(player.id).emit(EVENTS.EXTENSIONS.STATE, playerSnapshot)
  }

  for (const specId of spectatorIds) {
    io.to(specId).emit(EVENTS.EXTENSIONS.STATE, playerSnapshot)
  }
}

export function connectAudience(ctx: AudienceConnection) {
  const { socket } = ctx
  socket.data = {
    clientId: ctx.clientId,
    role: SESSION_ROLES.SPECTATOR,
    gameId: ctx.gameId,
  }

  socket.emit(EVENTS.SPECTATOR.SUCCESS_JOIN, {
    gameId: ctx.gameId,
    inviteCode: ctx.inviteCode,
    gameMode: ctx.gameMode,
  })

  const currentStatus =
    ctx.managerStatus ??
    ctx.lastBroadcastStatus ??
    (!ctx.started
      ? {
          name: STATUS.SHOW_ROOM,
          data: {
            text: "game:waitingForPlayers",
            inviteCode: ctx.inviteCode,
          },
        }
      : null)

  if (currentStatus) {
    const sanitized = sanitizeAudienceStatus(currentStatus, ctx.survey)

    if (sanitized.name === STATUS.SELECT_ANSWER && ctx.acceptingAnswers) {
      const remaining = ctx.remainingSeconds

      if (remaining !== null && remaining !== undefined) {
        ;(sanitized.data as Record<string, unknown>).remainingTime = remaining
      }
    }

    socket.emit(EVENTS.GAME.STATUS, sanitized)
  }

  const { reconnectInfo } = ctx

  if (reconnectInfo) {
    socket.emit(EVENTS.GAME.UPDATE_QUESTION, reconnectInfo)
  }

  if (ctx.acceptingAnswers) {
    socket.emit(EVENTS.GAME.COOLDOWN, ctx.remainingSeconds)
  }

  if (ctx.session) {
    const playerScores: PlayerScoreInfo[] = ctx.players.map((p) => ({
      clientId: p.clientId,
      score: p.points,
      isConnected: p.connected,
    }))
    const specSnapshot = ctx.session.getStateSnapshot("player", playerScores)
    socket.emit(EVENTS.EXTENSIONS.STATE, specSnapshot)
  }
}

export function sendSessionSnapshot(
  socket: Socket,
  {
    session,
    role,
    players,
  }: {
    session: ExtensionGameSession | null
    role: "manager" | "player"
    players: Player[]
  },
): void {
  if (!session) {
    return
  }

  const scores = players.map((player) => ({
    clientId: player.clientId,
    score: player.points,
    isConnected: player.connected,
  }))
  socket.emit(EVENTS.EXTENSIONS.STATE, session.getStateSnapshot(role, scores))
}
