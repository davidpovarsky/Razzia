import { zValidator } from "@hono/zod-validator"
import { MAX_MEDIA_SIZE, SESSION_ROLES } from "@razzia/common/constants"
import { mediaUploadValidator } from "@razzia/common/validators/quizz"
import { checkMediaDeleteSafety } from "@razzia/extensions/server"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import {
  accountsEnabled,
  withAccount,
} from "@razzia/socket/services/account-scope"
import { verifyToken } from "@razzia/socket/services/auth"
import {
  allowedMediaName,
  readAccountMedia,
} from "@razzia/socket/services/media-read"
import { verifyMediaAccess } from "@razzia/socket/services/media-access"
import Registry from "@razzia/socket/services/registry"
import { getCookie } from "hono/cookie"
import fs from "node:fs"
import { i18nHook } from "@razzia/socket/api/validation"
import { getPath } from "@razzia/socket/services/config"
import {
  deleteMedia,
  listMedia,
  saveMedia,
} from "@razzia/socket/services/media"
import { bodyLimit } from "hono/body-limit"
import { StatusCodes } from "http-status-codes"

const MULTIPART_OVERHEAD = 64 * 1024

const routes = apiFactory
  .createApp()
  .get("/raw/:name", async (c) => {
    const name = c.req.param("name")
    if (!allowedMediaName(name)) return c.json({ error: "not-found" }, 404)
    let ownerId: string | null = null
    if (accountsEnabled()) {
      const managerCookie = getCookie(c, "tdz_media_auth")
      if (managerCookie) {
        try {
          const user = await verifyToken(managerCookie)
          if (user.role === SESSION_ROLES.MANAGER) ownerId = user.sub
        } catch {
          /* Try active room ticket */
        }
      }
      if (!ownerId) {
        const roomCookie = getCookie(c, "tdz_room")
        if (!roomCookie) return c.json({ error: "unauthorized" }, 401)
        try {
          const access = await verifyMediaAccess(roomCookie)
          const game = Registry.getInstance().getGameById(access.gameId)
          if (!game || !game.canViewMedia(name))
            return c.json({ error: "not-found" }, 404)
          ownerId = game.manager.clientId
        } catch {
          return c.json({ error: "unauthorized" }, 401)
        }
      }
    }
    const exists = await withAccount(ownerId ?? "", () => {
      try {
        return fs.lstatSync(getPath("media/" + name)).isFile()
      } catch {
        return false
      }
    })
    if (!exists) return c.json({ error: "not-found" }, 404)
    if (process.env.NODE_ENV === "production") {
      c.header(
        "X-Accel-Redirect",
        ownerId
          ? `/__private_media/${ownerId}/media/${name}`
          : `/__legacy_media/${name}`,
      )
      c.header("X-Content-Type-Options", "nosniff")
      c.header("Cache-Control", "private, no-store")
      return c.body(null, 200)
    }
    const media = await readAccountMedia(ownerId, name)
    if (!media) return c.json({ error: "not-found" }, 404)
    c.header("Content-Type", media.type)
    c.header("X-Content-Type-Options", "nosniff")
    c.header("Cache-Control", "private, no-store")
    return c.body(Uint8Array.from(media.bytes).buffer, 200)
  })
  .use(requireManager)
  .get("/", (c) => c.json({ media: listMedia() }))
  .post(
    "/",
    bodyLimit({
      maxSize: MAX_MEDIA_SIZE + MULTIPART_OVERHEAD,
      onError: (c) =>
        c.json(
          { error: "errors:media.tooLarge" },
          StatusCodes.REQUEST_TOO_LONG,
        ),
    }),
    zValidator("form", mediaUploadValidator, i18nHook),
    async (c) =>
      c.json(await saveMedia(c.req.valid("form").file), StatusCodes.CREATED),
  )
  .delete("/:name", (c) => {
    const name = c.req.param("name")
    const detach = c.req.query("detach") === "true"
    const safety = checkMediaDeleteSafety(getPath, name, {
      detach,
      deleteMediaFn: () => deleteMedia(name),
    })

    if (!safety.allowed) {
      return c.json(
        {
          error: safety.error || "extensions:mediaLibrary.deleteBlockedDesc",
          references: safety.references,
        },
        safety.unreadableFiles && safety.unreadableFiles.length > 0
          ? StatusCodes.INTERNAL_SERVER_ERROR
          : StatusCodes.CONFLICT,
      )
    }

    return c.body(null, StatusCodes.NO_CONTENT)
  })

export const media = routes
