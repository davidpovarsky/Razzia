import { getConnInfo } from "@hono/node-server/conninfo"
import { managedClientLoginValidator } from "@razzia/common/validators/managed-clients"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import { accountsEnabled } from "@razzia/socket/services/account-scope"
import { mintManagedClientToken } from "@razzia/socket/services/auth"
import {
  launchManagedClientGame,
  listManagedClientGames,
  requireManagedClientPrincipal,
} from "@razzia/socket/services/managed-client-games"
import { ManagedClientOwnerService } from "@razzia/socket/services/managed-client-owner"
import { managedClientRateAddress } from "@razzia/socket/services/managed-client-rate-limit"
import {
  clearPriorMediaAccess,
  validManagedClientRequest,
  managedClientCookieOptions,
  managedClientSessionResponse,
  readManagedClientClaims,
  retireManagedClientCookie,
  sameOriginClientRequest,
} from "@razzia/socket/services/managed-client-session"
import {
  MANAGED_CLIENT_COOKIE,
  MANAGED_CLIENT_TTL_SECONDS,
  ManagedClientFailure,
  ManagedClientStore,
} from "@razzia/socket/services/managed-clients"
import { grantMediaForGuest } from "@razzia/socket/services/media-access"
import type { Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import { setCookie } from "hono/cookie"

async function readJson(c: Context): Promise<unknown> {
  try {
    return (await c.req.json()) as unknown
  } catch {
    throw new ManagedClientFailure("client-invalid-request", 400)
  }
}

/** Only the explicitly configured local ingress may supply a canonical peer. */
function remoteAddress(c: Context): string {
  let peerAddress: string | undefined = undefined

  try {
    peerAddress = getConnInfo(c).remote.address
  } catch {
    // In-process requests and unsupported adapters share the fallback bucket.
  }

  return managedClientRateAddress({
    peerAddress,
    canonicalHeader: c.req.header("X-Tadazz-Client-IP"),
    rawHeaders: (c.env as { incoming?: { rawHeaders?: unknown } } | undefined)
      ?.incoming?.rawHeaders,
    requestHost: c.req.header("Host"),
    canonicalHost: process.env.TADAZZ_MANAGED_CLIENT_PROXY_HOST,
    trustLoopback: process.env.TADAZZ_MANAGED_CLIENT_TRUST_PROXY === "loopback",
  })
}

const smallBody = bodyLimit({ maxSize: 64 * 1024 })

export const managedClients = apiFactory
  .createApp()
  .use("*", requireManager)
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store")
    await next()
  })
  .use("*", smallBody)
  .get("/", async (c) =>
    c.json(await new ManagedClientOwnerService().list(c.get("claims").sub)),
  )
  .post("/", async (c) =>
    c.json(
      await new ManagedClientOwnerService().create(
        c.get("claims").sub,
        await readJson(c),
      ),
      201,
    ),
  )
  .patch("/:id", async (c) =>
    c.json(
      new ManagedClientOwnerService().update(
        c.get("claims").sub,
        c.req.param("id"),
        await readJson(c),
      ),
    ),
  )
  .put("/:id/games", async (c) =>
    c.json(
      await new ManagedClientOwnerService().assign(
        c.get("claims").sub,
        c.req.param("id"),
        await readJson(c),
      ),
    ),
  )
  .post("/:id/rotate-code", (c) =>
    c.json(
      new ManagedClientOwnerService().rotate(
        c.get("claims").sub,
        c.req.param("id"),
      ),
    ),
  )

const managedClientBoundary = apiFactory.createMiddleware(async (c, next) => {
  c.header("Cache-Control", "no-store")

  if (!accountsEnabled()) {
    return c.json({ error: "client-not-found" }, 404)
  }

  if (!validManagedClientRequest(c) || !sameOriginClientRequest(c)) {
    return c.json({ error: "client-session-expired" }, 401)
  }

  await next()
})

const requireManagedClientSession = apiFactory.createMiddleware(
  async (c, next) => {
    const claims = await readManagedClientClaims(c)

    if (!claims) {
      return c.json({ error: "client-session-expired" }, 401)
    }

    c.set("claims", claims)
    await next()
  },
)

export const clientAccess = apiFactory
  .createApp()
  .use("*", managedClientBoundary)
  .post(
    "/session",
    async (c, next) => {
      // Charge malformed and incorrect attempts too, before body parsing.
      new ManagedClientStore().consumeLoginBudget(remoteAddress(c))
      await next()
    },
    smallBody,
    async (c) => {
      const parsed = managedClientLoginValidator.safeParse(await readJson(c))

      if (!parsed.success) {
        throw new ManagedClientFailure("invalid-client-code", 401)
      }

      const principal = new ManagedClientStore().exchange(parsed.data.code)
      const token = await mintManagedClientToken(principal)
      await retireManagedClientCookie(c)
      clearPriorMediaAccess(c)
      setCookie(c, MANAGED_CLIENT_COOKIE, token, {
        ...managedClientCookieOptions,
        maxAge: MANAGED_CLIENT_TTL_SECONDS,
      })

      return c.json(managedClientSessionResponse(principal))
    },
  )
  .use("*", requireManagedClientSession)
  .get("/session", (c) =>
    c.json(
      managedClientSessionResponse(
        requireManagedClientPrincipal(c.get("claims")),
      ),
    ),
  )
  .delete("/session", async (c) => {
    await retireManagedClientCookie(c)
    clearPriorMediaAccess(c)

    return c.json({ status: "signed-out" })
  })
  .get("/games", async (c) =>
    c.json(await listManagedClientGames(c.get("claims"))),
  )
  .post("/games/:quizId/launch", smallBody, async (c) => {
    const result = await launchManagedClientGame(
      c.get("claims"),
      c.req.param("quizId"),
      await readJson(c),
    )
    await grantMediaForGuest(c, result.gameId)
    requireManagedClientPrincipal(c.get("claims"))

    return c.json(result, 201)
  })
