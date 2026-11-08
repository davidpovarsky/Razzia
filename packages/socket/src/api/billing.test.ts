import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createAdaptorServer } from "@hono/node-server"
import { io as connect, type Socket as ClientSocket } from "socket.io-client"
import { app, createSocketServer } from "@razzia/socket/app"
import {
  getAccountDb,
  closeAccountDb,
} from "@razzia/socket/services/account-db"
import { ensureAccountStorage } from "@razzia/socket/services/account-directory"
import { mintToken } from "@razzia/socket/services/auth"
import { requireBilling, closeBilling } from "@razzia/socket/services/billing"
import { withAccount } from "@razzia/socket/services/account-scope"
import { saveQuizz } from "@razzia/socket/services/config"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import Registry from "@razzia/socket/services/registry"
import { SESSION_ROLES, EVENTS } from "@razzia/common/constants"
import { insertGrant } from "../../../../extensions/src/server/billing/grants"
import { plan } from "../../../../extensions/src/server/billing/test-fixture"

const tenantA = crypto.randomUUID(),
  tenantB = crypto.randomUUID()
const server = createAdaptorServer({ fetch: app.fetch })
let socketServer: ReturnType<typeof createSocketServer> | undefined = undefined
const clients: ClientSocket[] = []
let address = "",
  tokenA = "",
  tokenB = "",
  playerToken = "",
  quizId = "",
  gameId = "",
  inviteCode = ""
const request = (path: string, token?: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const waitFor = (socket: ClientSocket, name: string) =>
  new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, listener)
      reject(new Error(`Missing ${name}`))
    }, 5000)
    const listener = (data: unknown) => {
      clearTimeout(timeout)
      resolve(data)
    }
    socket.once(name, listener)
  })
