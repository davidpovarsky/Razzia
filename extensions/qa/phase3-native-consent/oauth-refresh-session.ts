import assert from "node:assert/strict"
import type { VerifiedPrincipal } from "../../src/mcp-app/server/dependencies.ts"
import {
  oauthTokenResponseSchema,
  type PkceGrantSession,
} from "./oauth-flow.ts"

interface RefreshingSessionOptions {
  // Only the QA client refresh scheduler uses this clock; issuer time is unchanged.
  readonly schedulingClock?: () => number
  readonly origin: string
  readonly clientId: string
  readonly grant: PkceGrantSession
  readonly fetchImpl: typeof globalThis.fetch
  readonly verifyAccessToken: (token: string) => Promise<VerifiedPrincipal>
}

function authority(principal: VerifiedPrincipal) {
  return JSON.stringify({
    issuer: principal.issuer,
    audience: principal.audience,
    subject: principal.subject,
    clientId: principal.clientId,
    grantId: principal.grantId,
    accountId: principal.accountId,
    scopes: [...principal.scopes].sort(),
    active: principal.active,
    accountsEnabled: principal.accountsEnabled,
  })
}

// This is an OAuth client for isolated QA, not an alternate issuer or verifier.
// Both HTTP requests and direct fixture reads use a freshly issued principal.
export async function createRefreshingPkceSession(
  options: RefreshingSessionOptions,
) {
  const initialPrincipal = await options.verifyAccessToken(
    options.grant.accessToken,
  )
  assert.equal(initialPrincipal.clientId, options.clientId)
  assert.equal(initialPrincipal.grantId, options.grant.grantId)
  assert.equal(initialPrincipal.audience, `${options.origin}/mcp`)
  const expectedAuthority = authority(initialPrincipal)
  const schedulingNow = options.schedulingClock ?? Date.now
  let current = {
    accessToken: options.grant.accessToken,
    refreshToken: options.grant.refreshToken,
    principal: initialPrincipal,
  }
  let pending: Promise<typeof current> | undefined = undefined
  let rejected = false
  let refreshCount = 0
  const refreshes: Array<{
    readonly reason: "expiry-margin" | "explicit-qa-check"
    readonly remainingSeconds: number
    readonly sameAuthority: true
  }> = []

  async function rotate(forced: boolean) {
    const previous = current
    const remainingSeconds = Math.max(
      0,
      Math.floor((previous.principal.expiresAt - schedulingNow()) / 1000),
    )

    try {
      const response = await options.fetchImpl(
        `${options.origin}/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          signal: AbortSignal.timeout(10_000),
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: options.clientId,
            refresh_token: previous.refreshToken,
            resource: `${options.origin}/mcp`,
          }),
        },
      )
      assert.equal(response.status, 200, "QA OAuth refresh was rejected")
      const tokens = oauthTokenResponseSchema.parse(await response.json())
      const principal = await options.verifyAccessToken(tokens.access_token)
      assert(
        authority(principal) === expectedAuthority,
        "QA OAuth refresh changed the granted authority",
      )
      assert(
        tokens.access_token !== previous.accessToken &&
          tokens.refresh_token !== previous.refreshToken,
        "QA OAuth refresh did not rotate both tokens",
      )
      assert(
        principal.expiresAt > Date.now(),
        "QA OAuth refresh returned an expired principal",
      )
      current = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        principal,
      }
      refreshCount += 1
      refreshes.push({
        reason: forced ? "explicit-qa-check" : "expiry-margin",
        remainingSeconds,
        sameAuthority: true,
      })

      return current
    } catch {
      // Never re-authorize, create another grant, retry a write, or hide a
      // revoked/expired grant. Also keep tokens out of diagnostics.
      rejected = true
      throw new Error("QA_OAUTH_REFRESH_REJECTED")
    }
  }

  async function fresh(forced = false) {
    if (rejected) {
      throw new Error("QA_OAUTH_REFRESH_REJECTED")
    }

    if (pending) {
      return pending
    }

    if (!forced && current.principal.expiresAt - schedulingNow() > 30_000) {
      return current
    }

    pending = rotate(forced)

    try {
      return await pending
    } finally {
      pending = undefined
    }
  }

  return Object.freeze({
    async token() {
      return (await fresh()).accessToken
    },
    async principal() {
      return (await fresh()).principal
    },
    async refresh() {
      return (await fresh(true)).principal
    },
    evidence() {
      return {
        kind: "actual-issuer-oauth-refresh" as const,
        scheduler: options.schedulingClock
          ? "controlled-client-scheduler"
          : "wall-clock",
        accessTokenLifetimeSeconds: options.grant.expiresIn,
        refreshCount,
        rejected,
        automaticReauthorization: false,
        refreshes: refreshes.map((entry) => ({ ...entry })),
      }
    },
  })
}
