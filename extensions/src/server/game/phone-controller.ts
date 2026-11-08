// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type {
  GameSettings,
  Player,
  Quizz,
  QuizzMode,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  generateRosterPlayerId,
  normalizePhoneE164,
  resolveQuestionPlayMode,
} from "../../core/index"
import { isQuestionSupportedOnPstn } from "../../telephony/index"
import type { GameRoster } from "./roster/index"
import type { ExtensionGameSession } from "./session"
import type { StudioShowCoordinator } from "./studio-show-coordinator"

export interface PhoneRoundPort {
  readonly currentEpoch: number
  readonly currentQuestionIndex: number
  readonly isCurrentlyAcceptingAnswers: boolean
  readonly isPaused: boolean
  isSurvey(): boolean
  hasPlayerAnswered(id: string): boolean
  selectAnswer(socket: Socket, ids: number[]): unknown
  updatePlayerId(previous: string, next: string): void
}

export interface PhonePlayerPort {
  findByClientId(id: string): Player | undefined
  join(socket: Socket, name: string): string | null
  updateSocketId(previous: string, next: string): void
  broadcastCount(): void
}

export interface PhoneGamePorts {
  gameId: string
  inviteCode: string
  gameMode: QuizzMode
  quizz: Quizz
  io: Server
  roster: GameRoster
  round: PhoneRoundPort
  players: PhonePlayerPort
  started(): boolean
  settings(): GameSettings
  locked(): boolean
  session(): ExtensionGameSession | null
  coordinator(): StudioShowCoordinator | null
  admitPhone(identity: string, callId: string, join: () => string | null): string | null
  finishPhone(callId: string | undefined): void
  notifyPlayerUpdated(previous: string, player: Player, timedOut: boolean): void
  broadcastExtensionState(): void
  broadcastHostPresence(): void
  setPlayerDisconnected(id: string, timedOut: boolean): void
}

// Phone identity, gateway projections and synthetic transport live outside upstream Game.
// The injected round remains the sole authority for accepting and scoring answers.
//
export class GamePhoneController {
  private readonly ports: PhoneGamePorts
  constructor(ports: PhoneGamePorts) {
    this.ports = ports
  }
  private get gameId() {
    return this.ports.gameId
  }
  private get inviteCode() {
    return this.ports.inviteCode
  }
  private get gameMode() {
    return this.ports.gameMode
  }
  private get quizz() {
    return this.ports.quizz
  }
  private get io() {
    return this.ports.io
  }
  private get roster() {
    return this.ports.roster
  }
  private get round() {
    return this.ports.round
  }
  private get playerManager() {
    return this.ports.players
  }
  private get started() {
    return this.ports.started()
  }
  private get _settings() {
    return this.ports.settings()
  }
  private get _locked() {
    return this.ports.locked()
  }
  private get extensionSession() {
    return this.ports.session()
  }
  private get showCoordinator() {
    return this.ports.coordinator()
  }
  private notifyPlayerUpdated(
    previous: string,
    player: Player,
    timedOut: boolean,
  ) {
    this.ports.notifyPlayerUpdated(previous, player, timedOut)
  }
  private broadcastExtensionState() {
    this.ports.broadcastExtensionState()
  }
  private broadcastHostPresence() {
    this.ports.broadcastHostPresence()
  }
  private setPlayerDisconnected(id: string, timedOut: boolean) {
    this.ports.setPlayerDisconnected(id, timedOut)
  }
  getCurrentQuestionPstnSupport(): {
    supported: boolean
    reason?: string
    answersCount: number
    maxAnswerIndex: number
    isSurvey: boolean
    epoch: number
  } {
    const epoch =
      this.extensionSession?.currentEpoch ??
      (this.started ? this.round.currentEpoch : 0)

    if (!this.started || this.showCoordinator?.isSceneActive()) {
      return {
        supported: false,
        reason: "no_active_question",
        answersCount: 0,
        maxAnswerIndex: -1,
        isSurvey: false,
        epoch,
      }
    }

    const currentQ = this.quizz.questions[this.round.currentQuestionIndex]

    if (!currentQ) {
      return {
        supported: false,
        reason: "no_active_question",
        answersCount: 0,
        maxAnswerIndex: -1,
        isSurvey: false,
        epoch,
      }
    }

    const answersCount = currentQ.answers?.length ?? 0
    const playMode = resolveQuestionPlayMode(currentQ, this.gameMode)
    const check = isQuestionSupportedOnPstn(
      this.gameMode,
      currentQ.type,
      answersCount,
      playMode,
    )

    return {
      supported: check.supported,
      reason: check.reason,
      answersCount,
      maxAnswerIndex: answersCount - 1,
      isSurvey: this.round.isSurvey(),
      epoch,
    }
  }

