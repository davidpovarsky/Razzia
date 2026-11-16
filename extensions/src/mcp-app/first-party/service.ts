import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { isAbsolute, resolve } from "node:path"
import type { NativeCreationOperationPort } from "../../server/storage/creation-operation-types.ts"
import { validateConfig } from "../server/authorization.ts"
import { mutations } from "../contracts/tools.ts"
import type {
  AuthoringPolicy,
  Dependencies,
  DraftRepository,
  ServerConfig,
  VerifiedPrincipal,
} from "../server/dependencies.ts"
import { ToolError, unavailable } from "../server/errors.ts"
import { HTTP_LIMITS, HttpRejection, IngressBudget } from "./ingress.ts"
import {
  createFirstPartyOAuth,
  type FirstPartyCatalogOptions,
  type FirstPartyExportPolicy,
} from "./oauth.ts"
import type { OAuthCryptoOptions } from "./oauth-protocol.ts"

export const PROTECTED_MCP_SERVICE_ENV = "TADAZZ_MCP_SERVICE_ENABLED"

export interface PrincipalRateLimitOptions {
  readonly readsPerMinute?: number
  readonly mutationsPerMinute?: number
  readonly maxEntries?: number
  readonly windowMs?: number
}

export interface ProtectedMcpServiceNativeSaveOptions {
  readonly consentPageUrl: string
  readonly operations?: NativeCreationOperationPort
  readonly authoring?: AuthoringPolicy
}

export type PreviewCandidateV2Factory =
  | NonNullable<Dependencies["previewCandidateV2"]>
  | ((
      drafts: DraftRepository,
    ) => NonNullable<Dependencies["previewCandidateV2"]>)

export interface ProtectedMcpServiceOptions extends OAuthCryptoOptions {
  readonly enabled?: boolean
  readonly config: ServerConfig
  readonly configRoot: string
  readonly consentPageUrl: string
  readonly allowedOrigins: readonly string[]
  readonly responseTimeoutMs?: number
  readonly authoring: AuthoringPolicy
  readonly rateLimit: NonNullable<Dependencies["rateLimit"]>
  readonly catalog?: FirstPartyCatalogOptions
  readonly exportPolicy?: FirstPartyExportPolicy
  readonly nativeSave?: ProtectedMcpServiceNativeSaveOptions
  readonly preview?: Dependencies["preview"]
  readonly previewCandidateV2?: PreviewCandidateV2Factory
  readonly previewUiResource?: Dependencies["previewUiResource"]
}

export interface ProtectedMcpService {
  readonly enabled: boolean
  readonly config: ServerConfig
  readonly supportedScopes: readonly string[]
  isClosed(): boolean
  fetch(request: Request): Promise<Response>
  drain(): Promise<void>
  close(): Promise<void>
}

export interface ProtectedMcpHttpServerOptions {
  readonly host?: string
  readonly port: number
  readonly allowNonLoopback?: boolean
  readonly responseTimeoutMs?: number
}

export interface ProtectedMcpHttpServer {
  readonly server: Server
  readonly host: string
  readonly port: number
  readonly address: string
  close(): Promise<void>
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"])
const BODY_LESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const MAX_URL_LENGTH = 16_384
const MAX_HEADER_COUNT = 32
const MAX_HEADER_NAME_LENGTH = 128
const MAX_HEADER_VALUE_LENGTH = 8192
const MAX_HEADER_BYTES = 16_384
const POSITIVE_INT = /^(0|[1-9][0-9]{0,8})$/u

const STRICT_RESPONSE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
})

function hasInvalidUrlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (code <= 0x20 || code === 0x7f || code === 0x23 || code === 0x5c) {
      return true
    }
  }

  return false
}

function hasInvalidHeaderValueChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      return true
    }
  }

  return false
}

function isTokenString(value: string): boolean {
  if (value.length === 0) {
    return false
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (code < 0x21 || code > 0x7e) {
      return false
    }
  }

  return true
}

