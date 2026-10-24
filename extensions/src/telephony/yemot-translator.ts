import type { TelephonyProvider } from "./provider"
import {
  redactPhoneNumber,
  telephonyLogger,
  type InboundWebhookRequest,
  type TelephonyDirective,
  type TelephonyEvent,
  type WebhookVerificationResult,
} from "./types"

export interface YemotCallbackData {
  apiCallId: string
  apiPhoneMasked: string
  apiDID?: string
  apiRealDID?: string
  apiExtension?: string
  apiTime?: number
  isHangup: boolean
  hangupExtension?: string
  digits?: string
  rawParams: Record<string, string>
}

export interface YemotTranslatorOptions {
  /**
   * MUST remain false in this local release.
   * Real Yemot provider authentication and UK routing remain unverified.
   */
  allowUnverifiedCarrier?: boolean
}

/**
 * Yemot type=api IVR translator.
 *
 * Implements documented Yemot callback parsing and read prompt formatting.
 *
 * SAFETY GUARANTEE:
 * Real Yemot is DISABLED and unverified by default.
 * - No documented cryptographic HMAC signature exists in official Yemot docs (User-Agent is not auth).
 * - No UK inbound PSTN numbers are verified.
 * - Yemot type=api operates via HTTP request-response read loops, not real-time DTMF streaming.
 * - Concurrent call scaling and commercial costs are unverified.
 */
export class YemotApiTranslator implements TelephonyProvider {
  readonly id = "yemot"
  readonly name = "Yemot HaMashiach IVR (Unverified / Disabled for Live)"
  readonly isEnabled: boolean

  constructor(options?: YemotTranslatorOptions) {
    // Strictly disabled by default unless unverified override is explicitly provided
    this.isEnabled = options?.allowUnverifiedCarrier ?? false
  }

  /**
   * Parse inbound GET or POST callback from Yemot IVR.
   */
  parseCallback(req: InboundWebhookRequest): YemotCallbackData {
    void this.id
    const params: Record<string, string | undefined> = {}

    // Combine query parameters and body
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") {
        params[k] = v
      }
    }

    if (req.body && typeof req.body === "object") {
      for (const [k, v] of Object.entries(
        req.body as Record<string, unknown>,
      )) {
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          params[k] = String(v)
        }
      }
    }

    const apiCallId =
      params.ApiCallId ?? params.apicallid ?? params.callId ?? "unknown-call"
    const rawPhone = params.ApiPhone ?? params.apiphone
    const apiPhoneMasked = redactPhoneNumber(rawPhone)

    const isHangup =
      params.hangup === "yes" ||
      params.action === "hangup" ||
      Boolean(params.ApiHangupExtension)

    // Detect digits collected from a previous `read` parameter (e.g. pin, ans, data)
    const { pin, ans, data, digits: paramDigits } = params
    const digits = pin ?? ans ?? data ?? paramDigits

    return {
      apiCallId,
      apiPhoneMasked,
      apiDID: params.ApiDID,
      apiRealDID: params.ApiRealDID,
      apiExtension: params.ApiExtension,
      apiTime: params.ApiTime ? Number.parseInt(params.ApiTime, 10) : undefined,
      isHangup,
      hangupExtension: params.ApiHangupExtension,
      digits,
      rawParams: params as Record<string, string>,
    }
  }

  /**
   * Webhook verification for Yemot.
   * Note: Official Yemot type=api docs DO NOT specify any HMAC-SHA256 signature.
   * If real telephony is disabled, verification fails closed.
   */
  verifyRequest(req: InboundWebhookRequest): WebhookVerificationResult {
    if (!this.isEnabled) {
      return {
        valid: false,
        reason:
          "Real Yemot telephony is DISABLED. Unverified carrier cannot process live traffic.",
      }
    }

    // Inspect user agent as documented by vendor (yemot-core-api/1.0), but log security warning
    const ua = req.headers["user-agent"] ?? ""

    if (!ua.includes("yemot-core-api")) {
      telephonyLogger.warn(
        "Inbound Yemot request missing standard User-Agent header",
      )
    }

    return {
      valid: true,
      reason: "Carrier unverified override enabled",
    }
  }

  /**
   * Maps incoming Yemot callback to TelephonyEvent.
   */
  parseRequest(req: InboundWebhookRequest): TelephonyEvent | null {
    const data = this.parseCallback(req)

    if (!data.apiCallId) {
      return null
    }

    if (data.isHangup) {
      return {
        callId: data.apiCallId,
        timestamp: Date.now(),
        type: "HANGUP",
        callerId: data.apiPhoneMasked,
        provider: this.id,
      }
    }

    if (data.digits !== undefined && data.digits !== "") {
      return {
        callId: data.apiCallId,
        timestamp: Date.now(),
        type: "DTMF",
        digit: data.digits,
        callerId: data.apiPhoneMasked,
        provider: this.id,
      }
    }

    return {
      callId: data.apiCallId,
      timestamp: Date.now(),
      type: "CALL_START",
      callerId: data.apiPhoneMasked,
      provider: this.id,
    }
  }

  /**
   * Formats a TelephonyDirective into Yemot IVR response protocol text.
   */
  formatResponse(directive: TelephonyDirective): {
    statusCode: number
    headers: Record<string, string>
    body: string
  } {
    void this.id
    let body = ""

    switch (directive.type) {
      case "read": {
        // Format: read=t-Message=varName,,minDigits,maxDigits,Digits,yes
        const timeout = directive.timeoutSec ?? 10
        body = `read=t-${directive.message}=${directive.varName},,${directive.minDigits},${directive.maxDigits},Digits,yes,${timeout}`

        break
      }

      case "play": {
        body = `id_list_message=t-${directive.message}`

        break
      }

      case "hangup": {
        body = "hangup"

        break
      }

      case "noop": {
        body = ""

        break
      }
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      body,
    }
  }

  /**
   * Formats a Yemot read directive string directly.
   */
  static formatReadPrompt(
    ...args:
      | [
          options: {
            message: string
            varName: string
            minDigits: number
            maxDigits: number
            timeoutSec?: number
          },
        ]
      | [
          message: string,
          varName: string,
          minDigits: number,
          maxDigits: number,
          timeoutSec?: number,
        ]
  ): string {
    if (typeof args[0] === "object") {
      const [{ message, varName, minDigits, maxDigits, timeoutSec = 10 }] = args

      return `read=t-${message}=${varName},,${minDigits},${maxDigits},Digits,yes,${timeoutSec}`
    }

    const [message, varName, minDigits, maxDigits, timeoutSec = 10] = args

    return `read=t-${message}=${varName},,${minDigits},${maxDigits},Digits,yes,${timeoutSec}`
  }

  /**
   * Formats a Yemot hangup response.
   */
  static formatHangup(): string {
    return "hangup"
  }
}
