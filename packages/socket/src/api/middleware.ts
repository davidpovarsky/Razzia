import { withAccount } from "@razzia/socket/services/account-scope"
import { SESSION_ROLES } from "@razzia/common/constants"
import type { SessionClaims } from "@razzia/common/types/auth"
import { type ApiEnv } from "@razzia/socket/api/factory"
import { verifyToken } from "@razzia/socket/services/auth"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { StatusCodes } from "http-status-codes"
import {
  isManagedClientRequest,
  validManagedClientRequest,
  readManagedClientClaims,
} from "@razzia/socket/services/managed-client-session"
import { canHostGame } from "@razzia/socket/services/managed-client-authorization"
import Registry from "@razzia/socket/services/registry"

const UNAUTHORIZED = { error: "errors:auth.unauthorized" } as const

const getBearerToken = (c: Context): string | undefined => {
  const header = c.req.header("Authorization")

  if (!header?.startsWith("Bearer ")) {
    return undefined
  }

  return header.slice("Bearer ".length)
}

export const readClaims = async (
  c: Context,
): Promise<SessionClaims | undefined> => {
  if (isManagedClientRequest(c)) {
    // Explicit client mode never falls back to another browser account.
    return validManagedClientRequest(c) ? readManagedClientClaims(c) : undefined
  }

  const token = getBearerToken(c)

  if (!token) {
    return undefined
  }

  try {
    const claims = await verifyToken(token)

    return claims.managedClientId ? undefined : claims
  } catch {
    return undefined
  }
}

export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  const claims = await readClaims(c)

  if (!claims || claims.managedClientId) {
    return c.json(UNAUTHORIZED, StatusCodes.UNAUTHORIZED)
  }

  c.set("claims", claims)

  await next()
})

export const requireManager = createMiddleware<ApiEnv>(async (c, next) => {
  const claims = await readClaims(c)

  if (
    !claims ||
    claims.role !== SESSION_ROLES.MANAGER ||
    claims.managedClientId
  ) {
    return c.json(UNAUTHORIZED, StatusCodes.UNAUTHORIZED)
  }

  c.set("claims", claims)

  await withAccount(claims.sub, next)
})

/** Only existing, assigned rooms may enter the delegated content-owner scope. */
export const requireRoomHost = createMiddleware<ApiEnv>(async (c, next) => {
  const claims = await readClaims(c)

  if (!claims || claims.role !== SESSION_ROLES.MANAGER) {
    return c.json(
      isManagedClientRequest(c)
        ? { error: "client-session-expired" }
        : UNAUTHORIZED,
      StatusCodes.UNAUTHORIZED,
    )
  }

  const id = c.req.param("gameId")
  const game = id ? Registry.getInstance().getGameById(id) : undefined

  if (!game || !canHostGame(claims, game)) {
    return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
  }

  c.set("claims", claims)
  await withAccount(game.contentOwnerId, next)
})
