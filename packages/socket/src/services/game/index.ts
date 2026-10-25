import { createDefaultGameSettings, EVENTS } from "@razzia/common/constants"
import type {
  GameSettings,
  Player,
  Quizz,
  QuizzMode,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import { shouldShowLeaderboard } from "@razzia/extensions/gameplay"
import {
  ExtensionGameSession,
  readSidecar,
  type PlayerScoreInfo,
} from "@razzia/extensions/server"
import { getPath, saveResult } from "@razzia/socket/services/config"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import Registry from "@razzia/socket/services/registry"
import { createInviteCode } from "@razzia/socket/utils/game"
import { createNickname } from "@razzia/socket/utils/nickname"
import { SECOND_MS } from "@razzia/socket/utils/sleep"
import { getClientId } from "@razzia/socket/utils/socket"
import { v7 as uuid } from "uuid"

const registry = Registry.getInstance()

const MANAGER_GRACE_SECONDS = 30

class Game {
  readonly gameId: string
  readonly inviteCode: string
  readonly gameMode: QuizzMode

  private _settings: GameSettings = createDefaultGameSettings()
  private _locked = false

  private readonly io: Server
  private readonly _manager: {
    id: string
    clientId: string
    connected: boolean
  }
  private readonly playerManager: PlayerManager
  private readonly round: RoundManager
  private readonly cooldown: CooldownTimer
  private readonly extensionSession: ExtensionGameSession | null
  private managerGraceTimer: NodeJS.Timeout | null = null

  private lastBroadcastStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private managerStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private playerStatus = new Map<
    string,
    { name: Status; data: StatusDataMap[Status] }
  >()

  constructor(io: Server, managerClientId: string, quizz: Quizz) {
    this.io = io
    this.gameId = uuid()
    this.inviteCode = createInviteCode()
    this.gameMode = quizz.gameMode
    this._manager = {
      id: "",
      clientId: managerClientId,
      connected: false,
    }

    const quizzId = (quizz as { id?: string }).id
    const sidecar = quizzId ? readSidecar(getPath, quizzId) : null

    this.extensionSession = sidecar
      ? new ExtensionGameSession(this.gameId, sidecar)
      : null

    this.cooldown = new CooldownTimer(io, this.gameId)

    this.playerManager = new PlayerManager({
      io,
      gameId: this.gameId,
      gameMode: quizz.gameMode,
      getManagerId: () => this._manager.id,
      isStarted: () => this.started,
    })

    this.round = new RoundManager({
      quizz,
      players: this.playerManager,
      cooldown: this.cooldown,
      io,
      gameId: this.gameId,
      getManagerId: () => this._manager.id,
      broadcast: this.broadcastStatus.bind(this),
      send: this.sendStatus.bind(this),
      onNewQuestion: () => {
        this.playerStatus.clear()
        this.managerStatus = null
      },
      onGameFinished: saveResult,
      getSettings: () => this._settings,
      shouldShowLeaderboard: this.extensionSession
        ? (params) => {
            if (!this.extensionSession?.extras?.leaderboard) {
              return false
            }

            const currentQId =
              this.extensionSession.extras.questionIds[
                params.currentQuestionIndex
              ]
            const nextQId =
              this.extensionSession.extras.questionIds[
                params.currentQuestionIndex + 1
              ]

            return shouldShowLeaderboard({
              policy: this.extensionSession.extras.leaderboard,
              gameMode: this.gameMode,
              currentQuestionIndex: params.currentQuestionIndex,
              totalQuestions: params.totalQuestions,
              currentQuestionId: currentQId,
              nextQuestionId: nextQId,
              currentCategory: params.currentCategory,
              nextCategory: params.nextCategory,
              isManualRequested:
                this.extensionSession.consumeManualLeaderboardRequest(),
            })
          }
        : undefined,
      hasInterlude: (qIdx) =>
        this.extensionSession?.hasInterlude(qIdx) ?? false,
      getInterludeAdvance: (qIdx) =>
        this.extensionSession?.getInterludeAdvance(qIdx) ?? "manual",
      getInterludeDuration: (qIdx) =>
        this.extensionSession?.getInterludeDuration(qIdx) ?? 5000,
      onInterlude: (qIdx) => {
        if (this.extensionSession) {
          this.extensionSession.onInterludeStart(qIdx)
          this.broadcastExtensionState()
        }
      },
      getQuestionId: (qIdx) => this.extensionSession?.getQuestionId(qIdx),
      onResultsCalculated: (dist) => {
        if (this.extensionSession) {
          this.extensionSession.setRevealDistribution(dist)
          this.broadcastExtensionState()
        }
      },
      onReplayCheckpoint: (qIdx) => {
        if (this.extensionSession) {
          this.extensionSession.onReplayCheckpoint(qIdx)
          this.broadcastExtensionState()
        }
      },
    })

    if (this.extensionSession) {
      this.extensionSession.setDelegate({
        endAnswerTimer: () => this.round.endTimer(),
        nextScreen: () => this.round.nextScreen(),
        skipQuestion: (reason) => this.round.skipQuestion(reason),
        replayFromCheckpoint: (qIdx) => this.round.replayFromCheckpoint(qIdx),
        endOrSkipInterlude: () => this.round.endOrSkipInterlude(),
        getHistory: (qIdx) => this.round.getHistory(qIdx),
      })
    }

    console.log(
      `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
    )
  }

  get manager() {
    return this._manager
  }

  get players(): Player[] {
    return this.playerManager.getAll()
  }

  get started(): boolean {
    return this.round.isStarted()
  }

  get settings(): GameSettings {
    return this._settings
  }

  updateSettings(settings: Partial<GameSettings>): boolean {
    if (this.started) {
      return false
    }

    this._settings = { ...this._settings, ...settings }

    return true
  }

  get locked(): boolean {
    return this._locked
  }

  setLocked(locked: boolean) {
    this._locked = locked
    this.io.to(this._manager.id).emit(EVENTS.MANAGER.LOCK_UPDATED, locked)
  }

  // ── Status broadcasting ──────────────────────────────────────────────────

  private broadcastStatus<T extends Status>(status: T, data: StatusDataMap[T]) {
    const statusData = { name: status, data }
    this.lastBroadcastStatus = statusData
    this.io.to(this.gameId).emit(EVENTS.GAME.STATUS, statusData)

    if (this.extensionSession) {
      this.syncExtensionStatus(status)
    }
  }

  private syncExtensionStatus(status: Status) {
    if (!this.extensionSession) {
      return
    }

    if (status === STATUS.SHOW_QUESTION) {
      this.extensionSession.onQuestionStart(this.round.currentQuestionIndex)
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
        this.extensionSession.setPhase(phase)
      }
    }

    this.broadcastExtensionState()
  }

  private broadcastExtensionState() {
    if (!this.extensionSession) {
      return
    }

    const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
      clientId: p.clientId,
      score: p.points,
      isConnected: p.connected,
    }))

    if (this._manager.id) {
      this.io
        .to(this._manager.id)
        .emit(
          EVENTS.EXTENSIONS.STATE,
          this.extensionSession.getStateSnapshot("manager", playerScores),
        )
    }

    const playerSnapshot = this.extensionSession.getStateSnapshot(
      "player",
      playerScores,
    )

    for (const player of this.players) {
      this.io.to(player.id).emit(EVENTS.EXTENSIONS.STATE, playerSnapshot)
    }
  }

  handleExtensionCommand(command: unknown) {
    if (!this.extensionSession) {
      return { success: false }
    }

    const result = this.extensionSession.handleCommand(command, true)
    this.broadcastExtensionState()

    return result
  }

  private sendStatus<T extends Status>(
    target: string,
    status: T,
    data: StatusDataMap[T],
  ) {
    const statusData = { name: status, data }

    if (this._manager.id === target) {
      this.managerStatus = statusData

      if (this.extensionSession) {
        if (status === STATUS.SHOW_LEADERBOARD) {
          this.extensionSession.setPhase("leaderboard")
        }

        this.broadcastExtensionState()
      }
    } else {
      this.playerStatus.set(target, statusData)
    }

    this.io.to(target).emit(EVENTS.GAME.STATUS, statusData)
  }

  // Player actions

  join(socket: Socket, username?: string): string | null {
    if (this._locked) {
      return "errors:game.locked"
    }

    if (this._settings.generatedUsernames) {
      const taken = this.playerManager.getAll().map((player) => player.username)
      const error = this.playerManager.join(socket, createNickname(taken))

      if (!error && this.extensionSession) {
        this.extensionSession.onPlayerJoin(getClientId(socket))
        this.broadcastExtensionState()
      }

      return error
    }

    if (!username) {
      return "errors:auth.usernameTooShort"
    }

    const error = this.playerManager.join(socket, username)

    if (!error && this.extensionSession) {
      this.extensionSession.onPlayerJoin(getClientId(socket))
      this.broadcastExtensionState()
    }

    return error
  }

  dispose() {
    this.round.dispose()
    this.cancelManagerGrace()
  }

  waitForManager(onTimeout: () => void) {
    this.cancelManagerGrace()
    this.managerGraceTimer = setTimeout(() => {
      this.managerGraceTimer = null

      if (!this._manager.connected && !this.started) {
        onTimeout()
      }
    }, MANAGER_GRACE_SECONDS * SECOND_MS)
  }

  private cancelManagerGrace() {
    if (this.managerGraceTimer) {
      clearTimeout(this.managerGraceTimer)
      this.managerGraceTimer = null
    }
  }

  kickPlayer(playerId: string) {
    const player = this.playerManager.findById(playerId)

    if (this.playerManager.kick(playerId)) {
      this.playerStatus.delete(playerId)

      if (this.extensionSession && player) {
        this.extensionSession.onPlayerKicked(player.clientId)
        this.broadcastExtensionState()
      }
    }
  }

  // Reconnect

  reconnect(socket: Socket) {
    const clientId = getClientId(socket)

    if (this._manager.clientId === clientId) {
      this.reconnectManager(socket)

      return
    }

    this.reconnectPlayer(socket)
  }

  private reconnectManager(socket: Socket) {
    const previousSocketId = this._manager.connected ? this._manager.id : null

    socket.join(this.gameId)
    this._manager.id = socket.id
    this._manager.connected = true
    this.cancelManagerGrace()

    if (previousSocketId && previousSocketId !== socket.id) {
      this.io
        .to(previousSocketId)
        .emit(EVENTS.GAME.RESET, "errors:game.managerAlreadyConnected")
      this.io.in(previousSocketId).disconnectSockets(true)
    }

    const status = (() => {
      if (this.managerStatus) {
        return this.managerStatus
      }

      if (this.lastBroadcastStatus) {
        return this.lastBroadcastStatus
      }

      return {
        name: STATUS.SHOW_ROOM,
        data: {
          text: "game:waitingForPlayers",
          inviteCode: this.inviteCode,
        },
      }
    })()

    socket.emit(EVENTS.MANAGER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      settings: this._settings,
      locked: this._locked,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      players: this.playerManager.getAll(),
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.joinedCount())

    if (this.extensionSession) {
      const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
        clientId: p.clientId,
        score: p.points,
        isConnected: p.connected,
      }))

      socket.emit(
        EVENTS.EXTENSIONS.STATE,
        this.extensionSession.getStateSnapshot("manager", playerScores),
      )
    }

    registry.reactivateGame(this.gameId)
    console.log(`Manager reconnected to game ${this.inviteCode}`)
  }

  private reconnectPlayer(socket: Socket) {
    const clientId = getClientId(socket)
    const player = this.playerManager.findByClientId(clientId)

    if (!player) {
      return
    }

    socket.join(this.gameId)

    const oldSocketId = player.id
    const replacesConnection = player.connected && oldSocketId !== socket.id
    this.playerManager.updateSocketId(oldSocketId, socket.id)
    this.round.updatePlayerId(oldSocketId, socket.id)
    player.connected = true
    this.notifyPlayerUpdated(oldSocketId, player)

    if (replacesConnection) {
      this.io.in(oldSocketId).disconnectSockets(true)
    }

    const status = this.playerStatus.get(oldSocketId) ??
      this.lastBroadcastStatus ?? {
        name: STATUS.WAIT,
        data: { text: "game:waitingForPlayers" },
      }

    const oldStatus = this.playerStatus.get(oldSocketId)

    if (oldStatus) {
      this.playerStatus.delete(oldSocketId)
      this.playerStatus.set(socket.id, oldStatus)
    }

    socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      gameMode: this.gameMode,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      player: { username: player.username, points: player.points },
    })
    this.playerManager.broadcastCount()

    if (this.extensionSession) {
      const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
        clientId: p.clientId,
        score: p.points,
        isConnected: p.connected,
      }))

      socket.emit(
        EVENTS.EXTENSIONS.STATE,
        this.extensionSession.getStateSnapshot("player", playerScores),
      )
    }

    console.log(
      `Player ${player.username} reconnected to game ${this.inviteCode}`,
    )
  }

  // Disconnect helpers

  setManagerDisconnected() {
    this._manager.connected = false
  }

  removePlayer(socketId: string): Player | undefined {
    const player = this.playerManager.remove(socketId)

    if (player) {
      this.io.to(this._manager.id).emit(EVENTS.MANAGER.REMOVE_PLAYER, player.id)
      this.playerManager.broadcastCount()
    }

    return player
  }

  setPlayerDisconnected(socketId: string, timedOut = false) {
    this.playerManager.setDisconnected(socketId)
    this.playerManager.broadcastCount()
    this.round.endIfEveryoneAnswered()

    const player = this.playerManager.findById(socketId)

    if (player) {
      this.notifyPlayerUpdated(socketId, player, timedOut)
    }
  }

  private notifyPlayerUpdated(
    previousId: string,
    player: Player,
    timedOut = false,
  ) {
    this.io
      .to(this._manager.id)
      .emit(EVENTS.MANAGER.PLAYER_UPDATED, { previousId, player, timedOut })
  }

  // Game flow

  abortCooldown() {
    this.cooldown.abort()
  }

  async start(socket: Socket) {
    if (!this.started) {
      const away = this.playerManager.getAll().filter((p) => !p.connected)

      for (const player of away) {
        this.removePlayer(player.id)
      }
    }

    await this.round.start(socket)
  }

  selectAnswer(socket: Socket, answerIds: number[]) {
    this.round.selectAnswer(socket, answerIds)
  }

  advance() {
    this.round.advance()
  }
}

export default Game
