import { promiseFrom } from "../shared/promise-operation.ts"
import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { authorize, validateConfig } from "./authorization.ts"
import { createTadazzMcpHttpHandler } from "./factory.ts"
import { inputs, toolNames, scopes } from "../contracts/tools.ts"
import { FULL_SHOW_RESOURCE_V3 } from "../contracts/full-show-frame.ts"
import { LIMITS, PREVIEW_RESOURCE } from "../contracts/schemas.ts"
import { PREVIEW_UI_RESPONSE_LIMIT } from "./preview-resource.ts"

import {
  IngressBudget,
  HttpRejection,
  bodyText,
} from "../first-party/ingress.ts"

export interface RemoteMcpOptions {
  config: ServerConfig
  /** Browser origins are explicit. Absent Origin is permitted for server clients. */
  allowedOrigins: readonly string[]
  /** Trusted host setting; a deadline hides the response but never frees work. */
  responseTimeoutMs?: number
  /** Signature, issuer, exact audience, expiry, live grant and account verifier. */
  verifyAccessToken(
    token: string,
    signal: AbortSignal,
  ): Promise<VerifiedPrincipal>
  dependencies: Omit<Dependencies, "authorize" | "prevalidationLimit">
}

const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
}
function rejectResponse(status: number, challenge?: string) {
  return Response.json(
    { error: "HTTP_REJECTED", status },
    {
      status,
      headers: {
        ...responseHeaders,
        ...(status === 405 ? { allow: "POST, OPTIONS" } : {}),
        ...(challenge ? { "www-authenticate": challenge } : {}),
      },
    },
  )
}

