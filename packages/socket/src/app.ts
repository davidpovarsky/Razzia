import type { ServerType } from "@hono/node-server"
import { EVENTS, SESSION_ROLES } from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"
import { clientEventValidators } from "@razzia/common/validators/socket"
import { api } from "@razzia/socket/api"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import type { SocketHandler } from "@razzia/socket/handlers/types"
import { verifyToken } from "@razzia/socket/services/auth"
import { accountsEnabled } from "@razzia/socket/services/account-scope"
import { DomainError } from "@razzia/socket/services/errors"
import {
  ManagedClientFailure,
  ManagedClientStore,
  onManagedClientAccessChanged,
} from "@razzia/socket/services/managed-clients"
import {
  managedClientCookieToken,
  sameOriginManagedSocketRequest,
} from "@razzia/socket/services/managed-client-session"
import { canHostGame } from "@razzia/socket/services/managed-client-authorization"
import Registry from "@razzia/socket/services/registry"
import { setIo } from "@razzia/socket/services/io"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { JwtTokenExpired } from "hono/utils/jwt/types"
import { StatusCodes } from "http-status-codes"
import { Server as ServerIO } from "socket.io"
import type { z } from "zod"

const eventValidators: Partial<Record<string, z.ZodType>> =
  clientEventValidators

export const app = new Hono()

app.route("/api", api)

app.notFound((c) =>
  c.json({ error: "errors:api.notFound" }, StatusCodes.NOT_FOUND),
)

const HTTP_ERROR_KEYS: Partial<Record<number, string>> = {
  [StatusCodes.BAD_REQUEST]: "errors:invalidRequest",
  [StatusCodes.UNAUTHORIZED]: "errors:auth.unauthorized",
  [StatusCodes.FORBIDDEN]: "errors:auth.unauthorized",
  [StatusCodes.NOT_FOUND]: "errors:api.notFound",
}

app.onError((error, c) => {
  if (error instanceof ManagedClientFailure) {
    if (error.details?.retryAfterSeconds) {
      c.header("Retry-After", String(error.details.retryAfterSeconds))
    }

    return c.json({ error: error.code, ...error.details }, error.status)
  }

  if (error instanceof DomainError) {
    if (error.status >= StatusCodes.INTERNAL_SERVER_ERROR) {
      console.error("API error:", error)
    }

    return c.json({ error: error.key }, error.status)
  }

  if (error instanceof HTTPException) {
    return c.json(
      { error: HTTP_ERROR_KEYS[error.status] ?? "errors:api.serverError" },
      error.status,
    )
  }

  console.error("Unhandled API error:", error)

  return c.json(
    { error: "errors:api.serverError" },
    StatusCodes.INTERNAL_SERVER_ERROR,
  )
})

const socketHandlers: SocketHandler[] = [gameSocketHandlers]

const authError = (code: string, message: string) => {
  const error = new Error(message) as Error & { data: { code: string } }
  error.data = { code }

  return error
}