async function client(token: string) {
  const socket = connect(address, {
    path: "/ws",
    auth: { token },
    transports: ["websocket"],
    autoConnect: false,
  })
  clients.push(socket)
  const connected = Promise.race([
    waitFor(socket, "connect"),
    new Promise<never>((_resolve, reject) => {
      socket.once("connect_error", reject)
    }),
  ])
  socket.connect()
  await connected

  return socket
}
beforeAll(async () => {
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
  vi.stubEnv("TADAZZ_BILLING_ENABLED", "true")
  vi.stubEnv("PADDLE_ENVIRONMENT", "sandbox")
  vi.stubEnv("RESEND_API_KEY", "synthetic-unused")
  vi.stubEnv("TADAZZ_AUTH_EMAIL_FROM", "test@example.invalid")
  for (const id of [tenantA, tenantB]) {
    getAccountDb()
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,0)")
      .run(
        id,
        `${id}@example.invalid`,
        "unused",
        "unused",
        Date.now(),
        Date.now(),
      )
  }
  ensureAccountStorage(tenantA)
  ensureAccountStorage(tenantB)
  tokenA = (await mintToken(tenantA, SESSION_ROLES.MANAGER)).token
  tokenB = (await mintToken(tenantB, SESSION_ROLES.MANAGER)).token
  playerToken = (await mintToken(crypto.randomUUID(), SESSION_ROLES.PLAYER))
    .token
  quizId = (
    await withAccount(tenantA, () => saveQuizz(createQuizz([createQuestion()])))
  ).id
  insertGrant(requireBilling().database, {
    id: "http-test-grant",
    tenantId: tenantA,
    plan,
    startsAt: 0,
    expiresAt: null,
    transactionId: "synthetic-paid",
  })
  socketServer = createSocketServer(server)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  address = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => {
  clients.forEach((socket) => {
    socket.disconnect()
  })
  Registry.getInstance().cleanup()

  if (socketServer) {
    await new Promise<void>((resolve) => {
      void socketServer?.close(() => resolve())
    })
  }

  closeBilling()
  closeAccountDb()
  vi.unstubAllEnvs()
})
describe("real authenticated billing/game integration", () => {
  it("denies guests and players, exposes only the manager's own billing", async () => {
    expect((await request("/billing")).status).toBe(401)
    expect((await request("/billing", playerToken)).status).toBe(401)
    const own = await request("/billing", tokenA)
    expect(own.status).toBe(200)
    expect(own.headers.get("cache-control")).toBe("no-store")
    const a = (await own.json()) as { grants: unknown[] }
    const b = (await (await request("/billing", tokenB)).json()) as {
      grants: unknown[]
    }
    expect(a.grants).toHaveLength(1)
    expect(b.grants).toHaveLength(0)
    expect(JSON.stringify(a)).not.toContain("apiKey")
    expect(
      (
        await request("/billing/checkout", tokenA, {
          planId: "bad",
          currency: "GBP",
          requestId: crypto.randomUUID(),
          tenantId: tenantB,
        })
      ).status,
    ).toBe(400)
    expect(
      (await request("/billing/webhooks/paddle", undefined, {})).status,
    ).toBe(401)
  })
  it("creates an owned lobby through HTTP without spending the game", async () => {
    const result = await request("/games", tokenA, { quizzId: quizId })
    expect(result.status).toBe(201)
    const data = (await result.json()) as { gameId: string; inviteCode: string }
    ;({ gameId, inviteCode } = data)
    expect(requireBilling().snapshot(tenantA).grants[0].remainingGames).toBe(1)
    expect(requireBilling().snapshot(tenantB).games).toEqual([])
  })
  it("enforces one shared participant cap for real websocket and simulated phone", async () => {
    const joined = await request("/games/join", playerToken, {
      inviteCode,
      username: "Web Player",
    })
    expect(joined.status).toBe(200)
    const { ticket } = (await joined.json()) as { ticket: string }
    const player = await client(playerToken)
    const accepted = waitFor(player, EVENTS.GAME.SUCCESS_JOIN)
    player.emit(EVENTS.PLAYER.LOGIN, { ticket })
    await accepted
    const game = Registry.getInstance().getGameById(gameId)

    if (!game) {
      throw new Error("Missing test game")
    }

    const phone = game.joinOrRebindPhoneCaller({
      callId: "synthetic-call-a",
      fallbackName: "Phone Player",
    })
    expect(phone.ok).toBe(true)
    expect(
      game.joinOrRebindPhoneCaller({
        callId: "synthetic-call-b",
        fallbackName: "Excess Player",
      }).error,
    ).toContain("participantLimit")
    expect(
      game.joinOrRebindPhoneCaller({
        callId: "synthetic-call-a",
        rosterPlayerId: phone.rosterPlayerId,
      }).ok,
    ).toBe(true)
    expect(requireBilling().entitlements.count(gameId)).toBe(2)
    const reconnected = waitFor(player, EVENTS.PLAYER.SUCCESS_RECONNECT)
    player.emit(EVENTS.PLAYER.RECONNECT, { gameId })
    await reconnected
    expect(requireBilling().entitlements.count(gameId)).toBe(2)
  })
  it("consumes exactly one credit through the real manager socket", async () => {
    const host = await client(tokenA)
    const connected = waitFor(host, EVENTS.MANAGER.SUCCESS_RECONNECT)
    host.emit(EVENTS.MANAGER.RECONNECT, { gameId })
    await connected
    host.emit(EVENTS.MANAGER.START_GAME, { gameId })
    await vi.waitFor(() =>
      expect(requireBilling().snapshot(tenantA).grants[0].remainingGames).toBe(
        0,
      ),
    )
    host.emit(EVENTS.MANAGER.START_GAME, { gameId })
    expect(requireBilling().snapshot(tenantA).grants[0].remainingGames).toBe(0)
  })
  it("keeps the legacy API available when billing is disabled", async () => {
    vi.stubEnv("TADAZZ_BILLING_ENABLED", "false")
    expect(
      (
        (await (await request("/billing/config")).json()) as {
          enabled: boolean
        }
      ).enabled,
    ).toBe(false)
    expect((await request("/billing", tokenA)).status).toBe(404)
    expect((await request("/games", tokenA, { quizzId: quizId })).status).toBe(
      201,
    )
    vi.stubEnv("TADAZZ_BILLING_ENABLED", "true")
  })
})
