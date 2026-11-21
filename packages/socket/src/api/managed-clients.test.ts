import { createAdaptorServer } from "@hono/node-server"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { request as nodeRequest } from "node:http"
import { fileURLToPath } from "node:url"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { io as connect, type Socket as ClientSocket } from "socket.io-client"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { EVENTS } from "@razzia/common/constants"
import type {
  ManagedClientCodeResponse,
  ManagedClientLaunchResponse,
  ManagedClientListResponse,
} from "@razzia/common/types/managed-clients"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  createShowThemeRegistry,
  resolveShowTheme,
  type ExtensionStateEnvelope,
  type ShowThemeDefinition,
} from "@razzia/extensions/core"
import { packageSha, writeSidecar } from "@razzia/extensions/server"
import { createPackageFixture } from "@razzia/extensions/testkit/package-fixtures"
import { app, createSocketServer } from "@razzia/socket/app"
import {
  closeAccountDb,
  getAccountDb,
} from "@razzia/socket/services/account-db"
import { withAccount } from "@razzia/socket/services/account-scope"
import { mintToken, verifyToken } from "@razzia/socket/services/auth"
import * as billing from "@razzia/socket/services/billing"
import {
  getPath,
  getQuizzById,
  getResultsMeta,
  saveQuizz,
} from "@razzia/socket/services/config"
import { canHostGame } from "@razzia/socket/services/managed-client-authorization"
import { executeManagedClientOwnerCommand } from "@razzia/socket/services/managed-client-owner-cli"
import { ManagedClientStore } from "@razzia/socket/services/managed-clients"
import { setIo } from "@razzia/socket/services/io"
import {
  closePackageStore,
  packageStore,
} from "@razzia/socket/services/package-installation"
import Registry from "@razzia/socket/services/registry"
import { closeThemeInstallationStore } from "@razzia/socket/services/theme-installation"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"

const owner = "b1cffc45-c0e2-4866-9e22-7e927c2059a3"
const stranger = "94fe4d50-9240-4c52-bd56-690c1fc3e035"
let directory = ""
let token = ""
let strangerToken = ""
let quizId = ""
let secondId = ""
let strangerQuizId = ""
let fake = createFakeIo()
const sockets: ClientSocket[] = []

interface RequestOptions {
  method?: string
  body?: unknown
  bearer?: string
  cookie?: string
  managed?: boolean
  managedValue?: string
  origin?: string
}

