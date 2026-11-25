/* oxlint-disable no-await-in-loop -- Resource authorization is checked sequentially against one room. */
import { randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  ManagedClientCodeResponse,
  ManagedClientLaunchResponse,
} from "@razzia/common/types/managed-clients"
import { createPackageFixture } from "@razzia/extensions/testkit/package-fixtures"
import { packageSha } from "@razzia/extensions/server"
import { app } from "@razzia/socket/app"
import {
  closeAccountDb,
  getAccountDb,
} from "@razzia/socket/services/account-db"
import { withAccount } from "@razzia/socket/services/account-scope"
import { mintToken } from "@razzia/socket/services/auth"
import { getPath } from "@razzia/socket/services/config"
import { setIo } from "@razzia/socket/services/io"
import { ManagedClientStore } from "@razzia/socket/services/managed-clients"
import {
  closePackageStore,
  packageStore,
} from "@razzia/socket/services/package-installation"
import Registry from "@razzia/socket/services/registry"
import { closeThemeInstallationStore } from "@razzia/socket/services/theme-installation"
import { createFakeIo } from "@razzia/socket/test/fake-io"

const ownerId = "e5d037c9-435a-48f4-aae6-dc7ef017e268"
const style = "managed-resources"
const themeId = `fixture-${style}`
let directory = ""
let ownerToken = ""
let sourceDigest = ""
let quizIds: string[] = []
let fixture = createPackageFixture("complete", style)

