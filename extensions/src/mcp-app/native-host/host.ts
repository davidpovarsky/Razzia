import {
  createServer as createHttpServer,
  type RequestListener,
  type Server as HttpServer,
} from "node:http"
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from "node:https"
import type { Socket } from "node:net"
import { isAbsolute, resolve as resolvePath } from "node:path"
import {
  createProtectedMcpNodeListener,
  createProtectedMcpService,
  type ProtectedMcpService,
  type ProtectedMcpServiceNativeSaveOptions,
  type ProtectedMcpServiceOptions,
} from "../first-party/index.ts"
import {
  createConsentRouteMatcher,
  createMachineRouteMatcher,
  extractRawPathname,
  isHtmlContentType,
  withConsentSecurityHeaders,
} from "./consent-routes.ts"
import { runNativeNodeRequest, writeSimpleNodeError } from "./node-bridge.ts"
import { createSiteDistHandler } from "./static-site.ts"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

function hostResponseTimeout(options: NativeConsentHostOptions): number {
  const timeout = options.responseTimeoutMs ?? 30000

  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) {
    throw new Error("Native host requires a response timeout in 1..120000 ms")
  }

  return timeout
}

export type NativeConsentHostMcpOptions = Omit<
  ProtectedMcpServiceOptions,
  "enabled" | "configRoot" | "nativeSave"
> & {
  readonly configRoot?: string
  readonly nativeSave: ProtectedMcpServiceNativeSaveOptions
}

export interface NativeConsentHostOptions {
  readonly enabled?: boolean
  readonly configRoot?: string
  readonly siteDistDir?: string
  readonly webFallback?: (request: Request) => Response | Promise<Response>
  readonly nativeAppFetch?: (request: Request) => Response | Promise<Response>
  readonly initializeNativeRuntime?: boolean
  readonly mcp?: NativeConsentHostMcpOptions
  readonly responseTimeoutMs?: number
}

export interface NativeConsentHost {
  readonly enabled: boolean
  readonly service: ProtectedMcpService | null
  readonly consentRouteMatcher: ((pathname: string) => boolean) | null
  readonly machineRouteMatcher: ((pathname: string) => boolean) | null
  isClosed(): boolean
  fetch(request: Request): Promise<Response>
  readonly nodeListener: RequestListener
  drain(): Promise<void>
  close(): Promise<void>
}

export interface NativeConsentHttpServerTlsOptions {
  readonly key: string | Buffer
  readonly cert: string | Buffer
}

export interface ListenNativeConsentHostOptions {
  readonly host?: string
  readonly port: number
  readonly allowNonLoopback?: boolean
  readonly maxConnections?: number
  readonly tls?: NativeConsentHttpServerTlsOptions
  readonly attachSocketServer?: boolean
}

export interface NativeConsentHttpServer {
  readonly server: HttpServer | HttpsServer
  readonly host: string
  readonly port: number
  readonly origin: string
  drain(): Promise<void>
  close(): Promise<void>
}