  getQuestionStateForGateway(rosterPlayerId?: string) {
    const pstn = this.getCurrentQuestionPstnSupport()

    if (this.showCoordinator?.isSceneActive()) {
      const entry = rosterPlayerId
        ? this.roster.entries.get(rosterPlayerId)
        : null
      const player = entry?.clientId
        ? this.playerManager.findByClientId(entry.clientId)
        : undefined
      const verdict = rosterPlayerId
        ? (this.roster.verdicts.get(rosterPlayerId) ?? null)
        : null

      return {
        gameId: this.gameId,
        inviteCode: this.inviteCode,
        started: this.started,
        gameMode: this.gameMode,
        epoch: this.showCoordinator.currentEpoch,
        questionIndex: this.round.currentQuestionIndex,
        acceptingAnswers: false,
        answeredCurrentQuestion: true,
        points: player?.points ?? entry?.points ?? 0,
        lastVerdict: verdict,
        answersCount: pstn.answersCount,
        maxAnswerIndex: pstn.maxAnswerIndex,
        isSurvey: pstn.isSurvey,
        isSupportedOnPstn: pstn.supported,
      }
    }

    const epoch =
      this.extensionSession?.currentEpoch ??
      (this.started ? this.round.currentEpoch : 0)
    const entry = rosterPlayerId
      ? this.roster.entries.get(rosterPlayerId)
      : null
    const player = entry?.clientId
      ? this.playerManager.findByClientId(entry.clientId)
      : undefined
    const answered = player ? this.round.hasPlayerAnswered(player.id) : false
    const verdict = rosterPlayerId
      ? (this.roster.verdicts.get(rosterPlayerId) ?? null)
      : null

    return {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      started: this.started,
      gameMode: this.gameMode,
      epoch,
      questionIndex: this.round.currentQuestionIndex,
      acceptingAnswers: this.round.isCurrentlyAcceptingAnswers,
      answeredCurrentQuestion: answered,
      points: player?.points ?? entry?.points ?? 0,
      lastVerdict: verdict,
      answersCount: pstn.answersCount,
      maxAnswerIndex: pstn.maxAnswerIndex,
      isSurvey: pstn.isSurvey,
      isSupportedOnPstn: pstn.supported,
    }
  }

