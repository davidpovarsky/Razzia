/** Mounts the exact proposed hook through Hono's public API; source stays untouched. */
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { once } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { SESSION_ROLES } from "@razzia/common/constants"
import {
  registerAccount,
  consumeCode,
  issueCode,
} from "@razzia/socket/services/account-auth"
import { closeAccountDb } from "@razzia/socket/services/account-db"
import { mintToken } from "@razzia/socket/services/auth"
import { closeThemeInstallationStore } from "@razzia/socket/services/theme-installation"
import { themeRoutes } from "@razzia/socket/api/extensions/theme-routes"
import { builderDocumentFixture } from "../../components/theme-builder/document.fixture"

const root = mkdtempSync(join(tmpdir(), "builder-host-"))
const keys = [
  "CONFIG_PATH",
  "TADAZZ_ACCOUNTS_ENABLED",
  "JWT_SECRET",
  "TADAZZ_THEME_INSTALLER_ENABLED",
  "TADAZZ_THEME_WORKSPACE_GRANTS",
  "NODE_ENV",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let server: ReturnType<typeof serve> | undefined = undefined,
  base = "",
  owner = "",
  authorToken = "",
  strangerToken = "",
  playerToken = ""
beforeAll(async () => {
  closeAccountDb()
  closeThemeInstallationStore()
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.TADAZZ_THEME_INSTALLER_ENABLED = "true"
  process.env.JWT_SECRET =
    "isolated-builder-host-test-key-20261115-not-production"
  process.env.NODE_ENV = "test"
  delete process.env.TADAZZ_THEME_WORKSPACE_GRANTS
  const author = await registerAccount(
    "builder-author@example.invalid",
    "synthetic-test-only-password",
  )
  consumeCode(
    "builder-author@example.invalid",
    "verify",
    issueCode(author.id, "verify"),
  )
  const stranger = await registerAccount(
    "builder-stranger@example.invalid",
    "synthetic-test-only-password",
  )
  consumeCode(
    "builder-stranger@example.invalid",
    "verify",
    issueCode(stranger.id, "verify"),
  )
  owner = author.id
  authorToken = (await mintToken(author.id, SESSION_ROLES.MANAGER)).token
  strangerToken = (await mintToken(stranger.id, SESSION_ROLES.MANAGER)).token
  playerToken = (await mintToken("builder-player", SESSION_ROLES.PLAYER)).token
  const app = new Hono().route("/api/themes", themeRoutes)
  server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 })

  if ("keepAliveTimeout" in server) {
    server.keepAliveTimeout = 60_000
  }

  if (!server.listening) {
    await once(server, "listening")
  }

  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("Missing loopback port")
  }

  base = `http://127.0.0.1:${address.port}/api/themes/builder/${owner}/documents`
}, 90_000)
afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()))
    })
  }

  closeThemeInstallationStore()
  closeAccountDb()
  for (const key of keys) {
    const value = previous[key]

    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
  rmSync(root, { recursive: true, force: true })
})
function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireObservedRecord(value: unknown): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error("Expected an object in the observed JSON value")
  }

  return value
}

async function http(
  path: string,
  token?: string,
  input?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(base + path, {
    method: input ? "PUT" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(input ? { "Content-Type": "application/json" } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  })
  const text = await response.text()

  return { status: response.status, body: text ? JSON.parse(text) : null }
}
it("uses actual verified account auth, tenant assignment, atomic CAS and the existing OFF gate", async () => {
  expect((await http("")).status).toBe(401)
  expect((await http("", playerToken)).status).toBe(401)
  expect((await http("", strangerToken)).status).toBe(404)
  const document = builderDocumentFixture()
  const first = await http("/test-draft", authorToken, {
    expectedRevision: 0,
    document,
  })
  expect(first.status).toBe(200)
  expect(requireObservedRecord(first.body).revision).toBe(1)
  expect(
    requireObservedRecord((await http("/test-draft", authorToken)).body)
      .document,
  ).toEqual(document)
  expect((await http("/test-draft", strangerToken)).status).toBe(404)
  expect(
    (await http("/test-draft", authorToken, { expectedRevision: 0, document }))
      .status,
  ).toBe(409)
  expect(
    (
      await http("/test-draft", authorToken, {
        expectedRevision: 1,
        document,
        tenantId: "foreign",
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await http("/test-draft", authorToken, {
        expectedRevision: 1,
        document: { ...document, formatVersion: 2 },
      })
    ).status,
  ).toBe(400)
  expect(
    requireObservedRecord((await http("/test-draft", authorToken)).body)
      .revision,
  ).toBe(1)
  process.env.TADAZZ_THEME_INSTALLER_ENABLED = "false"
  expect((await http("", authorToken)).status).toBe(404)
  process.env.TADAZZ_THEME_INSTALLER_ENABLED = "true"
  expect(
    requireObservedRecord((await http("/test-draft", authorToken)).body)
      .revision,
  ).toBe(1)
}, 90_000)
