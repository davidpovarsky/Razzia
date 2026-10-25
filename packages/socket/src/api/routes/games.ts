import { zValidator } from "@hono/zod-validator"
import {
  checkGameValidator,
  createGameValidator,
  gameSettingsValidator,
  joinGameValidator,
} from "@razzia/common/validators/game"
import {
  normalizePhoneE164,
  parseRosterImportFile,
  rosterParticipantSchema,
} from "@razzia/extensions/core"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager, requireSession } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { mintJoinTicket } from "@razzia/socket/services/auth"
import { getQuizz } from "@razzia/socket/services/config"
import Game from "@razzia/socket/services/game"
import { getIo } from "@razzia/socket/services/io"
import Registry from "@razzia/socket/services/registry"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

const upsertRosterBodySchema = z.object({
  rosterPlayerId: z.string().min(1).max(64).optional(),
  displayName: z.string().min(1).max(40),
  phone: z.string().max(40).nullable().optional(),
})

const importRosterBodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentBase64: z.string().min(1),
  commit: z.boolean().optional(),
  phoneInviteOnly: z.boolean().optional(),
})

const commitParsedRosterBodySchema = z.object({
  participants: z.array(rosterParticipantSchema).max(2000),
  phoneInviteOnly: z.boolean().optional(),
})

const pilotPhoneBodySchema = z.object({
  action: z.enum(["join_or_poll", "answer", "hangup"]),
  callId: z.string().min(1).max(128),
  phone: z.string().max(64).nullable().optional(),
  inviteCode: z.string().max(16).optional(),
  gameId: z.string().max(64).optional(),
  rosterPlayerId: z.string().max(64).optional(),
  answerIndex: z.number().int().min(0).max(9).optional(),
})

function resolvePilotTargetGame(
  registry: Registry,
  gameId?: string,
  inviteCode?: string,
): { game: Game | null; error?: string } {
  if (gameId) {
    const byId = registry.getGameById(gameId)

    return byId ? { game: byId } : { game: null, error: "errors:game.notFound" }
  }

  if (inviteCode) {
    const byCode = registry.getGameByInviteCode(inviteCode)

    return byCode
      ? { game: byCode }
      : { game: null, error: "errors:game.notFound" }
  }

  const allGames = registry.getAllGames()

  if (allGames.length === 0) {
    return { game: null, error: "errors:game.notFound" }
  }

  if (allGames.length === 1) {
    return { game: allGames[0] }
  }

  // If multiple games exist, prefer the single game whose manager is currently connected
  const managerConnected = allGames.filter((g) => g.manager.connected)

  if (managerConnected.length === 1) {
    return { game: managerConnected[0] }
  }

  return { game: null, error: "errors:game.notFound" }
}

