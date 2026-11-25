import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { MAX_MEDIA_SIZE } from "@razzia/common/constants"
import { PACKAGE_LIMITS } from "../../core/packages/manifest.ts"
import { extractRawPathname } from "./consent-routes.ts"

const DEFAULT_MAX_NON_MCP_BODY_BYTES = 16 * 1024 * 1024
const MAX_NATIVE_MEDIA_BODY_BYTES = MAX_MEDIA_SIZE + 64 * 1024
const mediaRequests = new WeakMap<Set<Promise<void>>, number>()
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding"])

export function writeSimpleNodeError(
  res: ServerResponse,
  status: number,
  code: string,
): void {
  if (res.headersSent || res.destroyed || res.writableEnded) {
    return
  }

  const body = Buffer.from(JSON.stringify({ error: code }), "utf8")

  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Connection", "close")
  res.setHeader("Content-Length", String(body.byteLength))
  res.end(body)
}

function parseNodeHeaders(
  rawHeaders: readonly string[],
): { host: string; headers: Headers } | null {
  const headers = new Headers()
  let host: string | null = null

  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]
    const value = rawHeaders[index + 1] ?? ""

    if (!name || name.startsWith(":")) {
      continue
    }

    if (name.toLowerCase() === "host") {
      const trimmed = value.trim()

      if (trimmed.length === 0 || host !== null) {
        return null
      }

      host = trimmed
    }

    try {
      headers.append(name, value)
    } catch {
      return null
    }
  }

  if (host === null) {
    return null
  }

  return { host, headers }
}

function parseTargetUrl(rawTarget: string): URL | null {
  try {
    return new URL(rawTarget)
  } catch {
    return null
  }
}

export function nodeRequestToWebRequest(
  req: IncomingMessage,
  maxBodyBytes: number = DEFAULT_MAX_NON_MCP_BODY_BYTES,
  signal?: AbortSignal,
):
  | {
      readonly request: Request
      readonly method: string
      readonly bodyLimitExceeded?: () => boolean
    }
  | { readonly status: 400 | 413; readonly code: string } {
  const rawUrl = req.url ?? ""
  const rawPath = extractRawPathname(rawUrl)

  if (rawPath === null) {
    return { status: 400, code: "INVALID_URL" }
  }

  const parsedHeaders = parseNodeHeaders(req.rawHeaders)

  if (parsedHeaders === null) {
    return { status: 400, code: "INVALID_HOST" }
  }

  const encrypted =
    (req.socket as { readonly encrypted?: boolean } | undefined)?.encrypted ===
    true
  const scheme = encrypted ? "https" : "http"
  const targetUrl = parseTargetUrl(`${scheme}://${parsedHeaders.host}${rawUrl}`)

  if (targetUrl === null) {
    return { status: 400, code: "INVALID_URL" }
  }

  if (targetUrl.host.toLowerCase() !== parsedHeaders.host.toLowerCase()) {
    return { status: 400, code: "INVALID_HOST" }
  }

  const method = (req.method ?? "GET").toUpperCase()

  if (method === "GET" || method === "HEAD") {
    return {
      method,
      request: new Request(targetUrl, {
        method,
        headers: parsedHeaders.headers,
        signal,
      }),
    }
  }

  const declaredLength = parsedHeaders.headers.get("content-length")

  if (declaredLength !== null && Number(declaredLength) > maxBodyBytes) {
    return { status: 413, code: "PAYLOAD_TOO_LARGE" }
  }

  let total = 0
  let exceeded = false
  // Node's stream/web declarations and lib.dom use different BYOB view types;
  // IncomingMessage is a byte stream and both implement the same Web API.
  const incoming = Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>
  const body = incoming.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength

        if (total > maxBodyBytes) {
          exceeded = true
          controller.error(new Error("PAYLOAD_TOO_LARGE"))

          return
        }

        controller.enqueue(chunk)
      },
    }),
    { preventCancel: true },
  )
  const requestInit: RequestInit & { duplex: "half" } = {
    method,
    headers: parsedHeaders.headers,
    body,
    duplex: "half",
    signal,
  }

  return {
    method,
    request: new Request(targetUrl, requestInit),
    bodyLimitExceeded: () => exceeded,
  }
}

