import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { SESSION_ROLES } from "@razzia/common/constants"
import { app } from "@razzia/socket/app"
import { mintToken } from "@razzia/socket/services/auth"
import {
  registerAccount,
  issueCode,
  consumeCode,
} from "@razzia/socket/services/account-auth"
import { ensureAccountStorage } from "@razzia/socket/services/account-directory"
import { closeAccountDb } from "@razzia/socket/services/account-db"
import { withAccount } from "@razzia/socket/services/account-scope"
import { initConfig, saveQuizz } from "@razzia/socket/services/config"
import { setIo } from "@razzia/socket/services/io"
import Registry from "@razzia/socket/services/registry"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"

const root = mkdtempSync(join(tmpdir(), "tadazz-room-idempotency-"))
let tokenA = "",
  tokenB = "",
  playerToken = ""
let quizA = "",
  anotherQuizA = "",
  quizB = ""

const create = (body: unknown, token = tokenA) =>
  app.request("/api/games", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

beforeAll(async () => {
  vi.stubEnv("CONFIG_PATH", root)
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
  setIo(createFakeIo().io)
  const provision = async (email: string) => {
    const account = await registerAccount(
      email,
      "Disposable-room-test-password-2026",
    )
    consumeCode(email, "verify", issueCode(account.id, "verify"))
    ensureAccountStorage(account.id)
    const { token } = await mintToken(account.id, SESSION_ROLES.MANAGER)
    const quizzId = await withAccount(account.id, () => {
      initConfig()

      return saveQuizz(createQuizz([createQuestion()])).id
    })

    return { id: account.id, token, quizzId }
  }
  const authorA = await provision("room-a@example.invalid")
  const authorB = await provision("room-b@example.invalid")
  tokenA = authorA.token
  tokenB = authorB.token
  quizA = authorA.quizzId
  quizB = authorB.quizzId
  anotherQuizA = await withAccount(
    authorA.id,
    () => saveQuizz(createQuizz([createQuestion()])).id,
  )
  playerToken = (await mintToken(authorA.id, SESSION_ROLES.PLAYER)).token
})

afterEach(() => {
  for (const game of Registry.getInstance().getAllGames()) {
    Registry.getInstance().removeGame(game.gameId)
  }
})

afterAll(() => {
  Registry.getInstance().cleanup()
  closeAccountDb()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe("room creation retry identity", () => {
  it("replays the same live room after a lost response, including concurrent retries", async () => {
    const requestId = randomUUID()
    const body = { quizzId: quizA, requestId }
    const [first, concurrent] = await Promise.all([create(body), create(body)])
    expect(first.status).toBe(201)
    // Deliberately discard the first body, as a disconnected caller would.
    const [registered] = Registry.getInstance().getAllGames()
    const replies = [concurrent, await create(body)]
    for (const response of replies) {
      expect(response.status).toBe(201)
      expect(await response.json()).toEqual({
        gameId: registered.gameId,
        inviteCode: registered.inviteCode,
      })
    }
    expect(Registry.getInstance().getGameCount()).toBe(1)
  })

  it("binds the identity to the original quiz and rejects a different valid quiz", async () => {
    const requestId = randomUUID()
    expect((await create({ quizzId: quizA, requestId })).status).toBe(201)
    const conflict = await create({ quizzId: anotherQuizA, requestId })
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({
      error: "game-creation-request-conflict",
    })
    expect(Registry.getInstance().getGameCount()).toBe(1)
  })

  it("isolates identical identities by authenticated owner and preserves quiz authorization", async () => {
    const requestId = randomUUID()
    const ownA = await create({ quizzId: quizA, requestId })
    const ownB = await create({ quizzId: quizB, requestId }, tokenB)
    expect(ownA.status).toBe(201)
    expect(ownB.status).toBe(201)
    const a = (await ownA.json()) as { gameId: string }
    const b = (await ownB.json()) as { gameId: string }
    expect(b.gameId).not.toBe(a.gameId)
    expect((await create({ quizzId: quizA, requestId }, tokenB)).status).toBe(
      404,
    )
    expect(Registry.getInstance().getGameCount()).toBe(2)
  })

  it("keeps optional-key compatibility for existing clients", async () => {
    const first = await create({ quizzId: quizA })
    const second = await create({ quizzId: quizA })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(await first.json()).not.toEqual(await second.json())
    expect(Registry.getInstance().getGameCount()).toBe(2)
  })

  it("rejects malformed identities and unauthorized callers without making rooms", async () => {
    expect(
      (await create({ quizzId: quizA, requestId: "not-a-uuid" })).status,
    ).toBe(400)
    expect(
      (await create({ quizzId: quizA, requestId: randomUUID() }, "")).status,
    ).toBe(401)
    expect(
      (await create({ quizzId: quizA, requestId: randomUUID() }, playerToken))
        .status,
    ).toBe(401)
    expect(Registry.getInstance().getGameCount()).toBe(0)
  })

  it("allows a fresh room once the original volatile room has been removed", async () => {
    const body = { quizzId: quizA, requestId: randomUUID() }
    const first = (await (await create(body)).json()) as { gameId: string }
    Registry.getInstance().removeGame(first.gameId)
    const second = await create(body)
    expect(second.status).toBe(201)
    expect(((await second.json()) as { gameId: string }).gameId).not.toBe(
      first.gameId,
    )
    expect(Registry.getInstance().getGameCount()).toBe(1)
  })
})