function request(path: string, options: RequestOptions = {}) {
  return app.request(`http://localhost/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      Host: "localhost",
      Origin: options.origin ?? "http://localhost",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.managed
        ? { "X-Tadazz-Session": options.managedValue ?? "managed-client" }
        : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  })
}

async function createClient(gameIds = [quizId]) {
  const response = await request("/managed-clients", {
    method: "POST",
    bearer: token,
    body: { name: "Synthetic event", gameIds, requestId: randomUUID() },
  })
  expect(response.status).toBe(201)

  return (await response.json()) as ManagedClientCodeResponse
}

async function exchange(code: string) {
  const response = await request("/client-access/session", {
    method: "POST",
    managed: true,
    body: { code },
  })
  expect(response.status).toBe(200)
  const header = response.headers
    .getSetCookie()
    .find(
      (value) =>
        value.startsWith("tdz_client_auth=") &&
        !value.startsWith("tdz_client_auth=;"),
    )
  expect(header).toContain("HttpOnly")
  expect(header).toContain("SameSite=Lax")
  expect(header).toContain("Path=/")
  const cookie = header?.split(";")[0]
  expect(cookie).toBeDefined()

  return { cookie: cookie!, response }
}

function launch(cookie: string, id = quizId, requestId = randomUUID()) {
  return request(`/client-access/games/${encodeURIComponent(id)}/launch`, {
    method: "POST",
    managed: true,
    cookie,
    body: { requestId },
  })
}

beforeEach(async () => {
  closeAccountDb()
  closePackageStore()
  closeThemeInstallationStore()
  directory = mkdtempSync(join(tmpdir(), "tadazz-managed-api-"))
  vi.stubEnv("CONFIG_PATH", directory)
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
  vi.stubEnv("JWT_SECRET", "synthetic-managed-client-private-store-test-secret")
  vi.stubEnv("RESEND_API_KEY", "synthetic-no-network")
  vi.stubEnv("TADAZZ_AUTH_EMAIL_FROM", "qa@example.invalid")
  vi.stubEnv("TADAZZ_PACKAGE_INSTALLER_ENABLED", "true")
  vi.stubEnv("TADAZZ_PACKAGE_RUNTIME_ENABLED", "true")
  vi.stubEnv("TADAZZ_BILLING_ENABLED", "false")
  fake = createFakeIo()
  setIo(fake.io)

  for (const id of [owner, stranger]) {
    getAccountDb()
      .prepare(
        "INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        id,
        `${id}@example.invalid`,
        "synthetic",
        "synthetic",
        Date.now(),
        Date.now(),
      )
  }

  ;({ token } = await mintToken(owner, "manager"))
  ;({ token: strangerToken } = await mintToken(stranger, "manager"))
  await withAccount(owner, () =>
    mkdirSync(getPath("quizz"), { recursive: true }),
  )
  await withAccount(stranger, () =>
    mkdirSync(getPath("quizz"), { recursive: true }),
  )
  quizId = (
    await withAccount(owner, () =>
      saveQuizz({
        ...createQuizz([createQuestion()]),
        subject: "Assigned quiz",
      }),
    )
  ).id
  secondId = (
    await withAccount(owner, () =>
      saveQuizz({
        ...createQuizz([createQuestion({ question: "Second" })]),
        subject: "Second quiz",
      }),
    )
  ).id
  strangerQuizId = (
    await withAccount(stranger, () =>
      saveQuizz(createQuizz([createQuestion()])),
    )
  ).id
})

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    socket.disconnect()
  }

  for (const game of Registry.getInstance().getAllGames()) {
    Registry.getInstance().removeGame(game.gameId)
  }

  closePackageStore()
  closeThemeInstallationStore()
  closeAccountDb()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

afterAll(() => Registry.getInstance().stopCleanupTask())

describe("managed-client HTTP/native boundaries", () => {
  it("creates once, lists no credentials, and denies assigning another owner's game", async () => {
    const requestId = randomUUID()
    const body = { name: "Client", gameIds: [quizId], requestId }
    const first = await request("/managed-clients", {
      method: "POST",
      bearer: token,
      body,
    })
    expect(first.status).toBe(201)
    const created = (await first.json()) as ManagedClientCodeResponse
    expect(created.code).toMatch(/^[0-9]{6}$/u)
    const replay = await request("/managed-clients", {
      method: "POST",
      bearer: token,
      body,
    })
    expect(replay.status).toBe(409)
    expect(await replay.json()).toEqual({
      error: "client-create-already-completed",
      clientId: created.client.id,
    })
    const listing = await request("/managed-clients", { bearer: token })
    const listed = (await listing.json()) as ManagedClientListResponse
    expect(listed.clients).toEqual([created.client])
    expect(listed.games.map((game) => game.id).sort()).toEqual(
      [quizId, secondId].sort(),
    )
    expect(JSON.stringify(listed)).not.toContain('"code"')
    expect(
      (
        await request(`/managed-clients/${created.client.id}/games`, {
          method: "PUT",
          bearer: token,
          body: { gameIds: [strangerQuizId] },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await request(`/managed-clients/${created.client.id}/rotate-code`, {
          method: "POST",
          bearer: strangerToken,
        })
      ).status,
    ).toBe(404)
    expect(
      new ManagedClientStore().get(owner, created.client.id).gameIds,
    ).toEqual([quizId])
  })

  it("uses HttpOnly client mode without exposing owner credentials or falling back to them", async () => {
    const created = await createClient()
    const { cookie, response } = await exchange(created.code)
    const session: unknown = await response.json()
    expect(session).toMatchObject({
      kind: "managed-client",
      role: "manager",
      client: { id: created.client.id },
    })
    expect(session).not.toHaveProperty("token")
    expect(session).not.toHaveProperty("ownerId")
    expect(
      response.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith("tdz_media_auth=;") &&
            value.includes("Path=/media"),
        ),
    ).toBe(true)
    expect(
      response.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith("tdz_room=;") && value.includes("Path=/media"),
        ),
    ).toBe(true)
    expect(
      (await request("/client-access/games", { managed: true, cookie })).status,
    ).toBe(200)
    for (const path of [
      "/quizz",
      "/results",
      "/accounts/me",
      "/managed-clients",
      "/billing/entitlements",
    ]) {
      const denied = await request(path, {
        managed: true,
        cookie,
        bearer: token,
      })
      expect([401, 404]).toContain(denied.status)
    }
    const jwt = cookie.slice("tdz_client_auth=".length)
    expect((await request("/quizz", { bearer: jwt })).status).toBe(401)
    expect(
      (
        await request("/quizz", {
          managed: true,
          managedValue: "invalid",
          cookie,
          bearer: token,
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request("/client-access/session", {
          managed: true,
          managedValue: "invalid",
          cookie,
          bearer: token,
        })
      ).status,
    ).toBe(401)
    expect(
      (await request("/auth/session", { method: "POST", body: { token: jwt } }))
        .status,
    ).toBe(401)
    expect(
      (
        await request("/auth/session", {
          method: "POST",
          managed: true,
          bearer: token,
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request("/client-access/session", {
          managed: true,
          cookie: "tdz_client_auth=invalid",
          bearer: token,
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request("/client-access/session", {
          method: "POST",
          managed: true,
          origin: "https://unrelated.invalid",
          body: { code: created.code },
        })
      ).status,
    ).toBe(401)
  })

  it("starts only assigned games with host-scoped retry identity and immediately enforces unassign/rotation", async () => {
    const created = await createClient([quizId, secondId])
    const { cookie } = await exchange(created.code)
    const requestId = randomUUID()
    const first = await launch(cookie, quizId, requestId)
    expect(first.status).toBe(201)
    const room = (await first.json()) as ManagedClientLaunchResponse
    expect(room.hostUrl).toBe(`/party/manager/${room.gameId}`)
    expect(await (await launch(cookie, quizId, requestId)).json()).toEqual(room)
    expect((await launch(cookie, secondId, requestId)).status).toBe(409)
    expect((await launch(cookie, strangerQuizId)).status).toBe(404)
    expect(Registry.getInstance().getAllGames()).toHaveLength(1)
    const game = Registry.getInstance().getGameById(room.gameId)
    expect(game).toMatchObject({
      contentOwnerId: owner,
      managedClientId: created.client.id,
      sourceQuizId: quizId,
    })
    expect(game?.manager.clientId).toBe(created.client.id)
    expect(
      (
        await request(`/games/${room.gameId}/display-media`, {
          managed: true,
          cookie,
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request(`/games/${room.gameId}/display-media`, {
          managed: true,
          cookie: "tdz_client_auth=invalid",
          bearer: token,
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request("/games/check", {
          method: "POST",
          managed: true,
          cookie,
          body: { inviteCode: room.inviteCode },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request("/games/check", {
          method: "POST",
          managed: true,
          cookie: "tdz_client_auth=invalid",
          bearer: token,
          body: { inviteCode: room.inviteCode },
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request(`/games/${room.gameId}/settings`, {
          method: "PATCH",
          managed: true,
          cookie,
          body: { answersOnly: true },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request(`/games/${room.gameId}/settings`, {
          method: "PATCH",
          bearer: strangerToken,
          body: { answersOnly: true },
        })
      ).status,
    ).toBe(404)
    await request(`/managed-clients/${created.client.id}/games`, {
      method: "PUT",
      bearer: token,
      body: { gameIds: [secondId] },
    })
    expect(
      (await request(`/games/${room.gameId}/roster`, { managed: true, cookie }))
        .status,
    ).toBe(404)
    expect(
      (
        await request(`/games/${room.gameId}/display-media`, {
          managed: true,
          cookie,
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await request("/games/check", {
          method: "POST",
          managed: true,
          cookie,
          body: { inviteCode: room.inviteCode },
        })
      ).status,
    ).toBe(404)
    expect((await launch(cookie, quizId)).status).toBe(404)
    expect((await launch(cookie, secondId)).status).toBe(201)
    const claims = await verifyToken(cookie.slice("tdz_client_auth=".length))
    expect(game && canHostGame(claims, game)).toBe(false)
    const rotated = await request(
      `/managed-clients/${created.client.id}/rotate-code`,
      { method: "POST", bearer: token },
    )
    expect(rotated.status).toBe(200)
    expect(
      (
        await request("/client-access/session", {
          managed: true,
          cookie,
          bearer: token,
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request("/client-access/session", {
          method: "POST",
          managed: true,
          body: { code: created.code },
        })
      ).status,
    ).toBe(401)
  })

  it("charges incorrect and malformed login attempts against a durable bound", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request("/client-access/session", {
        method: "POST",
        managed: true,
        body: { code: attempt % 2 ? "wrong" : "000000" },
      })
      expect(response.status).toBe(401)
    }

    closeAccountDb()
    const denied = await request("/client-access/session", {
      method: "POST",
      managed: true,
      body: { code: "000000" },
    })
    expect(denied.status).toBe(429)
    expect(Number(denied.headers.get("Retry-After"))).toBeGreaterThan(0)
  })

  it("binds real HTTP login budgets to the canonical ingress host and rejects spoofed or duplicate address headers", async () => {
    vi.stubEnv("TADAZZ_MANAGED_CLIENT_TRUST_PROXY", "loopback")
    vi.stubEnv("TADAZZ_MANAGED_CLIENT_PROXY_HOST", "tadazz.com")
    const charge = vi.spyOn(ManagedClientStore.prototype, "consumeLoginBudget")
    const server = createAdaptorServer({ fetch: app.fetch })
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve)
    })
    const { port } = server.address() as AddressInfo
    const attempt = (host: string, headers: string[]) =>
      new Promise<number | undefined>((resolve, reject) => {
        const incoming = nodeRequest(
          {
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/api/client-access/session",
            agent: false,
            headers: [
              "Host",
              host,
              "Origin",
              `http://${host}`,
              "Content-Type",
              "application/json",
              "X-Tadazz-Session",
              "managed-client",
              ...headers,
            ],
          },
          (response) => {
            response.resume()
            response.once("end", () => {
              resolve(response.statusCode)
            })
          },
        )
        incoming.once("error", reject)
        incoming.end(JSON.stringify({ code: "000000" }))
      })

    try {
      expect(
        await attempt("tadazz.com", ["X-Tadazz-Client-IP", "192.0.2.7"]),
      ).toBe(401)
      expect(
        await attempt("preview.example.invalid", [
          "X-Tadazz-Client-IP",
          "192.0.2.8",
        ]),
      ).toBe(401)
      expect(
        await attempt("tadazz.com", [
          "X-Tadazz-Client-IP",
          "192.0.2.9",
          "x-tadazz-client-ip",
          "192.0.2.9",
        ]),
      ).toBe(401)
      expect(
        await attempt("tadazz.com", [
          "X-Forwarded-For",
          "192.0.2.10",
          "X-Real-IP",
          "192.0.2.11",
        ]),
      ).toBe(401)
      expect(charge.mock.calls.map(([address]) => address)).toEqual([
        "192.0.2.7",
        "127.0.0.1",
        "127.0.0.1",
        "127.0.0.1",
      ])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    }
  })

  it("launches the original installed custom theme with its music/media and charges/saves under its owner", async () => {
    const store = packageStore()
    const principal = {
      userId: owner,
      tenantId: owner,
      grants: ["author"] as const,
    }
    const fixture = createPackageFixture("declarative", "managed-private")
    const author = { ...principal, grants: [...principal.grants] }
    const uploaded = store.upload(author, fixture.bytes, randomUUID())
    store.requestBuild(author, uploaded.uploadId)
    const job = join(store.tenantRoot(owner), "jobs", uploaded.uploadId)
    const bundle = Buffer.from("{}")
    // Trusted-worker unit double; browser qualification separately exercises the
    // real worker/renderer. Native install, media and Game resolution are real.
    writeFileSync(join(job, "bundle.json"), bundle)
    writeFileSync(
      join(job, "result.json"),
      JSON.stringify({
        sourceDigest: uploaded.sourceDigest,
        outputDigest: packageSha(bundle),
        mediaValidated: true,
      }),
    )
    store.acceptBuild(author, uploaded.uploadId)
    const built = store.details(author, uploaded.uploadId)
    store.install(author, built.uploadId, built.revision, [
      "fixture-managed-private",
    ])
    const theme = store
      .catalog(owner)
      .find((item) => item.id === "fixture-managed-private")
    expect(theme).toBeDefined()
    const music = theme?.assets.find((asset) => asset.id === "music")
    const variant = theme?.audioEvents.answersMusic.variants[0]
    expect(music).toBeDefined()
    const reserve = vi.spyOn(billing, "reserveBilledGame")
    await withAccount(owner, () => {
      const quiz = getQuizzById(quizId)
      const extras = createDefaultQuizExtrasV2(
        quizId,
        quiz.questions.map(() => randomUUID()),
        computeCanonicalBaseDigest(quiz),
      )
      extras.defaults.showTheme = {
        id: "fixture-managed-private",
        version: "1.0.0",
        legacyPolicy: "theme-defaults",
        overrides: { audio: { answersMusic: { variantId: variant?.id } } },
      }
      writeSidecar(getPath, quizId, extras)
    })
    const original = await withAccount(owner, () =>
      readFileSync(getPath(`extensions/quizzes/${quizId}.json`), "utf8"),
    )
    const created = await createClient()
    const { cookie } = await exchange(created.code)
    const launched = await launch(cookie)
    expect(launched.status).toBe(201)
    const room = (await launched.json()) as ManagedClientLaunchResponse
    const game = Registry.getInstance().getGameById(room.gameId)
    expect(game).toBeDefined()
    expect(reserve).toHaveBeenCalledWith(owner, room.gameId)
    const host = fake.createSocket("managed-host", created.client.id)
    game?.reconnect(host)
    const snapshot = fake.lastEvent(host.id, EVENTS.EXTENSIONS.STATE)
      ?.data as ExtensionStateEnvelope
    const definition = JSON.parse(
      snapshot.extras.themeDefinitionJson as string,
    ) as ShowThemeDefinition
    expect(definition.id).toBe("fixture-managed-private")
    const resolved = resolveShowTheme({
      selection: (
        snapshot.extras.defaults as { showTheme?: unknown } | undefined
      )?.showTheme,
      role: "manager",
      registry: createShowThemeRegistry([definition]),
    })
    expect(resolved.audio.answersMusic.url).toBe(music?.url)
    expect(resolved.audio.answersMusic.volume).toBe(0.2)
    expect(game?.canViewMedia((music?.url ?? "").slice("/media/".length))).toBe(
      true,
    )
    expect(game?.canViewMedia("unassigned-owner-secret.wav")).toBe(false)
    game?.roundManager.finish()
    expect(await withAccount(owner, () => getResultsMeta())).toHaveLength(1)
    expect(
      await withAccount(created.client.id, () => getResultsMeta()),
    ).toHaveLength(0)
    expect(
      await withAccount(owner, () =>
        readFileSync(getPath(`extensions/quizzes/${quizId}.json`), "utf8"),
      ),
    ).toBe(original)
  })

  it("rejects a missing custom theme instead of silently replacing the assigned show", async () => {
    await withAccount(owner, () => {
      const quiz = getQuizzById(quizId)
      const extras = createDefaultQuizExtrasV2(
        quizId,
        quiz.questions.map(() => randomUUID()),
        computeCanonicalBaseDigest(quiz),
      )
      extras.defaults.showTheme = {
        id: "missing-private-theme",
        version: "1.0.0",
        overrides: {},
        legacyPolicy: "preserve-saved",
      }
      writeSidecar(getPath, quizId, extras)
    })
    const created = await createClient()
    const { cookie } = await exchange(created.code)
    const denied = await launch(cookie)
    expect(denied.status).toBe(409)
    expect(await denied.json()).toEqual({
      error: "client-game-theme-unavailable",
    })
    expect(Registry.getInstance().getAllGames()).toHaveLength(0)
  })

  it("uses the same validated owner service for operator create/recovery without accepting a foreign quiz", async () => {
    const requestId = randomUUID()
    const command = {
      operation: "create",
      ownerId: owner,
      quizId,
      name: "Operator synthetic",
      requestId,
    }
    const first = await executeManagedClientOwnerCommand(command)
    expect(first).toHaveProperty("code")
    await expect(
      executeManagedClientOwnerCommand(command),
    ).rejects.toMatchObject({ code: "client-create-already-completed" })
    const recovered = await executeManagedClientOwnerCommand({
      operation: "lookup",
      ownerId: owner,
      quizId,
      requestId,
    })
    expect(recovered).not.toHaveProperty("code")
    expect(recovered.client?.gameIds).toEqual([quizId])
    await expect(
      executeManagedClientOwnerCommand({
        ...command,
        quizId: strangerQuizId,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "client-game-unavailable" })
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx/esm"),
        fileURLToPath(new URL("../index.ts", import.meta.url)),
        "--managed-client-owner",
      ],
      {
        input: JSON.stringify({
          operation: "lookup",
          ownerId: owner,
          quizId,
          requestId,
        }),
        encoding: "utf8",
        env: process.env,
        timeout: 20_000,
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, ...recovered })
    expect(result.stdout.trim().split("\n")).toHaveLength(1)
  })
})