  /**
   * Direct server-side answer evaluation for authenticated gateway/telephony session.
   * Returns immediate acceptance status and whether verdict is known now or delayed until reveal.
   */
  submitPhoneAnswerByRosterId(
    rosterPlayerId: string,
    zeroBasedAnswerIndex: number,
    callId?: string,
  ): {
    accepted: boolean
    epoch: number
    correct?: boolean
    verdictPending?: boolean
    isSurvey?: boolean
    reason?: string
  } {
    const pstn = this.getCurrentQuestionPstnSupport()
    const { epoch } = pstn

    if (this.showCoordinator?.isSceneActive()) {
      return {
        accepted: false,
        epoch,
        reason: "scene_active",
      }
    }

    if (this.round.isPaused) {
      return {
        accepted: false,
        epoch,
        reason: "game_paused",
      }
    }

    if (!pstn.supported) {
      return {
        accepted: false,
        epoch,
        reason: pstn.reason ?? "unsupported_question_type",
      }
    }

    if (
      typeof zeroBasedAnswerIndex !== "number" ||
      !Number.isInteger(zeroBasedAnswerIndex) ||
      zeroBasedAnswerIndex < 0 ||
      zeroBasedAnswerIndex > pstn.maxAnswerIndex
    ) {
      return {
        accepted: false,
        epoch,
        reason: "invalid_answer_index",
      }
    }

    if (!this.started || !this.round.isCurrentlyAcceptingAnswers) {
      return {
        accepted: false,
        epoch,
        reason: "not_accepting_answers",
      }
    }

    const entry = this.roster.entries.get(rosterPlayerId)

    if (!entry?.clientId) {
      return {
        accepted: false,
        epoch,
        reason: "player_not_joined",
      }
    }

    if (callId && entry.activeCallId && entry.activeCallId !== callId) {
      return {
        accepted: false,
        epoch,
        reason: "stale_call",
      }
    }

    const player = this.playerManager.findByClientId(entry.clientId)

    if (!player) {
      return {
        accepted: false,
        epoch,
        reason: "player_not_found",
      }
    }

    if (this.round.hasPlayerAnswered(player.id)) {
      return {
        accepted: false,
        epoch,
        reason: "duplicate_answer",
      }
    }

    entry.lastSeenAt = Date.now()
    // Construct a minimal Socket-compatible shim for RoundManager.selectAnswer
    const fakeSocket = {
      id: player.id,
      data: { clientId: player.clientId, role: "player" },
      to: (room: string) => this.io.to(room),
      emit: (ev: string, payload: unknown) => {
        ;(
          this.io.to(player.id) as unknown as {
            emit: (_e: string, _p: unknown) => void
          }
        ).emit(ev, payload)
      },
    } as unknown as Socket

    this.round.selectAnswer(fakeSocket, [zeroBasedAnswerIndex])

    const nowAnswered = this.round.hasPlayerAnswered(player.id)

    if (!nowAnswered) {
      return {
        accepted: false,
        epoch,
        reason: "rejected_by_engine",
      }
    }

    if (this.round.isSurvey()) {
      return {
        accepted: true,
        epoch,
        isSurvey: true,
        verdictPending: false,
      }
    }

    // Note: if this was the last connected player to answer, RoundManager immediately
    // aborts cooldown and runs showResults() synchronously or right after!
    const verdict = this.roster.verdicts.get(rosterPlayerId)

    if (verdict?.epoch === epoch) {
      return {
        accepted: true,
        epoch,
        correct: verdict.correct,
        verdictPending: false,
      }
    }

    return {
      accepted: true,
      epoch,
      verdictPending: true,
    }
  }

