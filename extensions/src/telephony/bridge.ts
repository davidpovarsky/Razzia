import {
  isQuestionSupportedOnPstn,
  isValidPin,
  mapDtmfToAnswerIndex,
  redactPhoneNumber,
  telephonyLogger,
  TELEPHONY_CONSTANTS,
  type InboundWebhookRequest,
  type SessionState,
  type TelephonyCallSession,
  type TelephonyDirective,
  type TelephonyEvent,
  type TelephonyResult,
} from "./types"
import type { TelephonyProvider } from "./provider"
import { ProviderRegistry } from "./provider"
import { RazziaSocketClient } from "./socket-client"
import type { RazziaTransport } from "./transport"

export interface TelephonyBridgeOptions {
  transport: RazziaTransport
  provider?: TelephonyProvider
  maxSessions?: number
  replayTtlMs?: number
  maxSkewMs?: number
  digitRateLimitPerSec?: number
  baseUrl?: string
}

/**
 * TelephonyBridge orchestrates incoming telephony events across providers,
 * manages per-call session state, enforces idempotency per (callId, gameId, epoch),
 * validates 6-digit PINs, throttles DTMF input, and coordinates authenticated Razzia participation.
 */
export class TelephonyBridge {
  private readonly transport: RazziaTransport
  private readonly maxSessions: number
  private readonly replayTtlMs: number
  private readonly digitRateLimitPerSec: number
  private readonly baseUrl: string

  private sessions = new Map<string, TelephonyCallSession>()
  private clients = new Map<string, RazziaSocketClient>()
  // Processed answers idempotency set: `${callId}:${gameId}:${epoch}` -> expiresAt
  private processedAnswers = new Map<string, number>()

  private participantCounter = 1

  constructor(options: TelephonyBridgeOptions) {
    this.transport = options.transport
    this.maxSessions = options.maxSessions ?? TELEPHONY_CONSTANTS.MAX_SESSIONS
    this.replayTtlMs = options.replayTtlMs ?? TELEPHONY_CONSTANTS.REPLAY_TTL_MS
    this.digitRateLimitPerSec =
      options.digitRateLimitPerSec ??
      TELEPHONY_CONSTANTS.DIGIT_RATE_LIMIT_PER_SEC
    this.baseUrl = options.baseUrl ?? "http://localhost:3001"

    if (options.provider) {
      ProviderRegistry.getInstance().register(options.provider)
    }
  }

  getActiveSessionsCount(): number {
    return this.sessions.size
  }

  getSession(callId: string): TelephonyCallSession | undefined {
    return this.sessions.get(callId)
  }

  getClient(callId: string): RazziaSocketClient | undefined {
    return this.clients.get(callId)
  }

  /**
   * Cleans up expired idempotency keys.
   */
  private purgeExpiredIdempotency(now: number): void {
    for (const [key, expiresAt] of this.processedAnswers.entries()) {
      if (expiresAt <= now) {
        this.processedAnswers.delete(key)
      }
    }
  }

