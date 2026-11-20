import type { ServerResponse } from "node:http"
import { oauthConsentSecurityHeaders } from "../../site/oauth-consent-headers.ts"
import { nativeSaveConsentRequestId } from "../contracts/native-save.ts"
import type { ServerConfig } from "../server/dependencies.ts"

export const CONSENT_SECURITY_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({ ...oauthConsentSecurityHeaders })

export interface ConsentRouteMatcherOptions {
  readonly consentPageUrl: string
  readonly nativeSaveConsentPageUrl?: string
  readonly packageSaveConsentPageUrl?: string
}

function hasControls(value: string, includeSpace = false): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (code <= (includeSpace ? 32 : 31) || code === 127) {
      return true
    }
  }

  return false
}

function normalizePathname(rawUrl: string): string | null {
  const path = new URL(rawUrl).pathname

  if (path.length === 0 || path === "/") {
    return null
  }

  return path.replace(/\/+$/u, "")
}

export function extractRawPathname(rawUrl: string): string | null {
  if (
    rawUrl.length === 0 ||
    !rawUrl.startsWith("/") ||
    rawUrl.startsWith("//") ||
    rawUrl.includes("#") ||
    hasControls(rawUrl, true) ||
    rawUrl.includes("\\")
  ) {
    return null
  }

  const cut = rawUrl.indexOf("?")
  const pathname = cut === -1 ? rawUrl : rawUrl.slice(0, cut)

  try {
    if (new URL(rawUrl, "https://routing.invalid").pathname !== pathname) {
      return null
    }

    for (const segment of pathname.split("/")) {
      const decoded = decodeURIComponent(segment)

      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\") ||
        hasControls(decoded)
      ) {
        return null
      }
    }
  } catch {
    return null
  }

  return pathname
}

function firstHeaderString(
  value: string | readonly string[] | number | null | undefined,
): string | null {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    const first: unknown = value[0]

    return typeof first === "string" ? first : null
  }

  return null
}

function joinHeaderStrings(
  value: string | readonly string[] | number | null | undefined,
): string {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ")
  }

  return ""
}

export function isHtmlContentType(
  value: string | readonly string[] | number | null | undefined,
): boolean {
  const raw = firstHeaderString(value)

  if (raw === null) {
    return false
  }

  const mediaType = raw.split(";", 1)[0]?.trim().toLowerCase()

  return mediaType === "text/html"
}

export function mergeContentSecurityPolicyFrameAncestors(
  existing: string | readonly string[] | number | null | undefined,
): string {
  const defaultDirective = CONSENT_SECURITY_HEADERS["Content-Security-Policy"]
  const raw = joinHeaderStrings(existing)

  if (raw.trim().length === 0) {
    return defaultDirective
  }

  const policies = raw
    .split(",")
    .map((segment) => {
      const retained = segment
        .split(";")
        .map((directive) => directive.trim())
        .filter((directive) => {
          if (directive.length === 0) {
            return false
          }

          const keyword = directive.split(/\s+/u, 1)[0]?.toLowerCase()

          return keyword !== "frame-ancestors"
        })

      retained.push(defaultDirective)

      return retained.join("; ")
    })
    .filter((segment) => segment.length > 0)

  return policies.length > 0 ? policies.join(", ") : defaultDirective
}

export function applyConsentSecurityHeadersToHeaders(headers: Headers): void {
  headers.set(
    "Content-Security-Policy",
    mergeContentSecurityPolicyFrameAncestors(
      headers.get("content-security-policy"),
    ),
  )
  headers.set("X-Frame-Options", CONSENT_SECURITY_HEADERS["X-Frame-Options"])
  headers.set("Referrer-Policy", CONSENT_SECURITY_HEADERS["Referrer-Policy"])
  headers.set("Cache-Control", CONSENT_SECURITY_HEADERS["Cache-Control"])
}

export function withConsentSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)

  applyConsentSecurityHeadersToHeaders(headers)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function applyConsentSecurityHeadersToNodeResponse(
  res: ServerResponse,
): void {
  const merged = mergeContentSecurityPolicyFrameAncestors(
    res.getHeader("content-security-policy"),
  )

  res.setHeader("Content-Security-Policy", merged)
  res.setHeader("X-Frame-Options", CONSENT_SECURITY_HEADERS["X-Frame-Options"])
  res.setHeader("Referrer-Policy", CONSENT_SECURITY_HEADERS["Referrer-Policy"])
  res.setHeader("Cache-Control", CONSENT_SECURITY_HEADERS["Cache-Control"])
}

export function createConsentRouteMatcher(
  options: ConsentRouteMatcherOptions,
): (pathname: string) => boolean {
  const oauthConsentPath = normalizePathname(options.consentPageUrl)

  if (!oauthConsentPath) {
    throw new Error("Consent page URL must define a non-root pathname")
  }

  const nativeSavePrefix = options.nativeSaveConsentPageUrl
    ? normalizePathname(options.nativeSaveConsentPageUrl)
    : null

  if (options.nativeSaveConsentPageUrl && !nativeSavePrefix) {
    throw new Error(
      "Native-save consent page URL must define a non-root pathname",
    )
  }

  const packageSavePrefix = options.packageSaveConsentPageUrl
    ? normalizePathname(options.packageSaveConsentPageUrl)
    : null
  if (options.packageSaveConsentPageUrl && !packageSavePrefix) {
    throw new Error(
      "Package-save consent page URL must define a non-root pathname",
    )
  }

  return (pathname: string): boolean => {
    if (pathname === oauthConsentPath) {
      return true
    }

    if (packageSavePrefix && pathname.startsWith(`${packageSavePrefix}/`)) {
      return /^[A-Za-z0-9_-]{22,64}$/u.test(
        pathname.slice(packageSavePrefix.length + 1),
      )
    }

    if (!nativeSavePrefix) {
      return false
    }

    const prefixWithSlash = `${nativeSavePrefix}/`

    if (!pathname.startsWith(prefixWithSlash)) {
      return false
    }

    const id = pathname.slice(prefixWithSlash.length)

    if (id.includes("/")) {
      return false
    }

    return nativeSaveConsentRequestId.safeParse(id).success
  }
}

export function createMachineRouteMatcher(
  config: Pick<ServerConfig, "issuer" | "resource" | "resourceMetadataUrl">,
): (pathname: string) => boolean {
  const issuer = new URL(config.issuer)
  const resource = new URL(config.resource)
  const metadata = new URL(config.resourceMetadataUrl)
  const base = issuer.pathname.replace(/\/$/u, "")
  const endpoint = (name: string) => `${base}/${name}`
  const authServerMetadataPath = `/.well-known/oauth-authorization-server${base === "" ? "" : base}`
  const downloadPrefix = endpoint("downloads/")
  const exactPaths = new Set([
    authServerMetadataPath,
    endpoint("jwks.json"),
    endpoint("authorize"),
    endpoint("inspect"),
    endpoint("approve"),
    endpoint("native-save/inspect"),
    endpoint("native-save/approve"),
    endpoint("token"),
    endpoint("revoke"),
    resource.pathname,
    metadata.pathname,
  ])

  return (pathname: string): boolean => {
    const safePath = extractRawPathname(pathname)

    if (safePath === null) {
      return false
    }

    const decoded = safePath
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/")

    return (
      exactPaths.has(decoded) ||
      decoded.startsWith(downloadPrefix) ||
      decoded === "/.well-known" ||
      decoded.startsWith("/.well-known/") ||
      (base.length > 0 &&
        (decoded === base || decoded.startsWith(`${base}/`))) ||
      decoded.startsWith(`${resource.pathname}/`)
    )
  }
}
