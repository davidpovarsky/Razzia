import { accountsEnabled } from "@razzia/socket/services/account-scope"
import {
  canRefreshAsPlayer,
  retireManagerClaims,
} from "@razzia/socket/services/account-session-policy"
import { deleteCookie } from "hono/cookie"
import { zValidator } from "@hono/zod-validator"
import { SESSION_ROLES } from "@razzia/common/constants"
import type { SessionClaims, SessionResponse } from "@razzia/common/types/auth"
import {
  managerLoginValidator,
  sessionRequestValidator,
} from "@razzia/common/validators/auth"
import { readClaims } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { managerPassword } from "@razzia/socket/env"
import { isAccountConnectionValid } from "@razzia/socket/services/account-auth"
import {
  mintToken,
  newClientId,
  verifyIgnoringExpiry,
  verifyToken,
} from "@razzia/socket/services/auth"
import { Hono, type Context } from "hono"
import { JwtTokenExpired } from "hono/utils/jwt/types"
import { StatusCodes } from "http-status-codes"

const readRequestToken = async (c: Context): Promise<string | undefined> => {
  try {
    const result = sessionRequestValidator.safeParse(await c.req.json())

    if (result.success && result.data.token) {
      return result.data.token
    }
  } catch {
    /* Empty */
  }

  const header = c.req.header("Authorization")

  return header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined
}

const freshPlayerSession = (): Promise<SessionResponse> =>
  mintToken(newClientId(), SESSION_ROLES.PLAYER)

const readLogoutClaims = async (
  c: Context,
): Promise<SessionClaims | undefined> => {
  const active = await readClaims(c)

  if (active) {
    return active
  }

  const header = c.req.header("Authorization")

  if (!accountsEnabled() || !header?.startsWith("Bearer ")) {
    return undefined
  }

  try {
    // An expired signed owner session can retire only its own retained anchor.
    // This fallback is exclusive to logout and never grants owner access.
    const expired = await verifyIgnoringExpiry(header.slice("Bearer ".length))

    if (
      expired.role === SESSION_ROLES.MANAGER &&
      !("managedClientId" in expired) &&
      expired.exp * 1000 <= Date.now() &&
      expired.sid &&
      isAccountConnectionValid(expired.sub, expired.sid)
    ) {
      return expired
    }
  } catch {
    /* Empty */
  }

  return undefined
}

const routes = new Hono()
  .get("/mode", (c) => c.json({ accountsEnabled: accountsEnabled() }))
  .post("/session", async (c) => {
    const token = await readRequestToken(c)

    if (!token) {
      return c.json(await freshPlayerSession())
    }

    try {
      const claims = await verifyToken(token)

      return c.json({
        token,
        clientId: claims.sub,
        role: claims.role,
        expiresAt: claims.exp,
      } satisfies SessionResponse)
    } catch (error) {
      if (error instanceof JwtTokenExpired) {
        try {
          const claims = await verifyIgnoringExpiry(token)

          if (canRefreshAsPlayer(claims)) {
            return c.json(await mintToken(claims.sub, SESSION_ROLES.PLAYER))
          }

          // Native manager access has expired, so return a fresh player below.
          // Keep its retained session row as an external connection's revocation
          // anchor; ordinary expiry must not act like an explicit logout.
        } catch {
          /* Empty */
        }
      }

      deleteCookie(c, "tdz_media_auth", { path: "/media" })

      return c.json(await freshPlayerSession())
    }
  })
  .post(
    "/manager",
    zValidator("json", managerLoginValidator, i18nHook),
    async (c) => {
      const { password } = c.req.valid("json")

      if (accountsEnabled() || !managerPassword) {
        return c.json(
          { error: "errors:manager.passwordNotConfigured" },
          StatusCodes.FORBIDDEN,
        )
      }

      if (password !== managerPassword) {
        return c.json(
          { error: "errors:manager.invalidPassword" },
          StatusCodes.FORBIDDEN,
        )
      }

      const claims = await readClaims(c)

      return c.json(
        await mintToken(claims?.sub ?? newClientId(), SESSION_ROLES.MANAGER),
      )
    },
  )
  .post("/logout", async (c) => {
    const claims = await readLogoutClaims(c)

    if (!claims) {
      return c.json(
        { error: "errors:auth.unauthorized" },
        StatusCodes.UNAUTHORIZED,
      )
    }

    retireManagerClaims(claims)
    deleteCookie(c, "tdz_media_auth", { path: "/media" })

    return c.json(
      await mintToken(
        accountsEnabled() ? newClientId() : claims.sub,
        SESSION_ROLES.PLAYER,
      ),
    )
  })

export const auth = routes
