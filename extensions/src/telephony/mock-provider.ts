import { createHmac, timingSafeEqual } from "node:crypto"
import type { TelephonyProvider } from "./provider"
import {
  TELEPHONY_CONSTANTS,
  type InboundWebhookRequest,
  type TelephonyDirective,
  type TelephonyEvent,
  type WebhookVerificationResult,
} from "./types"

export interface MockProviderOptions {
  secret?: string
  replayTtlMs?: number
  maxSkewMs?: number
}

/**
 * Computes HMAC-SHA256 signature for payload with timestamp and nonce.
 */
export function computeMockHmac(
  secret: string,
  timestamp: number,
  nonce: string,
  rawBody: string,
): string {
  const message = `${timestamp}:${nonce}:${rawBody}`
  return createHmac("sha256", secret).update(message).digest("hex")
}

/**
 * Performs constant-time comparison of two hex strings to prevent timing attacks.
 */
export function safeCompareSignatures(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex")
    const bufB = Buffer.from(b, "hex")
    if (bufA.length !== bufB.length) {
      return false
    }
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/**
 * Pure offline Mock Telephony Provider.
 * Signs and verifies synthetic events with HMAC-SHA256, enforces timing skew <=120s,
 * and maintains a 10-minute replay protection nonce cache.
 */
export class MockProvider implements TelephonyProvider {
  readonly id = "mock"
  readonly name = "Local Mock Provider"
  readonly isEnabled = true

  readonly secret: string
  readonly replayTtlMs: number
  readonly maxSkewMs: number

  // Nonce cache: nonce -> expiry timestamp (Date.now() + replayTtlMs)
  private readonly seenNonces = new Map<string, number>()

  constructor(options?: MockProviderOptions) {
    this.secret = options?.secret ?? "local-razzia-mock-secret-key-12345"
    this.replayTtlMs = options?.replayTtlMs ?? TELEPHONY_CONSTANTS.REPLAY_TTL_MS
    this.maxSkewMs = options?.maxSkewMs ?? TELEPHONY_CONSTANTS.MAX_SKEW_MS
  }

  /**
   * Cleans up expired nonces from the replay cache.
   */
  private purgeExpiredNonces(now: number): void {
    for (const [nonce, expiresAt] of this.seenNonces.entries()) {
      if (expiresAt <= now) {
        this.seenNonces.delete(nonce)
      }
    }
  }

  /**
   * Verifies HMAC signature, timestamp skew, and nonce replay.
   */
  verifyRequest(req: InboundWebhookRequest): WebhookVerificationResult {
    const now = Date.now()
    this.purgeExpiredNonces(now)

    // Read headers (case-insensitive lookup)
    const headers = req.headers
    const getHeader = (name: string): string | undefined => {
      const lower = name.toLowerCase()
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === lower) {
          return v
        }
      }
      return undefined
    }

    const signatureHeader =
      getHeader(TELEPHONY_CONSTANTS.HMAC_HEADER) ??
      getHeader("x-mock-signature")
    const timestampHeader =
      getHeader(TELEPHONY_CONSTANTS.TIMESTAMP_HEADER) ??
      getHeader("x-mock-timestamp")
    const nonce =
      getHeader(TELEPHONY_CONSTANTS.NONCE_HEADER) ?? getHeader("x-mock-nonce")

    if (!signatureHeader || !timestampHeader || !nonce) {
      return {
        valid: false,
        reason:
          "Missing authentication headers (signature, timestamp, or nonce)",
      }
    }

    // Parse timestamp (support both milliseconds or seconds)
    const rawTs = Number.parseInt(timestampHeader, 10)
    if (Number.isNaN(rawTs) || rawTs <= 0) {
      return { valid: false, reason: "Invalid timestamp header" }
    }
    const timestampMs = rawTs < 10_000_000_000 ? rawTs * 1000 : rawTs

    // 1. Verify timing skew <= 120 seconds
    const skew = Math.abs(now - timestampMs)
    if (skew > this.maxSkewMs) {
      return {
        valid: false,
        reason: `Clock skew exceeds allowed limit (${Math.round(skew / 1000)}s > ${Math.round(this.maxSkewMs / 1000)}s)`,
        timestamp: timestampMs,
      }
    }

    // 2. Check replay cache
    if (this.seenNonces.has(nonce)) {
      return {
        valid: false,
        reason: `Replay detected: nonce '${nonce}' has already been processed`,
        nonce,
      }
    }

    // 3. Verify HMAC-SHA256 signature
    const cleanSignature = signatureHeader.replace(/^sha256=/, "")
    const rawBody =
      req.rawBody ??
      (typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}))

    const expectedSignature = computeMockHmac(
      this.secret,
      timestampMs,
      nonce,
      rawBody,
    )

    if (!safeCompareSignatures(cleanSignature, expectedSignature)) {
      return {
        valid: false,
        reason: "HMAC signature mismatch: unauthorized webhook request",
      }
    }

    // Record nonce with expiry TTL
    this.seenNonces.set(nonce, now + this.replayTtlMs)

    return {
      valid: true,
      timestamp: timestampMs,
      nonce,
    }
  }

  /**
   * Translates incoming validated mock request to TelephonyEvent.
   */
  parseRequest(req: InboundWebhookRequest): TelephonyEvent | null {
    try {
      const data =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : (req.body as Record<string, unknown> | undefined)

      if (!data || typeof data !== "object") {
        return null
      }

      const callId = String(data.callId || req.query.callId || "")
      if (!callId) {
        return null
      }

      const type = (data.type as TelephonyEvent["type"]) || "CALL_START"
      const digit = data.digit ? String(data.digit) : undefined
      const callerId = data.callerId
        ? String(data.callerId)
        : `mock-caller-${callId}`

      return {
        callId,
        timestamp: Date.now(),
        type,
        digit,
        callerId,
        provider: this.id,
      }
    } catch {
      return null
    }
  }

  /**
   * Formats a TelephonyDirective into a JSON response.
   */
  formatResponse(directive: TelephonyDirective): {
    statusCode: number
    headers: Record<string, string>
    body: string
  } {
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: this.id,
        directive,
      }),
    }
  }

  /**
   * Helper utility to create a signed mock request envelope.
   */
  createSignedRequest(
    event: Partial<TelephonyEvent> & {
      callId: string
      type: TelephonyEvent["type"]
    },
    options?: {
      timestampMs?: number
      nonce?: string
      secret?: string
      mutateSignature?: (sig: string) => string
    },
  ): InboundWebhookRequest {
    const timestamp = options?.timestampMs ?? Date.now()
    const nonce =
      options?.nonce ?? `nonce_${Math.random().toString(36).slice(2)}`
    const secret = options?.secret ?? this.secret

    const bodyObj = {
      callId: event.callId,
      type: event.type,
      digit: event.digit,
      callerId: event.callerId ?? `mock-caller-${event.callId}`,
      timestamp,
    }
    const rawBody = JSON.stringify(bodyObj)

    let signature = computeMockHmac(secret, timestamp, nonce, rawBody)
    if (options?.mutateSignature) {
      signature = options.mutateSignature(signature)
    }

    return {
      method: "POST",
      url: "/api/telephony/mock",
      headers: {
        "content-type": "application/json",
        [TELEPHONY_CONSTANTS.HMAC_HEADER]: `sha256=${signature}`,
        [TELEPHONY_CONSTANTS.TIMESTAMP_HEADER]: String(timestamp),
        [TELEPHONY_CONSTANTS.NONCE_HEADER]: nonce,
      },
      query: { callId: event.callId },
      body: bodyObj,
      rawBody,
    }
  }
}