function isApiPathname(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

function serviceUnavailableResponse(): Response {
  return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

async function runNativeStartup(configRoot: string): Promise<void> {
  const [accountDb, configService, configScope, serverExt] = await Promise.all([
    import("@razzia/socket/services/account-db"),
    import("@razzia/socket/services/config"),
    import("@razzia/socket/services/config-scope"),
    import("@razzia/extensions/server"),
  ])
  const resolved = resolvePath(configRoot)
  const scopedRoot = resolvePath(configScope.resolveConfigRoot())

  if (scopedRoot !== resolved) {
    throw new Error("Native config scope root does not match configRoot")
  }

  accountDb.readStartupOwnerSnapshot()
  serverExt.recoverCreationReservations(resolved)
  configService.initConfig()
  accountDb.checkAccountConfiguration()
  serverExt.recoverStartupOwnerJournals(accountDb.readStartupOwnerSnapshot())
}

function resolveEnabledConfiguration(options: NativeConsentHostOptions): {
  readonly configRoot: string
  readonly mcp: NativeConsentHostMcpOptions
} {
  if (!options.mcp) {
    throw new Error(
      "NativeConsentHost requires explicit mcp configuration when enabled",
    )
  }

  const configRoot = options.configRoot ?? options.mcp.configRoot

  if (typeof configRoot !== "string" || !isAbsolute(configRoot)) {
    throw new Error(
      "NativeConsentHost requires an absolute configRoot when enabled",
    )
  }

  const envConfigPath = process.env.CONFIG_PATH

  if (
    !envConfigPath ||
    resolvePath(envConfigPath) !== resolvePath(configRoot)
  ) {
    throw new Error(
      "NativeConsentHost requires process.env.CONFIG_PATH to match configRoot",
    )
  }

  if (!options.mcp.nativeSave.consentPageUrl) {
    throw new Error(
      "NativeConsentHost requires explicit mcp.nativeSave.consentPageUrl",
    )
  }

  const issuerOrigin = new URL(options.mcp.config.issuer).origin
  const oauthConsentUrl = new URL(options.mcp.consentPageUrl)
  const nativeConsentUrl = new URL(options.mcp.nativeSave.consentPageUrl)

  if (
    oauthConsentUrl.origin !== issuerOrigin ||
    nativeConsentUrl.origin !== issuerOrigin
  ) {
    throw new Error(
      "Consent page URLs must share an origin with the OAuth issuer",
    )
  }

  if (oauthConsentUrl.pathname === nativeConsentUrl.pathname) {
    throw new Error(
      "OAuth consent and native-save consent paths must be distinct",
    )
  }

  return {
    configRoot: resolvePath(configRoot),
    mcp: options.mcp,
  }
}

function createAppDispatcher(options: NativeConsentHostOptions) {
  const staticSite = options.siteDistDir
    ? createSiteDistHandler(options.siteDistDir, {
        isMachinePath:
          options.enabled === true && options.mcp
            ? createMachineRouteMatcher(options.mcp.config)
            : undefined,
      })
    : null
  let cachedDefaultNativeApp:
    ((request: Request) => Response | Promise<Response>) | null = null

  const callNativeApp = async (request: Request): Promise<Response> => {
    if (options.nativeAppFetch) {
      return options.nativeAppFetch(request)
    }

    if (!cachedDefaultNativeApp) {
      const mod = await import("@razzia/socket/app")
      cachedDefaultNativeApp = (incoming) => mod.app.fetch(incoming)
    }

    return cachedDefaultNativeApp(request)
  }

  const serveWeb = (request: Request): Promise<Response> => {
    if (staticSite) {
      return Promise.resolve(staticSite(request))
    }

    if (options.webFallback) {
      return Promise.resolve(options.webFallback(request))
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }))
  }

  return { callNativeApp, serveWeb }
}

function drainTrackedPromises(inFlight: Set<Promise<void>>): Promise<void> {
  if (inFlight.size === 0) {
    return Promise.resolve()
  }

  return Promise.allSettled([...inFlight]).then(() =>
    drainTrackedPromises(inFlight),
  )
}

function createDisabledHost(
  options: NativeConsentHostOptions,
): NativeConsentHost {
  const { callNativeApp, serveWeb } = createAppDispatcher(options)
  const inFlight = new Set<Promise<void>>()
  let draining = false
  let closed = false

  const fetchHandler = (request: Request): Promise<Response> => {
    if (closed || draining) {
      return Promise.resolve(serviceUnavailableResponse())
    }

    const { pathname } = new URL(request.url)

    if (isApiPathname(pathname)) {
      return callNativeApp(request)
    }

    return serveWeb(request)
  }

  const nodeListener: RequestListener = (req, res) => {
    if (closed || draining) {
      writeSimpleNodeError(res, 503, "SERVICE_UNAVAILABLE")

      return
    }

    runNativeNodeRequest({
      req,
      res,
      dispatch: fetchHandler,
      inFlight,
      timeoutMs: hostResponseTimeout(options),
    })
  }

  const drain = async (): Promise<void> => {
    draining = true
    await drainTrackedPromises(inFlight)
  }

  const close = async (): Promise<void> => {
    if (closed) {
      return
    }

    await drain()
    closed = true
  }

  return {
    enabled: false,
    service: null,
    consentRouteMatcher: null,
    machineRouteMatcher: null,
    isClosed: () => closed,
    fetch: fetchHandler,
    nodeListener,
    drain,
    close,
  }
}

