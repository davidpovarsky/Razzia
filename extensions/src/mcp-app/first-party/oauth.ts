import { createPublicKey } from "node:crypto"
import { Hono } from "hono"
import type { ApiEnv } from "@razzia/socket/api/factory"
import { z } from "zod"
import { createAccessTokenVerifier } from "../server/access-token.ts"
import type {
  AuthoringPolicy,
  VerifiedPrincipal,
} from "../server/dependencies.ts"
import { createRemoteMcpApp, type RemoteMcpOptions } from "../server/http.ts"
import { loadFirstPartyBindings } from "./bindings.ts"
import { FirstPartyOAuthGrants } from "./oauth-grants.ts"
import {
  createOAuthProtocol,
  OAuthError,
  type OAuthCryptoOptions,
} from "./oauth-protocol.ts"
import { IngressBudget, bodyText, HttpRejection } from "./ingress.ts"
import type { FirstPartyExportPolicy } from "./oauth-export.ts"
import type { FirstPartyNativeSaveOptions } from "./oauth-native-save.ts"
import type { FirstPartyCatalogOptions } from "./oauth-catalog.ts"
import { safeError, ToolError } from "../server/errors.ts"
import { CONTRACT_VERSION } from "../contracts/schemas.ts"
import type { PackageAuthoringPort } from "../server/package-authoring.ts"
import {
  nativeSaveInspectInput,
  nativeSaveApproveInput,
} from "../contracts/native-save.ts"

export type {
  FirstPartyExportPolicy,
  ExportRightsContext,
} from "./oauth-export.ts"

export type { FirstPartyNativeSaveOptions } from "./oauth-native-save.ts"

export type { FirstPartyCatalogOptions } from "./oauth-catalog.ts"

export interface FirstPartyOAuthOptions extends OAuthCryptoOptions {
  configRoot: string

  /**
   * Existing first-party UI must inspect/display scopes and require a click.
   * No missing consent page is silently invented or replaced by auto-approval.
   */

  consentPageUrl: string

  /**
   * Explicit deployment-owned authoring/rights policy. Missing means no export
   * adapter and no download route; native Save consent is unrelated.
   */

  exportPolicy?: FirstPartyExportPolicy
  // Separate exact-revision native consent and actual C1 durable operation port.
  // Missing means no storage adapter or native-consent machine endpoints.
  nativeSave?: FirstPartyNativeSaveOptions
}

const ticketBody = z.strictObject({ ticket: z.string().min(40).max(8192) })
const approvalBody = ticketBody.extend({
  decision: z.literal("allow"),
  proof: z.string().regex(/^[a-f0-9]{64}$/u),
})
const codeBody = z.strictObject({
  grant_type: z.literal("authorization_code"),
  client_id: z.string().min(1).max(256),
  code: z.string().min(40).max(8192),
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z.string().url().max(2048),
  resource: z.string().url().max(2048),
})
const refreshBody = z.strictObject({
  grant_type: z.literal("refresh_token"),
  client_id: z.string().min(1).max(256),
  refresh_token: z.string().min(40).max(8192),
  resource: z.string().url().max(2048),
})
const revokeBody = z.strictObject({
  client_id: z.string().min(1).max(256),
  token: z.string().min(1).max(8192),
  token_type_hint: z.literal("refresh_token").optional(),
})
const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
}
const active = (signal: AbortSignal) => {
  if (signal.aborted) {
    throw new OAuthError("access_denied")
  }
}
function isEmptyParameterRecord(
  value: unknown,
): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === null &&
    Reflect.ownKeys(value).length === 0
  )
}
const uniqueParameters = (parameters: URLSearchParams) => {
  const values: unknown = Object.create(null)

  if (!isEmptyParameterRecord(values)) {
    throw new OAuthError("invalid_request")
  }

  for (const [key, value] of parameters) {
    if (Object.hasOwn(values, key) || key.length > 100 || value.length > 8192) {
      throw new OAuthError("invalid_request")
    }

    values[key] = value
  }

  return values
}
function failure(error: unknown) {
  if (error instanceof HttpRejection) {
    return Response.json(
      { error: "invalid_request" },
      { status: error.status, headers },
    )
  }

  const code =
    error instanceof OAuthError ? error.code : "temporarily_unavailable"

  const getFailureStatus = () => {
    if (code === "temporarily_unavailable") {
      return 503
    }

    if (code === "access_denied") {
      return 403
    }

    return 400
  }

  return Response.json(
    { error: code },
    {
      status: getFailureStatus(),
      headers,
    },
  )
}

