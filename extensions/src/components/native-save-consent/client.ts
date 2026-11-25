import { restoreNativeSaveCspConfiguration } from "./csp-admission"
import {
  nativeSaveConsentRequestId,
  nativeSaveInspectInput,
  nativeSaveApproveInput,
  nativeSaveInspectResponse,
  nativeSaveApproveResponse,
  type NativeSaveInspection,
  type NativeSaveApproval,
} from "../../mcp-app/contracts/native-save"
import { LIMITS } from "../../mcp-app/contracts/schemas"

restoreNativeSaveCspConfiguration()

export type { NativeSaveInspection, NativeSaveApproval }

export const NATIVE_SAVE_CONSENT_PATH = "/studio/native-save-consent"

export class NativeSaveConsentError extends Error {
  constructor(readonly code: string) {
    super(`native-save-consent:${code}`)
  }
}

/** Only an exact, query/hash-free path carries this opaque, non-authorizing ID. */
export function nativeSaveRequestIdFromPath(
  pathname: string,
  search = "",
  hash = "",
): string | null {
  if (search || hash) {
    return null
  }

  const prefix = `${NATIVE_SAVE_CONSENT_PATH}/`

  if (!pathname.startsWith(prefix)) {
    return null
  }

  const parsed = nativeSaveConsentRequestId.safeParse(
    pathname.slice(prefix.length),
    { jitless: true },
  )

  return parsed.success ? parsed.data : null
}

function trustedIssuerPath(value: string) {
  if (
    !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/u.test(value) ||
    value.startsWith("//")
  ) {
    throw new NativeSaveConsentError("issuer-unconfigured")
  }

  return value.replace(/\/$/u, "")
}

function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      freezeJson(child)
    }
    Object.freeze(value)
  }

  return value
}

async function exactAuthoredDigest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )

  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

// Separate exact-revision approval client. This cannot save or allocate a game,
// issue an OAuth grant, follow a callback, or reuse scope-consent proof objects.
// F's browser-safe canonical DTO leaf is its only contract dependency.
//
export function createNativeSaveConsentClient(options: {
  issuerBasePath: string
  accountId: string
  getNativeToken: () => string | null
  request?: typeof fetch
}) {
  const base = trustedIssuerPath(options.issuerBasePath)
  const request = options.request ?? fetch
  let generation = 0
  const inspections = new WeakMap<
    object,
    {
      token: string
      generation: number
      requestId: string
      proof: string
    }
  >()
  function active(token: string, expected: number) {
    if (
      !token ||
      options.getNativeToken() !== token ||
      generation !== expected
    ) {
      throw new NativeSaveConsentError("session-changed")
    }
  }
  // eslint-disable-next-line max-params -- Keep the session generation and cancellation explicit at the I/O boundary.
  async function post(
    operation: "inspect" | "approve",
    body: unknown,
    token: string,
    expected: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) {
      throw new NativeSaveConsentError("canceled")
    }

    active(token, expected)
    const response = await request(`${base}/native-save/${operation}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
      body: JSON.stringify(body),
    })
    active(token, expected)

    if (
      response.redirected ||
      !response.headers.get("content-type")?.startsWith("application/json")
    ) {
      throw new NativeSaveConsentError("request-failed")
    }

    const text = await response.text()
    active(token, expected)

    if (signal?.aborted) {
      throw new NativeSaveConsentError("canceled")
    }

    if (text.length > LIMITS.response) {
      throw new NativeSaveConsentError("response-too-large")
    }

    let value: unknown = undefined

    try {
      value = JSON.parse(text)
    } catch {
      throw new NativeSaveConsentError("request-failed")
    }

    // Strict failure DTOs are parsed below even for HTTP errors. A failure URL or
    // message is never treated as a destination, command, credential or authority.
    if (!response.ok) {
      const parsed =
        operation === "inspect"
          ? nativeSaveInspectResponse.safeParse(value, { jitless: true })
          : nativeSaveApproveResponse.safeParse(value, { jitless: true })

      if (parsed.success && !parsed.data.ok) {
        throw new NativeSaveConsentError(parsed.data.error.code)
      }

      throw new NativeSaveConsentError("request-failed")
    }

    return value
  }

  return {
    invalidate() {
      generation += 1
    },
    async inspect(
      requestIdInput: string,
      signal?: AbortSignal,
    ): Promise<NativeSaveInspection> {
      const body = nativeSaveInspectInput.parse(
        { consentRequestId: requestIdInput },
        { jitless: true },
      )
      const token = options.getNativeToken() ?? ""
      generation += 1
      const expected = generation
      const response = nativeSaveInspectResponse.parse(
        await post("inspect", body, token, expected, signal),
        { jitless: true },
      )

      if (!response.ok) {
        throw new NativeSaveConsentError(response.error.code)
      }

      const value = response.data

      if (
        value.consentRequestId !== body.consentRequestId ||
        value.accountId !== options.accountId
      ) {
        throw new NativeSaveConsentError("inspection-mismatch")
      }

      if (
        value.authoredDigest !==
        (await exactAuthoredDigest(value.authoredShowJson))
      ) {
        throw new NativeSaveConsentError("snapshot-mismatch")
      }

      active(token, expected)

      if (signal?.aborted) {
        throw new NativeSaveConsentError("canceled")
      }

      if (
        value.state === "pending" &&
        (value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 600000)
      ) {
        throw new NativeSaveConsentError("expired")
      }

      const result = freezeJson(value)

      if (result.state === "pending" && result.proof) {
        inspections.set(result, {
          token,
          generation: expected,
          requestId: body.consentRequestId,
          proof: result.proof,
        })
      }

      return result
    },
    async approve(
      requestIdInput: string,
      inspection: NativeSaveInspection,
      signal?: AbortSignal,
    ): Promise<NativeSaveApproval> {
      const requestId = nativeSaveConsentRequestId.parse(requestIdInput, {
        jitless: true,
      })
      const bound = inspections.get(inspection)

      if (
        !bound ||
        bound.requestId !== requestId ||
        inspection.state !== "pending" ||
        inspection.expiresAt <= Date.now()
      ) {
        throw new NativeSaveConsentError("expired")
      }

      active(bound.token, bound.generation)

      if (signal?.aborted) {
        throw new NativeSaveConsentError("canceled")
      }
      // Consume before any approval I/O. Unknown outcomes never trigger a retry.

      inspections.delete(inspection)
      generation += 1
      const approvalGeneration = generation
      const body = nativeSaveApproveInput.parse(
        { consentRequestId: requestId, decision: "allow", proof: bound.proof },
        { jitless: true },
      )
      const response = nativeSaveApproveResponse.parse(
        await post("approve", body, bound.token, approvalGeneration, signal),
        { jitless: true },
      )

      if (!response.ok) {
        throw new NativeSaveConsentError(response.error.code)
      }

      const result = response.data

      if (
        result.consentRequestId !== requestId ||
        result.draftId !== inspection.draftId ||
        result.revision !== inspection.revision ||
        result.expiresAt > inspection.expiresAt ||
        result.expiresAt <= Date.now()
      ) {
        throw new NativeSaveConsentError("approval-mismatch")
      }

      return Object.freeze(result)
    },
  }
}