// The SDK's JSON response option applies to its modern path. Legacy stateless
// calls can return an SSE Response before handler work settles. Buffer that
// bounded exchange through EOF so HTTP admission still owns the whole call.
// Preserve SDK framing; this does not parse or implement the MCP protocol.
async function completeLegacyResponse(
  response: Response,
  signal: AbortSignal,
  limit: number = LIMITS.response,
) {
  if (!response.body) {
    return response
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let interrupt: (error: Error) => void = () => {
    throw new Error(
      "Promise resolver interrupt was used before executor initialization",
    )
  }

  const interrupted = new Promise<never>((_, reject) => {
    interrupt = reject
  })
  let reading: ReturnType<typeof reader.read> | undefined = undefined
  let complete = false
  const abort = () => interrupt(new HttpRejection(400))
  signal.addEventListener("abort", abort, { once: true })

  try {
    if (signal.aborted) {
      abort()
    }

    for (;;) {
      reading = reader.read()
      // oxlint-disable-next-line no-await-in-loop -- Consume one read/abort race at a time to preserve original scheduling and reader ownership.
      const part = await Promise.race([reading, interrupted])
      reading = undefined

      if (part.done) {
        complete = true

        break
      }

      const chunk = part.value
      size += chunk.byteLength

      if (size > limit + 4096) {
        throw new Error("Response limit exceeded")
      }

      chunks.push(chunk.slice())
    }

    return new Response(Buffer.concat(chunks), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } finally {
    signal.removeEventListener("abort", abort)

    if (!complete) {
      await Promise.allSettled([
        reading,
        reader.cancel().catch(() => {
          /* Cancellation rejection still settles before the owned reader is released. */
        }),
      ])
    }

    reader.releaseLock()
  }
}

// Retain the HTTP admission while cancelled dependency work is still running.
// Closing transport alone does not mean durable/verification work has settled.
class RequestWork {
  private pending = new Set<Promise<unknown>>()
  constructor(private readonly signal: AbortSignal) {}
  check() {
    if (this.signal.aborted) {
      throw new HttpRejection(400)
    }
  }
  wrap<T extends object>(value: T): T {
    return new Proxy(Object.create(null) as T, {
      get: (_target, property) => {
        const member: unknown = Reflect.get(value, property)

        if (typeof member !== "function") {
          return member
        }

        return (...args: unknown[]) => {
          this.check()
          const result: unknown = Reflect.apply(member, value, args)

          if (!(result instanceof Promise)) {
            return result
          }

          this.pending.add(result)
          void result.then(
            () => this.pending.delete(result),
            () => this.pending.delete(result),
          )

          return result
        }
      },
    })
  }
  async drain() {
    while (this.pending.size) {
      // oxlint-disable-next-line no-await-in-loop -- Recheck each settled snapshot without retaining a recursive Promise chain while new work joins.
      await Promise.allSettled([...this.pending])
    }
  }
}

// Stateless SDK Streamable HTTP service. Opens no listener and trusts no proxy,
// account header, cookie, session ID or manager token. Mount only behind HTTPS
// with the exact external Request URL/Host preserved by trusted host integration.
export function createRemoteMcpApp(options: RemoteMcpOptions) {
  const config = validateConfig(options.config)
  const resource = new URL(config.resource)
  const metadata = new URL(config.resourceMetadataUrl)

  if (
    metadata.origin !== resource.origin ||
    metadata.pathname === resource.pathname
  ) {
    throw new Error("Separate same-origin protected resource metadata required")
  }

  const origins = new Set(options.allowedOrigins)
  for (const origin of origins) {
    if (new URL(origin).origin !== origin || !origin.startsWith("https://")) {
      throw new Error("Exact HTTPS browser origins required")
    }
  }
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the original receiver-free callback snapshot; calls must not acquire options as this.
  const verifyToken = options.verifyAccessToken
  const deps = Object.freeze({ ...options.dependencies })
  const budget = new IngressBudget()
  const responseTimeout = options.responseTimeoutMs ?? 30_000

  if (
    !Number.isSafeInteger(responseTimeout) ||
    responseTimeout < 1 ||
    responseTimeout > 120_000
  ) {
    throw new Error("Bounded HTTP response deadline required")
  }

  const active = new Map<AbortController, Promise<void>>()
  let closed = false
  // Request all supported permissions at initial OAuth consent; individual tools remain scoped.
  const scopeList = [...new Set(Object.values(scopes).flat())]
  const challenge = `Bearer resource_metadata="${
    config.resourceMetadataUrl
  }", scope="${scopeList.join(" ")}"`

  return Object.freeze({
    async fetch(input: Request): Promise<Response> {
      let request = input
      const lifetime = new AbortController()
      let release: (() => void) | undefined = undefined

      let server: ReturnType<typeof createTadazzMcpHttpHandler> | undefined =
        undefined
      const work = new RequestWork(lifetime.signal)
      let removeAbort = () => {
        /* No abort listener has been installed at request initialization. */
      }
      let finish = () => {
        /* No completion promise has been registered at request initialization. */
      }
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined = undefined

      let serving: Promise<Response> | undefined = undefined
      let suppliedOrigin: string | null = null
      const rejected = (status: number, suppliedChallenge?: string) => {
        const response = rejectResponse(status, suppliedChallenge)

        if (suppliedOrigin && origins.has(suppliedOrigin)) {
          response.headers.set("access-control-allow-origin", suppliedOrigin)
          response.headers.set(
            "access-control-expose-headers",
            "WWW-Authenticate, MCP-Protocol-Version",
          )
          response.headers.set("vary", "Origin")
        }

        return response
      }

      try {
        if (closed) {
          return rejected(503)
        }

        release = budget.enter()
        const completion = new Promise<void>((resolve) => {
          finish = resolve
        })
        active.set(lifetime, completion)
        const externalAbort = () => lifetime.abort()
        input.signal.addEventListener("abort", externalAbort, { once: true })
        removeAbort = () =>
          input.signal.removeEventListener("abort", externalAbort)

        if (input.signal.aborted) {
          lifetime.abort()
        }

        request = new Request(input, { signal: lifetime.signal })
        timer = setTimeout(() => {
          timedOut = true
          lifetime.abort()
        }, responseTimeout)
        const interrupted = new Promise<never>((_, reject) => {
          const abort = () => reject(new HttpRejection(400))
          const previous = removeAbort
          lifetime.signal.addEventListener("abort", abort, { once: true })
          removeAbort = () => {
            previous()
            lifetime.signal.removeEventListener("abort", abort)
          }

          if (lifetime.signal.aborted) {
            abort()
          }
        })
        serving = (async () => {
          work.check()

          if (request.url.length > 2048) {
            return rejected(400)
          }

          const url = new URL(request.url)
          let headerBytes = 0
          let headerCount = 0
          let invalidHeaders = false
          for (const [name, value] of request.headers) {
            headerBytes += Buffer.byteLength(name + value)

            headerCount += 1

            if (
              headerCount > 32 ||
              headerBytes > 16_384 ||
              value.length > 8192 ||
              name === "forwarded" ||
              name.startsWith("x-forwarded-")
            ) {
              invalidHeaders = true
            }
          }

          if (invalidHeaders) {
            return rejected(400)
          }

          if (
            url.origin !== resource.origin ||
            request.headers.get("host") !== resource.host
          ) {
            return rejected(403)
          }

          suppliedOrigin = request.headers.get("origin")

          if (suppliedOrigin !== null && !origins.has(suppliedOrigin)) {
            return rejected(403)
          }

          if (url.search || url.hash) {
            return rejected(400)
          }

          if (url.href === metadata.href) {
            if (request.method !== "GET" || request.body) {
              return rejected(405)
            }

            return Response.json(
              {
                resource: config.resource,
                authorization_servers: [config.issuer],
                scopes_supported: scopeList,
                bearer_methods_supported: ["header"],
              },
              { headers: responseHeaders },
            )
          }

          if (url.href !== config.resource) {
            return rejected(404)
          }

          if (request.method === "OPTIONS") {
            if (!suppliedOrigin || !origins.has(suppliedOrigin)) {
              return rejected(403)
            }

            const method = request.headers.get("access-control-request-method")
            const requested = (
              request.headers.get("access-control-request-headers") ?? ""
            )
              .toLowerCase()
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)

            if (
              method !== "POST" ||
              requested.some(
                (name) =>
                  ![
                    "authorization",
                    "content-type",
                    "mcp-protocol-version",
                    "mcp-method",
                    "mcp-name",
                    "accept",
                  ].includes(name),
              )
            ) {
              return rejected(403)
            }

            return new Response(null, {
              status: 204,
              headers: {
                ...responseHeaders,
                "access-control-allow-origin": suppliedOrigin,
                vary: "Origin",
                "access-control-allow-methods": "POST",
                "access-control-allow-headers": requested.join(", "),
              },
            })
          }

          const authorization = request.headers.get("authorization") ?? ""

          if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/u.test(authorization)) {
            return rejected(401, challenge)
          }

          const token = authorization.slice(7)
          const authority = work.wrap({
            verify: () => verifyToken(token, request.signal),
          })
          const verified = async () =>
            authorize(
              undefined,
              undefined,
              {
                authorize: authority.verify,
                ...(deps.principalAccepted
                  ? { principalAccepted: deps.principalAccepted }
                  : {}),
                prevalidationLimit: () => Promise.resolve(true),
                rateLimit: () => Promise.resolve(true),
              },
              config,
            )
          let initial: VerifiedPrincipal | undefined = undefined

          try {
            initial = await verified()
          } catch {
            return request.signal.aborted
              ? rejected(400)
              : rejected(401, challenge)
          }

          work.check()

          if (request.method !== "POST") {
            return rejected(405)
          }

          if (request.headers.has("mcp-session-id")) {
            return rejected(400)
          }

          if (
            request.headers.has("content-encoding") ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
              request.headers.get("content-type") ?? "",
            )
          ) {
            return rejected(415)
          }

          const declared = request.headers.get("content-length")

          if (
            declared !== null &&
            (!/^(0|[1-9][0-9]{0,8})$/u.test(declared) ||
              Number(declared) > LIMITS.request)
          ) {
            return rejected(413)
          }

          let parsedBody: unknown = undefined

          try {
            parsedBody = JSON.parse(await bodyText(request))
          } catch (error) {
            return rejected(error instanceof HttpRejection ? error.status : 400)
          }

          work.check()

          // One request per HTTP call keeps cancellation and principal accounting distinct.
          if (Array.isArray(parsedBody)) {
            return rejected(400)
          }

          if (
            parsedBody &&
            typeof parsedBody === "object" &&
            "id" in parsedBody &&
            ((typeof parsedBody.id === "string" &&
              parsedBody.id.length > 128) ||
              (typeof parsedBody.id === "number" &&
                !Number.isSafeInteger(parsedBody.id)))
          ) {
            return rejected(400)
          }

          if (
            parsedBody &&
            typeof parsedBody === "object" &&
            "method" in parsedBody &&
            parsedBody.method === "tools/call" &&
            "id" in parsedBody &&
            (typeof parsedBody.id === "string" ||
              typeof parsedBody.id === "number")
          ) {
            const raw = parsedBody as {
              id: string | number
              params?: { name?: unknown; arguments?: unknown }
            }
            const name = toolNames.find((item) => item === raw.params?.name)

            if (
              !name ||
              !inputs[name].safeParse(raw.params?.arguments ?? {}).success
            ) {
              return Response.json(
                {
                  jsonrpc: "2.0",
                  id: raw.id,
                  error: { code: -32602, message: "Invalid tool request" },
                },
                { status: 400, headers: responseHeaders },
              )
            }
          }

          const dependencies: Dependencies = {
            ...deps,
            ...(deps.rateLimit
              ? { rateLimit: work.wrap({ run: deps.rateLimit }).run }
              : {}),
            authorize: async () => {
              const p = await verified()
              work.check()

              if (
                ["subject", "accountId", "clientId", "grantId"].some(
                  (key) =>
                    p[key as keyof VerifiedPrincipal] !==
                    initial[key as keyof VerifiedPrincipal],
                )
              ) {
                throw new HttpRejection(403)
              }

              return p
            },
            prevalidationLimit: () =>
              promiseFrom(() => !request.signal.aborted),
            ...(deps.drafts ? { drafts: work.wrap(deps.drafts) } : {}),
            ...(deps.semanticDrafts
              ? { semanticDrafts: work.wrap(deps.semanticDrafts) }
              : {}),
            ...(deps.catalog ? { catalog: work.wrap(deps.catalog) } : {}),
            ...(deps.preview ? { preview: work.wrap(deps.preview) } : {}),
            ...(deps.previewCandidateV2
              ? { previewCandidateV2: work.wrap(deps.previewCandidateV2) }
              : {}),
            ...(deps.fullShowPreviewV3
              ? { fullShowPreviewV3: work.wrap(deps.fullShowPreviewV3) }
              : {}),
            ...(deps.storage ? { storage: work.wrap(deps.storage) } : {}),
            ...(deps.exports ? { exports: work.wrap(deps.exports) } : {}),
          }
          server = createTadazzMcpHttpHandler(config, dependencies)
          work.check()
          let response = await server.fetch(request, { parsedBody })
          const uiRead =
            parsedBody &&
            typeof parsedBody === "object" &&
            "method" in parsedBody &&
            parsedBody.method === "resources/read" &&
            "params" in parsedBody &&
            parsedBody.params &&
            typeof parsedBody.params === "object" &&
            "uri" in parsedBody.params &&
            ((deps.previewUiResource &&
              parsedBody.params.uri === PREVIEW_RESOURCE) ||
              (deps.fullShowUiResourceV3 &&
                parsedBody.params.uri === FULL_SHOW_RESOURCE_V3))
          response = await completeLegacyResponse(
            response,
            request.signal,
            uiRead ? PREVIEW_UI_RESPONSE_LIMIT : LIMITS.response,
          )
          work.check()

          if (response.status >= 400) {
            return rejected(response.status)
          }

          for (const [name, value] of Object.entries(responseHeaders)) {
            response.headers.set(name, value)
          }

          if (suppliedOrigin) {
            response.headers.set("access-control-allow-origin", suppliedOrigin)
            response.headers.set(
              "access-control-expose-headers",
              "WWW-Authenticate, MCP-Protocol-Version",
            )
            response.headers.set("vary", "Origin")
          }

          return response
        })()

        return await Promise.race([serving, interrupted])
      } catch (error) {
        const getRejectionStatus = () => {
          if (timedOut) {
            return 504
          }

          if (error instanceof HttpRejection) {
            return error.status
          }

          return 500
        }

        return rejected(getRejectionStatus())
      } finally {
        if (timer) {
          clearTimeout(timer)
        }

        lifetime.abort()
        removeAbort()

        if (release) {
          const releaseSlot = release
          const retire = async () => {
            await Promise.allSettled([
              Promise.resolve().then(() => server?.close()),
              serving,
            ])

            // Request construction transfers the scoped body here. Early
            // refusals must cancel this owned stream so the outer body tracker
            // can settle before graceful shutdown waits for real active work.
            if (request.body && !request.bodyUsed && !request.body.locked) {
              await request.body.cancel().catch(() => undefined)
            }

            await work.drain()
            releaseSlot()
            active.delete(lifetime)
            finish()
          }
          // Tracked by active/completion until real settlement. An unexpected
          // retirement failure retains its bounded slot rather than admitting more.
          void retire().catch(() => {
            /* Retirement failure retains the active admission slot and completion witness. */
          })
        }
      }
    },
    async drain() {
      await Promise.allSettled([...active.values()])
    },
    async close() {
      closed = true
      const pending = [...active.entries()]
      for (const [controller] of pending) {
        controller.abort()
      }
      await Promise.allSettled(pending.map(([, completion]) => completion))
    },
    supportedScopes: Object.freeze(scopeList),
  })
}