function request(
  path: string,
  options: {
    method?: string
    body?: unknown
    cookie?: string
    bearer?: string
    managed?: string
  } = {},
) {
  return app.request(`http://localhost/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      Host: "localhost",
      Origin: "http://localhost",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
      ...(options.managed === undefined
        ? {}
        : { "X-Tadazz-Session": options.managed }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  })
}

function cookie(response: Response, name: string) {
  const value = response.headers
    .getSetCookie()
    .find(
      (item) => item.startsWith(`${name}=`) && !item.startsWith(`${name}=;`),
    )
    ?.split(";")[0]

  if (!value) {
    throw new Error(`Missing synthetic ${name} cookie`)
  }

  return value
}

async function clientRoom(quizId: string) {
  const created = await request("/managed-clients", {
    method: "POST",
    bearer: ownerToken,
    body: {
      name: "Resource fixture client",
      gameIds: [quizId],
      requestId: randomUUID(),
    },
  })
  expect(created.status).toBe(201)
  const client = (await created.json()) as ManagedClientCodeResponse
  const exchange = await request("/client-access/session", {
    method: "POST",
    managed: "managed-client",
    body: { code: client.code },
  })
  expect(exchange.status).toBe(200)
  const sessionCookie = cookie(exchange, "tdz_client_auth")
  const launch = await request(`/client-access/games/${quizId}/launch`, {
    method: "POST",
    managed: "managed-client",
    cookie: sessionCookie,
    body: { requestId: randomUUID() },
  })
  expect(launch.status).toBe(201)
  const room = (await launch.json()) as ManagedClientLaunchResponse

  return { client, room, sessionCookie, roomCookie: cookie(launch, "tdz_room") }
}

beforeEach(async () => {
  closeAccountDb()
  closePackageStore()
  closeThemeInstallationStore()
  directory = mkdtempSync(join(tmpdir(), "tadazz-managed-resources-"))
  vi.stubEnv("CONFIG_PATH", directory)
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
  vi.stubEnv("JWT_SECRET", "synthetic-managed-resource-private-test-secret")
  vi.stubEnv("RESEND_API_KEY", "synthetic-no-network")
  vi.stubEnv("TADAZZ_AUTH_EMAIL_FROM", "qa@example.invalid")
  vi.stubEnv("TADAZZ_PACKAGE_INSTALLER_ENABLED", "true")
  vi.stubEnv("TADAZZ_PACKAGE_RUNTIME_ENABLED", "true")
  vi.stubEnv("TADAZZ_PACKAGE_RUNTIME_ORIGIN", "https://runtime.example.test")
  vi.stubEnv("TADAZZ_PACKAGE_PARENT_ORIGIN", "http://localhost")
  vi.stubEnv("TADAZZ_BILLING_ENABLED", "false")
  setIo(createFakeIo().io)
  getAccountDb()
    .prepare(
      "INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      ownerId,
      "resource-owner@example.invalid",
      "synthetic",
      "synthetic",
      Date.now(),
      Date.now(),
    )
  ;({ token: ownerToken } = await mintToken(ownerId, "manager"))
  fixture = createPackageFixture("complete", style)
  const principal = {
    tenantId: ownerId,
    userId: ownerId,
    grants: ["author" as const],
  }
  const store = packageStore()
  const upload = store.upload(principal, fixture.bytes, randomUUID())
  ;({ sourceDigest } = upload)
  store.requestBuild(principal, upload.uploadId)
  const job = join(store.tenantRoot(ownerId), "jobs", upload.uploadId)
  // Trusted-worker unit double only. The browser case separately runs the real
  // worker and renderer; this suite tests the installed HTTP resource boundary.
  const bundle = Buffer.from("{}")
  writeFileSync(join(job, "bundle.json"), bundle)
  writeFileSync(
    join(job, "result.json"),
    JSON.stringify({
      sourceDigest,
      outputDigest: packageSha(bundle),
      mediaValidated: true,
    }),
  )
  store.acceptBuild(principal, upload.uploadId)
  const ready = store.details(principal, upload.uploadId)
  const installed = store.install(
    principal,
    ready.uploadId,
    ready.revision,
    fixture.manifest.contents.map((item) => item.id),
  )
  quizIds = installed.installedGames
  expect(quizIds).toHaveLength(2)
})

afterEach(() => {
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

it("serves only room-referenced private images and music from the canonical content owner", async () => {
  const access = await clientRoom(quizIds[0])
  for (const file of fixture.manifest.files
    .filter((item) => ["image", "audio"].includes(item.kind))
    .slice(0, 2)) {
    const name = `pkg_${sourceDigest.slice(0, 24)}_${file.sha256}.${file.path.split(".").at(-1)}`
    const response = await request(`/media/raw/${name}`, {
      cookie: access.roomCookie,
    })
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      fixture.files.get(file.path),
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  }
  await withAccount(ownerId, () => {
    mkdirSync(getPath("media"), { recursive: true })
    writeFileSync(
      getPath("media/unassigned-owner-secret.wav"),
      "unassigned private fixture",
    )
  })
  expect(
    (
      await request("/media/raw/unassigned-owner-secret.wav", {
        cookie: access.roomCookie,
      })
    ).status,
  ).toBe(404)
  const noRoom = await request(
    `/media/raw/pkg_${sourceDigest.slice(0, 24)}_missing.png`,
    { cookie: access.sessionCookie },
  )
  expect(noRoom.status).toBe(401)
})

it("issues the selected runtime only for the current assigned host and fails closed on malformed or revoked client mode", async () => {
  const access = await clientRoom(quizIds[0])
  const second = await clientRoom(quizIds[1])
  const runtime = (gameId: string) =>
    `/packages/runtime/${sourceDigest}/${themeId}?roomId=${gameId}`
  const response = await request(runtime(access.room.gameId), {
    cookie: access.sessionCookie,
    managed: "managed-client",
  })
  expect(response.status).toBe(200)
  const url = new URL(((await response.json()) as { url: string }).url)
  expect(url.origin).toBe("https://runtime.example.test")
  expect(url.searchParams.get("theme")).toBe(themeId)
  expect(url.searchParams.get("ticket")).toBeTruthy()
  expect(
    (
      await request(runtime(second.room.gameId), {
        cookie: access.sessionCookie,
        managed: "managed-client",
        bearer: ownerToken,
      })
    ).status,
  ).toBe(404)
  for (const managed of ["invalid", "", "managed-client, invalid"]) {
    expect(
      (
        await request(runtime(access.room.gameId), {
          cookie: access.sessionCookie,
          managed,
          bearer: ownerToken,
        })
      ).status,
    ).toBe(401)
  }
  expect(
    (
      await request(runtime(access.room.gameId), {
        cookie: "tdz_client_auth=invalid",
        managed: "managed-client",
        bearer: ownerToken,
      })
    ).status,
  ).toBe(401)
  new ManagedClientStore().assign(ownerId, access.client.client.id, [])
  expect(
    (
      await request(runtime(access.room.gameId), {
        cookie: access.sessionCookie,
        managed: "managed-client",
        bearer: ownerToken,
      })
    ).status,
  ).toBe(404)
  new ManagedClientStore().rotate(ownerId, access.client.client.id)
  expect(
    (
      await request(runtime(access.room.gameId), {
        cookie: access.sessionCookie,
        managed: "managed-client",
        bearer: ownerToken,
      })
    ).status,
  ).toBe(401)
})
