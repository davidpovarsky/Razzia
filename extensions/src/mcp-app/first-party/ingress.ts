import { ToolError } from "../server/errors.ts"

export const HTTP_LIMITS = Object.freeze({
  bytes: 65_536,
  inFlight: 32,
  perMinute: 120,
  bodyMs: 5000,
})
export type Route =
  { kind: "create" } | { kind: "get" | "replace" | "prepare-save"; id: string }
export class HttpRejection extends Error {
  constructor(readonly status: 400 | 403 | 404 | 405 | 413 | 415 | 429) {
    super("HTTP_REJECTED")
  }
}
/** Observe cancellation at explicit request/authorization boundaries. This
 * neither interrupts synchronous SQLite nor rolls back committed rows. */
export function assertRequestActive(signal: AbortSignal) {
  if (signal.aborted) throw new HttpRejection(400)
}
export function trustedOrigin(raw: string) {
  const url = new URL(raw)
  if (
    url.protocol !== "https:" ||
    url.origin !== raw ||
    url.username ||
    url.password
  )
    throw new Error("Invalid first-party origin configuration")
  return url
}
export function route(request: Request, origin: URL): Route {
  if (request.url.length > 2048) throw new HttpRejection(400)
  let headerCount = 0
  let headerBytes = 0
  let forwarded = false
  request.headers.forEach((value, name) => {
    if (++headerCount > 32 || name.length > 128 || value.length > 4096)
      throw new HttpRejection(400)
    headerBytes += new TextEncoder().encode(name + value).byteLength
    if (headerBytes > 8192) throw new HttpRejection(400)
    if (name === "forwarded" || name.startsWith("x-forwarded-"))
      forwarded = true
  })
  const url = new URL(request.url)
  if (
    url.origin !== origin.origin ||
    request.headers.get("host") !== origin.host ||
    forwarded
  )
    throw new HttpRejection(403)
  const suppliedOrigin = request.headers.get("origin")
  if (
    (request.method !== "GET" || suppliedOrigin !== null) &&
    suppliedOrigin !== origin.origin
  )
    throw new HttpRejection(403)
  if (url.search || url.hash) throw new HttpRejection(400)
  const selected = /^\/drafts\/([A-Za-z0-9_-]{22,64})(\/save-intents)?$/u.exec(
    url.pathname,
  )
  let found: Route
  if (url.pathname === "/drafts") {
    if (request.method !== "POST") throw new HttpRejection(405)
    found = { kind: "create" }
  } else if (selected?.[1]) {
    if (selected[2]) {
      if (request.method !== "POST") throw new HttpRejection(405)
      found = { kind: "prepare-save", id: selected[1] }
    } else if (request.method === "GET")
      found = { kind: "get", id: selected[1] }
    else if (request.method === "PUT")
      found = { kind: "replace", id: selected[1] }
    else throw new HttpRejection(405)
  } else throw new HttpRejection(404)
  const length = request.headers.get("content-length")
  if (
    length !== null &&
    (!/^(0|[1-9][0-9]{0,8})$/u.test(length) ||
      Number(length) > HTTP_LIMITS.bytes)
  )
    throw new HttpRejection(413)
  if (request.headers.has("content-encoding")) throw new HttpRejection(415)
  if (found.kind === "get") {
    if (request.body || (length !== null && length !== "0"))
      throw new HttpRejection(400)
  } else if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new HttpRejection(415)
  return found
}

/** A fixed process-wide anonymous budget: no client/IP/forwarded identity trust.
 * Every attempted request counts. A slow/cancel-stalled body retains its slot.
 */
export class IngressBudget {
  private inFlight = 0
  private used = 0
  private until = 0
  enter() {
    const now = Date.now()
    if (now >= this.until) {
      this.until = now + 60_000
      this.used = 0
    }
    if (
      ++this.used > HTTP_LIMITS.perMinute ||
      this.inFlight >= HTTP_LIMITS.inFlight
    )
      throw new HttpRejection(429)
    this.inFlight++
    let released = false
    return () => {
      if (!released) {
        released = true
        this.inFlight--
      }
    }
  }
}

/** Bound the actual stream, not only Content-Length. No JSON parse here.
 * Cancellation is awaited; a nonsettling stream cannot free an occupied slot.
 */
export async function bodyText(request: Request): Promise<string> {
  assertRequestActive(request.signal)
  if (!request.body) throw new HttpRejection(400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectInterrupted: (error: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject
  })
  const abort = () => rejectInterrupted(new HttpRejection(400))
  request.signal.addEventListener("abort", abort, { once: true })
  timer = setTimeout(abort, HTTP_LIMITS.bodyMs)
  let reading: ReturnType<typeof reader.read> | undefined
  let complete = false
  try {
    if (request.signal.aborted) abort()
    while (true) {
      reading = reader.read()
      const part = await Promise.race([reading, interrupted])
      reading = undefined
      if (part.done) {
        complete = true
        break
      }
      size += part.value.byteLength
      if (size > HTTP_LIMITS.bytes) throw new HttpRejection(413)
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      throw new ToolError("VALIDATION_FAILED")
    }
  } finally {
    if (timer) clearTimeout(timer)
    request.signal.removeEventListener("abort", abort)
    if (!complete) {
      // Keep ownership through BOTH the pending read and public cancel promise.
      const cancellation = reader.cancel().catch(() => {})
      await Promise.allSettled([reading, cancellation])
    }
    reader.releaseLock()
  }
}