export async function createNativeConsentHost(
  options: NativeConsentHostOptions,
): Promise<NativeConsentHost> {
  hostResponseTimeout(options)

  if (options.enabled !== true) {
    return createDisabledHost(options)
  }

  const resolvedConfig = resolveEnabledConfiguration(options)
  const consentMatcher = createConsentRouteMatcher({
    consentPageUrl: resolvedConfig.mcp.consentPageUrl,
    nativeSaveConsentPageUrl: resolvedConfig.mcp.nativeSave.consentPageUrl,
    packageSaveConsentPageUrl: new URL(
      "/studio/package-save-consent",
      resolvedConfig.mcp.consentPageUrl,
    ).href,
  })
  const machineMatcher = createMachineRouteMatcher(resolvedConfig.mcp.config)
  const { callNativeApp, serveWeb } = createAppDispatcher(options)

  if (options.initializeNativeRuntime === true) {
    await runNativeStartup(resolvedConfig.configRoot)
  }

  const service = await createProtectedMcpService({
    ...resolvedConfig.mcp,
    enabled: true,
    configRoot: resolvedConfig.configRoot,
    responseTimeoutMs:
      options.responseTimeoutMs ?? resolvedConfig.mcp.responseTimeoutMs,
  })
  const mcpNodeListener = createProtectedMcpNodeListener(
    service,
    options.responseTimeoutMs !== undefined
      ? { responseTimeoutMs: options.responseTimeoutMs }
      : undefined,
  )
  const inFlight = new Set<Promise<void>>()
  let draining = false
  let closed = false

  const routeNonMachineRequest = async (
    request: Request,
  ): Promise<Response> => {
    const { pathname } = new URL(request.url)

    if (isApiPathname(pathname)) {
      return callNativeApp(request)
    }

    const response = await serveWeb(request)
    const method = request.method.toUpperCase()

    if (
      (method === "GET" || method === "HEAD") &&
      consentMatcher(pathname) &&
      isHtmlContentType(response.headers.get("content-type"))
    ) {
      return withConsentSecurityHeaders(response)
    }

    return response
  }

  const fetchHandler = (request: Request): Promise<Response> => {
    if (closed) {
      return Promise.resolve(serviceUnavailableResponse())
    }

    const { pathname } = new URL(request.url)

    if (machineMatcher(pathname)) {
      return service.fetch(request)
    }

    if (draining) {
      return Promise.resolve(serviceUnavailableResponse())
    }

    return routeNonMachineRequest(request)
  }

  const nodeListener: RequestListener = (req, res) => {
    if (closed) {
      writeSimpleNodeError(res, 503, "SERVICE_UNAVAILABLE")

      return
    }

    const rawPath = extractRawPathname(req.url ?? "")

    if (rawPath === null) {
      writeSimpleNodeError(res, 400, "INVALID_URL")

      return
    }

    // Machine OAuth and MCP endpoints keep the protected raw-header listener
    // untouched before any Web Request conversion or non-machine routing.
    if (machineMatcher(rawPath)) {
      mcpNodeListener(req, res)

      return
    }

    if (draining) {
      writeSimpleNodeError(res, 503, "SERVICE_UNAVAILABLE")

      return
    }

    runNativeNodeRequest({
      req,
      res,
      dispatch: routeNonMachineRequest,
      inFlight,
      timeoutMs: hostResponseTimeout(options),
    })
  }

  const drain = async (): Promise<void> => {
    draining = true
    await service.drain()
    await drainTrackedPromises(inFlight)
  }

  const close = async (): Promise<void> => {
    if (closed) {
      return
    }

    await drain()
    await service.close()
    closed = true

    if (options.initializeNativeRuntime === true) {
      const accountDb = await import("@razzia/socket/services/account-db")
      const registry = await import("@razzia/socket/services/registry")
      registry.default.getInstance().stopCleanupTask()
      accountDb.closeAccountDb()
    }
  }

  return {
    enabled: true,
    service,
    consentRouteMatcher: consentMatcher,
    machineRouteMatcher: machineMatcher,
    isClosed: () => closed || service.isClosed(),
    fetch: fetchHandler,
    nodeListener,
    drain,
    close,
  }
}

