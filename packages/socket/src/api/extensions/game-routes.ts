/** Downstream HTTP adapters. These routes are not part of Razzia upstream. */
import { zValidator } from "@hono/zod-validator"
import {
  parseRosterImportFile,
  rosterParticipantSchema,
} from "@razzia/extensions/core"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { grantMediaForGuest } from "@razzia/socket/services/media-access"
import Game from "@razzia/socket/services/game"
import { selectQuizPilotTarget } from "@razzia/socket/services/game/pilot-target"
import { selectDialedPilotTarget } from "@razzia/socket/services/game/pilot-dial-target"
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
  epoch: z.number().int().nonnegative().optional(),
  dialedNumber: z
    .string()
    .regex(/^\+?\d{5,20}$/)
    .optional(),
})

function resolvePilotTargetGame(
  registry: Registry,
  {
    gameId,
    inviteCode,
    dialedNumber,
  }: { gameId?: string; inviteCode?: string; dialedNumber?: string },
): { game: Game | null; error?: string } {
  if (dialedNumber && process.env.TADA_PILOT_DIAL_TARGETS) {
    return selectDialedPilotTarget(
      registry.getAllGames(),
      dialedNumber,
      process.env.TADA_PILOT_DIAL_TARGETS,
    )
  }

  const targetGameId = gameId ?? process.env.TADA_ACTIVE_GAME_ID
  const targetInviteCode = inviteCode ?? process.env.TADA_ACTIVE_INVITE_CODE

  if (targetGameId) {
    const byId = registry.getGameById(targetGameId)

    return byId ? { game: byId } : { game: null, error: "errors:game.notFound" }
  }

  if (targetInviteCode) {
    const byCode = registry.getGameByInviteCode(targetInviteCode)

    return byCode
      ? { game: byCode }
      : { game: null, error: "errors:game.notFound" }
  }

  const allGames = registry.getAllGames()

  if (process.env.TADA_PILOT_QUIZ_ID) {
    return selectQuizPilotTarget(
      allGames,
      process.env.TADA_PILOT_QUIZ_ID,
      process.env.TADA_PILOT_OWNER_ID,
    )
  }

  if (allGames.length === 0) {
    return { game: null, error: "errors:game.notFound" }
  }

  if (allGames.length === 1) {
    return { game: allGames[0] }
  }

  // If multiple games exist and no explicit gameId or inviteCode provided: fail closed!
  return { game: null, error: "errors:game.ambiguousTargetGame" }
}

export const gameExtensionRoutes = apiFactory
  .createApp()
  // Public projector displays use an unguessable live game ID, never account credentials.
  .get("/:gameId/display-media", async (c) => {
    const game = Registry.getInstance().getGameById(c.req.param("gameId"))

    if (!game) {
      return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
    }

    await grantMediaForGuest(c, game.gameId)

    return c.json({ status: "ready" })
  })
  .get("/:gameId/roster", requireManager, async (c) => {
    const game = Registry.getInstance().getGameById(c.req.param("gameId"))

    if (!game || game.manager.clientId !== c.get("claims").sub) {
      return c.json({ error: "errors:game.notFound" }, StatusCodes.NOT_FOUND)
    }

    // A manager may have a valid Bearer session but no /media cookie after
    // reopening a previously created room. Refresh the room-bound ticket.
    await grantMediaForGuest(c, game.gameId)

    return c.json({ presence: game.getHostPresenceSnapshot() })
  })
  .patch(
    "/:gameId/roster/settings",
    requireManager,
    zValidator("json", z.object({ phoneInviteOnly: z.boolean() }), i18nHook),
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
              error instanceof Error ? error.message : "errors:invalidRequest",
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
      const resolved = resolvePilotTargetGame(registry, body)

      if (!resolved.game) {
        return c.json(
          {
            ok: false,
            error: resolved.error ?? "errors:game.notFound",
          },
          StatusCodes.NOT_FOUND,
        )
      }

      const { game } = resolved

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
              rosterPlayerId: rosterId,
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

        const pstn = game.getCurrentQuestionPstnSupport()

        if (typeof body.epoch === "number" && body.epoch !== pstn.epoch) {
          return c.json({
            ok: true,
            accepted: false,
            reason: "stale_question_epoch",
            rosterPlayerId: rosterId,
            state: game.getQuestionStateForGateway(rosterId),
          })
        }

        if (!pstn.supported) {
          return c.json({
            ok: true,
            accepted: false,
            reason: pstn.reason ?? "unsupported_question_type",
            rosterPlayerId: rosterId,
            state: game.getQuestionStateForGateway(rosterId),
          })
        }

        if (
          typeof body.answerIndex !== "number" ||
          !Number.isInteger(body.answerIndex) ||
          body.answerIndex < 0 ||
          body.answerIndex > pstn.maxAnswerIndex
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
          body.callId,
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
        game.disconnectPhoneCallerByRosterId(rosterId, false, body.callId)
      }

      return c.json({
        ok: true,
        disconnected: Boolean(rosterId),
        rosterPlayerId: rosterId ?? null,
      })
    },
  )