function parseUrlSafely(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function createDeferred() {
  let complete: (() => void) | null = null
  const promise = new Promise<void>((res) => {
    complete = res
  })

  return {
    promise,
    resolve() {
      complete?.()
    },
  }
}

function securityJson(status: number, code: string): Response {
  return Response.json(
    { error: code, status },
    { status, headers: STRICT_RESPONSE_HEADERS },
  )
}

function assertPositiveBound(name: string, value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid rate limit bound: ${name}`)
  }

  return value
}

export function isProtectedMcpServiceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PROTECTED_MCP_SERVICE_ENV] === "true"
}

export function createPrincipalRateLimiter(
  options: PrincipalRateLimitOptions = {},
): NonNullable<Dependencies["rateLimit"]> {
  const readsPerMinute = assertPositiveBound(
    "readsPerMinute",
    options.readsPerMinute ?? 120,
    10_000,
  )
  const mutationsPerMinute = assertPositiveBound(
    "mutationsPerMinute",
    options.mutationsPerMinute ?? 30,
    10_000,
  )
  const maxEntries = assertPositiveBound(
    "maxEntries",
    options.maxEntries ?? 10_000,
    100_000,
  )
  const windowMs = assertPositiveBound(
    "windowMs",
    options.windowMs ?? 60_000,
    3_600_000,
  )
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return (principal: VerifiedPrincipal, toolName) => {
    const now = Date.now()
    const isMutation = toolName !== undefined && mutations.has(toolName)
    const limit = isMutation ? mutationsPerMinute : readsPerMinute
    const bucketKey = `${principal.accountId}:${principal.grantId}:${isMutation ? "w" : "r"}`
    const existing = buckets.get(bucketKey)

    if (existing && now < existing.resetAt) {
      buckets.delete(bucketKey)
      buckets.set(bucketKey, existing)
      existing.count += 1

      return Promise.resolve(existing.count <= limit)
    }

    if (existing) {
      buckets.delete(bucketKey)
    }

    if (buckets.size >= maxEntries) {
      for (const [key, entry] of buckets) {
        if (now >= entry.resetAt) {
          buckets.delete(key)
        }
      }
    }

    if (buckets.size >= maxEntries) {
      const oldest = buckets.keys().next()

      if (!oldest.done) {
        buckets.delete(oldest.value)
      }
    }

    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })

    return Promise.resolve(limit >= 1)
  }
}

export async function createFirstPartyNativeSaveOperations(
  configRoot: string,
): Promise<NativeCreationOperationPort> {
  if (!isAbsolute(configRoot)) {
    throw new ToolError("ACCOUNT_UNAVAILABLE")
  }

  const root = resolve(configRoot)
  const envRoot = process.env.CONFIG_PATH

  if (!envRoot || resolve(envRoot) !== root) {
    throw new ToolError("ACCOUNT_UNAVAILABLE")
  }

  const [scope, config, reservation] = await Promise.all([
    import("@razzia/socket/services/account-scope"),
    import("@razzia/socket/services/config"),
    import("../../server/storage/creation-reservation.ts"),
  ])

  const port = reservation.createNativeCreationPort({
    configuredRoot: () => root,
    accountsEnabled: scope.accountsEnabled,
    activeOwner: scope.activeAccount,
    getPath: config.getPath,
    prepare: config.prepareNativeQuizCreation,
    enableOperationBindings: true,
  })
  const portOperations = port.operations

  if (!portOperations) {
    throw unavailable()
  }

  // On non-Linux hosts, invoke the real C1 port so its fail-closed fence check runs,
  // then surface DEPENDENCY_UNAVAILABLE instead of letting an unwrapped Error map to INTERNAL.
  const invoke = <T>(action: () => T): T => {
    if (process.platform === "linux") {
      return action()
    }

    try {
      return action()
    } catch (error) {
      if (error instanceof ToolError) {
        throw error
      }

      throw unavailable()
    }
  }

  const wrapped: NativeCreationOperationPort = {
    lookup: (binding) => invoke(() => portOperations.lookup(binding)),
    create: (binding, input, extras) =>
      invoke(() => portOperations.create(binding, input, extras)),
  }

  return Object.freeze(wrapped)
}

function buildOAuthRouteMatcher(issuer: URL) {
  const base = issuer.pathname.replace(/\/$/u, "")
  const endpoint = (name: string) => `${base}/${name}`
  const metadataPath = `/.well-known/oauth-authorization-server${base === "" ? "" : base}`
  const downloadPrefix = endpoint("downloads/")
  const exactPaths = new Set([
    metadataPath,
    endpoint("jwks.json"),
    endpoint("authorize"),
    endpoint("inspect"),
    endpoint("approve"),
    endpoint("native-save/inspect"),
    endpoint("native-save/approve"),
    endpoint("token"),
    endpoint("revoke"),
  ])

  return (url: URL) =>
    url.origin === issuer.origin &&
    (exactPaths.has(url.pathname) || url.pathname.startsWith(downloadPrefix))
}

function validateServiceRoutes(
  config: ServerConfig,
  consentPageUrl: string,
  nativeConsentPageUrl?: string,
) {
  const issuer = new URL(config.issuer)
  const resource = new URL(config.resource)
  const metadata = new URL(config.resourceMetadataUrl)

  if (
    metadata.origin !== resource.origin ||
    metadata.pathname === resource.pathname
  ) {
    throw new Error("Separate same-origin protected resource metadata required")
  }

  const isOAuthRoute = buildOAuthRouteMatcher(issuer)
  const isMcpRoute = (url: URL) =>
    (url.origin === resource.origin && url.pathname === resource.pathname) ||
    (url.origin === metadata.origin && url.pathname === metadata.pathname)

  if (isOAuthRoute(resource) || isOAuthRoute(metadata)) {
    throw new Error("Protected MCP routes collide with OAuth routes")
  }

  const consentUrl = new URL(consentPageUrl)

  if (isOAuthRoute(consentUrl) || isMcpRoute(consentUrl)) {
    throw new Error("Consent page route collides with protocol routes")
  }

  if (nativeConsentPageUrl) {
    const nativeConsentUrl = new URL(nativeConsentPageUrl)

    if (isOAuthRoute(nativeConsentUrl) || isMcpRoute(nativeConsentUrl)) {
      throw new Error(
        "Native-save consent page route collides with protocol routes",
      )
    }
  }

  return {
    issuer,
    resource,
    metadata,
    isOAuthRoute,
    isMcpRoute,
  }
}

function validateHeaderSurface(
  headers: Headers,
  expectedHosts: ReadonlySet<string>,
): { status: 400 | 403 } | { host: string; origin: string | null } {
  const pairs: Array<[string, string]> = []

  headers.forEach((value, name) => {
    pairs.push([name, value])
  })

  if (pairs.length > MAX_HEADER_COUNT) {
    return { status: 400 }
  }

  let bytes = 0

  for (const [name, value] of pairs) {
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value)

    if (
      bytes > MAX_HEADER_BYTES ||
      name.length > MAX_HEADER_NAME_LENGTH ||
      value.length > MAX_HEADER_VALUE_LENGTH ||
      name === "forwarded" ||
      name.startsWith("x-forwarded-")
    ) {
      return { status: 400 }
    }
  }

  const host = headers.get("host")

  if (!host || !expectedHosts.has(host)) {
    return { status: 403 }
  }

  return {
    host,
    origin: headers.get("origin"),
  }
}

export async function createProtectedMcpService(
  options: ProtectedMcpServiceOptions,
): Promise<ProtectedMcpService> {
  const config = Object.freeze({ ...validateConfig(options.config) })
  let closed = false

  if (options.enabled !== true) {
    return Object.freeze({
      enabled: false,
      config,
      supportedScopes: Object.freeze([]),
      isClosed: () => closed,
      fetch: () =>
        Promise.resolve(
          closed
            ? securityJson(503, "SERVICE_CLOSED")
            : securityJson(404, "SERVICE_DISABLED"),
        ),
      drain: () => Promise.resolve(undefined),
      close: () => {
        closed = true

        return Promise.resolve(undefined)
      },
    })
  }

  if (typeof options.rateLimit !== "function") {
    throw new Error("Bounded principal rate limiter is required")
  }

  if (options.preview && typeof options.preview.render !== "function") {
    throw new Error("Invalid preview adapter")
  }

  const routes = validateServiceRoutes(
    config,
    options.consentPageUrl,
    options.nativeSave?.consentPageUrl,
  )

  const nativeSaveOptions = options.nativeSave
    ? {
        authoring: options.nativeSave.authoring ?? options.authoring,
        consentPageUrl: options.nativeSave.consentPageUrl,
        operations:
          options.nativeSave.operations ??
          (await createFirstPartyNativeSaveOperations(options.configRoot)),
      }
    : undefined

  const oauth = await createFirstPartyOAuth({
    config,
    clients: options.clients,
    keyId: options.keyId,
    signingPrivateKeyPem: options.signingPrivateKeyPem,
    ticketEncryptionKey: options.ticketEncryptionKey,
    configRoot: options.configRoot,
    consentPageUrl: options.consentPageUrl,
    ...(options.exportPolicy ? { exportPolicy: options.exportPolicy } : {}),
    ...(nativeSaveOptions ? { nativeSave: nativeSaveOptions } : {}),
  })

  const drafts = oauth.draftRepository(options.authoring)
  const previewCandidateV2 =
    typeof options.previewCandidateV2 === "function"
      ? options.previewCandidateV2(drafts)
      : options.previewCandidateV2

  const dependencies: Omit<Dependencies, "authorize" | "prevalidationLimit"> = {
    authoring: options.authoring,
    drafts,
    rateLimit: options.rateLimit,
    ...(options.catalog ? { catalog: oauth.catalog(options.catalog) } : {}),
    ...(oauth.exports ? { exports: oauth.exports } : {}),
    ...(oauth.storage ? { storage: oauth.storage } : {}),
    ...(options.preview ? { preview: options.preview } : {}),
    ...(previewCandidateV2 ? { previewCandidateV2 } : {}),
    ...(options.previewUiResource
      ? { previewUiResource: options.previewUiResource }
      : {}),
  }

  const remote = oauth.remote({
    allowedOrigins: options.allowedOrigins,
    ...(options.responseTimeoutMs !== undefined
      ? { responseTimeoutMs: options.responseTimeoutMs }
      : {}),
    dependencies,
  })

  const outerBudget = new IngressBudget()
  const active = new Map<AbortController, Promise<void>>()
  const allowedHosts = new Set([
    routes.issuer.host,
    routes.resource.host,
    routes.metadata.host,
  ])

  const executeFetch = (
    request: Request,
    controller: AbortController,
  ): Promise<Response> => {
    if (controller.signal.aborted) {
      return Promise.resolve(securityJson(400, "REQUEST_ABORTED"))
    }

    if (request.url.length > MAX_URL_LENGTH) {
      return Promise.resolve(securityJson(400, "INVALID_URL"))
    }

    const url = parseUrlSafely(request.url)

    if (!url || url.hash) {
      return Promise.resolve(securityJson(400, "INVALID_URL"))
    }

    const headerCheck = validateHeaderSurface(request.headers, allowedHosts)

    if ("status" in headerCheck) {
      return Promise.resolve(
        securityJson(
          headerCheck.status,
          headerCheck.status === 403 ? "FORBIDDEN_HOST" : "INVALID_HEADERS",
        ),
      )
    }

    const scopedRequest = new Request(request, { signal: controller.signal })

    if (routes.isMcpRoute(url)) {
      if (headerCheck.host !== routes.resource.host) {
        return Promise.resolve(securityJson(403, "FORBIDDEN_HOST"))
      }

      return remote.fetch(scopedRequest)
    }

    if (routes.isOAuthRoute(url)) {
      if (headerCheck.host !== routes.issuer.host) {
        return Promise.resolve(securityJson(403, "FORBIDDEN_HOST"))
      }

      if (
        headerCheck.origin !== null &&
        headerCheck.origin !== routes.issuer.origin
      ) {
        return Promise.resolve(securityJson(403, "FORBIDDEN_ORIGIN"))
      }

      return oauth.fetch(scopedRequest)
    }

    return Promise.resolve(securityJson(404, "NOT_FOUND"))
  }

  const waitForActiveRequests = (): Promise<void> => {
    if (active.size === 0) {
      return Promise.resolve(undefined)
    }

    return Promise.allSettled([...active.values()]).then(waitForActiveRequests)
  }

  return Object.freeze({
    enabled: true,
    config,
    supportedScopes: remote.supportedScopes,
    isClosed: () => closed,
    async fetch(request: Request): Promise<Response> {
      if (closed) {
        return securityJson(503, "SERVICE_CLOSED")
      }

      let release: (() => void) | null = null

      try {
        release = outerBudget.enter()
      } catch (error) {
        if (error instanceof HttpRejection) {
          return securityJson(error.status, "HTTP_REJECTED")
        }

        throw error
      }

      const controller = new AbortController()
      const onExternalAbort = () => controller.abort()
      request.signal.addEventListener("abort", onExternalAbort, { once: true })

      if (request.signal.aborted) {
        controller.abort()
      }

      const deferred = createDeferred()
      active.set(controller, deferred.promise)

      try {
        return await executeFetch(request, controller)
      } finally {
        request.signal.removeEventListener("abort", onExternalAbort)
        active.delete(controller)
        release()
        deferred.resolve()
      }
    },
    async drain(): Promise<void> {
      await waitForActiveRequests()
      await remote.drain()
    },
    async close(): Promise<void> {
      closed = true
      const current = [...active.entries()]

      for (const [controller] of current) {
        controller.abort()
      }

      await Promise.allSettled([
        remote.close(),
        ...current.map(([, completion]) => completion),
      ])
    },
  })
}

interface ParsedNodeHeaders {
  readonly host: string
  readonly contentLength: string | undefined
  readonly hasTransferEncoding: boolean
  readonly headers: Headers
}

function inspectRawNodeHeaders(
  rawHeaders: readonly string[],
  expectedHosts: ReadonlySet<string>,
): { status: 400 | 403 | 413; code: string } | ParsedNodeHeaders {
  if (rawHeaders.length % 2 !== 0) {
    return { status: 400, code: "INVALID_HEADERS" }
  }

  const pairCount = rawHeaders.length / 2

  if (pairCount > MAX_HEADER_COUNT) {
    return { status: 400, code: "TOO_MANY_HEADERS" }
  }

  let totalBytes = 0
  let hostCount = 0
  let hostValue = ""
  let contentLengthCount = 0
  let contentLengthValue: string | null = null
  let hasTransferEncoding = false
  const pairs: Array<[string, string]> = []

  for (let index = 0; index < rawHeaders.length; index += 2) {
    const rawName = rawHeaders[index]
    const rawValue = rawHeaders[index + 1]

    if (
      rawName.length === 0 ||
      rawName.length > MAX_HEADER_NAME_LENGTH ||
      rawValue.length > MAX_HEADER_VALUE_LENGTH ||
      !isTokenString(rawName) ||
      hasInvalidHeaderValueChar(rawValue)
    ) {
      return { status: 400, code: "INVALID_HEADERS" }
    }

    totalBytes += Buffer.byteLength(rawName) + Buffer.byteLength(rawValue)

    if (totalBytes > MAX_HEADER_BYTES) {
      return { status: 400, code: "HEADERS_TOO_LARGE" }
    }

    const lowerName = rawName.toLowerCase()

    if (lowerName === "forwarded" || lowerName.startsWith("x-forwarded-")) {
      return { status: 400, code: "FORWARDED_HEADERS_REJECTED" }
    }

    if (lowerName === "host") {
      hostCount += 1
      hostValue = rawValue
    } else if (lowerName === "content-length") {
      contentLengthCount += 1
      contentLengthValue = rawValue.trim()
    } else if (lowerName === "transfer-encoding") {
      hasTransferEncoding = true
    }

    pairs.push([rawName, rawValue])
  }

  if (hostCount !== 1 || !hostValue) {
    return { status: 400, code: "INVALID_HOST" }
  }

  if (!expectedHosts.has(hostValue)) {
    return { status: 403, code: "FORBIDDEN_HOST" }
  }

  if (contentLengthCount > 1) {
    return { status: 400, code: "INVALID_CONTENT_LENGTH" }
  }

  if (contentLengthValue !== null) {
    if (!POSITIVE_INT.test(contentLengthValue)) {
      return { status: 400, code: "INVALID_CONTENT_LENGTH" }
    }

    if (Number(contentLengthValue) > HTTP_LIMITS.bytes) {
      return { status: 413, code: "PAYLOAD_TOO_LARGE" }
    }
  }

  const headers = new Headers()

  for (const [name, value] of pairs) {
    headers.append(name, value)
  }

  return {
    host: hostValue,
    contentLength: contentLengthValue ?? undefined,
    hasTransferEncoding,
    headers,
  }
}

function createBoundedNodeBodyStream(
  req: IncomingMessage,
): ReadableStream<Uint8Array> {
  let bytesRead = 0
  let settled = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        req.off("data", onData)
        req.off("end", onEnd)
        req.off("error", onError)
        req.off("aborted", onAborted)
      }

      const fail = (error: unknown) => {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        controller.error(error)
      }

      const onData = (chunk: Buffer | string) => {
        if (settled) {
          return
        }

        const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk
        bytesRead += part.byteLength

        if (bytesRead > HTTP_LIMITS.bytes) {
          const rejection = new HttpRejection(413)
          req.destroy(rejection)
          fail(rejection)

          return
        }

        controller.enqueue(new Uint8Array(part))
      }

      const onEnd = () => {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        controller.close()
      }

      const onError = (error: Error) => fail(error)
      const onAborted = () => fail(new HttpRejection(400))

      req.on("data", onData)
      req.on("end", onEnd)
      req.on("error", onError)
      req.on("aborted", onAborted)
    },
    cancel() {
      settled = true
      req.removeAllListeners("data")
      req.removeAllListeners("end")
    },
  })
}

function canWriteNodeResponse(res: ServerResponse): boolean {
  return !res.writableEnded && !res.destroyed
}

function writeNodeError(
  res: ServerResponse,
  status: number,
  code: string,
): void {
  if (!canWriteNodeResponse(res)) {
    return
  }

  const body = Buffer.from(JSON.stringify({ error: code, status }), "utf8")
  res.statusCode = status

  for (const [name, value] of Object.entries(STRICT_RESPONSE_HEADERS)) {
    res.setHeader(name, value)
  }

  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("content-length", String(body.byteLength))
  res.setHeader("connection", "close")
  res.end(body)
}

export function createProtectedMcpNodeListener(service: ProtectedMcpService) {
  const issuerUrl = new URL(service.config.issuer)
  const resourceUrl = new URL(service.config.resource)
  const expectedHosts = new Set([issuerUrl.host, resourceUrl.host])

  return (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      if (!service.enabled || service.isClosed()) {
        writeNodeError(res, 503, "SERVICE_UNAVAILABLE")

        return
      }

      const rawUrl = req.url ?? ""

      if (
        rawUrl.length === 0 ||
        rawUrl.length > MAX_URL_LENGTH ||
        !rawUrl.startsWith("/") ||
        rawUrl.startsWith("//") ||
        hasInvalidUrlChar(rawUrl)
      ) {
        writeNodeError(res, 400, "INVALID_URL")

        return
      }

      const headerResult = inspectRawNodeHeaders(req.rawHeaders, expectedHosts)

      if ("status" in headerResult) {
        writeNodeError(res, headerResult.status, headerResult.code)

        return
      }

      const method = (req.method ?? "").toUpperCase()

      if (!isTokenString(method)) {
        writeNodeError(res, 400, "INVALID_METHOD")

        return
      }

      if (BODY_LESS_METHODS.has(method)) {
        if (
          (headerResult.contentLength !== undefined &&
            headerResult.contentLength !== "0") ||
          headerResult.hasTransferEncoding
        ) {
          writeNodeError(res, 400, "UNEXPECTED_BODY")

          return
        }
      }

      const baseOrigin =
        headerResult.host === issuerUrl.host
          ? issuerUrl.origin
          : resourceUrl.origin
      const controller = new AbortController()
      const abortRequest = () => controller.abort()
      const onResClose = () => {
        if (!res.writableFinished) {
          controller.abort()
        }
      }

      req.once("aborted", abortRequest)
      res.once("close", onResClose)

      try {
        const hasBody =
          !BODY_LESS_METHODS.has(method) &&
          (headerResult.hasTransferEncoding ||
            (headerResult.contentLength !== undefined &&
              headerResult.contentLength !== "0"))
        const requestInit: RequestInit & { duplex?: "half" } = {
          method,
          headers: headerResult.headers,
          signal: controller.signal,
        }

        if (hasBody) {
          requestInit.body = createBoundedNodeBodyStream(req)
          requestInit.duplex = "half"
        }

        const webRequest = new Request(`${baseOrigin}${rawUrl}`, requestInit)
        const webResponse = await service.fetch(webRequest)

        if (!canWriteNodeResponse(res)) {
          return
        }

        const bodyBytes = Buffer.from(await webResponse.arrayBuffer())

        if (!canWriteNodeResponse(res)) {
          return
        }

        res.statusCode = webResponse.status
        webResponse.headers.forEach((value, name) => {
          if (name.toLowerCase() !== "content-length") {
            res.setHeader(name, value)
          }
        })
        res.setHeader("content-length", String(bodyBytes.byteLength))

        if (!req.complete) {
          res.setHeader("connection", "close")
        }

        res.end(bodyBytes)
      } catch (error) {
        if (error instanceof HttpRejection) {
          writeNodeError(res, error.status, "HTTP_REJECTED")

          return
        }

        writeNodeError(res, 500, "INTERNAL")
      } finally {
        req.off("aborted", abortRequest)
        res.off("close", onResClose)
      }
    })()
  }
}

export async function listenProtectedMcpHttpServer(
  service: ProtectedMcpService,
  options: ProtectedMcpHttpServerOptions,
): Promise<ProtectedMcpHttpServer> {
  if (!service.enabled || service.isClosed()) {
    throw new Error("Cannot listen on a disabled or closed MCP service")
  }

  const host = options.host ?? "127.0.0.1"

  if (!options.allowNonLoopback && !LOOPBACK_HOSTS.has(host)) {
    throw new Error("Refusing non-loopback bind without allowNonLoopback: true")
  }

  const responseTimeoutMs = options.responseTimeoutMs ?? 30_000

  if (
    !Number.isSafeInteger(responseTimeoutMs) ||
    responseTimeoutMs < 1 ||
    responseTimeoutMs > 120_000
  ) {
    throw new Error("Bounded HTTP listener responseTimeoutMs required")
  }

  const server = createServer(createProtectedMcpNodeListener(service))
  server.maxHeadersCount = 64
  server.headersTimeout = 10_000
  server.requestTimeout = responseTimeoutMs
  server.keepAliveTimeout = 5000

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      rejectListen(error)
    }

    const onListening = () => {
      server.off("error", onError)
      resolveListen()
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen({ host, port: options.port })
  })

  const bound = server.address()

  if (!bound || typeof bound === "string") {
    await service.close()
    server.close()

    throw new Error("Unexpected HTTP server bind address")
  }

  const resolvedHost = bound.address.includes(":")
    ? `[${bound.address}]`
    : bound.address
  const address = `http://${resolvedHost}:${bound.port}`
  let closing: Promise<void> | null = null

  return Object.freeze({
    server,
    host: bound.address,
    port: bound.port,
    address,
    close(): Promise<void> {
      if (closing) {
        return closing
      }

      closing = (async () => {
        server.closeIdleConnections()
        const closedServer = new Promise<void>((resolveClose) => {
          server.close(() => resolveClose())
        })
        await service.close()
        server.closeAllConnections()
        await closedServer
      })()

      return closing
    },
  })
}
