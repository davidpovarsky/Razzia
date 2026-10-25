import { EVENTS } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import type {
  RazziaTransport,
  SocketConnection,
  SocketEventHandler,
} from "./transport"
import { isQuestionSupportedOnPstn, telephonyLogger } from "./types"

export interface RazziaSocketClientConfig {
  baseUrl?: string
  wsPath?: string
  transport: RazziaTransport
}

export interface ClientGameState {
  joined: boolean
  gameId: string | null
  inviteCode: string | null
  username: string | null
  rosterPlayerId: string | null
  gameMode: string | null
  status: Status | null
  phase: string | null
  currentEpoch: number
  questionType: string | null
  answersCount: number
  acceptingAnswers: boolean
  lastSubmittedEpoch: number | null
  lastSubmittedAnswer: number | null
  lastResult: {
    epoch: number
    correct: boolean
    points: number
    myPoints: number
  } | null
  error: string | null
}

export type StateChangeCallback = (state: ClientGameState) => void

/**
 * Razzia client implementing the authentic participant protocol over HTTP & Socket.IO.
 * Interacts only via public documented APIs, never bypassing socket auth or directly calling RoundManager.
 */
export class RazziaSocketClient {
  private readonly baseUrl: string
  private readonly wsPath: string
  private readonly transport: RazziaTransport

  private token: string | null = null
  private clientId: string | null = null
  private socket: SocketConnection | null = null
  private stateChangeListeners = new Set<StateChangeCallback>()

  private state: ClientGameState = {
    joined: false,
    gameId: null,
    inviteCode: null,
    username: null,
    rosterPlayerId: null,
    gameMode: null,
    status: null,
    phase: null,
    currentEpoch: 0,
    questionType: null,
    answersCount: 0,
    acceptingAnswers: false,
    lastSubmittedEpoch: null,
    lastSubmittedAnswer: null,
    lastResult: null,
    error: null,
  }

  constructor(config: RazziaSocketClientConfig) {
    this.baseUrl = config.baseUrl ?? "http://localhost:3001"
    this.wsPath = config.wsPath ?? "/ws"
    this.transport = config.transport
  }

  getState(): Readonly<ClientGameState> {
    return { ...this.state }
  }

  getToken(): string | null {
    return this.token
  }

  getClientId(): string | null {
    return this.clientId
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected)
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.stateChangeListeners.add(cb)

