import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"
import { oauthConsentSecurityHeaders } from "../../site/oauth-consent-headers.ts"

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webmanifest": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

function tryDecodeSegment(part: string): string | null {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

function decodeStaticSegments(pathname: string): string[] | null {
  const parts = pathname.split("/").filter((part) => part.length > 0)
  const decoded: string[] = []

  for (const part of parts) {
    const segment = tryDecodeSegment(part)

    if (
      segment === null ||
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      return null
    }

    decoded.push(segment)
  }

  return decoded
}

function resolveInsideDist(
  distReal: string,
  segments: readonly string[],
): string | null {
  if (segments.length === 0) {
    return null
  }

  const candidate = resolve(distReal, ...segments)

  if (!candidate.startsWith(`${distReal}${sep}`) || !existsSync(candidate)) {
    return null
  }

  const realCandidate = realpathSync(candidate)

  if (!realCandidate.startsWith(`${distReal}${sep}`)) {
    return null
  }

  if (!statSync(realCandidate).isFile()) {
    return null
  }

  return realCandidate
}

interface ByteRange {
  readonly start: number
  readonly end: number
}

/** One byte range is enough for browser media seeking; ignore multipart requests. */
function singleByteRange(
  value: string | null | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!value) {
    return null
  }

  const unit = /^bytes=(.*)$/iu.exec(value.trim())

  if (!unit || unit[1].includes(",")) {
    return null
  }

  const range = /^(\d*)-(\d*)$/u.exec(unit[1].trim())

  if (!range || (!range[1] && !range[2]) || size === 0) {
    return "unsatisfiable"
  }

  // Decimal offsets can exceed Number.MAX_SAFE_INTEGER. Compare before narrowing.
  const length = BigInt(size)

  if (!range[1]) {
    const suffix = BigInt(range[2])

    return suffix === 0n
      ? "unsatisfiable"
      : {
          start: Number(suffix >= length ? 0n : length - suffix),
          end: size - 1,
        }
  }

  const start = BigInt(range[1])
  const end = range[2] ? BigInt(range[2]) : length - 1n

  if (start >= length || end < start) {
    return "unsatisfiable"
  }

  return {
    start: Number(start),
    end: Number(end >= length ? length - 1n : end),
  }
}

function fileResponse(options: {
  readonly method: string
  readonly bytes: Buffer
  readonly contentType: string
  readonly consentPage: boolean
  readonly allowRanges?: boolean
  readonly range?: string | null
}): Response {
  const size = options.bytes.byteLength
  const headers = new Headers({
    "Content-Type": options.contentType,
    "Content-Length": String(size),
  })

  if (options.consentPage && options.contentType.startsWith("text/html;")) {
    for (const [name, value] of Object.entries(oauthConsentSecurityHeaders)) {
      headers.set(name, value)
    }
  }

  if (options.allowRanges) {
    headers.set("Accept-Ranges", "bytes")
  }

  // Range applies only to GET. HEAD always describes the complete representation.
  const range =
    options.allowRanges && options.method === "GET"
      ? singleByteRange(options.range, size)
      : null

  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`)
    headers.set("Content-Length", "0")

    return new Response(null, { status: 416, headers })
  }

  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
    headers.set("Content-Length", String(range.end - range.start + 1))

    return new Response(
      new Uint8Array(options.bytes.subarray(range.start, range.end + 1)),
      { status: 206, headers },
    )
  }

  return new Response(
    options.method === "HEAD" ? null : new Uint8Array(options.bytes),
    { status: 200, headers },
  )
}

export function createSiteDistHandler(
  siteDistDir: string,
  options: {
    /** The protected dispatcher must handle these paths before this fallback. */
    readonly isMachinePath?: (pathname: string) => boolean
    /** Additional first-party consent routes, supplied by trusted root config. */
    readonly isConsentPath?: (pathname: string) => boolean
  } = {},
): (request: Request) => Response {
  const distReal = realpathSync(resolve(siteDistDir))
  const indexCandidate = join(distReal, "index.html")

  if (!existsSync(indexCandidate)) {
    throw new Error("Site dist directory must contain index.html")
  }

  const indexReal = realpathSync(indexCandidate)

  if (
    !indexReal.startsWith(`${distReal}${sep}`) ||
    !statSync(indexReal).isFile()
  ) {
    throw new Error("Site dist index.html must be a regular file inside dist")
  }

  const indexBytes = readFileSync(indexReal)

  return (request: Request): Response => {
    const method = request.method.toUpperCase()

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      })
    }

    const { pathname } = new URL(request.url)
    const segments = decodeStaticSegments(pathname)

    if (segments === null) {
      return new Response("Bad Request", { status: 400 })
    }

    // A missing/disabled machine dispatcher must never masquerade as a working
    // MCP or OAuth endpoint by returning the site's successful HTML shell.
    // Check decoded segments as well, before considering on-disk assets.
    const canonicalPathname = `/${segments.join("/")}`

    if (
      ["mcp", "oauth", ".well-known", "api"].includes(segments[0] ?? "") ||
      options.isMachinePath?.(pathname) ||
      options.isMachinePath?.(canonicalPathname)
    ) {
      const body = '{"error":"NOT_FOUND"}'

      return new Response(method === "HEAD" ? null : body, {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(body)),
          "Cache-Control": "no-store",
        },
      })
    }

    // These are HTML response protections, not request-ID/authentication checks.
    // Protect invalid consent paths too; the actual page still denies invalid IDs.
    const consentPage =
      canonicalPathname === "/studio/oauth-consent" ||
      canonicalPathname === "/studio/native-save-consent" ||
      canonicalPathname.startsWith("/studio/native-save-consent/") ||
      options.isConsentPath?.(pathname) === true ||
      options.isConsentPath?.(canonicalPathname) === true
    const assetPath = resolveInsideDist(distReal, segments)

    if (assetPath !== null) {
      const ext = extname(assetPath).toLowerCase()
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream"

      return fileResponse({
        method,
        bytes: readFileSync(assetPath),
        contentType,
        consentPage,
        allowRanges: true,
        // No validator is emitted here, so If-Range cannot authorize a partial copy.
        range: request.headers.has("if-range")
          ? null
          : request.headers.get("range"),
      })
    }

    const lastSegment = segments[segments.length - 1] ?? ""

    if (pathname.startsWith("/assets/") || lastSegment.includes(".")) {
      return new Response("Not Found", { status: 404 })
    }

    return fileResponse({
      method,
      bytes: indexBytes,
      contentType: "text/html; charset=utf-8",
      consentPage,
    })
  }
}