const routes = apiFactory
  .createApp()
  .post(
    "/",
    requireManager,
    zValidator("json", createGameValidator, i18nHook),
    (c) => {
      const { quizzId } = c.req.valid("json")
      const quizz = getQuizz().find((q) => q.id === quizzId)

      if (!quizz) {
        return c.json({ error: "errors:quizz.notFound" }, StatusCodes.NOT_FOUND)
      }

      const registry = Registry.getInstance()
      const game = new Game(getIo(), c.get("claims").sub, quizz)

      registry.addGame(game)
      registry.markGameAsEmpty(game)

      return c.json(
        { gameId: game.gameId, inviteCode: game.inviteCode },
        StatusCodes.CREATED,
      )
    },
  )
  .patch(
    "/:gameId/settings",
    requireManager,
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
  .post("/check", zValidator("json", checkGameValidator, i18nHook), (c) => {
    const { inviteCode } = c.req.valid("json")
    const game = Registry.getInstance().getGameByInviteCode(inviteCode)

    if (!game) {
      return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
    }

    if (game.locked) {
      return c.json({ error: "errors:game.locked" }, StatusCodes.FORBIDDEN)
    }

    return c.json({ generatedUsernames: game.settings.generatedUsernames })
  })
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

      if (game.manager.clientId === sub) {
        return c.json(
          { error: "errors:game.managerCannotJoin" },
          StatusCodes.FORBIDDEN,
        )
      }

      const normalizedPhone = phone ? normalizePhoneE164(phone) : null
      const rosterMatch = normalizedPhone
        ? game.findRosterByPhone(normalizedPhone)
        : null

      // If this exact clientId is already joined and not rebinding from a different phone session
      const existing = game.players.find((p) => p.clientId === sub)

      if (existing && !rosterMatch) {
        return c.json({
          gameId: game.gameId,
          ticket: null,
          username: existing.username,
        })
      }

      if ((source === "phone" || normalizedPhone) && !rosterMatch && game.phoneInviteOnly) {
        return c.json(
          { error: "errors:game.locked", reason: "phone_invite_only" },
          StatusCodes.FORBIDDEN,
        )
      }

      if (game.locked && !rosterMatch) {
        return c.json({ error: "errors:game.locked" }, StatusCodes.FORBIDDEN)
      }

      const resolvedName = rosterMatch?.displayName ?? username

      if (!game.settings.generatedUsernames && !resolvedName) {
        return c.json(
          { error: "errors:auth.usernameTooShort" },
          StatusCodes.BAD_REQUEST,
        )
      }

      const name =
        game.settings.generatedUsernames && !rosterMatch
          ? undefined
          : resolvedName

      return c.json({
        gameId: game.gameId,
        ticket: await mintJoinTicket(sub, game.gameId, {
          username: name,
          rosterPlayerId: rosterMatch?.rosterPlayerId,
          phoneE164: normalizedPhone ?? undefined,
          source: source ?? (normalizedPhone ? "phone" : "web"),
        }),
        username: name ?? null,
        rosterPlayerId: rosterMatch?.rosterPlayerId ?? null,
      })
    },
  )
  .get("/:gameId/roster", requireManager, (c) => {
    const game = Registry.getInstance().getGameById(c.req.param("gameId"))

    if (!game || game.manager.clientId !== c.get("claims").sub) {
      return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
    }

    return c.json({ presence: game.getHostPresenceSnapshot() })
  })
  .patch(
    "/:gameId/roster/settings",
    requireManager,
    zValidator(
      "json",
      z.object({ phoneInviteOnly: z.boolean() }),
      i18nHook,
    ),
    (c) => {
      const game = Registry.getInstance().getGameById(c.req.param("gameId"))

      if (!game || game.manager.clientId !== c.get("claims").sub) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      game.setPhoneInviteOnly(c.req.valid("json").phoneInviteOnly)

      return c.json({ presence: game.getHostPresenceSnapshot() })
    },
  )
  .post(
    "/:gameId/roster",
    requireManager,
    zValidator("json", upsertRosterBodySchema, i18nHook),
    (c) => {
      const game = Registry.getInstance().getGameById(c.req.param("gameId"))

      if (!game || game.manager.clientId !== c.get("claims").sub) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      try {
        const participant = game.upsertRosterParticipant(c.req.valid("json"))

        return c.json({
          participant,
          presence: game.getHostPresenceSnapshot(),
        })
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "errors:invalidRequest",
          },
          StatusCodes.BAD_REQUEST,
        )
      }
    },
  )
  .delete("/:gameId/roster/:rosterPlayerId", requireManager, (c) => {
    const game = Registry.getInstance().getGameById(c.req.param("gameId"))

    if (!game || game.manager.clientId !== c.get("claims").sub) {
      return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
    }

    const removed = game.removeRosterParticipant(c.req.param("rosterPlayerId"))

    if (!removed) {
      return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
    }

    return c.json({ presence: game.getHostPresenceSnapshot() })
  })
  .post(
    "/:gameId/roster/import",
    requireManager,
    zValidator("json", importRosterBodySchema, i18nHook),
    (c) => {
      const game = Registry.getInstance().getGameById(c.req.param("gameId"))

      if (!game || game.manager.clientId !== c.get("claims").sub) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      const { filename, contentBase64, commit, phoneInviteOnly } =
        c.req.valid("json")
      const buffer = Buffer.from(contentBase64, "base64")
      const snapshot = game.getHostPresenceSnapshot()
      const existingParticipants = snapshot.players
        .filter((p) => p.phoneE164 !== null)
        .map((p) => ({
          rosterPlayerId: p.rosterPlayerId,
          displayName: p.displayName,
          phoneE164: p.phoneE164,
        }))

      const importResult = parseRosterImportFile(
        new Uint8Array(buffer),
        filename,
        existingParticipants,
      )

      if (!importResult.ok) {
        return c.json(
          {
            error: importResult.fatalError ?? "errors:invalidRequest",
            importResult,
          },
          StatusCodes.BAD_REQUEST,
        )
      }

      if (commit) {
        game.replaceRosterParticipants(
          importResult.validParticipants,
          phoneInviteOnly,
        )
      }

      return c.json({
        importResult,
        presence: game.getHostPresenceSnapshot(),
      })
    },
  )
  .put(
    "/:gameId/roster/participants",
    requireManager,
    zValidator("json", commitParsedRosterBodySchema, i18nHook),
    (c) => {
      const game = Registry.getInstance().getGameById(c.req.param("gameId"))

      if (!game || game.manager.clientId !== c.get("claims").sub) {
        return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
      }

      const { participants, phoneInviteOnly } = c.req.valid("json")
      game.replaceRosterParticipants(participants, phoneInviteOnly)

      return c.json({ presence: game.getHostPresenceSnapshot() })
    },
  )
  .post(
    "/pilot-phone",
    zValidator("json", pilotPhoneBodySchema, i18nHook),
    (c) => {
      const expectedSecret = process.env.TADA_PILOT_SECRET

      if (expectedSecret) {
        const providedSecret = c.req.header("x-tada-pilot-secret") ?? ""

        if (providedSecret !== expectedSecret) {
          return c.json(
            { error: "errors:auth.unauthorized" },
            StatusCodes.UNAUTHORIZED,
          )
        }
      }

      const body = c.req.valid("json")
      const registry = Registry.getInstance()
      const resolved = resolvePilotTargetGame(
        registry,
        body.gameId,
        body.inviteCode,
      )

      if (!resolved.game) {
        return c.json(
          {
            ok: false,
            error: resolved.error ?? "errors:game.notFound",
          },
          StatusCodes.NOT_FOUND,
        )
      }

      const {game} = resolved

      if (body.action === "join_or_poll") {
        let rosterId = body.rosterPlayerId
        let joinRes: ReturnType<Game["joinOrRebindPhoneCaller"]> | null = null

        if (!rosterId || !game.getRosterEntry(rosterId)) {
          joinRes = game.joinOrRebindPhoneCaller({
            phoneRaw: body.phone,
            callId: body.callId,
          })

          if (!joinRes.ok || !joinRes.rosterPlayerId) {
            return c.json(
              {
                ok: false,
                error: joinRes.error ?? "errors:game.locked",
                reason: game.settings.phoneInviteOnly
                  ? "phone_invite_only"
                  : "locked",
              },
              StatusCodes.FORBIDDEN,
            )
          }

          rosterId = joinRes.rosterPlayerId
        } else {
          // Ensure connected if polling after a brief drop or rebind
          const existingEntry = game.getRosterEntry(rosterId)

          if (existingEntry && existingEntry.status !== "connected") {
            joinRes = game.joinOrRebindPhoneCaller({
              phoneRaw: body.phone ?? existingEntry.phoneE164,
              callId: body.callId,
            })
          }
        }

        const qState = game.getQuestionStateForGateway(rosterId)
        const entry = game.getRosterEntry(rosterId)

        return c.json({
          ok: true,
          joined: true,
          reconnected: joinRes?.reconnected ?? false,
          rosterPlayerId: rosterId,
          displayName: entry?.displayName ?? joinRes?.displayName ?? null,
          phoneE164: entry?.phoneE164 ?? joinRes?.phoneE164 ?? null,
          state: qState,
        })
      }

      if (body.action === "answer") {
        let rosterId = body.rosterPlayerId

        if (!rosterId || !game.getRosterEntry(rosterId)) {
          const joinRes = game.joinOrRebindPhoneCaller({
            phoneRaw: body.phone,
            callId: body.callId,
          })

          if (!joinRes.ok || !joinRes.rosterPlayerId) {
            return c.json(
              {
                ok: false,
                error: joinRes.error ?? "errors:game.locked",
                reason: game.settings.phoneInviteOnly
                  ? "phone_invite_only"
                  : "locked",
              },
              StatusCodes.FORBIDDEN,
            )
          }

          rosterId = joinRes.rosterPlayerId
        }

        if (
          typeof body.answerIndex !== "number" ||
          body.answerIndex < 0 ||
          body.answerIndex > 3
        ) {
          return c.json({
            ok: true,
            accepted: false,
            reason: "invalid_answer_index",
            rosterPlayerId: rosterId,
            state: game.getQuestionStateForGateway(rosterId),
          })
        }

        const outcome = game.submitPhoneAnswerByRosterId(
          rosterId,
          body.answerIndex,
        )

        return c.json({
          ok: true,
          ...outcome,
          rosterPlayerId: rosterId,
          state: game.getQuestionStateForGateway(rosterId),
        })
      }

      let rosterId = body.rosterPlayerId

      if (!rosterId && body.phone) {
        const matched = game.findRosterByPhone(body.phone)
        rosterId = matched?.rosterPlayerId
      }

      if (rosterId) {
        game.disconnectPhoneCallerByRosterId(rosterId, false)
      }

      return c.json({
        ok: true,
        disconnected: Boolean(rosterId),
        rosterPlayerId: rosterId ?? null,
      })
    },
  )

export const games = routes
