/** Tenant/room authorization and extension media-reference lifecycle. */
import type { Context } from "hono"
import type { ApiEnv } from "@razzia/socket/api/factory"
import { SESSION_ROLES } from "@razzia/common/constants"
import { checkMediaDeleteSafety } from "@razzia/extensions/server"
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
import { getPath } from "@razzia/socket/services/config"
import { deleteMedia } from "@razzia/socket/services/media"
import {
  readInstalledThemeMedia,
  readThemePreviewMedia,
} from "@razzia/socket/services/theme-installation"
import { themeMediaResponse } from "./theme-media-response"
import { StatusCodes } from "http-status-codes"

export const readRoomMedia = async (c: Context<ApiEnv, "/raw/:name">) => {
  const name = c.req.param("name")

  if (!allowedMediaName(name)) {
    return c.json({ error: "not-found" }, 404)
  }

  const previewTicket = getCookie(c, "tdz_theme_preview")

  if (previewTicket) {
    try {
      const preview = await readThemePreviewMedia(previewTicket, name)

      if (preview) {
        return themeMediaResponse(c, preview)
      }
    } catch {
      // Invalid/revoked preview access grants nothing; normal room/manager
      // authorization may still authorize a different published asset below.
    }
  }

  let ownerId: string | null = null

  if (accountsEnabled()) {
    const managerCookie = getCookie(c, "tdz_media_auth")

    if (managerCookie) {
      try {
        const user = await verifyToken(managerCookie)

        if (user.role === SESSION_ROLES.MANAGER) {
          ownerId = user.sub
        }
      } catch {
        /* Try active room ticket */
      }
    }

    if (!ownerId) {
      const roomCookie = getCookie(c, "tdz_room")

      if (!roomCookie) {
        return c.json({ error: "unauthorized" }, 401)
      }

      try {
        const access = await verifyMediaAccess(roomCookie)
        const game = Registry.getInstance().getGameById(access.gameId)

        if (!game || !game.canViewMedia(name)) {
          return c.json({ error: "not-found" }, 404)
        }

        ownerId = game.manager.clientId
      } catch {
        return c.json({ error: "unauthorized" }, 401)
      }
    }
  }

  const installedAsset = ownerId ? readInstalledThemeMedia(ownerId, name) : null

  if (installedAsset) {
    return themeMediaResponse(c, installedAsset)
  }

  const exists = await withAccount(ownerId ?? "", () => {
    try {
      return fs.lstatSync(getPath(`media/${name}`)).isFile()
    } catch {
      return false
    }
  })

  if (!exists) {
    return c.json({ error: "not-found" }, 404)
  }

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

  if (!media) {
    return c.json({ error: "not-found" }, 404)
  }

  c.header("Content-Type", media.type)
  c.header("X-Content-Type-Options", "nosniff")
  c.header("Cache-Control", "private, no-store")

  return c.body(Uint8Array.from(media.bytes).buffer, 200)
}

export const deleteReferencedMedia = (c: Context<ApiEnv, "/:name">) => {
  const name = c.req.param("name")
  const detach = c.req.query("detach") === "true"
  const safety = checkMediaDeleteSafety(getPath, name, {
    detach,
    deleteMediaFn: () => deleteMedia(name),
  })

  if (!safety.allowed) {
    return c.json(
      {
        error: safety.error?.length
          ? safety.error
          : "extensions:mediaLibrary.deleteBlockedDesc",
        references: safety.references,
      },
      safety.unreadableFiles && safety.unreadableFiles.length > 0
        ? StatusCodes.INTERNAL_SERVER_ERROR
        : StatusCodes.CONFLICT,
    )
  }

  return c.body(null, StatusCodes.NO_CONTENT)
}
