import { AsyncLocalStorage } from "node:async_hooks"
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http"
import { isAbsolute, resolve as resolvePath } from "node:path"
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
  readonly fullShowPreviewV3?: (
    drafts: DraftRepository,
  ) => NonNullable<Dependencies["fullShowPreviewV3"]>
  readonly fullShowUiResourceV3?: Dependencies["fullShowUiResourceV3"]
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

export interface ProtectedMcpNodeListenerOptions {
  readonly responseTimeoutMs?: number
}

export interface ProtectedMcpHttpServerOptions {
  readonly host?: string
  readonly port: number
  readonly allowNonLoopback?: boolean
  readonly responseTimeoutMs?: number
  readonly maxConnections?: number
}

export interface ProtectedMcpHttpServer {
  readonly server: Server
  readonly host: string
  readonly port: number
  readonly address: string
  drain(): Promise<void>
  close(): Promise<void>
}

interface AccountRateBucket {
  reads: number
  readsResetAt: number
  mutations: number
  mutationsResetAt: number
}

interface ServiceListenerBridge {
  readonly responseTimeoutMs: number
  runWithResponse<T>(
    request: Request,
    respond: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T>
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"])
const BODY_LESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "content-length",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
])
const MAX_URL_LENGTH = 16_384
const MAX_HEADER_COUNT = 32
const MAX_HEADER_NAME_LENGTH = 128
const MAX_HEADER_VALUE_LENGTH = 8192
const MAX_HEADER_BYTES = 16_384
const RESPONSE_WRITE_CHUNK_BYTES = 65_536
const DEFAULT_MAX_CONNECTIONS = 64
const MAX_CONNECTIONS_CAP = 256
const POSITIVE_INT = /^(0|[1-9][0-9]{0,8})$/u
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u

const STRICT_RESPONSE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
})

const serviceBridges = new WeakMap<ProtectedMcpService, ServiceListenerBridge>()
const listenerDrainers = new WeakMap<RequestListener, () => Promise<void>>()

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
  return value.length > 0 && HTTP_TOKEN.test(value)
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

function assertTimeoutMs(value: number | undefined): number {
  const resolved = value ?? 30_000

  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 120_000) {
    throw new Error("Bounded HTTP response deadline required")
  }

  return resolved
}

function cloneAuthoringPolicy(policy: AuthoringPolicy): AuthoringPolicy {
  return {
    allowedPublicAssetUrls: new Set(policy.allowedPublicAssetUrls),
    ...(policy.semantic
      ? {
          semantic: Object.freeze({
            ...(policy.semantic.assets
              ? {
                  assets: Object.freeze({
                    resolveAsset: policy.semantic.assets.resolveAsset.bind(
                      policy.semantic.assets,
                    ),
                    resolveStoredUrl:
                      policy.semantic.assets.resolveStoredUrl.bind(
                        policy.semantic.assets,
                      ),
                    listAssets: policy.semantic.assets.listAssets.bind(
                      policy.semantic.assets,
                    ),
                  }),
                }
              : {}),
          }),
        }
      : {}),
    ...(policy.trustedDefaults === undefined
      ? {}
      : { trustedDefaults: structuredClone(policy.trustedDefaults) }),
  }
}

async function yieldMicrotasks(hops: number): Promise<void> {
  if (hops <= 0) {
    return
  }

  await Promise.resolve()
  await yieldMicrotasks(hops - 1)
}

class RequestWorkTracker {
  private readonly pending = new Set<Promise<unknown>>()

  hasPending(): boolean {
    return this.pending.size > 0
  }

  track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise)
    void promise.then(
      () => {
        this.pending.delete(promise)
      },
      () => {
        this.pending.delete(promise)
      },
    )

    return promise
  }

  async drain(): Promise<void> {
    if (this.pending.size === 0) {
      return
    }

    await Promise.allSettled([...this.pending])
    await this.drain()
  }
}

const requestWorkScope = new AsyncLocalStorage<RequestWorkTracker>()

function wrapTrackedObject<T extends object>(
  target: T,
  unscopedTracker: RequestWorkTracker,
): T {
  return new Proxy(Object.create(null) as T, {
    get(_obj, prop) {
      const member: unknown = Reflect.get(target, prop)

      if (typeof member !== "function") {
        return member
      }

      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(
          member as (...fnArgs: unknown[]) => unknown,
          target,
          args,
        )

        if (result instanceof Promise) {
          const tracker = requestWorkScope.getStore() ?? unscopedTracker

          return tracker.track(result)
        }

        return result
      }
    },
  })
}

