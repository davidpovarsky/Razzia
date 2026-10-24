import { EVENTS, QUIZZ_MODES } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { MockSocketConnection } from "./mock-socket-connection"

export { MockSocketConnection }

export interface HttpClient {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

export type SocketEventHandler = (...args: unknown[]) => void

export interface SocketConnection {
  readonly id: string
  readonly connected: boolean
  emit(event: string, ...args: unknown[]): void
  on(event: string, handler: SocketEventHandler): void
  off(event: string, handler: SocketEventHandler): void
  disconnect(): void
}

export type SocketFactory = (
  url: string,
  options: {
    path: string
    auth: { token: string }
  },
) => SocketConnection

export interface RazziaTransport {
  http: HttpClient
  createSocket: SocketFactory
}

export interface MockGameConfig {
  gameId: string
  inviteCode: string
  gameMode?: string
  locked?: boolean
  managerId?: string
}

export interface MockQuestionState {
  index: number
  epoch: number
  question: string
  answers: string[]
  questionType: string
  options?: unknown
  acceptingAnswers: boolean
}

export interface MockPlayerAnswerRecord {
  socketId: string
  clientId: string
  gameId: string
  epoch: number
  answerKeys: number[]
  serverReceivedAt: number
}

/**
 * In-memory Mock Razzia Transport for fully isolated testing and offline simulation.
 * Faithfully mimics Razzia's HTTP routes (/api/auth/session, /api/games/join)
 * and Socket.IO player lifecycle.
 */
export class MockRazziaTransport implements RazziaTransport {
  private games = new Map<string, MockGameConfig>()
  private sessions = new Map<
    string,
    { token: string; clientId: string; role: string; expiresAt: number }
  >()
  private tickets = new Map<
    string,
    { ticket: string; clientId: string; gameId: string; username: string }
  >()
  private activeSockets = new Map<string, MockSocketConnection>()
  private questionStates = new Map<string, MockQuestionState>()
  private recordedAnswers: MockPlayerAnswerRecord[] = []

  private idCounter = 1

  registerGame(game: MockGameConfig): void {
    this.games.set(game.inviteCode, game)
  }

  getGameByInviteCode(inviteCode: string): MockGameConfig | undefined {
    return this.games.get(inviteCode)
  }

  getGameById(gameId: string): MockGameConfig | undefined {
    for (const g of this.games.values()) {
      if (g.gameId === gameId) {
        return g
      }
    }

    return undefined
  }

  getRecordedAnswers(): MockPlayerAnswerRecord[] {
    return [...this.recordedAnswers]
  }

  clearRecordedAnswers(): void {
    this.recordedAnswers = []
  }

  /**
   * Triggers question state change for all players connected to the game.
   */
  startQuestion(
    gameId: string,
    questionState: Omit<MockQuestionState, "acceptingAnswers">,
  ): void {
    const state: MockQuestionState = {
      ...questionState,
      acceptingAnswers: true,
    }
    this.questionStates.set(gameId, state)

    for (const socket of this.activeSockets.values()) {
      if (socket.currentGameId === gameId && socket.connected) {
        // 1. Emit standard SELECT_ANSWER status
        socket.triggerServerEvent(EVENTS.GAME.STATUS, STATUS.SELECT_ANSWER, {
          question: state.question,
          answers: state.answers,
          time: 20,
          totalPlayer: 1,
          questionType: state.questionType,
          answersOnly: false,
        })

        // 2. Emit extensions:state envelope
        socket.triggerServerEvent("extensions:state", {
          v: 1,
          gameId,
          seq: state.index + 1,
          epoch: state.epoch,
          phase: "answers",
          startedAt: Date.now(),
          extras: {},
        })
      }
    }
  }

  /**
   * Concludes question and shows results.
   */
  showResults(gameId: string): void {
    const state = this.questionStates.get(gameId)

    if (state) {
      state.acceptingAnswers = false
    }

    for (const socket of this.activeSockets.values()) {
      if (socket.currentGameId === gameId && socket.connected) {
        socket.triggerServerEvent(EVENTS.GAME.STATUS, STATUS.SHOW_RESULT, {
          correct: true,
          message: "Results revealed",
          points: 100,
          myPoints: 100,
          rank: 1,
          aheadOfMe: null,
        })
      }
    }
  }

