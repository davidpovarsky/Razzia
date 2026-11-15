import { createPublicKey, verify, type KeyObject } from "node:crypto"
import { z } from "zod"
import type { ServerConfig, VerifiedPrincipal } from "./dependencies.ts"
import { validateConfig } from "./authorization.ts"
import { ToolError } from "./errors.ts"
import { scopes } from "../contracts/tools.ts"

const text = z.string().min(1).max(256)
const headerSchema = z.strictObject({
  alg: z.enum(["RS256", "EdDSA"]),
  kid: text,
  typ: z.literal("at+jwt"),
})
const claimsSchema = z.strictObject({
  iss: z.string(),
  aud: z.string(),
  sub: text,
  client_id: text,
  grant_id: text,
  account_id: z.uuid(),
  scope: z.string().min(1).max(1024),
  iat: z.number().int().nonnegative(),
  nbf: z.number().int().nonnegative().optional(),
  exp: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER / 1000),
  jti: text,
})
export interface ActiveOAuthGrant {
  grantId: string
  subject: string
  clientId: string
  accountId: string
  scopes: readonly string[]
  expiresAt: number
  active: true
}
export interface AccessTokenOptions {
  config: ServerConfig
  /** Deployment-owned public keys. Token-supplied URLs/JWKs are never fetched. */
  keys: readonly { kid: string; algorithm: "RS256" | "EdDSA"; pem: string }[]
  /** Real durable authority checks, required on EVERY verification. */
  activeGrant(
    grantId: string,
    accountId: string,
  ): Promise<ActiveOAuthGrant | undefined>
  activeAccount(accountId: string): Promise<boolean>
  /** Maximum issued lifetime, not a clock-skew/expiry bypass. */
  maxLifetimeSeconds?: number
}
const denied = () => new ToolError("SCOPE_REQUIRED")
const decode = (part: string) => {
  if (!/^[A-Za-z0-9_-]+$/u.test(part)) throw denied()
  const bytes = Buffer.from(part, "base64url")
  if (bytes.toString("base64url") !== part) throw denied()
  return bytes
}

/** Resource-specific JWT verifier. This does not issue grants, implement PKCE,
 * or accept existing manager JWTs as OAuth tokens. No global key/token cache. */
export function createAccessTokenVerifier(options: AccessTokenOptions) {
  const config = validateConfig(options.config)
  const maxLifetime = options.maxLifetimeSeconds ?? 600
  if (
    !Number.isSafeInteger(maxLifetime) ||
    maxLifetime < 1 ||
    maxLifetime > 3600
  )
    throw new Error("Invalid access token lifetime")
  const allowedScopes = new Set(Object.values(scopes).flat())
  const keys = new Map<
    string,
    { algorithm: "RS256" | "EdDSA"; key: KeyObject }
  >()
  if (!options.keys.length || options.keys.length > 8)
    throw new Error("Explicit OAuth public keys required")
  for (const item of options.keys) {
    if (!text.safeParse(item.kid).success || keys.has(item.kid))
      throw new Error("Invalid OAuth key identifier")
    const key = createPublicKey(item.pem)
    if (
      (item.algorithm === "RS256" &&
        (key.asymmetricKeyType !== "rsa" ||
          (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)) ||
      (item.algorithm === "EdDSA" && key.asymmetricKeyType !== "ed25519")
    )
      throw new Error("Invalid OAuth public key type")
    keys.set(item.kid, { algorithm: item.algorithm, key })
  }
  return async function verifyAccessToken(
    token: string,
    signal?: AbortSignal,
  ): Promise<VerifiedPrincipal> {
    const current = () => {
      if (signal?.aborted) throw denied()
      return Date.now()
    }
    try {
      current()
      if (token.length > 8192) throw denied()
      const parts = token.split(".")
      if (parts.length !== 3) throw denied()
      const [encodedHeader, encodedClaims, encodedSignature] = parts as [
        string,
        string,
        string,
      ]
      const header = headerSchema.parse(
        JSON.parse(decode(encodedHeader).toString("utf8")),
      )
      const selected = keys.get(header.kid)
      if (!selected || selected.algorithm !== header.alg) throw denied()
      if (
        !verify(
          header.alg === "RS256" ? "RSA-SHA256" : null,
          Buffer.from(encodedHeader + "." + encodedClaims, "ascii"),
          selected.key,
          decode(encodedSignature),
        )
      )
        throw denied()
      const claims = claimsSchema.parse(
        JSON.parse(decode(encodedClaims).toString("utf8")),
      )
      const now = current()
      if (
        claims.iss !== config.issuer ||
        claims.aud !== config.resource ||
        claims.exp * 1000 <= now ||
        claims.iat * 1000 > now ||
        (claims.nbf !== undefined && claims.nbf * 1000 > now) ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > maxLifetime
      )
        throw denied()
      const grantedScopes = claims.scope.split(" ")
      if (
        grantedScopes.length > 20 ||
        new Set(grantedScopes).size !== grantedScopes.length ||
        grantedScopes.some((scope) => !allowedScopes.has(scope))
      )
        throw denied()
      const checkedGrant = (
        grant: ActiveOAuthGrant | undefined,
      ): ActiveOAuthGrant => {
        current()
        if (
          !grant ||
          grant.active !== true ||
          grant.grantId !== claims.grant_id ||
          grant.subject !== claims.sub ||
          grant.clientId !== claims.client_id ||
          grant.accountId !== claims.account_id ||
          grant.expiresAt <= Date.now() ||
          grantedScopes.some((scope) => !grant.scopes.includes(scope))
        )
          throw denied()
        return { ...grant, scopes: [...grant.scopes] }
      }
      let grant = checkedGrant(
        await options.activeGrant(claims.grant_id, claims.account_id),
      )
      if (!(await options.activeAccount(grant.accountId))) throw denied()
      current()
      // Do not return a stale grant across the separate asynchronous account check.
      // Atomic revocation still belongs to the authoritative backing service.
      grant = checkedGrant(
        await options.activeGrant(claims.grant_id, claims.account_id),
      )
      if (claims.exp * 1000 <= Date.now() || grant.expiresAt <= Date.now())
        throw denied()
      return Object.freeze({
        issuer: config.issuer,
        audience: config.resource,
        subject: grant.subject,
        clientId: grant.clientId,
        grantId: grant.grantId,
        accountId: grant.accountId,
        scopes: Object.freeze(grantedScopes),
        expiresAt: Math.min(claims.exp * 1000, grant.expiresAt),
        active: true,
        accountsEnabled: true,
      })
    } catch {
      // Keys, token bytes, backend exception text and rejected claims stay private.
      throw denied()
    }
  }
}
