import {
  reserveBilledGame, startBilledGame, admitBilledParticipant,
  admitBilledPhone, finishBilledPhone,
} from "@razzia/socket/services/billing"
import { createDefaultGameSettings, EVENTS } from "@razzia/common/constants"
import {
  type GameSettings,
  type Player,
  type Quizz,
  type QuizzMode,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import {
  type HostPresenceSnapshot,
  type RevealDistributionSnapshot,
  type RosterParticipant,
} from "@razzia/extensions/core"
import {
  ExtensionGameSession,
  GameRoster,
  GamePhoneController,
  createShowRoundHooks,
  createSessionDelegate,
  createAuthoredCoordinator,
  sendSessionSnapshot,
  isCreatingWorldsProgram,
  allowsTemporaryGuests,
  sanitizeAudienceStatus,
  canViewReferencedMedia,
  syncSessionStatus,
  broadcastSessionSnapshot,
  connectAudience,
  PresentationLaunch,
  readSidecar,
  type StudioShowCoordinator,
} from "@razzia/extensions/server"
import {
  accountsEnabled,
  withAccount,
} from "@razzia/socket/services/account-scope"
import { getPath, saveResult } from "@razzia/socket/services/config"
import { installedThemeForSelection } from "@razzia/socket/services/theme-installation"
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
  private readonly quizz: Quizz
  private readonly cooldown: CooldownTimer
  private readonly extensionSession: ExtensionGameSession | null
  private readonly showCoordinator: StudioShowCoordinator | null = null
  private readonly isCreatingWorldsShow: boolean
  private readonly presentationLaunch: PresentationLaunch | null
  private readonly temporaryGuestsAllowed: boolean
  private lastCompletedDistribution: RevealDistributionSnapshot | null = null
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
  private readonly spectatorSocketIds = new Set<string>()

  private readonly phone: GamePhoneController
  private readonly roster: GameRoster

  constructor(io: Server, managerClientId: string, quizz: Quizz) {
    this.io = io
    this.quizz = quizz
    this.gameId = uuid()
    reserveBilledGame(managerClientId, this.gameId)
    this.inviteCode = createInviteCode()
    this.gameMode = quizz.gameMode
    this._manager = {
      id: "",
      clientId: managerClientId,
      connected: false,
    }

    this.roster = new GameRoster({
      players: {
        getAll: () => this.playerManager.getAll(),
        findByClientId: (id) => this.playerManager.findByClientId(id),
      },
      onPlayerRenamed: (player) =>
        this.notifyPlayerUpdated(player.id, player, false),
      kickPlayer: (id) => this.kickPlayer(id),
      onChange: () => this.broadcastHostPresence(),
      setPhoneInviteOnly: (phoneInviteOnly) => {
        this._settings = { ...this._settings, phoneInviteOnly }
      },
    })

    const quizzId = (quizz as { id?: string }).id
    const sidecar = quizzId ? readSidecar(getPath, quizzId) : null
    const isCreatingWorlds = isCreatingWorldsProgram(sidecar)
    this.isCreatingWorldsShow = isCreatingWorlds
    this.temporaryGuestsAllowed = allowsTemporaryGuests(
      quizzId,
      managerClientId,
      process.env,
    )
    this.extensionSession = sidecar
      ? new ExtensionGameSession(
          this.gameId,
          sidecar,
          installedThemeForSelection(
            managerClientId,
            "defaults" in sidecar ? sidecar.defaults.showTheme : undefined,
          ),
        )
      : null
    this.presentationLaunch = isCreatingWorlds
      ? new PresentationLaunch(() => {
          this.extensionSession?.onPresenceChanged()
          this.broadcastExtensionState()
        })
      : null

    this.showCoordinator = createAuthoredCoordinator(
      sidecar,
      this.extensionSession,
      {
        onStartQuestion: (qIdx) => {
          this.round.startQuestionAtIndex(qIdx)
        },
        onReopenQuestion: (qIdx) => {
          this.clearQuestionVerdicts(qIdx)
          this.round.reopenQuestion(qIdx)
          this.syncRosterScoresFromPlayers()
          this.broadcastHostPresence()
          this.broadcastExtensionState()
        },
        onShowCompletedQuestionResults: (qIdx) => {
          this.round.showCompletedQuestionResults(qIdx)
          this.syncExtensionStatus(STATUS.SHOW_RESPONSES)
        },
        onFinish: () => {
          this.round.finish()
        },
        onBroadcastState: () => this.broadcastExtensionState(),
      },
    )

    if (sidecar?.roster) {
      this._settings = {
        ...this._settings,
        phoneInviteOnly:
          sidecar.roster.phoneInviteOnly && !this.temporaryGuestsAllowed,
      }
      this.roster.seed(sidecar.roster.participants)
    }

    this.cooldown = new CooldownTimer(io, this.gameId)

    this.playerManager = new PlayerManager({
      io,
      gameId: this.gameId,
      gameMode: quizz.gameMode,
      getManagerId: () => this._manager.id,
      isStarted: () => this.started,
    })

    const getRoundIndex = () => this.round.currentQuestionIndex
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
        this.broadcastHostPresence()
      },
      onGameFinished: (result) => {
        if (accountsEnabled()) {
          void withAccount(managerClientId, () => saveResult(result))
        } else {
          saveResult(result)
        }
      },
      getSettings: () => this._settings,
      ...createShowRoundHooks({
        extensionSession: this.extensionSession,
        showCoordinator: this.showCoordinator,
        isCreatingWorldsShow: isCreatingWorlds,
        gameMode: this.gameMode,
        roster: this.roster,
        round: {
          get currentQuestionIndex() {
            return getRoundIndex()
          },
        },
        setLastDistribution: (dist) => {
          this.lastCompletedDistribution = dist
        },
        syncRosterScoresFromPlayers: () => this.syncRosterScoresFromPlayers(),
        broadcastHostPresence: () => this.broadcastHostPresence(),
        broadcastExtensionState: () => this.broadcastExtensionState(),
      }),
    })

    this.phone = new GamePhoneController({
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      gameMode: this.gameMode,
      quizz,
      io,
      roster: this.roster,
      round: this.round,
      players: this.playerManager,
      started: () => this.started,
      settings: () => this._settings,
      locked: () => this._locked,
      session: () => this.extensionSession,
      coordinator: () => this.showCoordinator,
      admitPhone: (identity, callId, join) => admitBilledPhone(this._manager.clientId, this.gameId, identity, callId, join),
      finishPhone: callId => finishBilledPhone(this.gameId, callId),
      notifyPlayerUpdated: (previous, player, timedOut) =>
        this.notifyPlayerUpdated(previous, player, timedOut),
      broadcastExtensionState: () => this.broadcastExtensionState(),
      broadcastHostPresence: () => this.broadcastHostPresence(),
      setPlayerDisconnected: (id, timedOut) =>
        this.setPlayerDisconnected(id, timedOut),
    })

    if (this.extensionSession) {
      this.extensionSession.setDelegate(
        createSessionDelegate({
          extensionSession: this.extensionSession,
          presentationLaunch: this.presentationLaunch,
          showCoordinator: this.showCoordinator,
          round: this.round,
          quizz,
          roster: this.roster,
          started: () => this.started,
          players: () => this.players,
          playerCount: () => this.playerManager.count(),
          hostSocket: () => this.io.sockets.sockets.get(this.manager.id),
          start: (socket) => this.start(socket),
          getVoteCompletionReason: () => this.getVoteCompletionReason(),
          lastCompletedDistribution: () => this.lastCompletedDistribution,
          clearQuestionVerdicts: (index) => this.clearQuestionVerdicts(index),
          syncRosterScoresFromPlayers: () => this.syncRosterScoresFromPlayers(),
          broadcastHostPresence: () => this.broadcastHostPresence(),
          broadcastExtensionState: () => this.broadcastExtensionState(),
        }),
      )
    }

    console.log(
      `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
    )
  }

  get manager() {
    return this._manager
  }

  /** Authorize only files referenced by this room's actual content. */
  canViewMedia(name: string): boolean {
    if (
      this.extensionSession?.themeDefinition?.assets.some(
        (asset) => asset.url === `/media/${name}`,
      )
    )
      return true
    return canViewReferencedMedia(
      this.quizz,
      this.extensionSession?.extras ?? null,
      name,
    )
  }

  get roundManager(): RoundManager {
    return this.round
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

  get quizId(): string | undefined {
    return (this.quizz as { id?: string }).id
  }

  updateSettings(settings: Partial<GameSettings>): boolean {
    if (
      this.started &&
      Object.keys(settings).some((key) => key !== "endOnAllAnswered")
    ) {
      return false
    }

    this._settings = { ...this._settings, ...settings }
    if (settings.endOnAllAnswered) {
      this.round.endIfEveryoneAnswered()
    }
    this.broadcastHostPresence()

    return true
  }

  get phoneInviteOnly(): boolean {
    return Boolean(this._settings.phoneInviteOnly)
  }

  setPhoneInviteOnly(enabled: boolean): void {
    this._settings = { ...this._settings, phoneInviteOnly: enabled }
    this.broadcastHostPresence()
  }

  findRosterByPhone(rawOrE164: string) {
    return this.roster.findByPhone(rawOrE164)
  }

  getRosterEntry(rosterPlayerId: string) {
    return this.roster.get(rosterPlayerId)
  }

  getCurrentQuestionPstnSupport(
    ...args: Parameters<GamePhoneController["getCurrentQuestionPstnSupport"]>
  ) {
    return this.phone.getCurrentQuestionPstnSupport(...args)
  }

  getQuestionStateForGateway(
    ...args: Parameters<GamePhoneController["getQuestionStateForGateway"]>
  ) {
    return this.phone.getQuestionStateForGateway(...args)
  }

  submitPhoneAnswerByRosterId(
    ...args: Parameters<GamePhoneController["submitPhoneAnswerByRosterId"]>
  ) {
    return this.phone.submitPhoneAnswerByRosterId(...args)
  }

  /**
   * CRUD operations on game roster for the host.
   */
  upsertRosterParticipant(
    input: Parameters<GameRoster["upsert"]>[0],
  ): RosterParticipant {
    return this.roster.upsert(input)
  }

  removeRosterParticipant(rosterPlayerId: string): boolean {
    return this.roster.remove(rosterPlayerId)
  }

  replaceRosterParticipants(
    participants: RosterParticipant[],
    phoneInviteOnly?: boolean,
  ): void {
    this.roster.replace(participants, phoneInviteOnly)
  }

  private clearQuestionVerdicts(_qIdx?: number): void {
    this.roster.verdicts.clear()
  }

  private syncRosterScoresFromPlayers(): void {
    this.roster.syncScores()
  }

  getHostPresenceSnapshot(): HostPresenceSnapshot {
    return this.roster.snapshot(
      this.gameId,
      this.phoneInviteOnly,
      this.round.getAnsweredPlayerIds(),
    )
  }

  broadcastHostPresence(): void {
    this.roster.sequence += 1
    // Displays receive the live roster through the extension envelope as well.
    // Give presence changes a new sequence so clients accept the update.
    this.extensionSession?.onPresenceChanged()
    this.broadcastExtensionState()

    if (!this._manager.id) {
      return
    }

    const snapshot = this.getHostPresenceSnapshot()
    this.io.to(this._manager.id).emit(EVENTS.MANAGER.HOST_PRESENCE, snapshot)
  }

  get locked(): boolean {
    return this._locked
  }

  setLocked(locked: boolean) {
    this._locked = locked
    this.io.to(this._manager.id).emit(EVENTS.MANAGER.LOCK_UPDATED, locked)
  }

  // ── Spectator / Audience Projector ──────────────────────────────────────────

  hasSpectatorSocket(socketId: string): boolean {
    return this.spectatorSocketIds.has(socketId)
  }

  getSpectatorCount(): number {
    return this.spectatorSocketIds.size
  }

  joinSpectator(socket: Socket) {
    socket.join(this.gameId)
    this.spectatorSocketIds.add(socket.id)
    connectAudience({
      socket,
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      gameMode: this.gameMode,
      clientId: getClientId(socket),
      managerStatus: this.managerStatus,
      lastBroadcastStatus: this.lastBroadcastStatus,
      started: this.started,
      acceptingAnswers: this.round.isCurrentlyAcceptingAnswers,
      remainingSeconds: this.round.getRemainingSeconds(),
      reconnectInfo: this.round.getReconnectInfo(),
      survey: this.round.isSurvey(),
      session: this.extensionSession,
      players: this.players,
    })
  }

  leaveSpectator(socket: Socket) {
    socket.leave(this.gameId)
    this.spectatorSocketIds.delete(socket.id)
  }

  public sanitizeStatusForAudience<T extends Status>(statusData: {
    name: T
    data: StatusDataMap[T]
  }) {
    return sanitizeAudienceStatus(statusData, this.round.isSurvey())
  }

  // ── Status broadcasting ──────────────────────────────────────────────────

  private broadcastStatus<T extends Status>(status: T, data: StatusDataMap[T]) {
    const statusData = { name: status, data }
    this.lastBroadcastStatus = statusData
    const publicStatus = this.sanitizeStatusForAudience(statusData)

    // For Creating Worlds, the per-question image/answer metadata MUST arrive
    // before the five-card voting status. Otherwise the browser briefly pairs
    // the next question text with the previous question pictures.
    if (this.isCreatingWorldsShow && this.extensionSession) {
      this.syncExtensionStatus(status)
    }
    this.io.to(this.gameId).emit(EVENTS.GAME.STATUS, publicStatus)

    if (!this.isCreatingWorldsShow && this.extensionSession) {
      this.syncExtensionStatus(status)
    }
  }

  private syncExtensionStatus(status: Status) {
    if (!this.extensionSession) return
    syncSessionStatus({
      session: this.extensionSession,
      coordinator: this.showCoordinator,
      questionIndex: this.round.currentQuestionIndex,
      status,
    })
    this.broadcastExtensionState()
  }

  private broadcastExtensionState() {
    broadcastSessionSnapshot({
      session: this.extensionSession,
      io: this.io,
      managerId: this._manager.id,
      players: this.players,
      spectatorIds: this.spectatorSocketIds,
    })
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
        this.syncExtensionStatus(status)
      }

      // Also forward sanitized status to all audience spectators
      const publicStatus = this.sanitizeStatusForAudience(statusData)
      for (const specId of this.spectatorSocketIds) {
        this.io.to(specId).emit(EVENTS.GAME.STATUS, publicStatus)
      }
    } else {
      this.playerStatus.set(target, statusData)
    }

    this.io.to(target).emit(EVENTS.GAME.STATUS, statusData)
  }

  // Player actions

  join(
    socket: Socket,
    username?: string,
    claimsExtra?: {
      rosterPlayerId?: string
      phoneE164?: string
      source?: "web" | "phone"
    },
  ): string | null {
    const clientId = getClientId(socket)
    const {
      entry: rosterEntry,
      normalizedPhone,
      error: rosterError,
    } = this.roster.resolveBrowserJoin({
      clientId,
      username,
      claimsExtra,
      isCreatingWorldsShow: this.isCreatingWorldsShow,
      temporaryGuestsAllowed: this.temporaryGuestsAllowed,
      phoneInviteOnly: Boolean(this._settings.phoneInviteOnly),
    })
    if (rosterError) return rosterError

    // 3. If this roster entry already has an existing Player (e.g., redial with a new CallId/clientId/socket),
    // rebind the existing Player row without creating a duplicate or losing score/epoch/answer state!
    if (rosterEntry?.clientId) {
      const existingPlayer = this.playerManager.findByClientId(
        rosterEntry.clientId,
      )

      if (existingPlayer) {
        // If same clientId is already connected and not a phone redial, refuse duplicate join
        if (
          existingPlayer.clientId === clientId &&
          existingPlayer.connected &&
          claimsExtra?.source !== "phone" &&
          !normalizedPhone
        ) {
          return "errors:game.playerAlreadyConnected"
        }

        const oldClientId = existingPlayer.clientId
        const oldSocketId = existingPlayer.id
        const replacesConnection =
          existingPlayer.connected && oldSocketId !== socket.id

        socket.join(this.gameId)

        if (oldClientId !== clientId) {
          this.roster.clientIndex.delete(oldClientId)
          this.playerManager.updateClientId(oldSocketId, clientId)
          this.round.updateCheckpointClientId(oldClientId, clientId)
          this.extensionSession?.rebindPlayerClientId(oldClientId, clientId)
        }

        this.playerManager.updateSocketId(oldSocketId, socket.id)
        this.round.updatePlayerId(oldSocketId, socket.id)
        existingPlayer.connected = true
        existingPlayer.username =
          rosterEntry.displayName || existingPlayer.username

        rosterEntry.clientId = clientId
        rosterEntry.status = "connected"
        rosterEntry.timedOut = false
        rosterEntry.lastSeenAt = Date.now()

        if (claimsExtra?.source) {
          rosterEntry.source = claimsExtra.source
        } else if (normalizedPhone) {
          rosterEntry.source = "phone"
        }

        this.roster.clientIndex.set(clientId, rosterEntry.rosterPlayerId)

        this.notifyPlayerUpdated(oldSocketId, existingPlayer, false)

        if (replacesConnection) {
          this.io.in(oldSocketId).disconnectSockets(true)
        }

        const oldStatus = this.playerStatus.get(oldSocketId)

        if (oldStatus) {
          this.playerStatus.delete(oldSocketId)
          this.playerStatus.set(socket.id, oldStatus)
        }

        const status = oldStatus ??
          this.lastBroadcastStatus ?? {
            name: STATUS.WAIT,
            data: { text: "game:waitingForPlayers" },
          }

        socket.emit(EVENTS.GAME.SUCCESS_JOIN, {
          gameId: this.gameId,
          username: existingPlayer.username,
          gameMode: this.gameMode,
        })

        if (this.started) {
          socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
            gameId: this.gameId,
            gameMode: this.gameMode,
            currentQuestion: this.round.getReconnectInfo(),
            status,
            player: {
              username: existingPlayer.username,
              points: existingPlayer.points,
            },
          })
        }

        this.playerManager.broadcastCount()
        this.broadcastExtensionState()
        this.broadcastHostPresence()

        return null
      }
    }

    // 4. For brand-new joins (not rebinding an existing Player), check lock unless pre-registered in roster
    if (this._locked && !rosterEntry) {
      return "errors:game.locked"
    }

    let finalUsername = rosterEntry?.displayName ?? username

    if (this._settings.generatedUsernames && !rosterEntry) {
      const taken = this.playerManager.getAll().map((player) => player.username)
      finalUsername = createNickname(taken)
    }

    if (!finalUsername) {
      return "errors:auth.usernameTooShort"
    }

    const billingRosterId =
      rosterEntry?.rosterPlayerId ??
      claimsExtra?.rosterPlayerId ??
      generateRosterPlayerId()
    const billingIdentity =
      rosterEntry?.preRegistered ||
      normalizedPhone ||
      claimsExtra?.rosterPlayerId
        ? `roster:${billingRosterId}`
        : `client:${clientId}`
    const error = admitBilledParticipant(
      this._manager.clientId,
      this.gameId,
      billingIdentity,
      () => this.playerManager.join(socket, finalUsername),
    )

    if (error) {
      return error
    }

    this.roster.recordBrowserJoin({
      rosterEntry,
      clientId,
      finalUsername,
      normalizedPhone,
      claimsExtra: { ...claimsExtra, rosterPlayerId: billingRosterId },
    })

    if (this.extensionSession) {
      this.extensionSession.onPlayerJoin(clientId)
      this.broadcastExtensionState()
    }

    // If the game has already started when a phone/rostered participant joins, send current status
    if (this.started && this.lastBroadcastStatus) {
      socket.emit(EVENTS.GAME.STATUS, this.lastBroadcastStatus)
    }

    this.broadcastHostPresence()

    return null
  }

  /**
   * Direct server-side join/rebind for the authenticated local Yemot pilot gateway.
   * Ensures phone callers appear in PlayerManager, host leaderboard, and HostPresenceSnapshot
   * even without a browser WebSocket client.
   */
  joinOrRebindPhoneCaller(
    ...args: Parameters<GamePhoneController["joinOrRebindPhoneCaller"]>
  ) {
    return this.phone.joinOrRebindPhoneCaller(...args)
  }

  disconnectPhoneCallerByRosterId(
    ...args: Parameters<GamePhoneController["disconnectPhoneCallerByRosterId"]>
  ) {
    return this.phone.disconnectPhoneCallerByRosterId(...args)
  }

  dispose() {
    this.presentationLaunch?.dispose()
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

      if (player) this.roster.afterKick(player.clientId)

      if (this.extensionSession && player) {
        this.extensionSession.onPlayerKicked(player.clientId)
        this.broadcastExtensionState()
      }

      this.broadcastHostPresence()
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
    socket.emit(EVENTS.MANAGER.HOST_PRESENCE, this.getHostPresenceSnapshot())

    if (this.round.isCurrentlyAcceptingAnswers) {
      socket.emit(EVENTS.GAME.COOLDOWN, this.round.getRemainingSeconds())
    }

    sendSessionSnapshot(socket, {
      session: this.extensionSession,
      role: "manager",
      players: this.players,
    })

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

    this.roster.markConnected(clientId)

    this.notifyPlayerUpdated(oldSocketId, player)

    if (replacesConnection) {
      this.io.in(oldSocketId).disconnectSockets(true)
    }

    const status = this.playerStatus.get(oldSocketId) ??
      this.lastBroadcastStatus ?? {
        name: STATUS.WAIT,
        data: { text: "game:waitingForPlayers" },
      }

    if (
      status.name === STATUS.SELECT_ANSWER &&
      this.round.isCurrentlyAcceptingAnswers
    ) {
      const remaining = this.round.getRemainingSeconds()

      if (remaining !== null && remaining !== undefined) {
        ;(status.data as Record<string, unknown>).remainingTime = remaining
      }
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
    this.broadcastHostPresence()

    if (this.round.isCurrentlyAcceptingAnswers) {
      socket.emit(EVENTS.GAME.COOLDOWN, this.round.getRemainingSeconds())
    }

    sendSessionSnapshot(socket, {
      session: this.extensionSession,
      role: "player",
      players: this.players,
    })

    console.log(
      `Player ${player.username} reconnected to game ${this.inviteCode}`,
    )
  }

  // Disconnect helpers

  setManagerDisconnected() {
    this._manager.connected = false
  }

  removePlayer(socketId: string): Player | undefined {
    const existingPlayer = this.playerManager.findById(socketId)

    if (existingPlayer) {
      if (this.roster.shouldKeepParticipant(existingPlayer.clientId)) {
        this.setPlayerDisconnected(socketId, false)
        return existingPlayer
      }
      this.roster.forgetClient(existingPlayer.clientId)
    }

    const player = this.playerManager.remove(socketId)

    if (player) {
      this.io.to(this._manager.id).emit(EVENTS.MANAGER.REMOVE_PLAYER, player.id)
      this.playerManager.broadcastCount()
      this.broadcastHostPresence()
    }

    return player
  }

  setPlayerDisconnected(socketId: string, timedOut = false) {
    this.playerManager.setDisconnected(socketId)
    this.playerManager.broadcastCount()
    this.round.endIfEveryoneAnswered()

    const player = this.playerManager.findById(socketId)

    if (player) {
      this.roster.markDisconnected(player.clientId, player.points, timedOut)

      this.notifyPlayerUpdated(socketId, player, timedOut)
    }

    this.broadcastHostPresence()
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
    this.round.noteManualVoteCompletion()
    this.cooldown.abort()
  }

  getVoteCompletionReason() {
    return this.round.getVoteCompletionReason()
  }

  async start(socket: Socket) {
    if (!this.started && this.presentationLaunch?.advance()) return
    if (!this.started) {
      const away = this.playerManager.getAll().filter((p) => !p.connected)

      for (const player of away) {
        if (!this.roster.shouldKeepParticipant(player.clientId)) {
          this.removePlayer(player.id)
        }
      }
    }

    if (
      !this.started &&
      this.playerManager.count() > 0 &&
      socket.id === this._manager.id
    ) {
      const error = startBilledGame(this._manager.clientId, this.gameId)
      if (error) {
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, error)
        return
      }
    }
    await this.round.start(socket)
    this.broadcastHostPresence()
  }

  selectAnswer(socket: Socket, answerIds: number[]) {
    if (this.showCoordinator?.isSceneActive()) {
      return { accepted: false, reason: "scene_active" as const }
    }

    return this.round.selectAnswer(socket, answerIds)
  }

  advance() {
    if (this.showCoordinator?.isSceneActive()) {
      this.showCoordinator.advanceScene()

      return
    }

    this.round.advance()
  }
}

export default Game