export async function writeWebResponseToNode(options: {
  readonly method: string
  readonly res: ServerResponse
  readonly response: Response
}): Promise<void> {
  const { method, res, response } = options

  if (res.headersSent || res.destroyed || res.writableEnded) {
    return
  }

  res.statusCode = response.status
  response.headers.forEach((value, name) => {
    const lower = name.toLowerCase()

    if (lower !== "set-cookie" && !HOP_BY_HOP.has(lower)) {
      res.setHeader(name, value)
    }
  })

  const setCookies = response.headers.getSetCookie()

  if (setCookies.length > 0) {
    res.setHeader("set-cookie", setCookies)
  }

  const noBodyStatus =
    response.status < 200 || response.status === 204 || response.status === 304

  if (method === "HEAD" || noBodyStatus) {
    if (response.body && !response.body.locked) {
      await response.body.cancel().catch(() => undefined)
    }

    res.end()

    return
  }

  if (!response.body) {
    res.end()

    return
  }

  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    res,
  )
}

/** Bounded non-machine work only. MCP keeps its accepted raw listener. */
export function runNativeNodeRequest(options: {
  readonly req: IncomingMessage
  readonly res: ServerResponse
  readonly dispatch: (request: Request) => Promise<Response>
  readonly inFlight: Set<Promise<void>>
  readonly timeoutMs: number
}): void {
  const { req, res, dispatch, inFlight, timeoutMs } = options
  const pathname = extractRawPathname(req.url ?? "")
  const isMediaUpload =
    req.method === "POST" &&
    (pathname === "/api/media" || pathname === "/api/media/")
  const isPackageUpload =
    req.method === "POST" &&
    pathname !== null &&
    /^\/api\/packages\/(?:preflight|uploads|mcp-transfer\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u.test(
      pathname,
    )
  const isLargeUpload = isMediaUpload || isPackageUpload
  const activeMedia = mediaRequests.get(inFlight) ?? 0

  if (inFlight.size >= 16 || (isLargeUpload && activeMedia >= 2)) {
    writeSimpleNodeError(res, 503, "SERVICE_BUSY")

    return
  }

  if (isLargeUpload) {
    mediaRequests.set(inFlight, activeMedia + 1)
  }

  const controller = new AbortController()
  const disconnected = () => {
    if (!res.writableFinished) {
      controller.abort(new Error("CLIENT_DISCONNECTED"))
    }
  }
  res.once("close", disconnected)
  const expired = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        const reason: unknown = controller.signal.reason
        reject(reason instanceof Error ? reason : new Error("REQUEST_ABORTED"))
      },
      { once: true },
    )
  })
  const timer = setTimeout(
    () => {
      controller.abort(new Error("RESPONSE_TIMEOUT"))
      req.destroy()
      res.destroy()
    },
    isPackageUpload ? Math.max(timeoutMs, 120000) : timeoutMs,
  )
  timer.unref()
  const exchange = async () => {
    const mediaBodyLimit = isMediaUpload
      ? MAX_NATIVE_MEDIA_BODY_BYTES
      : undefined
    const converted = nodeRequestToWebRequest(
      req,
      isPackageUpload ? PACKAGE_LIMITS.archiveBytes : mediaBodyLimit,
      controller.signal,
    )
    controller.signal.throwIfAborted()

    if ("status" in converted) {
      writeSimpleNodeError(res, converted.status, converted.code)

      return
    }

    const response = await dispatch(converted.request).catch(
      (error: unknown) => {
        if (!converted.bodyLimitExceeded?.()) {
          throw error
        }

        return null
      },
    )

    if (!response || converted.bodyLimitExceeded?.()) {
      await response?.body?.cancel().catch(() => undefined)
      writeSimpleNodeError(res, 413, "PAYLOAD_TOO_LARGE")

      return
    }

    if (controller.signal.aborted) {
      await response.body?.cancel().catch(() => undefined)
      controller.signal.throwIfAborted()
    }

    if (!req.complete) {
      res.setHeader("Connection", "close")
    }

    await writeWebResponseToNode({ method: converted.method, res, response })
  }
  const work = Promise.race([exchange(), expired])
    .catch(() => {
      writeSimpleNodeError(res, 500, "INTERNAL")
    })
    .finally(() => {
      clearTimeout(timer)
      res.off("close", disconnected)

      if (!req.complete) {
        // Flush a refusal before terminating an upload that is still arriving.
        // Immediate req.destroy() can reset TCP before the peer sees the 413.
        req.socket.end()
        const terminate = setTimeout(() => req.destroy(), 250)
        terminate.unref()
      }

      if (isLargeUpload) {
        mediaRequests.set(inFlight, (mediaRequests.get(inFlight) ?? 1) - 1)
      }

      inFlight.delete(work)
    })
  inFlight.add(work)
}
