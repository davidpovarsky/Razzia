import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { SESSION_ROLES } from "@razzia/common/constants"
import { app } from "@razzia/socket/app"
import { getPath, saveQuizz } from "@razzia/socket/services/config"
import { withAccount } from "@razzia/socket/services/account-scope"
import { closeAccountDb } from "@razzia/socket/services/account-db"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { setIo } from "@razzia/socket/services/io"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import Registry from "@razzia/socket/services/registry"

const root = mkdtempSync(join(tmpdir(), "tadazz-e2e-auth-"))
const old = {
  TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
  CONFIG_PATH: process.env.CONFIG_PATH,
  JWT_SECRET: process.env.JWT_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TADAZZ_AUTH_EMAIL_FROM: process.env.TADAZZ_AUTH_EMAIL_FROM,
}
const codes = new Map<string, string>()
const credentials = [
  { email: "alice@example.invalid", password: "Passphrase-A-very-long" },
  { email: "bob@example.invalid", password: "Passphrase-B-very-long" },
]
let tokenA = ""
let tokenB = ""
let quizId = ""

const req = async (
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
  cookie?: string,
) =>
  app.request("/api" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

beforeAll(() => {
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.CONFIG_PATH = root
  process.env.JWT_SECRET = "test-super-secret-" + "x".repeat(48)
  process.env.RESEND_API_KEY = "test-not-a-real-api-key"
  process.env.TADAZZ_AUTH_EMAIL_FROM = "Tadazz Test <auth@example.invalid>"
  setIo(createFakeIo().io)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, opts: RequestInit) => {
      const msg = JSON.parse(String(opts.body)) as {
        to: string[]
        text: string
      }
      const found = msg.text.match(/\b\d{6}\b/u)
      if (found) codes.set(msg.to[0], found[0])
      return new Response(JSON.stringify({ id: "test-mail" }), { status: 200 })
    }),
  )
})
afterAll(() => {
  vi.unstubAllGlobals()
  for (const [key, val] of Object.entries(old)) {
    if (val === undefined) delete process.env[key]
    else process.env[key] = val
  }
  Registry.getInstance()
    .getAllGames()
    .forEach((game) => Registry.getInstance().removeGame(game.gameId))
  closeAccountDb()
  rmSync(root, { recursive: true, force: true })
})

describe("Tadazz HTTP tenant separation", () => {
  it("rejects legacy password and unverified account, then verifies both new accounts", async () => {
    expect((await req("/auth/mode")).status).toBe(200)
    expect(await (await req("/auth/mode")).json()).toMatchObject({
      accountsEnabled: true,
    })
    expect(
      (await req("/auth/manager", "POST", { password: "legacy-password" }))
        .status,
    ).toBe(403)
    for (const { email, password } of credentials) {
      expect(
        (await req("/accounts/register", "POST", { email, password })).status,
      ).toBe(202)
      expect(
        (await req("/accounts/login", "POST", { email, password })).status,
      ).toBe(401)
      const code = codes.get(email)
      expect(code).toMatch(/^\d{6}$/u)
      expect(
        (await req("/accounts/verify", "POST", { email, password, code }))
          .status,
      ).toBe(200)
    }
    const first = await req("/accounts/login", "POST", credentials[0])
    expect(first.status).toBe(200)
    tokenA = ((await first.json()) as { token: string }).token
    expect(first.headers.get("set-cookie")).toContain("HttpOnly")
    const second = await req("/accounts/login", "POST", credentials[1])
    expect(second.status).toBe(200)
    tokenB = ((await second.json()) as { token: string }).token
  }, 60_000)

  it("A can read their quiz, but B cannot list, fetch, export or delete it", async () => {
    const identity = await req("/accounts/me", "GET", undefined, tokenA)
    expect(identity.status).toBe(200)
    const owner = (await identity.json()) as { id: string }
    quizId = (
      await withAccount(owner.id, () =>
        saveQuizz(createQuizz([createQuestion()])),
      )
    ).id
    const aList = await req("/quizz", "GET", undefined, tokenA)
    const bList = await req("/quizz", "GET", undefined, tokenB)
    expect(aList.status).toBe(200)
    expect(bList.status).toBe(200)
    expect(JSON.stringify(await aList.json())).toContain(quizId)
    expect(JSON.stringify(await bList.json())).not.toContain(quizId)
    expect(
      (await req("/quizz/" + quizId, "GET", undefined, tokenA)).status,
    ).toBe(200)
    expect(
      (await req("/quizz/" + quizId, "GET", undefined, tokenB)).status,
    ).toBe(404)
    expect(
      (await req("/extensions/export/" + quizId, "GET", undefined, tokenB))
        .status,
    ).toBe(404)
    expect(
      (await req("/quizz/" + quizId, "DELETE", undefined, tokenB)).status,
    ).toBe(404)
    expect(
      (await req("/quizz/" + quizId, "GET", undefined, tokenA)).status,
    ).toBe(200)
  })

  it("media is served to its owner, never by another account or unauthenticated request", async () => {
    const me = (await (
      await req("/accounts/me", "GET", undefined, tokenA)
    ).json()) as { id: string }
    await withAccount(me.id, () => {
      const dest = getPath("media/private.png")
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, Buffer.from("89504e470d0a1a0a", "hex"))
    })
    const a = await req(
      "/media/raw/private.png",
      "GET",
      undefined,
      undefined,
      `tdz_media_auth=${tokenA}`,
    )
    const b = await req(
      "/media/raw/private.png",
      "GET",
      undefined,
      undefined,
      `tdz_media_auth=${tokenB}`,
    )
    const anon = await req("/media/raw/private.png")
    expect(a.status).toBe(200)
    expect(a.headers.get("Content-Type")).toContain("image/png")
    expect(b.status).toBe(404)
    expect(anon.status).not.toBe(200)
  })

  it("lets guests join via room code but never lets another manager control the room", async () => {
    const response = await req("/games", "POST", { quizzId: quizId }, tokenA)
    expect(response.status).toBe(201)
    const room = (await response.json()) as {
      gameId: string
      inviteCode: string
    }
    expect(room.inviteCode).toBeTruthy()
    const otherManager = await req(
      "/games/" + room.gameId + "/roster",
      "GET",
      undefined,
      tokenB,
    )
    expect(otherManager.status).toBe(404)
    const guest = await req("/auth/session", "POST", {})
    const playerToken = ((await guest.json()) as { token: string }).token
    const check = await req("/games/check", "POST", {
      inviteCode: room.inviteCode,
    })
    expect(check.status).toBe(200)
    expect(check.headers.get("set-cookie")).toContain("tdz_room")
    const join = await req(
      "/games/join",
      "POST",
      { inviteCode: room.inviteCode, username: "Guest" },
      playerToken,
    )
    expect(join.status).toBe(200)
    expect(((await join.json()) as { gameId: string }).gameId).toBe(room.gameId)
  })

  it("logging out revokes the managerial token while anonymous player sessions remain available", async () => {
    const logout = await req("/auth/logout", "POST", {}, tokenB)
    expect(logout.status).toBe(200)
    expect((await req("/accounts/me", "GET", undefined, tokenB)).status).toBe(
      401,
    )
    const player = await req("/auth/session", "POST", {})
    expect(player.status).toBe(200)
    expect(((await player.json()) as { role: string }).role).toBe(
      SESSION_ROLES.PLAYER,
    )
  })
})