  joinOrRebindPhoneCaller(input: {
    rosterPlayerId?: string
    phoneRaw?: string | null
    callId: string
    fallbackName?: string
  }): {
    ok: boolean
    error?: string
    rosterPlayerId?: string
    clientId?: string
    displayName?: string
    phoneE164?: string | null
    reconnected?: boolean
    points?: number
  } {
    const normalizedPhone = input.phoneRaw
      ? normalizePhoneE164(input.phoneRaw)
      : null

    let rosterEntry = input.rosterPlayerId
      ? this.roster.entries.get(input.rosterPlayerId)
      : undefined

    if (!input.rosterPlayerId && normalizedPhone) {
      const id = this.roster.phoneIndex.get(normalizedPhone)
      rosterEntry = id ? this.roster.entries.get(id) : undefined
    }

    if (!rosterEntry && this._settings.phoneInviteOnly) {
      return {
        ok: false,
        error: "errors:game.locked",
      }
    }

    if (!rosterEntry && this._locked) {
      return {
        ok: false,
        error: "errors:game.locked",
      }
    }

    const now = Date.now()
    const syntheticSocketId = `phone-sock-${input.callId}`

    // Rebind if already in roster and has a Player
    if (rosterEntry?.clientId) {
      const existingPlayer = this.playerManager.findByClientId(
        rosterEntry.clientId,
      )

      if (existingPlayer) {
        const oldSocketId = existingPlayer.id
        const billingError = this.ports.admitPhone(`roster:${rosterEntry.rosterPlayerId}`, input.callId, () => null)
        if (billingError) return { ok: false, error: billingError }
        if (rosterEntry.activeCallId !== input.callId) this.ports.finishPhone(rosterEntry.activeCallId)
        this.playerManager.updateSocketId(oldSocketId, syntheticSocketId)
        this.round.updatePlayerId(oldSocketId, syntheticSocketId)
        existingPlayer.connected = true
        rosterEntry.status = "connected"
        rosterEntry.timedOut = false
        rosterEntry.lastSeenAt = now
        rosterEntry.source = "phone"
        rosterEntry.activeCallId = input.callId

        this.notifyPlayerUpdated(oldSocketId, existingPlayer, false)
        this.playerManager.broadcastCount()
        this.broadcastExtensionState()
        this.broadcastHostPresence()

        return {
          ok: true,
          rosterPlayerId: rosterEntry.rosterPlayerId,
          clientId: existingPlayer.clientId,
          displayName: existingPlayer.username,
          phoneE164: rosterEntry.phoneE164,
          reconnected: true,
          points: existingPlayer.points,
        }
      }
    }

    const rId = rosterEntry?.rosterPlayerId ?? generateRosterPlayerId()
    const clientId = rosterEntry?.clientId ?? `phone-client-${rId}`
    const suffix = normalizedPhone
      ? normalizedPhone.slice(-4)
      : input.callId.slice(-4).padStart(4, "0")
    const displayName =
      rosterEntry?.displayName ?? input.fallbackName ?? `Caller_${suffix}`

    const fakeSocket = {
      id: syntheticSocketId,
      data: { clientId, role: "player" },
      join: (_room: string) => undefined,
      to: (room: string) => this.io.to(room),
      emit: (_event: string) => false,
    } as unknown as Socket

    const joinErr = this.ports.admitPhone(`roster:${rId}`, input.callId, () => this.playerManager.join(fakeSocket, displayName))

    if (joinErr) {
      return { ok: false, error: joinErr }
    }

    if (rosterEntry) {
      rosterEntry.clientId = clientId
      rosterEntry.status = "connected"
      rosterEntry.timedOut = false
      rosterEntry.lastSeenAt = now
      rosterEntry.source = "phone"
      rosterEntry.activeCallId = input.callId
    } else {
      rosterEntry = {
        rosterPlayerId: rId,
        clientId,
        displayName,
        phoneE164: normalizedPhone,
        phoneRaw: input.phoneRaw ?? undefined,
        source: "phone",
        status: "connected",
        timedOut: false,
        points: 0,
        lastSeenAt: now,
        preRegistered: false,
        activeCallId: input.callId,
      }
      this.roster.entries.set(rId, rosterEntry)

      if (normalizedPhone) {
        this.roster.phoneIndex.set(normalizedPhone, rId)
      }
    }

    this.roster.clientIndex.set(clientId, rId)

    if (this.extensionSession) {
      this.extensionSession.onPlayerJoin(clientId)
      this.broadcastExtensionState()
    }

    this.broadcastHostPresence()

    return {
      ok: true,
      rosterPlayerId: rId,
      clientId,
      displayName,
      phoneE164: normalizedPhone,
      reconnected: false,
      points: 0,
    }
  }

  disconnectPhoneCallerByRosterId(
    rosterPlayerId: string,
    timedOut = false,
    callId?: string,
  ): boolean {
    const entry = this.roster.entries.get(rosterPlayerId)

    if (!entry) {
      return false
    }

    // If a callId was provided and does not match the currently bound callId, this hangup is stale!
    this.ports.finishPhone(callId ?? entry.activeCallId)
    if (callId && entry.activeCallId && entry.activeCallId !== callId) {
      return false
    }

    entry.status = "disconnected"
    entry.timedOut = timedOut
    entry.lastSeenAt = Date.now()

    if (entry.clientId) {
      const player = this.playerManager.findByClientId(entry.clientId)

      if (player) {
        this.setPlayerDisconnected(player.id, timedOut)

        return true
      }
    }

    this.broadcastHostPresence()

    return true
  }
}
