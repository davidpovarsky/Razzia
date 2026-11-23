import { z } from "zod"

const ticketSchema = z.string().min(40).max(8192)
const inspectionSchema = z.strictObject({
  clientId: z.string().min(1).max(256),
  scopes: z.array(z.string().min(1).max(160)).min(1).max(64),
  expiresAt: z.number().int().positive(),
  proof: z.string().regex(/^[a-f0-9]{64}$/u),
})

export type ConsentInspection = Readonly<z.infer<typeof inspectionSchema>>

export function consentIssuerPath(value: string) {
  if (
    !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/u.test(value) ||
    value.startsWith("//")
  ) {
    throw new Error("oauth-consent:issuer-unconfigured")
  }

  return value.replace(/\/$/u, "")
}

/**
 * Native manager authority stays on the trusted same-origin consent surface.
 * Only an actual inspect result from this instance can be submitted for approval.
 */

export function createOAuthConsentClient(options: {
  issuerBasePath: string
  getNativeToken: () => string | null
  request?: typeof fetch
}) {
  const base = consentIssuerPath(options.issuerBasePath)
  const request = options.request ?? fetch
  let generation = 0
  const inspections = new WeakMap<
    object,
    { ticket: string; token: string; generation: number }
  >()
  function active(token: string, expectedGeneration: number) {
    if (
      !token ||
      options.getNativeToken() !== token ||
      generation !== expectedGeneration
    ) {
      throw new Error("oauth-consent:session-changed")
    }
  }
  async function post(
    path: string,
    body: unknown,
    token: string,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) {
    active(token, expectedGeneration)
    const response = await request(`${base}/${path}`, {
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
    active(token, expectedGeneration)

    if (
      !response.ok ||
      response.redirected ||
      !response.headers.get("content-type")?.startsWith("application/json")
    ) {
      throw new Error("oauth-consent:request-failed")
    }

    const value: unknown = await response.json()
    active(token, expectedGeneration)

    return value
  }

  return {
    invalidate() {
      generation += 1
    },
    async inspect(
      ticketInput: string,
      signal?: AbortSignal,
    ): Promise<ConsentInspection> {
      const ticket = ticketSchema.parse(ticketInput)
      const token = options.getNativeToken() ?? ""
      const expected = generation
      const value = inspectionSchema.parse(
        await post("inspect", { ticket }, token, expected, signal),
      )

      if (
        value.expiresAt <= Date.now() ||
        value.expiresAt > Date.now() + 600000
      ) {
        throw new Error("oauth-consent:expired")
      }

      Object.freeze(value.scopes)
      const result = Object.freeze(value)
      inspections.set(result, { ticket, token, generation: expected })

      return result
    },
    async approve(
      ticketInput: string,
      inspection: ConsentInspection,
      signal?: AbortSignal,
    ) {
      const ticket = ticketSchema.parse(ticketInput)
      const bound = inspections.get(inspection)

      if (
        !bound ||
        bound.ticket !== ticket ||
        inspection.expiresAt <= Date.now()
      ) {
        throw new Error("oauth-consent:expired")
      }

      active(bound.token, bound.generation)
      // Consume locally before the request: no accidental double-click retry.
      inspections.delete(inspection)
      const response = z
        .strictObject({
          redirectUrl: z.string().min(1).max(4096),
          grantId: z.string().min(1).max(256),
        })
        .parse(
          await post(
            "approve",
            { ticket, decision: "allow", proof: inspection.proof },
            bound.token,
            bound.generation,
            signal,
          ),
        )
      const url = new URL(response.redirectUrl)

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new Error("oauth-consent:invalid-redirect")
      }

      return response.redirectUrl
    },
  }
}
