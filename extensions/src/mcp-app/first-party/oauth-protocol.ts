import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
} from "node:crypto"
import { z } from "zod"
import { scopes as toolScopes } from "../contracts/tools.ts"
import { validateConfig } from "../server/authorization.ts"
import type { ServerConfig } from "../server/dependencies.ts"

export class OAuthError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "invalid_scope"
      | "access_denied"
      | "temporarily_unavailable",
  ) {
    super(code)
  }
}
const opaque = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/u)
const bounded = z.string().min(1).max(256)
const seconds = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER / 1000)
const requestSchema = z.strictObject({
  response_type: z.literal("code"),
  client_id: bounded,
  redirect_uri: z.string().url().max(2048),
  resource: z.string().url().max(2048),
  scope: z.string().min(1).max(1024),
  state: z.string().min(16).max(1024),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  code_challenge_method: z.literal("S256"),
})
const ticketSchema = requestSchema.extend({
  nonce: opaque,
  expires_at: seconds,
})
export type AuthorizationTicket = z.infer<typeof ticketSchema>
export interface OAuthClient {
  clientId: string
  redirectUris: readonly string[]
  scopes: readonly string[]
}
export interface OAuthCryptoOptions {
  config: ServerConfig
  clients: readonly OAuthClient[]
  keyId: string
  /** Deployment-owned persistent keys; never generated/defaulted by production. */
  signingPrivateKeyPem: string
  ticketEncryptionKey: Uint8Array
}
export const authorizationCodeSchema = z.strictObject({
  accountId: z.uuid(),
  grantId: opaque,
  clientId: bounded,
  nonce: opaque,
  expiresAt: seconds,
})
export const refreshTokenSchema = authorizationCodeSchema
export type OAuthCode = z.infer<typeof authorizationCodeSchema>
const downloadTicketSchema = z.strictObject({
  accountId: z.uuid(),
  grantId: opaque,
  requestKey: opaque,
  exportId: opaque,
  draftId: opaque,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  format: z.enum(["tada-json", "enhanced-bundle"]),
  authoredSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})
export type OAuthDownloadTicket = z.infer<typeof downloadTicketSchema>
const fail = (code: ConstructorParameters<typeof OAuthError>[0]): never => {
  throw new OAuthError(code)
}
export const tokenDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export const pkceChallenge = (verifier: string) => {
  if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier)) return fail("invalid_grant")
  return createHash("sha256").update(verifier, "ascii").digest("base64url")
}
export const randomOpaque = () => randomBytes(24).toString("base64url")

/** Explicit preregistered public clients + PKCE. No caller-controlled metadata
 * fetch/DCR, redirect wildcard, signing-key fallback or manager-token reuse. */
