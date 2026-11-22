import type { IncomingMessage } from "node:http"
import type { SessionClaims } from "@razzia/common/types/auth"
import type { ManagedClientSessionResponse } from "@razzia/common/types/managed-clients"
import type { Context } from "hono"
import { deleteCookie, getCookie } from "hono/cookie"
import { verifyToken } from "./auth"
import {
  MANAGED_CLIENT_COOKIE,
  MANAGED_CLIENT_HEADER,
  MANAGED_CLIENT_MODE,
  ManagedClientStore,
  type ManagedClientPrincipal,
} from "./managed-clients"

export const managedClientCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
}

export const isManagedClientRequest = (c: Context): boolean =>
  c.req.header(MANAGED_CLIENT_HEADER) !== undefined

export const validManagedClientRequest = (c: Context): boolean =>
  c.req.header(MANAGED_CLIENT_HEADER) === MANAGED_CLIENT_MODE

/** Cookie-bearing writes must originate from the same browser origin. */
export function sameOriginManagedTransport(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (!origin) {
    return false
  }

  try {
    const source = new URL(origin)

    return (
      source.origin === origin &&
      source.host === host &&
      (source.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && source.protocol === "http:"))
    )
  } catch {
    return false
  }
}

/** Same-origin browser polling omits Origin on its initial read-only GET. */
export function sameOriginManagedSocketRequest(
  request: Pick<IncomingMessage, "method" | "url" | "headers">,
): boolean {
  const { origin, host } = request.headers

  // A supplied Origin always remains authoritative, even when metadata claims
  // same-origin. WebSocket handshakes continue through this strict branch.
  if (origin !== undefined) {
    return sameOriginManagedTransport(origin, host)
  }

  if (
    request.method !== "GET" ||
    !request.url ||
    !host ||
    request.headers["sec-fetch-site"] !== "same-origin" ||
    request.headers["sec-fetch-mode"] !== "cors" ||
    request.headers["sec-fetch-dest"] !== "empty"
  ) {
    return false
  }

  try {
    const target = new URL(request.url, `https://${host}`)

    return (
      target.host === host &&
      target.username === "" &&
      target.password === "" &&
      target.searchParams.get("transport") === "polling"
    )
  } catch {
    return false
  }
}

export function sameOriginClientRequest(c: Context): boolean {
  return (
    ["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
    sameOriginManagedTransport(
      c.req.header("Origin"),
      c.req.header("Host") ?? new URL(c.req.url).host,
    )
  )
}

export async function readManagedClientClaims(
  c: Context,
): Promise<SessionClaims | undefined> {
  const token = getCookie(c, MANAGED_CLIENT_COOKIE)

  if (!token || !sameOriginClientRequest(c)) {
    return undefined
  }

  try {
    const claims = await verifyToken(token)

    return claims.managedClientId ? claims : undefined
  } catch {
    return undefined
  }
}

/** Socket.IO receives the HttpOnly cookie automatically; JS never sees it. */
export function managedClientCookieToken(header: string | undefined) {
  if (!header || header.length > 16_384) {
    return undefined
  }

  const values = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${MANAGED_CLIENT_COOKIE}=`))

  if (values.length !== 1) {
    return undefined
  }

  const token = values[0].slice(MANAGED_CLIENT_COOKIE.length + 1)

  return /^[A-Za-z0-9._-]{1,4096}$/u.test(token) ? token : undefined
}

export const managedClientSessionResponse = (
  principal: ManagedClientPrincipal,
): ManagedClientSessionResponse => ({
  kind: "managed-client",
  role: "manager",
  client: { id: principal.id, name: principal.name },
  expiresAt: principal.expiresAt,
})

export function clearPriorMediaAccess(c: Context): void {
  deleteCookie(c, "tdz_media_auth", { path: "/media" })
  deleteCookie(c, "tdz_room", { path: "/media" })
}

export async function retireManagedClientCookie(c: Context): Promise<void> {
  const claims = await readManagedClientClaims(c)

  if (claims?.sid) {
    new ManagedClientStore().revokeSession(claims.sid)
  }

  deleteCookie(c, MANAGED_CLIENT_COOKIE, managedClientCookieOptions)
}