function formatServerOrigin(options: {
  readonly host: string
  readonly port: number
  readonly tls: boolean
}): string {
  const scheme = options.tls ? "https" : "http"
  const formattedHost =
    options.host.includes(":") && !options.host.startsWith("[")
      ? `[${options.host}]`
      : options.host

  return `${scheme}://${formattedHost}:${options.port}`
}

async function closeServerCleanly(options: {
  readonly server: HttpServer | HttpsServer
  readonly sockets: Set<Socket>
  readonly closeIo?: () => Promise<void>
}): Promise<void> {
  const ioClosed =
    options.closeIo?.().catch(() => undefined) ?? Promise.resolve()

  options.server.closeIdleConnections()
  const httpClosed = new Promise<void>((resolve, reject) => {
    options.server.close((error) => {
      if (
        error &&
        (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
      ) {
        reject(error)

        return
      }

      resolve()
    })

    for (const socket of options.sockets) {
      socket.end()
    }

    if (options.sockets.size > 0) {
      const timer = setTimeout(() => {
        for (const socket of options.sockets) {
          socket.destroy()
        }
      }, 250)

      timer.unref()
    }
  })

  await Promise.all([httpClosed, ioClosed])
}

export async function listenNativeConsentHost(
  consentHost: NativeConsentHost,
  options: ListenNativeConsentHostOptions,
): Promise<NativeConsentHttpServer> {
  const host = options.host ?? "127.0.0.1"

  if (!LOOPBACK_HOSTS.has(host) && options.allowNonLoopback !== true) {
    throw new Error(
      "Native consent host refuses non-loopback bind without allowNonLoopback",
    )
  }

  const server = options.tls
    ? createHttpsServer(
        { key: options.tls.key, cert: options.tls.cert },
        consentHost.nodeListener,
      )
    : createHttpServer(consentHost.nodeListener)

  server.maxConnections = options.maxConnections ?? 128
  server.headersTimeout = 10000
  // Ordinary and MCP handlers retain their shorter response deadlines. The
  // exact package upload route can stream a native-size archive for two minutes.
  server.requestTimeout = 120000
  server.keepAliveTimeout = 5000

  const sockets = new Set<Socket>()

  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => {
      sockets.delete(socket)
    })
  })

  let closeIo: (() => Promise<void>) | null = null

  if (options.attachSocketServer === true) {
    const socketApp = await import("@razzia/socket/app")
    const io = socketApp.createSocketServer(server)

    closeIo = () =>
      new Promise<void>((resolve) => {
        io.close(() => {
          resolve()
        })
      })
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(options.port, host)
  })

  const bound = server.address()

  if (!bound || typeof bound === "string") {
    await closeServerCleanly({
      server,
      sockets,
      closeIo: closeIo ?? undefined,
    })

    throw new Error("Expected TCP socket address for native consent server")
  }

  const origin = formatServerOrigin({
    host: bound.address,
    port: bound.port,
    tls: options.tls !== undefined,
  })
  let closed = false

  return {
    server,
    host: bound.address,
    port: bound.port,
    origin,
    drain: async () => {
      await consentHost.drain()
      server.closeIdleConnections()
    },
    close: async () => {
      if (closed) {
        return
      }

      closed = true
      await consentHost.drain()
      await closeServerCleanly({
        server,
        sockets,
        closeIo: closeIo ?? undefined,
      })
      await consentHost.close()
    },
  }
}