  // --- HttpClient Implementation ---
  readonly http: HttpClient = {
    fetch: async (url: string, init?: RequestInit): Promise<Response> => {
      await Promise.resolve()
      const parsedUrl = new URL(url, "http://localhost:3001")
      const { pathname } = parsedUrl
      const method = (init?.method ?? "GET").toUpperCase()

      // 1. POST /api/auth/session
      if (pathname === "/api/auth/session" && method === "POST") {
        const clientId = `client_${this.idCounter}`
        this.idCounter += 1
        const token = `token_${clientId}_${Date.now()}`
        const session = {
          token,
          clientId,
          role: "player",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        }
        this.sessions.set(token, session)

        return new Response(JSON.stringify(session), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      // 2. POST /api/games/join
      if (pathname === "/api/games/join" && method === "POST") {
        const authHeader =
          init?.headers instanceof Headers
            ? init.headers.get("Authorization")
            : ((init?.headers as Record<string, string> | undefined)
                ?.Authorization ??
              (init?.headers as Record<string, string> | undefined)
                ?.authorization)

        const token = authHeader?.replace(/^Bearer\s+/, "")
        const session = token ? this.sessions.get(token) : undefined

        if (!session) {
          return new Response(
            JSON.stringify({ error: "errors:auth.unauthorized" }),
            { status: 401, headers: { "content-type": "application/json" } },
          )
        }

        let bodyObj: Record<string, unknown> = {}

        if (typeof init?.body === "string") {
          try {
            const parsed: unknown = JSON.parse(init.body)

            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              bodyObj = parsed as Record<string, unknown>
            }
          } catch {
            bodyObj = {}
          }
        }

        const inviteCode =
          typeof bodyObj.inviteCode === "string" ? bodyObj.inviteCode : ""
        const username =
          typeof bodyObj.username === "string" ? bodyObj.username : undefined

        if (!inviteCode || !/^\d{6}$/.test(inviteCode)) {
          return new Response(
            JSON.stringify({ error: "errors:game.invalidInviteCode" }),
            { status: 400, headers: { "content-type": "application/json" } },
          )
        }

        const game = this.games.get(inviteCode)

        if (!game) {
          return new Response(
            JSON.stringify({ error: "errors:game.notFound" }),
            { status: 404, headers: { "content-type": "application/json" } },
          )
        }

        if (game.locked) {
          return new Response(JSON.stringify({ error: "errors:game.locked" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          })
        }

        const effectiveUsername = username ?? `Player_${session.clientId}`
        const ticket = `ticket_${session.clientId}_${game.gameId}_${Date.now()}`
        this.tickets.set(ticket, {
          ticket,
          clientId: session.clientId,
          gameId: game.gameId,
          username: effectiveUsername,
        })

        return new Response(
          JSON.stringify({
            gameId: game.gameId,
            ticket,
            username: effectiveUsername,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }

      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    },
  }

  // --- SocketFactory Implementation ---
  readonly createSocket: SocketFactory = (
    _url: string,
    options: { path: string; auth: { token: string } },
  ): SocketConnection => {
    const socketId = `socket_${this.idCounter}`
    this.idCounter += 1
    const session = this.sessions.get(options.auth.token)

    const socket = new MockSocketConnection(
      socketId,
      session?.clientId ?? "anonymous",
      this,
    )
    this.activeSockets.set(socketId, socket)

    return socket
  }

  /**
   * Internal handler called when a socket emits an event.
   */
  handleSocketEmit(
    socket: MockSocketConnection,
    event: string,
    data: unknown,
  ): void {
    if (event === EVENTS.PLAYER.LOGIN) {
      const loginData =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : undefined
      const ticket =
        typeof loginData?.ticket === "string" ? loginData.ticket : undefined
      const ticketRecord = ticket ? this.tickets.get(ticket) : undefined

      if (!ticketRecord || ticketRecord.clientId !== socket.clientId) {
        socket.triggerServerEvent(
          EVENTS.GAME.RESET,
          "errors:auth.joinTicketInvalid",
        )

        return
      }

      const game = this.getGameById(ticketRecord.gameId)

      if (!game) {
        socket.triggerServerEvent(EVENTS.GAME.RESET, "errors:game.notFound")

        return
      }

      socket.currentGameId = game.gameId
      socket.currentUsername = ticketRecord.username

      // Emit success join to player
      socket.triggerServerEvent(EVENTS.GAME.SUCCESS_JOIN, {
        gameId: game.gameId,
        username: ticketRecord.username,
        gameMode: game.gameMode ?? QUIZZ_MODES.QUIZ,
      })

      return
    }

    if (event === EVENTS.PLAYER.SELECTED_ANSWER) {
      const selData =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : undefined
      const gameId = typeof selData?.gameId === "string" ? selData.gameId : ""
      const answerData =
        selData?.data && typeof selData.data === "object"
          ? (selData.data as Record<string, unknown>)
          : undefined
      const rawKeys = answerData?.answerKeys
      const answerKeys: number[] = Array.isArray(rawKeys)
        ? rawKeys.filter((k): k is number => typeof k === "number")
        : []
      const questionState = this.questionStates.get(gameId)

      // Only accept if currently accepting answers
      if (!questionState || !questionState.acceptingAnswers) {
        return
      }

      // Check if duplicate for this socket and epoch
      const alreadyAnswered = this.recordedAnswers.some(
        (a) =>
          a.socketId === socket.id &&
          a.gameId === gameId &&
          a.epoch === questionState.epoch,
      )

      if (alreadyAnswered) {
        return
      }

      // Server scoring clock authoritative: record answer with server receipt timestamp
      this.recordedAnswers.push({
        socketId: socket.id,
        clientId: socket.clientId,
        gameId,
        epoch: questionState.epoch,
        answerKeys,
        serverReceivedAt: Date.now(),
      })

      // Send WAIT status back to player
      socket.triggerServerEvent(EVENTS.GAME.STATUS, STATUS.WAIT, {
        text: "game:waitingForAnswers",
      })

      return
    }

    if (event === EVENTS.PLAYER.RECONNECT) {
      const recData =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : undefined
      const gameId = typeof recData?.gameId === "string" ? recData.gameId : ""
      const game = gameId ? this.getGameById(gameId) : undefined

      if (game) {
        socket.currentGameId = game.gameId
        socket.triggerServerEvent(EVENTS.PLAYER.SUCCESS_RECONNECT, {
          gameId: game.gameId,
          username: socket.currentUsername ?? "Reconnected Player",
        })
      } else {
        socket.triggerServerEvent(EVENTS.GAME.RESET, "errors:game.notFound")
      }
    }
  }

  handleSocketDisconnect(socketId: string): void {
    this.activeSockets.delete(socketId)
  }
}