function trackRequestBody(
  body: ReadableStream<Uint8Array>,
  tracker: RequestWorkTracker,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const deferred = createDeferred()
  void tracker.track(deferred.promise)

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const part = await reader.read()

          if (part.done) {
            controller.close()
            reader.releaseLock()
            deferred.resolve()

            return
          }

          controller.enqueue(part.value)
        } catch (error) {
          controller.error(error)
          reader.releaseLock()
          deferred.resolve()
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason)
        } finally {
          reader.releaseLock()
          deferred.resolve()
        }
      },
    },
    { highWaterMark: 0 },
  )
}

async function cancelUnreadBody(request: Request): Promise<void> {
  if (request.body && !request.bodyUsed && !request.body.locked) {
    await request.body.cancel().catch(() => undefined)
  }
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
  const buckets = new Map<string, AccountRateBucket>()

  return (principal: VerifiedPrincipal, toolName) => {
    if (
      typeof principal.accountId !== "string" ||
      principal.accountId.length === 0
    ) {
      return Promise.resolve(false)
    }

    const now = Date.now()
    const isMutation = toolName !== undefined && mutations.has(toolName)
    let bucket = buckets.get(principal.accountId)

    if (!bucket) {
      if (buckets.size >= maxEntries) {
        for (const [key, entry] of buckets) {
          if (now >= entry.readsResetAt && now >= entry.mutationsResetAt) {
            buckets.delete(key)
          }
        }
      }

      if (buckets.size >= maxEntries) {
        return Promise.resolve(false)
      }

      bucket = {
        reads: 0,
        readsResetAt: 0,
        mutations: 0,
        mutationsResetAt: 0,
      }
      buckets.set(principal.accountId, bucket)
    }

    if (isMutation) {
      if (now >= bucket.mutationsResetAt) {
        bucket.mutations = 0
        bucket.mutationsResetAt = now + windowMs
      }

      if (bucket.mutations >= mutationsPerMinute) {
        return Promise.resolve(false)
      }

      bucket.mutations += 1

      return Promise.resolve(true)
    }

    if (now >= bucket.readsResetAt) {
      bucket.reads = 0
      bucket.readsResetAt = now + windowMs
    }

    if (bucket.reads >= readsPerMinute) {
      return Promise.resolve(false)
    }

    bucket.reads += 1

    return Promise.resolve(true)
  }
}