it("authenticates real scoped host/display sockets, denies foreign rooms, and retires active controls on unassign/rotation", async () => {
  const server = createAdaptorServer({ fetch: app.fetch })
  const io = createSocketServer(server)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const created = await createClient()
  const { cookie } = await exchange(created.code)
  const room = (await (
    await launch(cookie)
  ).json()) as ManagedClientLaunchResponse
  const foreign = await request("/games", {
    method: "POST",
    bearer: strangerToken,
    body: { quizzId: strangerQuizId },
  })
  expect(foreign.status).toBe(201)
  const foreignRoom = (await foreign.json()) as {
    gameId: string
    inviteCode: string
  }
  expect(
    (
      await request(`/games/${foreignRoom.gameId}/display-media`, {
        managed: true,
        cookie,
      })
    ).status,
  ).toBe(404)
  expect(
    (
      await request("/games/check", {
        method: "POST",
        managed: true,
        cookie,
        body: { inviteCode: foreignRoom.inviteCode },
      })
    ).status,
  ).toBe(404)
  expect(
    (await request(`/games/${foreignRoom.gameId}/display-media`)).status,
  ).toBe(200)
  expect(
    (
      await request("/games/check", {
        method: "POST",
        body: { inviteCode: foreignRoom.inviteCode },
      })
    ).status,
  ).toBe(200)
  const traces = new WeakMap<ClientSocket, string[]>()
  const makeSocket = (
    origin: string,
    mode: "managed" | "bearer" | "invalid" = "managed",
  ) => {
    const authentication = {
      managed: { managedClient: true, token },
      bearer: { token: cookie.slice("tdz_client_auth=".length) },
      invalid: { managedClient: "invalid", token },
    }
    const auth = authentication[mode]
    const socket = connect(url, {
      path: "/ws",
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth,
      extraHeaders: { Cookie: cookie, Origin: origin },
    })
    const trace: string[] = []
    traces.set(socket, trace)
    socket.onAny((name: string, value: unknown) => {
      if (trace.length < 30) {
        trace.push(
          name === EVENTS.GAME.ERROR_MESSAGE &&
            typeof value === "string" &&
            value.startsWith("errors:")
            ? `${name}:${value}`
            : name,
        )
      }
    })
    socket.on("connect", () => {
      trace.push("connect")
    })
    socket.on("connect_error", () => {
      trace.push("connect_error")
    })
    socket.on("disconnect", () => {
      trace.push("disconnect")
    })
    sockets.push(socket)

    return socket
  }
  const event = <T = unknown>(socket: ClientSocket, name: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Missing ${name}; observed ${JSON.stringify(traces.get(socket))}`,
          ),
        )
      }, 5000)
      socket.once(name, (value: T) => {
        clearTimeout(timer)
        resolve(value)
      })
    })

  try {
    for (const [origin, mode] of [
      ["https://unrelated.invalid", "managed"],
      [url, "bearer"],
      [url, "invalid"],
    ] as const) {
      const invalid = makeSocket(origin, mode)
      const error = await event<Error & { data?: { code: string } }>(
        invalid,
        "connect_error",
      )
      expect(error.data?.code).toBe("TOKEN_INVALID")
    }

    const client = makeSocket(url)
    await event(client, "connect")
    const reconnect = event(client, EVENTS.MANAGER.SUCCESS_RECONNECT)
    client.emit(EVENTS.MANAGER.RECONNECT, { gameId: room.gameId })
    expect(await reconnect).toMatchObject({ gameId: room.gameId })
    expect(await client.timeout(5000).emitWithAck("extensions:clock")).toEqual(
      expect.any(Number),
    )
    const unknownDenied = event(client, EVENTS.GAME.ERROR_MESSAGE)
    client.emit("unregistered:managed-event", { gameId: room.gameId })
    expect(await unknownDenied).toBe("errors:auth.unauthorized")
    const display = makeSocket(url)
    await event(display, "connect")
    const joined = event(display, EVENTS.SPECTATOR.SUCCESS_JOIN)
    display.emit(EVENTS.SPECTATOR.JOIN, { gameId: room.gameId })
    expect(await joined).toMatchObject({ gameId: room.gameId })
    for (const gameId of [randomUUID(), foreignRoom.gameId]) {
      for (const name of [EVENTS.SPECTATOR.JOIN, EVENTS.SPECTATOR.LEAVE]) {
        const deniedDisplay = event(display, EVENTS.GAME.ERROR_MESSAGE)
        display.emit(name, { gameId })
        expect(await deniedDisplay).toBe("errors:auth.unauthorized")
      }
    }

    expect(
      Registry.getInstance()
        .getGameById(foreignRoom.gameId)
        ?.getSpectatorCount(),
    ).toBe(0)
    const disconnected = Promise.all([
      event(client, "disconnect"),
      event(display, "disconnect"),
    ])
    new ManagedClientStore().assign(owner, created.client.id, [])
    expect(await disconnected).toEqual([
      "io server disconnect",
      "io server disconnect",
    ])
    expect(
      (
        await request(`/games/${room.gameId}/roster`, {
          managed: true,
          cookie,
          bearer: token,
        })
      ).status,
    ).toBe(404)

    new ManagedClientStore().assign(owner, created.client.id, [quizId])
    const restoredHost = makeSocket(url)
    await event(restoredHost, "connect")
    const restored = event(restoredHost, EVENTS.MANAGER.SUCCESS_RECONNECT)
    restoredHost.emit(EVENTS.MANAGER.RECONNECT, { gameId: room.gameId })
    expect(await restored).toMatchObject({ gameId: room.gameId })
    const restoredDisplay = makeSocket(url)
    await event(restoredDisplay, "connect")
    const restoredJoin = event(restoredDisplay, EVENTS.SPECTATOR.SUCCESS_JOIN)
    restoredDisplay.emit(EVENTS.SPECTATOR.JOIN, { gameId: room.gameId })
    expect(await restoredJoin).toMatchObject({ gameId: room.gameId })
    const rotated = Promise.all([
      event(restoredHost, "disconnect"),
      event(restoredDisplay, "disconnect"),
    ])
    new ManagedClientStore().rotate(owner, created.client.id)
    expect(await rotated).toEqual([
      "io server disconnect",
      "io server disconnect",
    ])
    const retired = makeSocket(url)
    const retiredError = await event<Error & { data?: { code: string } }>(
      retired,
      "connect_error",
    )
    expect(retiredError.data?.code).toBe("TOKEN_INVALID")
  } finally {
    for (const socket of sockets.splice(0)) {
      socket.disconnect()
    }

    await io.close()
    setIo(fake.io)
  }
})

it("revalidates an ordinary owner's retained authority after display conversion and explicit logout", async () => {
  const server = createAdaptorServer({ fetch: app.fetch })
  const io = createSocketServer(server)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const response = await request("/games", {
    method: "POST",
    bearer: token,
    body: { quizzId: quizId },
  })
  expect(response.status).toBe(201)
  const room = (await response.json()) as { gameId: string }
  const game = Registry.getInstance().getGameById(room.gameId)
  expect(game).toBeDefined()
  const socket = connect(url, {
    path: "/ws",
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: { token },
    autoConnect: false,
  })
  sockets.push(socket)
  const event = <T = unknown>(name: string) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Missing ordinary owner display event ${name}`))
      }, 5000)
      socket.once(name, (value: T) => {
        clearTimeout(timer)
        resolve(value)
      })
    })

  try {
    const connected = event("connect")
    socket.connect()
    await connected
    const joined = event(EVENTS.SPECTATOR.SUCCESS_JOIN)
    socket.emit(EVENTS.SPECTATOR.JOIN, { gameId: room.gameId })
    expect(await joined).toMatchObject({ gameId: room.gameId })
    const serverSocket = io.sockets.sockets.get(socket.id!)
    expect(serverSocket?.data.role).toBe("spectator")
    expect(serverSocket?.data.claims).toMatchObject({
      sub: owner,
      role: "manager",
    })
    expect(game?.locked).toBe(false)
    expect(
      (await request("/auth/logout", { method: "POST", bearer: token })).status,
    ).toBe(200)
    expect((await request("/accounts/me", { bearer: token })).status).toBe(401)
    const disconnected = event("disconnect")
    socket.emit(EVENTS.MANAGER.SET_LOCK, { gameId: room.gameId, locked: true })
    expect(await disconnected).toBe("io server disconnect")
    expect(game?.locked).toBe(false)
  } finally {
    for (const active of sockets.splice(0)) {
      active.disconnect()
    }

    await io.close()
    setIo(fake.io)
  }
})
