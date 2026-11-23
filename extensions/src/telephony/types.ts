import { z } from "zod"
import { QUESTION_TYPES, QUIZZ_MODES } from "@razzia/common/constants"

/**
 * Telephony configuration limits and constants.
 */
export const TELEPHONY_CONSTANTS = {
  MAX_SESSIONS: 1000,
  // 10 minutes
  REPLAY_TTL_MS: 10 * 60 * 1000,
  REPLAY_TTL_SEC: 10 * 60,
  // 120 seconds
  MAX_SKEW_MS: 120 * 1000,
  MAX_SKEW_SEC: 120,
  // 10 digits/sec per call
  DIGIT_RATE_LIMIT_PER_SEC: 10,
  PIN_LENGTH: 6,
  DEFAULT_CALLER_PREFIX: "Phone ",
  HMAC_HEADER: "x-razzia-signature",
  TIMESTAMP_HEADER: "x-razzia-timestamp",
  NONCE_HEADER: "x-razzia-nonce",
} as const

/**
 * Call session lifecycle state.
 */
export const SESSION_STATES = [
  "idle",
  "collecting_pin",
  "joining",
  "in_game",
  "answering",
  "hung_up",
  "error",
] as const

export type SessionState = (typeof SESSION_STATES)[number]

/**
 * Directives returned from provider or bridge to control telephone IVR audio/prompts.
 */
export type TelephonyDirective =
  | {
      type: "play"
      message: string
      continueCall?: boolean
    }
  | {
      type: "read"
      message: string
      varName: string
      minDigits: number
      maxDigits: number
      timeoutSec?: number
    }
  | {
      type: "hangup"
      message?: string
      reason?: string
    }
  | {
      type: "noop"
      message?: string
    }

/**
 * Generic inbound webhook request envelope for telephone providers.
 */
export interface InboundWebhookRequest {
  method: "GET" | "POST"
  url: string
  headers: Record<string, string | undefined>
  query: Record<string, string | undefined>
  body?: unknown
  rawBody?: string
}

/**
 * Verification result for incoming webhook authentication.
 */
export interface WebhookVerificationResult {
  valid: boolean
  reason?: string
  timestamp?: number
  nonce?: string
}

/**
 * Normalized telephony event passed into bridge.
 */
export interface TelephonyEvent {
  callId: string
  timestamp: number
  type: "CALL_START" | "DTMF" | "HANGUP"
  digit?: string
  callerId?: string
  rawCallerId?: string
  phoneE164?: string | null
  provider?: string
}

/**
 * Result returned by bridge after handling a telephony event.
 */
export interface TelephonyResult {
  success: boolean
  directive: TelephonyDirective
  error?: string
  sessionId?: string
}

/**
 * Internal call session state tracked by the bridge.
 */
export interface TelephonyCallSession {
  callId: string
  provider: string
  // Redacted / synthetic dummy caller identifier
  callerId: string
  rawCallerId?: string
  phoneE164?: string | null
  rosterPlayerId?: string | null
  gameId: string | null
  inviteCode: string | null
  username: string
  token: string | null
  clientId: string | null
  state: SessionState
  currentEpoch: number
  lastEpochAnswered: number | null
  lastDigitAt: number
  digitCountInWindow: number
  digitWindowStart: number
  pinBuffer: string
  createdAt: number
  updatedAt: number
}

/**
 * Redacts raw phone numbers from logs to ensure caller privacy.
 * Replaces actual phone numbers with sanitized identifiers.
 */
export function redactPhoneNumber(phone?: string | null): string {
  if (!phone) {
    return "[ANONYMOUS]"
  }

  // Strip non-digits for check
  const digits = phone.replaceAll(/\D/g, "")

  if (digits.length <= 4) {
    return "[REDACTED_PHONE]"
  }

  // Mask all but last 4 digits
  return `***-***-${digits.slice(-4)}`
}

/**
 * Safe logger for telephony that automatically redacts phone numbers.
 */
export const telephonyLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    // Redact any phone fields in meta
    const sanitized = meta ? sanitizeMeta(meta) : undefined

    if (process.env.NODE_ENV !== "test") {
      console.log(`[Telephony] ${msg}`, sanitized ?? "")
    }
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    const sanitized = meta ? sanitizeMeta(meta) : undefined

    if (process.env.NODE_ENV !== "test") {
      console.warn(`[Telephony WARN] ${msg}`, sanitized ?? "")
    }
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    const sanitized = meta ? sanitizeMeta(meta) : undefined

    if (process.env.NODE_ENV !== "test") {
      console.error(`[Telephony ERROR] ${msg}`, sanitized ?? "")
    }
  },
}

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (
      k.toLowerCase().includes("phone") ||
      k.toLowerCase().includes("caller") ||
      k.toLowerCase().includes("did")
    ) {
      result[k] = typeof v === "string" ? redactPhoneNumber(v) : "[REDACTED]"
    } else {
      result[k] = v
    }
  }

  return result
}

/**
 * Strict 6-digit game PIN validator.
 */
export const pinValidator = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "errors:telephony.invalidPinFormat")

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

/**
 * Maps single DTMF digit 1..4 to 0-based Razzia answerKeys index [0..3].
 * Returns null for any digit outside '1'..'4'.
 */
export function mapDtmfToAnswerIndex(digit: string): number | null {
  switch (digit) {
    case "1": {
      return 0
    }

    case "2": {
      return 1
    }

    case "3": {
      return 2
    }

    case "4": {
      return 3
    }

    case "5": {
      return 4
    }

    default: {
      return null
    }
  }
}

/**
 * Checks if a game question is supported over telephone keypad.
 * Telephone PSTN supports single-choice questions (quiz or survey) with <= 5 options.
 * Multi-choice, estimation, or >5 options are explicitly unsupported.
 */
export /* oxlint-disable max-params -- Preserve the existing positional protocol/animation API; changing callers is outside this lint repair. */
function isQuestionSupportedOnPstn(
  gameMode: string,
  questionType: string,
  answersCount: number,
  playMode?: string | null,
): {
  supported: boolean
  reason?: string
} {
  const isSurvey =
    playMode === "survey" || (!playMode && gameMode === QUIZZ_MODES.SURVEY)

  if (isSurvey) {
    if (questionType !== QUESTION_TYPES.SINGLE) {
      return {
        supported: false,
        reason:
          "Only single-choice survey questions are supported via telephone keypad.",
      }
    }
  } else {
    if (questionType === QUESTION_TYPES.MULTI) {
      return {
        supported: false,
        reason:
          "Multiple-selection questions are not supported via telephone keypad.",
      }
    }

    if (questionType === QUESTION_TYPES.ESTIMATION) {
      return {
        supported: false,
        reason: "Estimation questions are not supported via telephone keypad.",
      }
    }
  }

  if (answersCount > 5) {
    return {
      supported: false,
      reason: `Questions with ${answersCount} answers exceed telephone keypad limit of 5.`,
    }
  }

  return {
    supported: true,
  }
}
/* oxlint-enable max-params */