export async function createFirstPartyNativeSaveOperations(
  configRoot: string,
): Promise<NativeCreationOperationPort> {
  if (!isAbsolute(configRoot)) {
    throw new ToolError("ACCOUNT_UNAVAILABLE")
  }

  const root = resolvePath(configRoot)
  const envRoot = process.env.CONFIG_PATH

  if (!envRoot || resolvePath(envRoot) !== root) {
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

async function runOAuthWithDeadline(params: {
  oauthFetch: (req: Request) => Promise<Response>
  scopedRequest: Request
  controller: AbortController
  timeoutMs: number
}): Promise<{
  response: Response
  settled: Promise<unknown>
  timedOut: boolean
}> {
  const { oauthFetch, scopedRequest, controller, timeoutMs } = params
  let timedOut = false
  let resolveInterrupt: ((value: Response) => void) | null = null
  const onAbort = () => {
    resolveInterrupt?.(
      timedOut
        ? securityJson(504, "HTTP_REJECTED")
        : securityJson(400, "REQUEST_ABORTED"),
    )
  }

  const interrupted = new Promise<Response>((resolve) => {
    resolveInterrupt = resolve
  })

  controller.signal.addEventListener("abort", onAbort, { once: true })

  if (controller.signal.aborted) {
    onAbort()
  }

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const settled = oauthFetch(scopedRequest)

  try {
    const response = await Promise.race([settled, interrupted])

    return { response, settled, timedOut }
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener("abort", onAbort)
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

  const responseTimeoutMs = assertTimeoutMs(options.responseTimeoutMs)
  const authoring = cloneAuthoringPolicy(options.authoring)
  const routes = validateServiceRoutes(
    config,
    options.consentPageUrl,
    options.nativeSave?.consentPageUrl,
  )

  const nativeSaveOptions = options.nativeSave
    ? {
        authoring: options.nativeSave.authoring
          ? cloneAuthoringPolicy(options.nativeSave.authoring)
          : authoring,
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

  const unscopedTracker = new RequestWorkTracker()
  const rawDrafts = oauth.draftRepository(authoring)
  const rawSemanticDrafts = authoring.semantic
    ? oauth.semanticDraftRepository(authoring)
    : undefined
  const rawFullShowPreviewV3 = options.fullShowPreviewV3?.(rawDrafts)
  const rawPreviewCandidateV2 =
    typeof options.previewCandidateV2 === "function"
      ? options.previewCandidateV2(rawDrafts)
      : options.previewCandidateV2
  const rawCatalog = options.catalog
    ? oauth.catalog(options.catalog)
    : undefined

  const trackedRateLimit: NonNullable<Dependencies["rateLimit"]> = (
    principal,
    tool,
  ) => {
    const tracker = requestWorkScope.getStore() ?? unscopedTracker

    return tracker.track(Promise.resolve(options.rateLimit(principal, tool)))
  }

  const dependencies: Omit<Dependencies, "authorize" | "prevalidationLimit"> = {
    authoring,
    drafts: wrapTrackedObject(rawDrafts, unscopedTracker),
    ...(rawSemanticDrafts
      ? {
          semanticDrafts: wrapTrackedObject(rawSemanticDrafts, unscopedTracker),
        }
      : {}),
    rateLimit: trackedRateLimit,
    ...(rawCatalog
      ? { catalog: wrapTrackedObject(rawCatalog, unscopedTracker) }
      : {}),
    ...(oauth.exports
      ? { exports: wrapTrackedObject(oauth.exports, unscopedTracker) }
      : {}),
    ...(oauth.storage
      ? { storage: wrapTrackedObject(oauth.storage, unscopedTracker) }
      : {}),
    ...(options.preview
      ? { preview: wrapTrackedObject(options.preview, unscopedTracker) }
      : {}),
    ...(rawPreviewCandidateV2
      ? {
          previewCandidateV2: wrapTrackedObject(
            rawPreviewCandidateV2,
            unscopedTracker,
          ),
        }
      : {}),
    ...(rawFullShowPreviewV3
      ? {
          fullShowPreviewV3: wrapTrackedObject(
            rawFullShowPreviewV3,
            unscopedTracker,
          ),
        }
      : {}),
    ...(options.fullShowUiResourceV3
      ? { fullShowUiResourceV3: options.fullShowUiResourceV3 }
      : {}),
    ...(options.previewUiResource
      ? { previewUiResource: options.previewUiResource }
      : {}),
  }

  const remote = oauth.remote({
    allowedOrigins: options.allowedOrigins,
    responseTimeoutMs,
    dependencies,
  })

  const outerBudget = new IngressBudget()
  const active = new Map<AbortController, Promise<void>>()
  const allowedHosts = new Set([
    routes.issuer.host,
    routes.resource.host,
    routes.metadata.host,
  ])

  const executeFetch = async (
    request: Request,
    controller: AbortController,
    tracker: RequestWorkTracker,
  ): Promise<{
    response: Response
    underlyingSettled: Promise<unknown>
    isMcp: boolean
    timedOut: boolean
    scopedRequest?: Request
  }> => {
    if (controller.signal.aborted) {
      await cancelUnreadBody(request)

      return {
        response: securityJson(400, "REQUEST_ABORTED"),
        underlyingSettled: Promise.resolve(undefined),
        isMcp: false,
        timedOut: false,
      }
    }

    if (request.url.length > MAX_URL_LENGTH) {
      await cancelUnreadBody(request)

      return {
        response: securityJson(400, "INVALID_URL"),
        underlyingSettled: Promise.resolve(undefined),
        isMcp: false,
        timedOut: false,
      }
    }

    const url = parseUrlSafely(request.url)

    if (!url || url.hash || url.username || url.password) {
      await cancelUnreadBody(request)

      return {
        response: securityJson(400, "INVALID_URL"),
        underlyingSettled: Promise.resolve(undefined),
        isMcp: false,
        timedOut: false,
      }
    }

    const headerCheck = validateHeaderSurface(request.headers, allowedHosts)

    if ("status" in headerCheck) {
      await cancelUnreadBody(request)

      return {
        response: securityJson(
          headerCheck.status,
          headerCheck.status === 403 ? "FORBIDDEN_HOST" : "INVALID_HEADERS",
        ),
        underlyingSettled: Promise.resolve(undefined),
        isMcp: false,
        timedOut: false,
      }
    }

    const trackedBody = request.body
      ? trackRequestBody(request.body, tracker)
      : null
    const scopedRequest = trackedBody
      ? new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: controller.signal,
          body: trackedBody,
          duplex: "half",
        } as RequestInit)
      : new Request(request, { signal: controller.signal })

    if (routes.isMcpRoute(url)) {
      if (headerCheck.host !== routes.resource.host) {
        await cancelUnreadBody(scopedRequest)

        return {
          response: securityJson(403, "FORBIDDEN_HOST"),
          underlyingSettled: Promise.resolve(undefined),
          isMcp: false,
          timedOut: false,
          scopedRequest,
        }
      }

      const fetchCall = remote.fetch(scopedRequest)
      const response = await fetchCall

      return {
        response,
        underlyingSettled: fetchCall,
        isMcp: true,
        timedOut: response.status === 504,
        scopedRequest,
      }
    }

    if (routes.isOAuthRoute(url)) {
      if (headerCheck.host !== routes.issuer.host) {
        await cancelUnreadBody(scopedRequest)

        return {
          response: securityJson(403, "FORBIDDEN_HOST"),
          underlyingSettled: Promise.resolve(undefined),
          isMcp: false,
          timedOut: false,
          scopedRequest,
        }
      }

      if (
        headerCheck.origin !== null &&
        headerCheck.origin !== routes.issuer.origin
      ) {
        await cancelUnreadBody(scopedRequest)

        return {
          response: securityJson(403, "FORBIDDEN_ORIGIN"),
          underlyingSettled: Promise.resolve(undefined),
          isMcp: false,
          timedOut: false,
          scopedRequest,
        }
      }

      const oauthResult = await runOAuthWithDeadline({
        oauthFetch: (req) => oauth.fetch(req),
        scopedRequest,
        controller,
        timeoutMs: responseTimeoutMs,
      })

      return {
        response: oauthResult.response,
        underlyingSettled: oauthResult.settled,
        isMcp: false,
        timedOut: oauthResult.timedOut,
        scopedRequest,
      }
    }

    await cancelUnreadBody(scopedRequest)

    return {
      response: securityJson(404, "NOT_FOUND"),
      underlyingSettled: Promise.resolve(undefined),
      isMcp: false,
      timedOut: false,
      scopedRequest,
    }
  }

  const runAdmitted = async <T>(
    request: Request,
    respond: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (closed) {
      await cancelUnreadBody(request)

      return respond(securityJson(503, "SERVICE_CLOSED"), request.signal)
    }

    let release: (() => void) | null = null

    try {
      release = outerBudget.enter()
    } catch (error) {
      await cancelUnreadBody(request)

      if (error instanceof HttpRejection) {
        return respond(
          securityJson(error.status, "HTTP_REJECTED"),
          request.signal,
        )
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
    const tracker = new RequestWorkTracker()
    let fetchPromise: ReturnType<typeof executeFetch> | null = null
    let retired = false

    const finalizeSlot = async (
      isMcp: boolean,
      underlyingSettled: Promise<unknown>,
      scopedRequest?: Request,
    ): Promise<void> => {
      try {
        await Promise.allSettled([underlyingSettled])

        if (scopedRequest) {
          await cancelUnreadBody(scopedRequest)
        } else {
          await cancelUnreadBody(request)
        }

        await tracker.drain()
        await unscopedTracker.drain()

        if (isMcp) {
          if (active.size === 1) {
            await remote.drain()
          } else {
            await yieldMicrotasks(8)
          }
        }
      } finally {
        request.signal.removeEventListener("abort", onExternalAbort)
        active.delete(controller)
        release()
        deferred.resolve()
      }
    }

    try {
      fetchPromise = requestWorkScope.run(tracker, () =>
        executeFetch(request, controller, tracker),
      )
      const outcome = await fetchPromise

      if (outcome.scopedRequest) {
        await cancelUnreadBody(outcome.scopedRequest)
      }

      const result = await respond(outcome.response, controller.signal)
      const hasPendingWork =
        controller.signal.aborted ||
        outcome.timedOut ||
        tracker.hasPending() ||
        unscopedTracker.hasPending()

      retired = true

      if (hasPendingWork) {
        void finalizeSlot(
          outcome.isMcp,
          outcome.underlyingSettled,
          outcome.scopedRequest,
        )
      } else {
        await finalizeSlot(
          outcome.isMcp,
          outcome.underlyingSettled,
          outcome.scopedRequest,
        )
      }

      return result
    } finally {
      if (!retired) {
        void Promise.allSettled([fetchPromise ?? Promise.resolve(undefined)])
          .then(([settled]) => {
            const outcome =
              settled.status === "fulfilled" ? settled.value : undefined

            return finalizeSlot(
              outcome?.isMcp ?? false,
              outcome?.underlyingSettled ?? Promise.resolve(undefined),
              outcome?.scopedRequest,
            )
          })
          .catch(() => {
            request.signal.removeEventListener("abort", onExternalAbort)
            active.delete(controller)
            release()
            deferred.resolve()
          })
      }
    }
  }

  const waitForActiveRequests = (): Promise<void> => {
    if (active.size === 0) {
      return Promise.resolve(undefined)
    }

    return Promise.allSettled([...active.values()]).then(waitForActiveRequests)
  }

  const service: ProtectedMcpService = Object.freeze({
    enabled: true,
    config,
    supportedScopes: remote.supportedScopes,
    isClosed: () => closed,
    fetch: (request: Request) =>
      runAdmitted(request, (response) => Promise.resolve(response)),
    async drain(): Promise<void> {
      await waitForActiveRequests()
      await unscopedTracker.drain()
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

  serviceBridges.set(service, {
    responseTimeoutMs,
    runWithResponse: runAdmitted,
  })

  return service
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

  if (
    contentLengthCount > 1 ||
    (hasTransferEncoding && contentLengthCount > 0)
  ) {
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

interface BoundedNodeBodyHandle {
  readonly stream: ReadableStream<Uint8Array>
  cleanup(): void
}

function createBoundedNodeBodyHandle(
  req: IncomingMessage,
): BoundedNodeBodyHandle {
  let bytesRead = 0
  let settled = false
  let cleanupListeners: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const cleanup = () => {
          req.off("data", onData)
          req.off("end", onEnd)
          req.off("error", onError)
          req.off("aborted", onAborted)
        }

        cleanupListeners = cleanup

        const fail = (error: unknown) => {
          if (settled) {
            return
          }

          settled = true
          cleanup()
          req.pause()
          controller.error(error)
        }

        const onData = (chunk: Buffer | string) => {
          if (settled) {
            return
          }

          const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk
          bytesRead += part.byteLength

          if (bytesRead > HTTP_LIMITS.bytes) {
            fail(new HttpRejection(413))

            return
          }

          controller.enqueue(new Uint8Array(part))

          if ((controller.desiredSize ?? 0) <= 0) {
            req.pause()
          }
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
        req.pause()
      },
      pull(controller) {
        if (settled) {
          return
        }

        if (req.readableEnded) {
          settled = true
          cleanupListeners?.()
          controller.close()

          return
        }

        if (req.destroyed) {
          settled = true
          cleanupListeners?.()
          controller.error(new HttpRejection(400))

          return
        }

        req.resume()
      },
      cancel() {
        settled = true
        cleanupListeners?.()
        req.pause()
      },
    },
    { highWaterMark: 0 },
  )

  return {
    stream,
    cleanup() {
      settled = true
      cleanupListeners?.()
      req.pause()
    },
  }
}

function canWriteNodeResponse(res: ServerResponse): boolean {
  return !res.writableEnded && !res.destroyed
}

function waitForResponseSettle(
  res: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  if (res.writableFinished || res.destroyed || res.closed) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const onAbort = () => {
      if (!res.writableFinished && !res.destroyed) {
        res.destroy()
      }

      done()
    }

    const done = () => {
      res.off("finish", done)
      res.off("close", done)
      res.off("error", done)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }

    res.once("finish", done)
    res.once("close", done)
    res.once("error", done)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function waitForResponseDrain(
  res: ServerResponse,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted || !canWriteNodeResponse(res)) {
    return Promise.resolve(false)
  }

  const sock = res.socket

  if (sock && (sock.destroyed || sock.writableEnded)) {
    return Promise.resolve(false)
  }

  if ((sock && !sock.writableNeedDrain) || (!sock && !res.writableNeedDrain)) {
    return Promise.resolve(true)
  }

  return new Promise<boolean>((resolve) => {
    const finish = (canContinue: boolean) => {
      res.off("drain", onDrain)
      res.off("close", onStop)
      res.off("error", onStop)
      sock?.off("drain", onDrain)
      sock?.off("close", onStop)
      sock?.off("error", onStop)
      signal.removeEventListener("abort", onStop)
      resolve(canContinue)
    }

    const onDrain = () => finish(true)
    const onStop = () => finish(false)

    res.once("drain", onDrain)
    res.once("close", onStop)
    res.once("error", onStop)
    sock?.once("drain", onDrain)
    sock?.once("close", onStop)
    sock?.once("error", onStop)
    signal.addEventListener("abort", onStop, { once: true })
  })
}

function writeResponseBody(
  res: ServerResponse,
  bodyBytes: Buffer,
  signal: AbortSignal,
): Promise<boolean> {
  const writeChunk = async (offset: number): Promise<boolean> => {
    if (signal.aborted || !canWriteNodeResponse(res)) {
      return false
    }

    if (offset >= bodyBytes.byteLength) {
      return true
    }

    const nextOffset = Math.min(
      offset + RESPONSE_WRITE_CHUNK_BYTES,
      bodyBytes.byteLength,
    )
    const slice = bodyBytes.subarray(offset, nextOffset)
    const ok = res.write(slice)

    if (!ok) {
      const drained = await waitForResponseDrain(res, signal)

      if (!drained) {
        return false
      }
    }

    return writeChunk(nextOffset)
  }

  return writeChunk(0)
}

async function readWebResponseBytes(
  webResponse: Response,
  signal: AbortSignal,
): Promise<Buffer> {
  if (signal.aborted) {
    if (webResponse.body && !webResponse.body.locked) {
      await webResponse.body.cancel().catch(() => undefined)
    }

    throw new HttpRejection(400)
  }

  if (!webResponse.body) {
    return Buffer.alloc(0)
  }

  let rejectAborted: ((reason?: unknown) => void) | null = null
  const onAbort = () => {
    rejectAborted?.(new HttpRejection(400))
  }
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject
  })
  void aborted.catch(() => undefined)

  signal.addEventListener("abort", onAbort, { once: true })

  const reader = webResponse.body.getReader()
  const chunks: Buffer[] = []
  const readNextChunk = async (): Promise<Buffer> => {
    const step = await Promise.race([reader.read(), aborted])

    if (step.done) {
      return Buffer.concat(chunks)
    }

    if (step.value.byteLength > 0) {
      chunks.push(
        Buffer.from(
          step.value.buffer,
          step.value.byteOffset,
          step.value.byteLength,
        ),
      )
    }

    return readNextChunk()
  }

  try {
    return await readNextChunk()
  } catch (error) {
    await reader.cancel().catch(() => undefined)

    throw error
  } finally {
    signal.removeEventListener("abort", onAbort)

    try {
      reader.releaseLock()
    } catch {
      // Lock may already be released after stream cancellation or completion.
    }
  }
}

async function writeAndSettleNodeError(
  res: ServerResponse,
  details: { status: number; code: string },
  timeoutMs: number,
): Promise<void> {
  if (res.headersSent) {
    if (!res.destroyed && !res.writableFinished) {
      res.destroy()
    }

    return
  }

  if (!canWriteNodeResponse(res)) {
    return
  }

  const { status, code } = details
  const body = Buffer.from(JSON.stringify({ error: code, status }), "utf8")
  res.statusCode = status

  for (const [name, value] of Object.entries(STRICT_RESPONSE_HEADERS)) {
    res.setHeader(name, value)
  }

  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("content-length", String(body.byteLength))
  res.setHeader("connection", "close")
  res.end(body)

  const flushController = new AbortController()
  const flushTimer = setTimeout(
    () => flushController.abort(),
    Math.min(timeoutMs, 2000),
  )

  try {
    await waitForResponseSettle(res, flushController.signal)
  } finally {
    clearTimeout(flushTimer)
  }
}

function isStatusWithoutLength(status: number): boolean {
  return status === 204 || status === 304 || (status >= 100 && status < 200)
}

export function createProtectedMcpNodeListener(
  service: ProtectedMcpService,
  options: ProtectedMcpNodeListenerOptions = {},
): RequestListener {
  const bridge = serviceBridges.get(service)
  const responseTimeoutMs = assertTimeoutMs(
    options.responseTimeoutMs ?? bridge?.responseTimeoutMs,
  )
  const issuerUrl = new URL(service.config.issuer)
  const resourceUrl = new URL(service.config.resource)
  const expectedHosts = new Set([issuerUrl.host, resourceUrl.host])
  const listenerActive = new Set<Promise<void>>()

  const drainListener = async (): Promise<void> => {
    if (listenerActive.size === 0) {
      return
    }

    await Promise.allSettled([...listenerActive])
    await drainListener()
  }

  const listener: RequestListener = (
    req: IncomingMessage,
    res: ServerResponse,
  ) => {
    const requestDone = createDeferred()
    listenerActive.add(requestDone.promise)

    void (async () => {
      let bodyHandle: BoundedNodeBodyHandle | undefined = undefined
      let webRequest: Request | undefined = undefined
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined = undefined
      let abortRequest: (() => void) | null = null
      let onResClose: (() => void) | null = null
      const deadlineState = { timedOut: false }

      try {
        if (!service.enabled || service.isClosed()) {
          await writeAndSettleNodeError(
            res,
            { status: 503, code: "SERVICE_UNAVAILABLE" },
            responseTimeoutMs,
          )

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
          await writeAndSettleNodeError(
            res,
            { status: 400, code: "INVALID_URL" },
            responseTimeoutMs,
          )

          return
        }

        const headerResult = inspectRawNodeHeaders(
          req.rawHeaders,
          expectedHosts,
        )

        if ("status" in headerResult) {
          await writeAndSettleNodeError(
            res,
            { status: headerResult.status, code: headerResult.code },
            responseTimeoutMs,
          )

          return
        }

        const method = (req.method ?? "").toUpperCase()

        if (!isTokenString(method)) {
          await writeAndSettleNodeError(
            res,
            { status: 400, code: "INVALID_METHOD" },
            responseTimeoutMs,
          )

          return
        }

        if (BODY_LESS_METHODS.has(method)) {
          if (
            (headerResult.contentLength !== undefined &&
              headerResult.contentLength !== "0") ||
            headerResult.hasTransferEncoding
          ) {
            await writeAndSettleNodeError(
              res,
              { status: 400, code: "UNEXPECTED_BODY" },
              responseTimeoutMs,
            )

            return
          }
        }

        const baseOrigin =
          headerResult.host === issuerUrl.host
            ? issuerUrl.origin
            : resourceUrl.origin
        const requestController = new AbortController()
        let writingStarted = false

        abortRequest = () => requestController.abort()
        onResClose = () => {
          if (!res.writableFinished) {
            requestController.abort()
          }
        }

        req.once("aborted", abortRequest)
        res.once("close", onResClose)

        deadlineTimer = setTimeout(() => {
          deadlineState.timedOut = true
          requestController.abort()

          if (writingStarted && !res.writableFinished && !res.destroyed) {
            res.destroy()
            req.destroy()
          }
        }, responseTimeoutMs)

        const hasBody =
          !BODY_LESS_METHODS.has(method) &&
          (headerResult.hasTransferEncoding ||
            (headerResult.contentLength !== undefined &&
              headerResult.contentLength !== "0"))
        const requestInit: RequestInit & { duplex?: "half" } = {
          method,
          headers: headerResult.headers,
          signal: requestController.signal,
        }

        if (hasBody) {
          bodyHandle = createBoundedNodeBodyHandle(req)
          requestInit.body = bodyHandle.stream
          requestInit.duplex = "half"
        }

        const builtRequest = new Request(`${baseOrigin}${rawUrl}`, requestInit)
        webRequest = builtRequest

        const sendResponse = async (
          webResponse: Response,
          signal: AbortSignal,
        ): Promise<void> => {
          if (deadlineState.timedOut && !res.headersSent) {
            if (webResponse.body && !webResponse.body.locked) {
              await webResponse.body.cancel().catch(() => undefined)
            }

            await writeAndSettleNodeError(
              res,
              { status: 504, code: "GATEWAY_TIMEOUT" },
              responseTimeoutMs,
            )

            return
          }

          if (!canWriteNodeResponse(res)) {
            if (webResponse.body && !webResponse.body.locked) {
              await webResponse.body.cancel().catch(() => undefined)
            }

            return
          }

          const bodyBytes = await readWebResponseBytes(webResponse, signal)

          if (deadlineState.timedOut && !res.headersSent) {
            await writeAndSettleNodeError(
              res,
              { status: 504, code: "GATEWAY_TIMEOUT" },
              responseTimeoutMs,
            )

            return
          }

          if (!canWriteNodeResponse(res)) {
            return
          }

          writingStarted = true
          const omitLengthAndBody = isStatusWithoutLength(webResponse.status)
          res.statusCode = webResponse.status
          webResponse.headers.forEach((value, name) => {
            if (!HOP_BY_HOP_RESPONSE_HEADERS.has(name.toLowerCase())) {
              res.setHeader(name, value)
            }
          })

          if (!omitLengthAndBody) {
            res.setHeader("content-length", String(bodyBytes.byteLength))
          }

          if (!req.complete) {
            res.setHeader("connection", "close")
          }

          if (omitLengthAndBody || bodyBytes.byteLength === 0) {
            res.end()
          } else {
            const wroteAll = await writeResponseBody(res, bodyBytes, signal)

            if (wroteAll && canWriteNodeResponse(res)) {
              res.end()
            } else if (!res.destroyed && !res.writableFinished) {
              res.destroy()
            }
          }

          await waitForResponseSettle(res, signal)
        }

        if (bridge) {
          await bridge.runWithResponse(builtRequest, sendResponse)
        } else {
          const webResponse = await service.fetch(builtRequest)
          await sendResponse(webResponse, requestController.signal)
        }
      } catch (error) {
        if (deadlineState.timedOut) {
          await writeAndSettleNodeError(
            res,
            { status: 504, code: "GATEWAY_TIMEOUT" },
            responseTimeoutMs,
          )

          return
        }

        if (error instanceof HttpRejection) {
          await writeAndSettleNodeError(
            res,
            { status: error.status, code: "HTTP_REJECTED" },
            responseTimeoutMs,
          )

          return
        }

        await writeAndSettleNodeError(
          res,
          { status: 500, code: "INTERNAL" },
          responseTimeoutMs,
        )
      } finally {
        if (deadlineTimer) {
          clearTimeout(deadlineTimer)
        }

        if (abortRequest) {
          req.off("aborted", abortRequest)
        }

        if (onResClose) {
          res.off("close", onResClose)
        }

        bodyHandle?.cleanup()

        if (webRequest) {
          await cancelUnreadBody(webRequest)
        }

        if (!req.complete && !req.destroyed && res.destroyed) {
          req.destroy()
        }

        listenerActive.delete(requestDone.promise)
        requestDone.resolve()
      }
    })()
  }

  listenerDrainers.set(listener, drainListener)

  return listener
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

  const responseTimeoutMs = assertTimeoutMs(options.responseTimeoutMs)
  const maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS

  if (
    !Number.isSafeInteger(maxConnections) ||
    maxConnections < 1 ||
    maxConnections > MAX_CONNECTIONS_CAP
  ) {
    throw new Error("Bounded HTTP listener maxConnections required")
  }

  const listener = createProtectedMcpNodeListener(service, {
    responseTimeoutMs,
  })
  const drainListener = listenerDrainers.get(listener)
  const server = createServer(listener)
  server.maxConnections = maxConnections
  server.maxHeadersCount = 64
  server.headersTimeout = Math.min(10_000, responseTimeoutMs)
  server.requestTimeout = responseTimeoutMs
  server.timeout = responseTimeoutMs
  server.keepAliveTimeout = Math.min(5000, responseTimeoutMs)

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
    async drain(): Promise<void> {
      await service.drain()

      if (drainListener) {
        await drainListener()
      }
    },
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

        if (drainListener) {
          await drainListener()
        }

        await closedServer
      })()

      return closing
    },
  })
}