export const createSocketServer = (server: ServerType): Server => {
  const io: Server = new ServerIO(server, {
    path: "/ws",
  })

  setIo(io)

  const managedEvents = new Set<string>([
    ...Object.values(EVENTS.MANAGER),
    EVENTS.EXTENSIONS.COMMAND,
    EVENTS.SPECTATOR.JOIN,
    EVENTS.SPECTATOR.LEAVE,
  ])
  const disconnectRevokedClients = () => {
    for (const socket of io.sockets.sockets.values()) {
      const { claims } = socket.data

      if (!claims?.managedClientId) {
        continue
      }

      const invalidRoom = socket.data.managedRoomIds?.some((id) => {
        const room = Registry.getInstance().getGameById(id)

        return !room || !canHostGame(claims, room)
      })

      if (
        !new ManagedClientStore().session(claims.sub, claims.sid) ||
        invalidRoom
      ) {
        socket.disconnect(true)
      }
    }
  }
  const unsubscribe = onManagedClientAccessChanged(disconnectRevokedClients)
  // External CLI/account revocations also retire idle connections. Every command
  // still rechecks synchronously; this timer only bounds passive subscriptions.
  const accessTimer = setInterval(disconnectRevokedClients, 15_000)
  accessTimer.unref()
  server.once("close", () => {
    clearInterval(accessTimer)
    unsubscribe()
  })

  io.use((socket, next) => {
    if (
      "managedClient" in socket.handshake.auth &&
      socket.handshake.auth.managedClient !== true
    ) {
      next(authError("TOKEN_INVALID", "errors:auth.tokenInvalid"))

      return
    }

    const managed = socket.handshake.auth.managedClient === true
    const token = managed
      ? managedClientCookieToken(socket.handshake.headers.cookie)
      : (socket.handshake.auth.token as string | undefined)

    if (managed && !sameOriginManagedSocketRequest(socket.request)) {
      next(authError("TOKEN_INVALID", "errors:auth.tokenInvalid"))

      return
    }

    if (!token) {
      next(authError("TOKEN_MISSING", "errors:auth.tokenMissing"))

      return
    }

    verifyToken(token)
      .then((claims) => {
        if (Boolean(claims.managedClientId) !== managed) {
          throw new Error("Invalid session transport")
        }

        socket.data = {
          clientId: claims.sub,
          role: claims.role,
          claims,
        }

        next()
      })
      .catch((error: unknown) => {
        const code =
          error instanceof JwtTokenExpired ? "TOKEN_EXPIRED" : "TOKEN_INVALID"

        next(authError(code, "errors:auth.tokenInvalid"))
      })
  })

  io.on("connection", (socket) => {
    console.log(
      `A user connected: socketId: ${socket.id}, clientId: ${socket.data.clientId}`,
    )

    // oxlint-disable-next-line typescript/no-misused-promises -- Async authorization catches errors and invokes the socket middleware continuation on every branch.
    socket.use(async (packet, next) => {
      // A revoked manager must not retain privileged controls through an open websocket.
      if (
        socket.handshake.auth.managedClient === true ||
        (accountsEnabled() &&
          (socket.data.role === SESSION_ROLES.MANAGER ||
            socket.data.claims?.role === SESSION_ROLES.MANAGER))
      ) {
        try {
          const token: unknown =
            socket.handshake.auth.managedClient === true
              ? managedClientCookieToken(socket.handshake.headers.cookie)
              : socket.handshake.auth.token
          const claims = await verifyToken(
            typeof token === "string" ? token : "",
          )

          if (
            claims.sub !== socket.data.clientId ||
            Boolean(claims.managedClientId) !==
              (socket.handshake.auth.managedClient === true)
          ) {
            throw new Error("Session identity changed")
          }

          socket.data.claims = claims
        } catch {
          socket.disconnect(true)

          return
        }
      }

      const validator = eventValidators[packet[0]]

      if (validator) {
        const result = validator.safeParse(packet[1])

        if (!result.success) {
          socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:invalidRequest")

          return
        }

        packet[1] = result.data
      }

      // Some native events intentionally have no shared validator. They still
      // require managed room admission; only the public clock has no room.
      if (
        socket.data.claims?.managedClientId &&
        packet[0] !== "extensions:clock"
      ) {
        const data: unknown = packet[1]
        const gameId: unknown =
          data && typeof data === "object" && "gameId" in data
            ? data.gameId
            : undefined
        const game =
          typeof gameId === "string"
            ? Registry.getInstance().getGameById(gameId)
            : undefined

        if (
          !managedEvents.has(packet[0]) ||
          !game ||
          !canHostGame(socket.data.claims, game)
        ) {
          socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:auth.unauthorized")

          return
        }

        if (
          packet[0] === EVENTS.MANAGER.RECONNECT ||
          packet[0] === EVENTS.SPECTATOR.JOIN
        ) {
          socket.data.managedRoomIds = [
            ...new Set([...(socket.data.managedRoomIds ?? []), game.gameId]),
          ]
        } else if (
          packet[0] === EVENTS.MANAGER.LEAVE ||
          packet[0] === EVENTS.SPECTATOR.LEAVE
        ) {
          socket.data.managedRoomIds = socket.data.managedRoomIds?.filter(
            (id) => id !== game.gameId,
          )
        }
      }

      next()
    })

    socketHandlers.forEach((handler) => {
      handler({ io, socket })
    })
  })

  return io
}
