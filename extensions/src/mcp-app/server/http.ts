import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { authorize, validateConfig } from "./authorization.ts"
import { createTadazzMcpHttpHandler } from "./factory.ts"
import { inputs, toolNames } from "../contracts/tools.ts"
import { LIMITS } from "../contracts/schemas.ts"
import { scopes } from "../contracts/tools.ts"
import {
  IngressBudget,
  HttpRejection,
  bodyText,
} from "../first-party/ingress.ts"

export interface RemoteMcpOptions {
  config: ServerConfig
  /** Browser origins are explicit. Absent Origin is permitted for server clients. */
  allowedOrigins: readonly string[]
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

/** Retain the HTTP admission while cancelled dependency work is still running.
 * Closing transport alone does not mean durable/verification work has settled. */
class RequestWork {
  private pending = new Set<Promise<unknown>>()
  constructor(private readonly signal: AbortSignal) {}
  check() {
    if (this.signal.aborted) throw new HttpRejection(400)
  }
  wrap<T extends object>(value: T): T {
    return new Proxy(Object.create(null) as T, {
      get: (_target, property) => {
        const member: unknown = Reflect.get(value, property)
        if (typeof member !== "function") return member
        return (...args: unknown[]) => {
          this.check()
          const result: unknown = Reflect.apply(member, value, args)
          if (!(result instanceof Promise)) return result
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
    while (this.pending.size) await Promise.allSettled([...this.pending])
  }
}

/** Stateless SDK Streamable HTTP service. Opens no listener and trusts no proxy,
 * account header, cookie, session ID or manager token. Mount only behind HTTPS
 * with the exact external Request URL/Host preserved by trusted host integration. */
export function createRemoteMcpApp(options: RemoteMcpOptions) {
  const config = validateConfig(options.config)
  const resource = new URL(config.resource)
  const metadata = new URL(config.resourceMetadataUrl)
  if (
    metadata.origin !== resource.origin ||
    metadata.pathname === resource.pathname
  )
    throw new Error("Separate same-origin protected resource metadata required")
  const origins = new Set(options.allowedOrigins)
  for (const origin of origins) {
    if (new URL(origin).origin !== origin || !origin.startsWith("https://"))
      throw new Error("Exact HTTPS browser origins required")
  }
  const verifyToken = options.verifyAccessToken
  const deps = Object.freeze({ ...options.dependencies })
  const budget = new IngressBudget()
  const challenge =
    'Bearer resource_metadata="' +
    config.resourceMetadataUrl +
    '", scope="tadazz.catalog.read"'
  const scopeList = [...new Set(Object.values(scopes).flat())]
  return Object.freeze({
    async fetch(request: Request): Promise<Response> {
      let release: (() => void) | undefined
      let server: ReturnType<typeof createTadazzMcpHttpHandler> | undefined
      const work = new RequestWork(request.signal)
      let removeAbort = () => {}
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
        release = budget.enter()
        work.check()
        if (request.url.length > 2048) return rejected(400)
        const url = new URL(request.url)
        let headerBytes = 0
        let headerCount = 0
        let invalidHeaders = false
        request.headers.forEach((value, name) => {
          headerBytes += Buffer.byteLength(name + value)
          if (
            ++headerCount > 32 ||
            headerBytes > 16_384 ||
            value.length > 8192 ||
            name === "forwarded" ||
            name.startsWith("x-forwarded-")
          )
            invalidHeaders = true
        })
        if (invalidHeaders) return rejected(400)
        if (
          url.origin !== resource.origin ||
          request.headers.get("host") !== resource.host
        )
          return rejected(403)
        suppliedOrigin = request.headers.get("origin")
        if (suppliedOrigin !== null && !origins.has(suppliedOrigin))
          return rejected(403)
        if (url.search || url.hash) return rejected(400)
        if (url.href === metadata.href) {
          if (request.method !== "GET" || request.body) return rejected(405)
          return Response.json(
            {
              resource: config.resource,
              authorization_servers: [config.issuer],
              scopes_supported: ["tadazz.catalog.read"],
              bearer_methods_supported: ["header"],
            },
            { headers: responseHeaders },
          )
        }
        if (url.href !== config.resource) return rejected(404)
        if (request.method === "OPTIONS") {
          if (!suppliedOrigin || !origins.has(suppliedOrigin))
            return rejected(403)
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
          )
            return rejected(403)
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
        if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/u.test(authorization))
          return rejected(401, challenge)
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
              prevalidationLimit: async () => true,
              rateLimit: async () => true,
            },
            config,
          )
        let initial: VerifiedPrincipal
        try {
          initial = await verified()
        } catch {
          return request.signal.aborted
            ? rejected(400)
            : rejected(401, challenge)
        }
        work.check()
        if (request.method !== "POST") return rejected(405)
        if (request.headers.has("mcp-session-id")) return rejected(400)
        if (
          request.headers.has("content-encoding") ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
            request.headers.get("content-type") ?? "",
          )
        )
          return rejected(415)
        const declared = request.headers.get("content-length")
        if (
          declared !== null &&
          (!/^(0|[1-9][0-9]{0,8})$/u.test(declared) ||
            Number(declared) > LIMITS.request)
        )
          return rejected(413)
        let parsedBody: unknown
        try {
          parsedBody = JSON.parse(await bodyText(request))
        } catch (error) {
          return rejected(error instanceof HttpRejection ? error.status : 400)
        }
        work.check()
        // One request per HTTP call keeps cancellation and principal accounting distinct.
        if (Array.isArray(parsedBody)) return rejected(400)
        if (
          parsedBody &&
          typeof parsedBody === "object" &&
          "id" in parsedBody &&
          ((typeof parsedBody.id === "string" && parsedBody.id.length > 128) ||
            (typeof parsedBody.id === "number" &&
              !Number.isSafeInteger(parsedBody.id)))
        )
          return rejected(400)
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
          )
            return Response.json(
              {
                jsonrpc: "2.0",
                id: raw.id,
                error: { code: -32602, message: "Invalid tool request" },
              },
              { status: 400, headers: responseHeaders },
            )
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
            )
              throw new HttpRejection(403)
            return p
          },
          prevalidationLimit: async () => !request.signal.aborted,
          ...(deps.drafts ? { drafts: work.wrap(deps.drafts) } : {}),
          ...(deps.catalog ? { catalog: work.wrap(deps.catalog) } : {}),
          ...(deps.preview ? { preview: work.wrap(deps.preview) } : {}),
          ...(deps.storage ? { storage: work.wrap(deps.storage) } : {}),
          ...(deps.exports ? { exports: work.wrap(deps.exports) } : {}),
        }
        server = createTadazzMcpHttpHandler(config, dependencies)
        work.check()
        const interrupted = new Promise<never>((_, reject) => {
          const abort = () => reject(new HttpRejection(400))
          request.signal.addEventListener("abort", abort, { once: true })
          removeAbort = () => request.signal.removeEventListener("abort", abort)
          if (request.signal.aborted) abort()
        })
        const response = await Promise.race([
          server.fetch(request, { parsedBody }),
          interrupted,
        ])
        work.check()
        if (response.status >= 400) return rejected(response.status)
        for (const [name, value] of Object.entries(responseHeaders))
          response.headers.set(name, value)
        if (suppliedOrigin) {
          response.headers.set("access-control-allow-origin", suppliedOrigin)
          response.headers.set(
            "access-control-expose-headers",
            "WWW-Authenticate, MCP-Protocol-Version",
          )
          response.headers.set("vary", "Origin")
        }
        return response
      } catch (error) {
        return rejected(error instanceof HttpRejection ? error.status : 500)
      } finally {
        removeAbort()
        await server?.close().catch(() => {})
        await work.drain()
        release?.()
      }
    },
    supportedScopes: Object.freeze(scopeList),
  })
}
