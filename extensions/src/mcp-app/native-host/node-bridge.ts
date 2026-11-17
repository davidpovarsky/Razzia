import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { extractRawPathname } from "./consent-routes.ts"

const DEFAULT_MAX_NON_MCP_BODY_BYTES = 16 * 1024 * 1024
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

async function readNodeRequestBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req as AsyncIterable<
    Buffer | Uint8Array | string
  >) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.byteLength

    if (total > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE")
    }

    chunks.push(buf)
  }

  return chunks.length === 0 ? new Uint8Array(0) : Buffer.concat(chunks, total)
}

function parseTargetUrl(rawTarget: string): URL | null {
  try {
    return new URL(rawTarget)
  } catch {
    return null
  }
}

async function tryReadBody(options: {
  readonly req: IncomingMessage
  readonly maxBodyBytes: number
}): Promise<
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly status: 400 | 413; readonly code: string }
> {
  try {
    const bytes = await readNodeRequestBody(options.req, options.maxBodyBytes)

    return { ok: true, bytes }
  } catch (error) {
    const isTooLarge =
      error instanceof Error && error.message === "PAYLOAD_TOO_LARGE"

    return {
      ok: false,
      status: isTooLarge ? 413 : 400,
      code: isTooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY",
    }
  }
}

export async function nodeRequestToWebRequest(
  req: IncomingMessage,
  maxBodyBytes: number = DEFAULT_MAX_NON_MCP_BODY_BYTES,
  signal?: AbortSignal,
): Promise<
  | { readonly request: Request; readonly method: string }
  | { readonly status: 400 | 413; readonly code: string }
> {
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

  const bodyResult = await tryReadBody({ req, maxBodyBytes })

  if (!bodyResult.ok) {
    return { status: bodyResult.status, code: bodyResult.code }
  }

  const requestInit: RequestInit =
    bodyResult.bytes.byteLength > 0
      ? {
          method,
          headers: parsedHeaders.headers,
          body: Uint8Array.from(bodyResult.bytes),
        }
      : { method, headers: parsedHeaders.headers }

  return {
    method,
    request: new Request(targetUrl, { ...requestInit, signal }),
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

  if (inFlight.size >= 16) {
    writeSimpleNodeError(res, 503, "SERVICE_BUSY")

    return
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
  const timer = setTimeout(() => {
    controller.abort(new Error("RESPONSE_TIMEOUT"))
    req.destroy()
    res.destroy()
  }, timeoutMs)
  timer.unref()
  const exchange = async () => {
    const converted = await nodeRequestToWebRequest(
      req,
      undefined,
      controller.signal,
    )
    controller.signal.throwIfAborted()

    if ("status" in converted) {
      writeSimpleNodeError(res, converted.status, converted.code)

      return
    }

    const response = await dispatch(converted.request)

    if (controller.signal.aborted) {
      await response.body?.cancel().catch(() => undefined)
      controller.signal.throwIfAborted()
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
      inFlight.delete(work)
    })
  inFlight.add(work)
}