  /**
   * Main entrypoint for processing an inbound provider webhook request.
   */
  async handleWebhookRequest(
    providerId: string,
    req: InboundWebhookRequest,
  ): Promise<{
    statusCode: number
    headers: Record<string, string>
    body: string
  }> {
    const provider = ProviderRegistry.getInstance().get(providerId)
    if (!provider) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: `Provider '${providerId}' not found` }),
      }
    }

    // 1. Verify anti-tamper signature and replay protection
    const verification = await provider.verifyRequest(req)
    if (!verification.valid) {
      telephonyLogger.warn("Webhook verification failed", {
        provider: providerId,
        reason: verification.reason,
      })
      const isReplay = verification.reason?.includes("Replay")
      return {
        statusCode: isReplay ? 409 : 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: verification.reason || "Unauthorized",
        }),
      }
    }

    // 2. Parse event
    const event = provider.parseRequest(req)
    if (!event) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Invalid telephony payload" }),
      }
    }

    // 3. Process event through bridge
    const result = await this.handleEvent(event)

    // 4. Format provider-specific response directive
    return provider.formatResponse(result.directive)
  }

  /**
   * Processes a normalized telephony event.
   */
  async handleEvent(event: TelephonyEvent): Promise<TelephonyResult> {
    const now = Date.now()
    this.purgeExpiredIdempotency(now)

    telephonyLogger.info("Handling telephony event", {
      type: event.type,
      callId: event.callId,
      callerId: redactPhoneNumber(event.callerId),
    })

    // Handle HANGUP
    if (event.type === "HANGUP") {
      return this.handleHangup(event.callId)
    }

    // Handle CALL_START
    if (event.type === "CALL_START") {
      return this.handleCallStart(event)
    }

    // Handle DTMF digits
    if (event.type === "DTMF") {
      return this.handleDtmf(event)
    }

    return {
      success: false,
      directive: { type: "noop" },
      error: `Unknown event type: ${event.type}`,
    }
  }

  private async handleCallStart(
    event: TelephonyEvent,
  ): Promise<TelephonyResult> {
    const now = Date.now()

    // Enforce 1000 session cap
    if (
      !this.sessions.has(event.callId) &&
      this.sessions.size >= this.maxSessions
    ) {
      telephonyLogger.warn("Local telephony session limit exceeded (1000 cap)")
      return {
        success: false,
        directive: {
          type: "play",
          message:
            "System capacity reached. Please hang up and try again later.",
          continueCall: false,
        },
        error: "errors:telephony.capacityExceeded",
      }
    }

    let session = this.sessions.get(event.callId)
    if (!session) {
      const callerId = event.callerId
        ? redactPhoneNumber(event.callerId)
        : `mock-caller-${event.callId}`
      const numStr = String(this.participantCounter++).padStart(3, "0")
      const username = `${TELEPHONY_CONSTANTS.DEFAULT_CALLER_PREFIX}${numStr}`

      session = {
        callId: event.callId,
        provider: event.provider || "mock",
        callerId,
        gameId: null,
        inviteCode: null,
        username,
        token: null,
        clientId: null,
        state: "collecting_pin",
        currentEpoch: 0,
        lastEpochAnswered: null,
        lastDigitAt: now,
        digitCountInWindow: 0,
        digitWindowStart: now,
        pinBuffer: "",
        createdAt: now,
        updatedAt: now,
      }
      this.sessions.set(event.callId, session)
    }

    session.state = "collecting_pin"
    session.pinBuffer = ""

    return {
      success: true,
      sessionId: session.callId,
      directive: {
        type: "read",
        message: "Welcome to Razzia. Please enter your 6-digit game PIN.",
        varName: "pin",
        minDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
        maxDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
        timeoutSec: 15,
      },
    }
  }

  private async handleDtmf(event: TelephonyEvent): Promise<TelephonyResult> {
    const now = Date.now()
    const session = this.sessions.get(event.callId)

    if (!session) {
      // Unrecognized call session
      return {
        success: false,
        directive: {
          type: "read",
          message: "Please enter your 6-digit game PIN.",
          varName: "pin",
          minDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
          maxDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
        },
        error: "Session not found",
      }
    }

    const digits = event.digit ?? ""
    if (!digits) {
      return { success: true, directive: { type: "noop" } }
    }

    // Per-call digit throttle (10 digits/sec)
    if (now - session.digitWindowStart < 1000) {
      if (
        session.digitCountInWindow + digits.length >
        this.digitRateLimitPerSec
      ) {
        telephonyLogger.warn("DTMF digit throttle exceeded for call", {
          callId: session.callId,
        })
        return {
          success: false,
          directive: { type: "noop" },
          error: "Digit rate limit exceeded (10 digits/sec)",
        }
      }
      session.digitCountInWindow += digits.length
    } else {
      session.digitWindowStart = now
      session.digitCountInWindow = digits.length
    }
    session.lastDigitAt = now
    session.updatedAt = now

    // State 1: PIN Collection
    if (session.state === "collecting_pin" || session.state === "idle") {
      return this.processPinEntry(session, digits)
    }

    // State 2: In-Game Answering
    if (session.state === "in_game" || session.state === "answering") {
      return this.processGameAnswer(session, digits)
    }

    return {
      success: true,
      directive: { type: "noop" },
    }
  }

  private async processPinEntry(
    session: TelephonyCallSession,
    digits: string,
  ): Promise<TelephonyResult> {
    // Append entered digits
    session.pinBuffer = (session.pinBuffer + digits).slice(
      0,
      TELEPHONY_CONSTANTS.PIN_LENGTH,
    )

    if (session.pinBuffer.length < TELEPHONY_CONSTANTS.PIN_LENGTH) {
      return {
        success: true,
        directive: { type: "noop" },
      }
    }

    const pin = session.pinBuffer

    // Strict 6-digit validation
    if (!isValidPin(pin)) {
      session.pinBuffer = ""
      return {
        success: false,
        directive: {
          type: "read",
          message: "Invalid game PIN. Please enter the 6-digit game PIN.",
          varName: "pin",
          minDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
          maxDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
        },
        error: "Invalid PIN format",
      }
    }

    // Attempt join
    session.state = "joining"
    try {
      let client = this.clients.get(session.callId)
      if (!client) {
        client = new RazziaSocketClient({
          baseUrl: this.baseUrl,
          transport: this.transport,
        })
        this.clients.set(session.callId, client)
      }

      await client.authenticateSession()
      session.token = client.getToken()
      session.clientId = client.getClientId()

      const { gameId, username } = await client.joinGame(pin, session.username)

      session.gameId = gameId
      session.inviteCode = pin
      session.username = username
      session.state = "in_game"

      telephonyLogger.info("Phone participant successfully joined game", {
        gameId,
        username,
        callId: session.callId,
      })

      return {
        success: true,
        sessionId: session.callId,
        directive: {
          type: "play",
          message: `Connected as ${username}. Please wait for the host to start the game.`,
          continueCall: true,
        },
      }
    } catch (err: any) {
      session.state = "collecting_pin"
      session.pinBuffer = ""
      const errMsg = err?.message || "Join failed"
      telephonyLogger.warn("Failed to join game with PIN", {
        pin,
        error: errMsg,
      })

      return {
        success: false,
        directive: {
          type: "read",
          message:
            "Could not find a game with that PIN. Please enter your 6-digit PIN.",
          varName: "pin",
          minDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
          maxDigits: TELEPHONY_CONSTANTS.PIN_LENGTH,
        },
        error: errMsg,
      }
    }
  }

  private async processGameAnswer(
    session: TelephonyCallSession,
    digits: string,
  ): Promise<TelephonyResult> {
    const client = this.clients.get(session.callId)
    if (!client || !session.gameId) {
      return {
        success: false,
        directive: { type: "play", message: "Not in an active game." },
        error: "No active client for session",
      }
    }

    const gameState = client.getState()

    // Check if question type is supported on phone
    const pstnSupport = isQuestionSupportedOnPstn(
      gameState.gameMode ?? "quiz",
      gameState.questionType ?? "single",
      gameState.answersCount || 4,
    )

    if (!pstnSupport.supported) {
      return {
        success: false,
        directive: {
          type: "play",
          message:
            pstnSupport.reason ??
            "This question is not supported via phone keypad. Please wait for the next question.",
          continueCall: true,
        },
        error: "Unsupported question type for telephone",
      }
    }

    // Only process the first digit
    const firstDigit = digits.charAt(0)

    // Digits 0, *, # are ignored or menu controls
    if (firstDigit === "0" || firstDigit === "*" || firstDigit === "#") {
      return {
        success: true,
        directive: { type: "noop" },
      }
    }

    // Map digit 1..4 -> index 0..3
    const answerIndex = mapDtmfToAnswerIndex(firstDigit)
    if (answerIndex === null) {
      return {
        success: false,
        directive: {
          type: "play",
          message: "Please press a number between 1 and 4 for your answer.",
        },
        error: "Invalid answer digit",
      }
    }

    // Check if caller already answered for (callId, gameId, epoch)
    const currentEpoch = gameState.currentEpoch
    const idempotencyKey = `${session.callId}:${session.gameId}:${currentEpoch}`

    if (
      this.processedAnswers.has(idempotencyKey) ||
      session.lastEpochAnswered === currentEpoch
    ) {
      return {
        success: false,
        directive: {
          type: "play",
          message: "Your answer has already been recorded for this question.",
        },
        error: "Duplicate submission for epoch",
      }
    }

    // Only accept during SELECT_ANSWER
    if (!gameState.acceptingAnswers) {
      return {
        success: false,
        directive: {
          type: "play",
          message: "Answers are not being accepted at this time.",
        },
        error: "Not in SELECT_ANSWER state",
      }
    }

    // Submit answer to Razzia server (server receipt time is authoritative)
    const submitResult = client.selectAnswer(answerIndex)
    if (!submitResult.success) {
      return {
        success: false,
        directive: {
          type: "play",
          message: submitResult.error || "Failed to record answer.",
        },
        error: submitResult.error,
      }
    }

    // Record idempotency key with TTL
    this.processedAnswers.set(idempotencyKey, Date.now() + this.replayTtlMs)
    session.lastEpochAnswered = currentEpoch
    session.updatedAt = Date.now()

    return {
      success: true,
      directive: {
        type: "play",
        message: `Answer ${firstDigit} submitted. Waiting for results.`,
        continueCall: true,
      },
    }
  }

  private handleHangup(callId: string): TelephonyResult {
    const session = this.sessions.get(callId)
    const client = this.clients.get(callId)

    if (client) {
      client.disconnect()
      this.clients.delete(callId)
    }

    if (session) {
      session.state = "hung_up"
      session.updatedAt = Date.now()
      this.sessions.delete(callId)
    }

    telephonyLogger.info("Phone call hung up and resources cleaned", {
      callId,
    })

    return {
      success: true,
      directive: {
        type: "hangup",
        reason: "Caller disconnected",
      },
    }
  }

  /**
   * Resets all internal state (useful between tests).
   */
  reset(): void {
    for (const client of this.clients.values()) {
      client.disconnect()
    }
    this.clients.clear()
    this.sessions.clear()
    this.processedAnswers.clear()
    this.participantCounter = 1
  }
}
