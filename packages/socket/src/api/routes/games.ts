import { gameExtensionRoutes } from "@razzia/socket/api/extensions/game-routes"
import { zValidator } from "@hono/zod-validator"
import {
  checkGameValidator,
  createGameValidator,
  gameSettingsValidator,
  joinGameValidator,
} from "@razzia/common/validators/game"
import { resolveGameJoin } from "@razzia/socket/api/extensions/join-policy"
import { apiFactory } from "@razzia/socket/api/factory"
import {
  readClaims,
  requireManager,
  requireRoomHost,
  requireSession,
} from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { mintJoinTicket } from "@razzia/socket/services/auth"
import { grantMediaForGuest } from "@razzia/socket/services/media-access"
import { getQuizz } from "@razzia/socket/services/config"
import {
  GameCreationRequestConflict,
  launchNativeGame,
} from "@razzia/socket/services/game-launch"
import Registry from "@razzia/socket/services/registry"
import { isManagedClientRequest } from "@razzia/socket/services/managed-client-session"
import { canHostGame } from "@razzia/socket/services/managed-client-authorization"
import { StatusCodes } from "http-status-codes"

const routes = apiFactory
  .createApp()
  .post(
    "/",
    requireManager,
    zValidator("json", createGameValidator, i18nHook),
    (c) => {
      const { quizzId, requestId } = c.req.valid("json")
      const quizz = getQuizz().find((q) => q.id === quizzId)

      if (!quizz) {
        return c.json({ error: "errors:quizz.notFound" }, StatusCodes.NOT_FOUND)
      }

      try {
        const game = launchNativeGame({
          managerId: c.get("claims").sub,
          quiz: quizz,
          requestId,
        })

        return c.json(
          { gameId: game.gameId, inviteCode: game.inviteCode },
          StatusCodes.CREATED,
        )
      } catch (error) {
        if (error instanceof GameCreationRequestConflict) {
          return c.json({ error: error.message }, StatusCodes.CONFLICT)
        }

        throw error
      }
    },
  )
  .patch(
    "/:gameId/settings",
    requireRoomHost,
    zValidator("json", gameSettingsValidator, i18nHook),
    (c) => {
      const game = Registry.getInstance().getGameById(c.req.param("gameId"))

      if (!game || game.manager.clientId !== c.get("claims").sub) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      if (!game.updateSettings(c.req.valid("json"))) {
        return c.json(
          { error: "errors:game.alreadyStarted" },
          StatusCodes.CONFLICT,
        )
      }

      return c.json({ settings: game.settings })
    },
  )
  .post(
    "/check",
    zValidator("json", checkGameValidator, i18nHook),
    async (c) => {
      const { inviteCode } = c.req.valid("json")
      const claims = isManagedClientRequest(c) ? await readClaims(c) : undefined

      if (isManagedClientRequest(c) && !claims?.managedClientId) {
        return c.json(
          { error: "client-session-expired" },
          StatusCodes.UNAUTHORIZED,
        )
      }

      const game = Registry.getInstance().getGameByInviteCode(inviteCode)

      if (!game || (claims && !canHostGame(claims, game))) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      if (game.locked) {
        return c.json({ error: "errors:game.locked" }, StatusCodes.FORBIDDEN)
      }

      await grantMediaForGuest(c, game.gameId)

      return c.json({ generatedUsernames: game.settings.generatedUsernames })
    },
  )
  .post(
    "/join",
    requireSession,
    zValidator("json", joinGameValidator, i18nHook),
    async (c) => {
      const { inviteCode, username, phone, source } = c.req.valid("json")
      const game = Registry.getInstance().getGameByInviteCode(inviteCode)

      if (!game) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      const { sub } = c.get("claims")
      const identity = { username, phoneE164: phone, source }
      const phoneAllowed = () => game.allowsBrowserPhoneIdentity(sub, identity)
      const phoneDenied = () =>
        c.json(
          {
            error: "errors:auth.unauthorized",
            reason: "phone_protocol_required",
          },
          StatusCodes.FORBIDDEN,
        )

      if (!phoneAllowed()) {
        return phoneDenied()
      }

      if (game.manager.clientId === sub) {
        return c.json(
          { error: "errors:game.managerCannotJoin" },
          StatusCodes.FORBIDDEN,
        )
      }

      const resolution = resolveGameJoin(game, {
        clientId: sub,
        username,
        phone,
        source,
      })

      if (resolution.kind === "existing") {
        await grantMediaForGuest(c, game.gameId)

        if (!phoneAllowed()) {
          return phoneDenied()
        }

        return c.json({
          gameId: game.gameId,
          ticket: null,
          username: resolution.username,
        })
      }

      if (resolution.kind === "denied") {
        return c.json(
          {
            error: resolution.error,
            ...(resolution.reason ? { reason: resolution.reason } : {}),
          },
          resolution.status,
        )
      }

      await grantMediaForGuest(c, game.gameId)

      if (!phoneAllowed()) {
        return phoneDenied()
      }

      const ticket = await mintJoinTicket(sub, game.gameId, resolution.identity)

      if (!phoneAllowed()) {
        return phoneDenied()
      }

      return c.json({
        gameId: game.gameId,
        ticket,
        username: resolution.identity.username ?? null,
        rosterPlayerId: resolution.identity.rosterPlayerId ?? null,
      })
    },
  )
  .route("/", gameExtensionRoutes)

export const games = routes