export function createOAuthProtocol(options: OAuthCryptoOptions) {
  const config = validateConfig(options.config)
  if (
    !bounded.safeParse(options.keyId).success ||
    options.ticketEncryptionKey.byteLength !== 32
  )
    throw new Error("Explicit persistent OAuth key configuration required")
  const encryptionKey = Buffer.from(options.ticketEncryptionKey)
  const signingKey = createPrivateKey(options.signingPrivateKeyPem)
  if (signingKey.asymmetricKeyType !== "ed25519")
    throw new Error("Explicit Ed25519 OAuth issuer key required")
  const publicKey = createPublicKey(signingKey).export({ format: "jwk" })
  const knownScopes = new Set(Object.values(toolScopes).flat())
  const clients = new Map<string, Readonly<OAuthClient>>()
  if (!options.clients.length || options.clients.length > 20)
    throw new Error("Explicit OAuth clients required")
  for (const client of options.clients) {
    if (
      !bounded.safeParse(client.clientId).success ||
      clients.has(client.clientId) ||
      !client.redirectUris.length ||
      client.redirectUris.length > 4 ||
      !client.scopes.length ||
      client.scopes.some((scope) => !knownScopes.has(scope))
    )
      throw new Error("Invalid OAuth client configuration")
    for (const redirect of client.redirectUris) {
      const url = new URL(redirect)
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        url.href !== redirect
      )
        throw new Error("Exact HTTPS OAuth redirect required")
    }
    clients.set(
      client.clientId,
      Object.freeze({
        ...client,
        redirectUris: Object.freeze([...client.redirectUris]),
        scopes: Object.freeze([...client.scopes]),
      }),
    )
  }
  const client = (id: string) => clients.get(id) ?? fail("invalid_client")
  const seal = (
    purpose: "request" | "code" | "refresh" | "download",
    value: unknown,
  ) => {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
    cipher.setAAD(Buffer.from("tadazz-oauth-v1:" + purpose))
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ])
    return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")
  }
  const open = (
    purpose: "request" | "code" | "refresh" | "download",
    value: string,
  ): unknown => {
    try {
      if (!/^[A-Za-z0-9_-]{40,8192}$/u.test(value)) throw new Error()
      const bytes = Buffer.from(value, "base64url")
      if (bytes.toString("base64url") !== value) throw new Error()
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        bytes.subarray(0, 12),
      )
      decipher.setAAD(Buffer.from("tadazz-oauth-v1:" + purpose))
      decipher.setAuthTag(bytes.subarray(-16))
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(12, -16)),
          decipher.final(),
        ]).toString("utf8"),
      )
    } catch {
      return fail("invalid_grant")
    }
  }
  const parseRequest = (raw: unknown) => {
    const result = requestSchema.safeParse(raw)
    if (!result.success) return fail("invalid_request")
    const request = result.data
    const selected = client(request.client_id)
    if (
      !selected.redirectUris.includes(request.redirect_uri) ||
      request.resource !== config.resource
    )
      return fail("invalid_request")
    if (
      Buffer.from(request.code_challenge, "base64url").toString("base64url") !==
      request.code_challenge
    )
      return fail("invalid_request")
    const requested = request.scope.split(" ")
    if (
      new Set(requested).size !== requested.length ||
      requested.length > 20 ||
      requested.some((scope) => !selected.scopes.includes(scope))
    )
      return fail("invalid_scope")
    return request
  }
  const readTicket = (ticket: string) => {
    const parsed = ticketSchema.safeParse(open("request", ticket))
    if (!parsed.success || parsed.data.expires_at * 1000 <= Date.now())
      return fail("invalid_grant")
    parseRequest(
      requestSchema.parse(
        Object.fromEntries(
          Object.entries(parsed.data).filter(
            ([name]) => name !== "nonce" && name !== "expires_at",
          ),
        ),
      ),
    )
    return parsed.data
  }
  const readCode = (purpose: "code" | "refresh", encoded: string) => {
    const result = authorizationCodeSchema.safeParse(open(purpose, encoded))
    if (!result.success || result.data.expiresAt * 1000 <= Date.now())
      return fail("invalid_grant")
    client(result.data.clientId)
    return result.data
  }
  return Object.freeze({
    config,
    client,
    readTicket,
    downloadTicket(value: OAuthDownloadTicket) {
      return seal("download", downloadTicketSchema.parse(value))
    },
    readDownloadTicket(
      encoded: string,
      requireFresh = true,
    ): OAuthDownloadTicket {
      const parsed = downloadTicketSchema.safeParse(open("download", encoded))
      if (
        !parsed.success ||
        (requireFresh && parsed.data.expiresAt <= Date.now())
      )
        return fail("invalid_grant")
      return parsed.data
    },
    consentProof(accountId: string, sid: string, ticket: string) {
      readTicket(ticket)
      return createHmac("sha256", encryptionKey)
        .update(
          JSON.stringify([
            "tadazz-oauth-consent-v1",
            accountId,
            sid,
            tokenDigest(ticket),
          ]),
        )
        .digest("hex")
    },
    checkConsentProof(
      accountId: string,
      sid: string,
      ticket: string,
      proof: string,
    ) {
      if (!/^[a-f0-9]{64}$/u.test(proof)) return fail("access_denied")
      const expected = createHmac("sha256", encryptionKey)
        .update(
          JSON.stringify([
            "tadazz-oauth-consent-v1",
            accountId,
            sid,
            tokenDigest(ticket),
          ]),
        )
        .digest()
      if (!timingSafeEqual(expected, Buffer.from(proof, "hex")))
        return fail("access_denied")
      readTicket(ticket)
    },
    begin(raw: unknown) {
      const request = parseRequest(raw)
      const ticket = {
        ...request,
        nonce: randomOpaque(),
        expires_at: Math.floor(Date.now() / 1000) + 300,
      }
      const encoded = seal("request", ticket)
      if (encoded.length > 8192) return fail("invalid_request")
      return {
        ticket: encoded,
        clientId: request.client_id,
        scopes: request.scope.split(" "),
        expiresAt: ticket.expires_at * 1000,
      }
    },
    code(value: OAuthCode) {
      return seal("code", authorizationCodeSchema.parse(value))
    },
    readCode: (value: string) => readCode("code", value),
    refresh(value: OAuthCode) {
      return seal("refresh", refreshTokenSchema.parse(value))
    },
    readRefresh: (value: string) => readCode("refresh", value),
    access(grant: {
      grantId: string
      accountId: string
      subject: string
      clientId: string
      scopes: readonly string[]
      expiresAt: number
    }) {
      const now = Math.floor(Date.now() / 1000)
      const expires = Math.min(now + 300, Math.floor(grant.expiresAt / 1000))
      if (expires <= now) return fail("invalid_grant")
      const unsigned = [
        { alg: "EdDSA", typ: "at+jwt", kid: options.keyId },
        {
          iss: config.issuer,
          aud: config.resource,
          sub: grant.subject,
          client_id: grant.clientId,
          grant_id: grant.grantId,
          account_id: grant.accountId,
          scope: grant.scopes.join(" "),
          iat: now,
          exp: expires,
          jti: randomUUID(),
        },
      ]
        .map((value) =>
          Buffer.from(JSON.stringify(value)).toString("base64url"),
        )
        .join(".")
      return {
        access_token:
          unsigned +
          "." +
          sign(null, Buffer.from(unsigned), signingKey).toString("base64url"),
        token_type: "Bearer" as const,
        expires_in: expires - now,
        scope: grant.scopes.join(" "),
      }
    },
    authorizationResponse(ticket: AuthorizationTicket, code: string) {
      const request = parseRequest(
        requestSchema.parse(
          Object.fromEntries(
            Object.entries(ticket).filter(
              ([name]) => name !== "nonce" && name !== "expires_at",
            ),
          ),
        ),
      )
      const url = new URL(request.redirect_uri)
      url.searchParams.set("code", code)
      url.searchParams.set("state", request.state)
      url.searchParams.set("iss", config.issuer)
      return url.href
    },
    metadata() {
      const issuer = new URL(config.issuer)
      const endpoint = (path: string) =>
        new URL(issuer.pathname.replace(/\/$/u, "") + path, issuer.origin).href
      return {
        issuer: config.issuer,
        authorization_endpoint: endpoint("/authorize"),
        token_endpoint: endpoint("/token"),
        revocation_endpoint: endpoint("/revoke"),
        jwks_uri: endpoint("/jwks.json"),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
        scopes_supported: [...knownScopes],
      }
    },
    jwks() {
      return {
        keys: [{ ...publicKey, kid: options.keyId, alg: "EdDSA", use: "sig" }],
      }
    },
  })
}
export type OAuthProtocol = ReturnType<typeof createOAuthProtocol>