/**
 * Real account-backed, unmounted OAuth issuer. No login/password endpoint,
 * listener, provider account, public tunnel or production-key generation.
 * Consent UI and HTTPS route integration are explicit host dependencies.
 */

export async function createFirstPartyOAuth(options: FirstPartyOAuthOptions) {
  const protocol = createOAuthProtocol(options)
  const issuer = new URL(protocol.config.issuer)

  if (
    options.exportPolicy &&
    !protocol.config.firstPartyOrigins?.includes(issuer.origin)
  ) {
    throw new Error("Export delivery origin must be explicitly allowed")
  }

  const consentPage = new URL(options.consentPageUrl)

  if (
    consentPage.protocol !== "https:" ||
    consentPage.origin !== issuer.origin ||
    consentPage.username ||
    consentPage.password ||
    consentPage.hash
  ) {
    throw new Error("Exact same-origin first-party consent page required")
  }

  const auth = await loadFirstPartyBindings(options.configRoot)
  auth.prepareRuntime()
  const grants = new FirstPartyOAuthGrants(auth, protocol)
  const base = issuer.pathname.replace(/\/$/u, "")
  const endpoint = (name: string) => `${base}/${name}`

  const metadataPath = `/.well-known/oauth-authorization-server${base === "" ? "" : base}`

  const budget = new IngressBudget()
  const issued = new WeakSet()
  const verify = createAccessTokenVerifier({
    config: protocol.config,
    keys: [
      {
        kid: options.keyId,
        algorithm: "EdDSA",
        pem: createPublicKey(options.signingPrivateKeyPem).export({
          type: "spki",
          format: "pem",
        }),
      },
    ],
    activeGrant: async (grantId, accountId) =>
      grants.activeGrant(accountId, grantId),
    activeAccount: async (accountId) => auth.delegatedAccountActive(accountId),
    maxLifetimeSeconds: 300,
  })
  const verifyAccessToken = async (token: string, signal?: AbortSignal) => {
    const p = await verify(token, signal)
    issued.add(p)

    return p
  }
  const assertIssued = (p: VerifiedPrincipal) => {
    if (!issued.has(p) || p.expiresAt <= Date.now()) {
      throw new OAuthError("invalid_grant")
    }
  }
  const principalAccepted = (raw: unknown, accepted: VerifiedPrincipal) => {
    if (!raw || typeof raw !== "object" || !issued.has(raw)) {
      throw new OAuthError("invalid_grant")
    }

    issued.add(accepted)
  }
  const nativeSave = options.nativeSave
    ? grants.nativeSave(options.nativeSave, assertIssued)
    : undefined

  return Object.freeze({
    verifyAccessToken,
    packages: (adapter: PackageAuthoringPort) =>
      grants.packages(adapter, assertIssued),
    catalog: (catalogOptions: FirstPartyCatalogOptions) =>
      grants.catalog(catalogOptions, assertIssued),
    draftRepository: (policy: AuthoringPolicy) =>
      grants.drafts(policy, assertIssued),
    semanticDraftRepository: (policy: AuthoringPolicy) =>
      grants.drafts(policy, assertIssued).semantic,
    exports: options.exportPolicy
      ? grants.exports(options.exportPolicy, assertIssued)
      : undefined,
    storage: nativeSave?.storage,
    remote(
      remoteOptions: Omit<RemoteMcpOptions, "verifyAccessToken" | "config">,
    ) {
      return createRemoteMcpApp({
        ...remoteOptions,
        config: protocol.config,
        verifyAccessToken,
        dependencies: { ...remoteOptions.dependencies, principalAccepted },
      })
    },
    async fetch(request: Request): Promise<Response> {
      let release: (() => void) | undefined = undefined

      try {
        release = budget.enter()
        active(request.signal)
        const url = new URL(request.url)

        if (
          request.url.length > 16_384 ||
          url.origin !== issuer.origin ||
          request.headers.get("host") !== issuer.host ||
          url.hash
        ) {
          throw new OAuthError("invalid_request")
        }

        let bytes = 0
        let count = 0
        let badHeaders = false
        request.headers.forEach((value, name) => {
          bytes += Buffer.byteLength(name + value)
          count += 1

          if (
            count > 32 ||
            bytes > 16_384 ||
            value.length > 8192 ||
            name === "forwarded" ||
            name.startsWith("x-forwarded-")
          ) {
            badHeaders = true
          }
        })

        if (badHeaders) {
          throw new OAuthError("invalid_request")
        }

        const declared = request.headers.get("content-length")

        if (
          declared !== null &&
          (!/^(0|[1-9][0-9]{0,8})$/u.test(declared) ||
            Number(declared) > 65_536)
        ) {
          throw new HttpRejection(413)
        }

        const origin = request.headers.get("origin")

        if (origin !== null && origin !== issuer.origin) {
          throw new OAuthError("access_denied")
        }

        const publicJson = (value: unknown) => Response.json(value, { headers })

        if (request.method === "GET" && !url.search && !request.body) {
          const downloadPrefix = endpoint("downloads/")

          if (url.pathname.startsWith(downloadPrefix)) {
            if (!options.exportPolicy) {
              return new Response(null, { status: 404, headers })
            }

            try {
              const file = grants.download(
                url.pathname.slice(downloadPrefix.length),
                options.exportPolicy,
              )
              active(request.signal)

              return new Response(file.body, {
                headers: {
                  ...headers,
                  "content-type": "application/json; charset=utf-8",
                  "content-length": String(file.data.bytes),
                  "content-disposition": `attachment; filename="tadazz-${file.data.exportId}.${file.data.format === "tada-json" ? "tada" : "enhanced"}.json"`,
                },
              })
            } catch {
              return new Response(null, { status: 404, headers })
            }
          }

          if (url.pathname === metadataPath) {
            return publicJson(protocol.metadata())
          }

          if (url.pathname === endpoint("jwks.json")) {
            return publicJson(protocol.jwks())
          }
        }

        if (
          url.pathname === endpoint("authorize") &&
          request.method === "GET" &&
          !request.body
        ) {
          const begun = protocol.begin(uniqueParameters(url.searchParams))
          const target = new URL(consentPage)
          target.searchParams.set("oauth_request", begun.ticket)

          return new Response(null, {
            status: 302,
            headers: { ...headers, location: target.href },
          })
        }

        if (
          url.search ||
          request.method !== "POST" ||
          request.headers.has("content-encoding")
        ) {
          throw new OAuthError("invalid_request")
        }

        const contentType = request.headers.get("content-type") ?? ""
        const isNativeConsent =
          url.pathname === endpoint("native-save/inspect") ||
          url.pathname === endpoint("native-save/approve")

        if (
          url.pathname === endpoint("inspect") ||
          url.pathname === endpoint("approve") ||
          isNativeConsent
        ) {
          if (isNativeConsent && !nativeSave) {
            return new Response(null, { status: 404, headers })
          }

          if (
            origin !== issuer.origin ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
          ) {
            throw new OAuthError("access_denied")
          }

          const app = new Hono<ApiEnv>()
          app.use("*", auth.requireManager)
          app.post("*", async (c) => {
            const raw: unknown = JSON.parse(await bodyText(request))
            active(request.signal)
            const p = await auth.principal(c)
            active(request.signal)

            if (isNativeConsent) {
              if (!nativeSave) {
                throw new ToolError("DEPENDENCY_UNAVAILABLE")
              }

              const data =
                url.pathname === endpoint("native-save/inspect")
                  ? nativeSave.inspect(
                      p,
                      nativeSaveInspectInput.parse(raw).consentRequestId,
                    )
                  : (() => {
                      const body = nativeSaveApproveInput.parse(raw)

                      return nativeSave.approve(
                        p,
                        body.consentRequestId,
                        body.proof,
                      )
                    })()
              active(request.signal)
              auth.assertActive(p)

              return publicJson({
                contractVersion: CONTRACT_VERSION,
                ok: true,
                data,
              })
            }

            if (url.pathname === endpoint("inspect")) {
              const body = ticketBody.parse(raw)
              const ticket = protocol.readTicket(body.ticket)
              auth.assertActive(p)

              return publicJson({
                clientId: ticket.client_id,
                scopes: ticket.scope.split(" "),
                expiresAt: ticket.expires_at * 1000,
                proof: protocol.consentProof(p.accountId, p.sid, body.ticket),
              })
            }

            const body = approvalBody.parse(raw)
            protocol.checkConsentProof(
              p.accountId,
              p.sid,
              body.ticket,
              body.proof,
            )
            active(request.signal)
            const result = grants.approve(p, body.ticket)
            active(request.signal)
            auth.assertActive(p)

            return publicJson(result)
          })
          app.onError((error) => {
            if (isNativeConsent) {
              const safe =
                error instanceof ToolError
                  ? error
                  : new ToolError(
                      error instanceof z.ZodError ||
                        error instanceof SyntaxError ||
                        error instanceof HttpRejection
                        ? "VALIDATION_FAILED"
                        : "DEPENDENCY_UNAVAILABLE",
                    )
              const statuses: Partial<Record<typeof safe.code, number>> = {
                SCOPE_REQUIRED: 403,
                NOT_FOUND: 404,
                REVISION_CONFLICT: 409,
                CONSENT_REQUIRED: 409,
                VALIDATION_FAILED: 400,
              }
              const status =
                error instanceof HttpRejection
                  ? error.status
                  : (statuses[safe.code] ?? 503)

              return Response.json(
                {
                  contractVersion: CONTRACT_VERSION,
                  ok: false,
                  error: safeError(safe),
                },
                { status, headers },
              )
            }

            return failure(
              error instanceof z.ZodError || error instanceof SyntaxError
                ? new OAuthError("invalid_request")
                : error,
            )
          })
          const result = await app.fetch(request)
          active(request.signal)
          for (const [key, value] of Object.entries(headers)) {
            result.headers.set(key, value)
          }

          return result
        }

        if (
          !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/iu.test(
            contentType,
          ) ||
          request.headers.has("authorization")
        ) {
          throw new OAuthError("invalid_client")
        }

        const fields = uniqueParameters(
          new URLSearchParams(await bodyText(request)),
        )
        active(request.signal)

        if (url.pathname === endpoint("token")) {
          let result: unknown = undefined

          if (fields.grant_type === "authorization_code") {
            result = grants.exchange(codeBody.parse(fields))
          } else if (fields.grant_type === "refresh_token") {
            result = grants.rotate(refreshBody.parse(fields))
          } else {
            throw new OAuthError("invalid_request")
          }

          active(request.signal)

          return publicJson(result)
        }

        if (url.pathname === endpoint("revoke")) {
          const body = revokeBody.parse(fields)
          grants.revokeToken(body.client_id, body.token)
          active(request.signal)

          return new Response(null, { status: 200, headers })
        }

        return new Response(null, { status: 404, headers })
      } catch (error) {
        return failure(
          error instanceof z.ZodError || error instanceof SyntaxError
            ? new OAuthError("invalid_request")
            : error,
        )
      } finally {
        release?.()
      }
    },
  })
}
