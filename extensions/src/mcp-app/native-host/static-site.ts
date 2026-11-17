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

function fileResponse(options: {
  readonly method: string
  readonly bytes: Buffer
  readonly contentType: string
  readonly consentPage: boolean
}): Response {
  const headers = new Headers({
    "Content-Type": options.contentType,
    "Content-Length": String(options.bytes.byteLength),
  })
  const body = options.method === "HEAD" ? null : new Uint8Array(options.bytes)

  if (options.consentPage && options.contentType.startsWith("text/html;")) {
    for (const [name, value] of Object.entries(oauthConsentSecurityHeaders)) {
      headers.set(name, value)
    }
  }

  return new Response(body, {
    status: 200,
    headers,
  })
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