    return () => this.stateChangeListeners.delete(cb)
  }

  private updateState(partial: Partial<ClientGameState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.stateChangeListeners) {
      listener(this.state)
    }
  }

  /**
   * Step 1: POST /api/auth/session to get or refresh session token.
   */
  async authenticateSession(): Promise<string> {
    const res = await this.transport.http.fetch(
      `${this.baseUrl}/api/auth/session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      },
    )

    if (!res.ok) {
      throw new Error(`Failed to establish session: HTTP ${res.status}`)
    }

    const data = (await res.json()) as {
      token: string
      clientId: string
      role: string
    }
    this.token = data.token
    this.clientId = data.clientId

    return data.token
  }

  /**
   * Step 2 & 3: Join game with invite code and username, connect Socket.IO, and login.
   */
  async joinGame(
    inviteCode: string,
    username: string,
    options?: {
      phone?: string | null
      source?: "web" | "phone"
    },
  ): Promise<{
    gameId: string
    username: string
    rosterPlayerId: string | null
  }> {
    if (!this.token) {
      await this.authenticateSession()
    }

    // POST /api/games/join
    const joinRes = await this.transport.http.fetch(
      `${this.baseUrl}/api/games/join`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          inviteCode,
          username,
          ...(options?.phone ? { phone: options.phone } : {}),
          ...(options?.source ? { source: options.source } : {}),
        }),
      },
    )

    if (!joinRes.ok) {
      const errData = (await joinRes.json().catch(() => ({}))) as {
        error?: string
      }
      const errMsg = errData.error ?? `Join failed with HTTP ${joinRes.status}`
      this.updateState({ error: errMsg })
      throw new Error(errMsg)
    }

    const {
      gameId,
      ticket,
      username: joinedName,
      rosterPlayerId = null,
    } = (await joinRes.json()) as {
      gameId: string
      ticket: string | null
      username: string
      rosterPlayerId?: string | null
    }

    this.updateState({
      gameId,
      inviteCode,
      username: joinedName,
      rosterPlayerId,
      error: null,
    })

    // Connect Socket.IO
    this.socket = this.transport.createSocket(this.baseUrl, {
      path: this.wsPath,
      auth: { token: this.token ?? "" },
    })

    this.attachSocketHandlers()

    // If ticket received, complete Step 4: PLAYER.LOGIN
    if (ticket) {
      await this.loginWithTicket(ticket)
    } else {
      // Re-joining existing player session
      this.socket.emit(EVENTS.PLAYER.RECONNECT, { gameId })
    }

    return {
      gameId,
      username: this.state.username ?? joinedName,
      rosterPlayerId,
    }
  }

  /**
   * Step 4: Emit PLAYER.LOGIN and wait for GAME.SUCCESS_JOIN.
   */
  private loginWithTicket(ticket: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not initialized"))

        return
      }

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error("Timeout waiting for GAME.SUCCESS_JOIN"))
      }, 5000)

      const onJoinSuccess: SocketEventHandler = (...args: unknown[]) => {
        const payload = args[0] as {
          gameId: string
          username: string
          gameMode: string
        }
        cleanup()
        this.updateState({
          joined: true,
          gameId: payload.gameId,
          username: payload.username,
          gameMode: payload.gameMode,
        })
        resolve()
      }

      const onReset: SocketEventHandler = (...args: unknown[]) => {
        const errorMsg = typeof args[0] === "string" ? args[0] : "Game reset"
        cleanup()
        this.updateState({ error: errorMsg })
        reject(new Error(errorMsg))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.socket?.off(EVENTS.GAME.SUCCESS_JOIN, onJoinSuccess)
        this.socket?.off(EVENTS.GAME.RESET, onReset)
      }

      this.socket.on(EVENTS.GAME.SUCCESS_JOIN, onJoinSuccess)
      this.socket.on(EVENTS.GAME.RESET, onReset)

      this.socket.emit(EVENTS.PLAYER.LOGIN, { ticket })
    })
  }

  /**
   * Listens for authoritative game status events from the server.
   */
  private attachSocketHandlers(): void {
    if (!this.socket) {
      return
    }

    this.socket.on(EVENTS.GAME.STATUS, (...args: unknown[]) => {
      // Support both (status, data) and ({ name, data }) shapes
      let status: Status = STATUS.WAIT
      let data: Record<string, unknown> | undefined = undefined

      if (
        args[0] &&
        typeof args[0] === "object" &&
        "name" in (args[0] as Record<string, unknown>)
      ) {
        const envelope = args[0] as {
          name: Status
          data?: Record<string, unknown>
        }
        ;({ name: status, data } = envelope)
      } else {
        status = args[0] as Status
        data =
          args[1] && typeof args[1] === "object"
            ? (args[1] as Record<string, unknown>)
            : undefined
      }

      telephonyLogger.info(`Game status update: ${status}`)

      if (status === STATUS.SELECT_ANSWER) {
        const rawAnswers = data?.answers
        const answersCount = Array.isArray(rawAnswers) ? rawAnswers.length : 0
        const qType =
          typeof data?.questionType === "string" ? data.questionType : "single"

        this.updateState({
          status,
          questionType: qType,
          answersCount,
          acceptingAnswers: true,
        })
      } else if (status === STATUS.SHOW_RESULT) {
        const correct = Boolean(data?.correct)
        const points = typeof data?.points === "number" ? data.points : 0
        const myPoints = typeof data?.myPoints === "number" ? data.myPoints : 0

        this.updateState({
          status,
          acceptingAnswers: false,
          lastResult: {
            epoch: this.state.currentEpoch,
            correct,
            points,
            myPoints,
          },
        })
      } else if (status === STATUS.FINISHED) {
        this.updateState({
          status,
          acceptingAnswers: false,
        })
      } else {
        this.updateState({ status })
      }
    })

    // Listen to extension state envelope if emitted
    this.socket.on("extensions:state", (...args: unknown[]) => {
      const envelope =
        args[0] && typeof args[0] === "object"
          ? (args[0] as Record<string, unknown>)
          : undefined

      if (envelope) {
        const epoch =
          typeof envelope.epoch === "number"
            ? envelope.epoch
            : this.state.currentEpoch
        const phase = typeof envelope.phase === "string" ? envelope.phase : null

        this.updateState({
          currentEpoch: epoch,
          phase,
        })
      }
    })

    this.socket.on(EVENTS.PLAYER.SUCCESS_RECONNECT, (...args: unknown[]) => {
      const payload =
        args[0] && typeof args[0] === "object"
          ? (args[0] as Record<string, unknown>)
          : undefined

      this.updateState({
        joined: true,
        gameId: typeof payload?.gameId === "string" ? payload.gameId : null,
        username: typeof payload?.username === "string" ? payload.username : "",
      })
    })

    this.socket.on(EVENTS.GAME.RESET, (...args: unknown[]) => {
      const errorMsg = typeof args[0] === "string" ? args[0] : "Game reset"

      this.updateState({
        joined: false,
        acceptingAnswers: false,
        error: errorMsg,
      })
    })
  }

  /**
   * Step 5: Submits an answer key index (0-based) to the game.
   * Only accepted during SELECT_ANSWER phase.
   * Server scoring clock is authoritative.
   */
  selectAnswer(zeroBasedIndex: number): {
    success: boolean
    error?: string
  } {
    if (!this.socket || !this.state.joined || !this.state.gameId) {
      return { success: false, error: "Not joined to an active game" }
    }

    if (!this.state.acceptingAnswers) {
      return {
        success: false,
        error: "Game is not currently accepting answers",
      }
    }

    // Check PSTN compatibility
    const support = isQuestionSupportedOnPstn(
      this.state.gameMode ?? "quiz",
      this.state.questionType ?? "single",
      this.state.answersCount,
    )

    if (!support.supported) {
      return { success: false, error: support.reason }
    }

    if (zeroBasedIndex < 0 || zeroBasedIndex > 3) {
      return {
        success: false,
        error: `Answer index ${zeroBasedIndex} out of range [0..3]`,
      }
    }

    // Emit standard PLAYER.SELECTED_ANSWER
    this.socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId: this.state.gameId,
      data: {
        answerKeys: [zeroBasedIndex],
      },
    })

    this.updateState({
      lastSubmittedEpoch: this.state.currentEpoch,
      lastSubmittedAnswer: zeroBasedIndex,
      // Player can only submit once per question
      acceptingAnswers: false,
    })

    return { success: true }
  }

  /**
   * Reconnects to the active game using existing session token.
   */
  reconnect(): void {
    if (this.socket && this.state.gameId) {
      this.socket.emit(EVENTS.PLAYER.RECONNECT, {
        gameId: this.state.gameId,
      })
    }
  }

  /**
   * Leaves game and disconnects socket.
   */
  disconnect(): void {
    if (this.socket) {
      if (this.state.gameId) {
        this.socket.emit(EVENTS.PLAYER.LEAVE, { gameId: this.state.gameId })
      }

      this.socket.disconnect()
      this.socket = null
    }

    this.updateState({
      joined: false,
      acceptingAnswers: false,
    })
    this.stateChangeListeners.clear()
  }
}
