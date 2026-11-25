/* oxlint-disable eslint/init-declarations, eslint/no-await-in-loop, eslint/max-params, typescript/no-non-null-assertion, typescript/no-dynamic-delete -- beforeAll provisions isolated HTTP fixtures; ordered transitions and exact environment restoration are intentional. */
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { once } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { SESSION_ROLES } from "@razzia/common/constants"
import {
  createInstallationFixture,
  picture,
  sound,
} from "@razzia/extensions/server/show-themes/installation.fixture"
import {
  registerAccount,
  issueCode,
  consumeCode,
} from "@razzia/socket/services/account-auth"
import {
  closeAccountDb,
  getAccountDb,
} from "@razzia/socket/services/account-db"
import { mintToken } from "@razzia/socket/services/auth"
import { closeThemeInstallationStore } from "@razzia/socket/services/theme-installation"
import { readRoomMedia } from "./media-routes"
import { themeRoutes } from "./theme-routes"

const root = mkdtempSync(join(tmpdir(), "theme-http-isolation-"))
const keys = [
  "CONFIG_PATH",
  "TADAZZ_ACCOUNTS_ENABLED",
  "JWT_SECRET",
  "TADAZZ_THEME_INSTALLER_ENABLED",
  "TADAZZ_THEME_WORKSPACE_GRANTS",
  "NODE_ENV",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
const app = new Hono()
  .route("/api/themes", themeRoutes)
  .get("/api/media/raw/:name", readRoomMedia)
let server: ReturnType<typeof serve> | undefined
let url: string
let author: { id: string; token: string }
let reviewer: { id: string; token: string }
let stranger: { id: string; token: string }
async function account(email: string) {
  const user = await registerAccount(email, "test-only-long-password")
  consumeCode(email, "verify", issueCode(user.id, "verify"))

  return {
    id: user.id,
    token: (await mintToken(user.id, SESSION_ROLES.MANAGER)).token,
  }
}
beforeAll(async () => {
  closeAccountDb()
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.TADAZZ_THEME_INSTALLER_ENABLED = "true"
  process.env.JWT_SECRET = `isolated-theme-http-signing-test-only-${"a".repeat(32)}`
  process.env.NODE_ENV = "test"
  author = await account("author@example.invalid")
  reviewer = await account("reviewer@example.invalid")
  stranger = await account("stranger@example.invalid")
  process.env.TADAZZ_THEME_WORKSPACE_GRANTS = JSON.stringify({
    [author.id]: {
      [author.id]: ["author", "publish"],
      platform: ["author", "platform"],
    },
    [reviewer.id]: {
      [author.id]: ["review", "publish"],
      platform: ["review", "publish", "platform"],
    },
  })
  server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 })
  // Keep the fixture's connections alive for the whole case under the remote
  // CPU quota. A five-second idle close raced Node fetch's pooled connection.
  Object.assign(server, { keepAliveTimeout: 60_000 })

  if (!server.listening) {
    await once(server, "listening")
  }

  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("Missing test port")
  }

  url = `http://127.0.0.1:${address.port}/api`
}, 30_000)
afterAll(async () => {
  const activeServer = server

  if (activeServer) {
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  closeThemeInstallationStore()
  closeAccountDb()
  for (const key of keys) {
    const value = previous[key]

    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  rmSync(root, { recursive: true, force: true })
})
const httpFetch: typeof fetch = async (input, init) => {
  try {
    const response = await fetch(input, init)
    // Drain even error/status-only responses before reusing the HTTP connection.
    const body = await response.arrayBuffer()

    return new Response(body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    const { cause } = error as Error & { cause?: Error }
    throw new Error(
      `HTTP ${init?.method ?? "GET"} ${input instanceof Request ? input.url : String(input)} failed: ${String(cause ?? error)}`,
    )
  }
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` })
function jsonRequest(
  path: string,
  token: string,
  body: unknown,
  method = "POST",
) {
  return httpFetch(url + path, {
    method,
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

it("enforces verified HTTP auth, tenant-private upload, independent review, signed persistence and private media", async () => {
  expect((await httpFetch(`${url}/themes/catalog`)).status).toBe(401)
  const player = await mintToken("theme-test-player", SESSION_ROLES.PLAYER)
  expect(
    (
      await httpFetch(`${url}/themes/catalog`, {
        headers: headers(player.token),
      })
    ).status,
  ).toBe(401)
  const base = `/themes/workspaces/${author.id}/drafts`
  expect(
    (
      await httpFetch(url + base, {
        method: "POST",
        headers: {
          ...headers(author.token),
          "Content-Type": "application/json",
        },
        body: "{",
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await httpFetch(url + base, {
        method: "POST",
        headers: {
          ...headers(author.token),
          "Content-Type": "application/json",
        },
        body: "x".repeat(1_000_001),
      })
    ).status,
  ).toBe(413)
  expect(
    (await jsonRequest(base, stranger.token, createInstallationFixture()))
      .status,
  ).toBe(404)
  expect(
    (
      await jsonRequest(base, author.token, {
        ...createInstallationFixture(),
        tenantId: stranger.id,
      })
    ).status,
  ).toBe(400)
  const created = await jsonRequest(
    base,
    author.token,
    createInstallationFixture(),
  )
  expect(created.status).toBe(201)
  const { artifactId } = (await created.json()) as { artifactId: string }
  const artifact = `${base}/${artifactId}`
  for (const [id, bytes] of [
    ["picture", picture],
    ["sound", sound],
  ] as const) {
    const response = await httpFetch(`${url}${artifact}/assets/${id}`, {
      method: "PUT",
      headers: headers(author.token),
      body: new Uint8Array(bytes),
    })
    expect(response.status).toBe(200)
  }
  expect(
    (
      await httpFetch(`${url}${artifact}/assets/picture`, {
        headers: headers(stranger.token),
      })
    ).status,
  ).toBe(404)
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "validate",
      })
    ).status,
  ).toBe(200)
  const preview = await httpFetch(`${url}${artifact}/preview`, {
    headers: headers(author.token),
  })
  expect(preview.headers.get("cache-control")).toContain("no-store")
  const previewReceipt = (await preview.json()) as {
    definition: ReturnType<typeof createInstallationFixture>
    revision: number
    manifestSha256: string
  }
  const { definition } = previewReceipt
  const mediaName = definition.assets[0].url.split("/").at(-1)!
  let previewCookie = preview.headers.get("set-cookie")?.split(";")[0]
  expect(previewCookie).toContain("tdz_theme_preview=")
  const privatePreview = await httpFetch(`${url}/media/raw/${mediaName}`, {
    headers: { Cookie: previewCookie! },
  })
  expect(privatePreview.status).toBe(200)
  expect(Buffer.from(await privatePreview.arrayBuffer())).toEqual(picture)
  expect(
    (
      await httpFetch(`${url}/media/raw/${mediaName}`, {
        headers: { Cookie: `tdz_media_auth=${author.token}` },
      })
    ).status,
  ).toBe(404)
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "publish",
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "request-review",
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(`${artifact}/rejection`, reviewer.token, {
        expectedRevision: 1,
        reason: "Exercise an actual private revision",
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(
        artifact,
        author.token,
        { expectedRevision: 1, manifest: createInstallationFixture() },
        "PUT",
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await httpFetch(`${url}/media/raw/${mediaName}`, {
        headers: { Cookie: previewCookie! },
      })
    ).status,
  ).toBe(401)
  for (const [assetId, bytes] of [
    ["picture", picture],
    ["sound", sound],
  ] as const) {
    expect(
      (
        await httpFetch(`${url}${artifact}/assets/${assetId}`, {
          method: "PUT",
          headers: headers(author.token),
          body: new Uint8Array(bytes),
        })
      ).status,
    ).toBe(200)
  }
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "validate",
      })
    ).status,
  ).toBe(200)
  const revisedPreview = await httpFetch(`${url}${artifact}/preview`, {
    headers: headers(author.token),
  })
  const revised = (await revisedPreview.json()) as {
    revision: number
    manifestSha256: string
  }
  previewCookie = revisedPreview.headers.get("set-cookie")?.split(";")[0]
  expect(revised.revision).toBe(2)
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "request-review",
      })
    ).status,
  ).toBe(200)
  const approval = {
    approved: true,
    expectedRevision: revised.revision,
    manifestSha256: revised.manifestSha256,
    qaEvidenceSha256: "e".repeat(64),
    rightsReviewed: true,
    contentReviewed: true,
    accessibilityReviewed: true,
    performanceReviewed: true,
  }
  expect(
    (
      await jsonRequest(`${artifact}/approval`, reviewer.token, {
        ...approval,
        expectedRevision: 1,
      })
    ).status,
  ).toBe(409)
  expect(
    (await jsonRequest(`${artifact}/approval`, author.token, approval)).status,
  ).toBe(403)
  expect(
    (await jsonRequest(`${artifact}/approval`, reviewer.token, approval))
      .status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "stage",
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(`${artifact}/actions`, author.token, {
        action: "publish",
      })
    ).status,
  ).toBe(200)
  closeThemeInstallationStore()
  const catalog = await httpFetch(`${url}/themes/catalog`, {
    headers: headers(author.token),
  })
  expect(
    ((await catalog.json()) as { definitions: unknown[] }).definitions,
  ).toHaveLength(1)
  const foreign = await httpFetch(`${url}/themes/catalog`, {
    headers: headers(stranger.token),
  })
  expect(
    ((await foreign.json()) as { definitions: unknown[] }).definitions,
  ).toEqual([])
  expect(
    (await jsonRequest(base, author.token, createInstallationFixture())).status,
  ).toBe(409)
  const ownMedia = await httpFetch(`${url}/media/raw/${mediaName}`, {
    headers: { Cookie: `tdz_media_auth=${author.token}` },
  })
  expect(ownMedia.status).toBe(200)
  expect(Buffer.from(await ownMedia.arrayBuffer())).toEqual(picture)
  expect(ownMedia.headers.get("content-type")).toBe("image/png")
  expect(ownMedia.headers.get("cache-control")).toBe("private, no-store")
  const range = await httpFetch(`${url}/media/raw/${mediaName}`, {
    headers: { Cookie: `tdz_media_auth=${author.token}`, Range: "bytes=0-15" },
  })
  expect(range.status).toBe(206)
  expect(Buffer.from(await range.arrayBuffer())).toEqual(
    picture.subarray(0, 16),
  )
  expect(range.headers.get("content-range")).toBe(
    `bytes 0-15/${picture.length}`,
  )
  expect((await httpFetch(`${url}/media/raw/${mediaName}`)).status).toBe(401)
  expect(
    (
      await httpFetch(`${url}/media/raw/${mediaName}`, {
        headers: { Cookie: `tdz_media_auth=${stranger.token}` },
      })
    ).status,
  ).toBe(404)
  const events = await httpFetch(
    `${url}/themes/workspaces/${author.id}/audit`,
    { headers: headers(reviewer.token) },
  )
  expect(
    ((await events.json()) as { events: Array<{ action: string }> }).events.map(
      (e) => e.action,
    ),
  ).toContain("publish")
  expect(
    (
      await httpFetch(`${url}/themes/workspaces/${author.id}/audit`, {
        headers: headers(stranger.token),
      })
    ).status,
  ).toBe(404)
  const platformBase = "/themes/workspaces/platform/drafts"
  const platformDefinition = createInstallationFixture(
    "1.0.0",
    "declarative",
    "qa-platform",
  )
  expect(
    (await jsonRequest(platformBase, stranger.token, platformDefinition))
      .status,
  ).toBe(404)
  const platformDraft = await jsonRequest(
    platformBase,
    author.token,
    platformDefinition,
  )
  expect(platformDraft.status).toBe(201)
  const platformId = ((await platformDraft.json()) as { artifactId: string })
    .artifactId
  const platformPath = `${platformBase}/${platformId}`
  for (const [assetId, bytes] of [
    ["picture", picture],
    ["sound", sound],
  ] as const) {
    expect(
      (
        await httpFetch(`${url}${platformPath}/assets/${assetId}`, {
          method: "PUT",
          headers: headers(author.token),
          body: new Uint8Array(bytes),
        })
      ).status,
    ).toBe(200)
  }
  expect(
    (
      await jsonRequest(`${platformPath}/actions`, author.token, {
        action: "validate",
      })
    ).status,
  ).toBe(200)
  const platformPreview = await httpFetch(`${url}${platformPath}/preview`, {
    headers: headers(author.token),
  })
  const platformReceipt = (await platformPreview.json()) as {
    revision: number
    manifestSha256: string
    definition: ReturnType<typeof createInstallationFixture>
  }
  expect(
    (
      await jsonRequest(`${platformPath}/actions`, author.token, {
        action: "request-review",
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(`${platformPath}/approval`, reviewer.token, {
        ...approval,
        expectedRevision: platformReceipt.revision,
        manifestSha256: platformReceipt.manifestSha256,
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(`${platformPath}/actions`, author.token, {
        action: "stage",
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await jsonRequest(`${platformPath}/actions`, reviewer.token, {
        action: "stage",
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await jsonRequest(`${platformPath}/actions`, reviewer.token, {
        action: "publish",
      })
    ).status,
  ).toBe(200)
  const shared = await httpFetch(`${url}/themes/catalog`, {
    headers: headers(stranger.token),
  })
  expect(
    (
      (await shared.json()) as { definitions: Array<{ id: string }> }
    ).definitions.map((item) => item.id),
  ).toEqual(["qa-platform"])
  const sharedName = platformReceipt.definition.assets[0].url.split("/").at(-1)!
  expect(
    (
      await httpFetch(`${url}/media/raw/${sharedName}`, {
        headers: { Cookie: `tdz_media_auth=${stranger.token}` },
      })
    ).status,
  ).toBe(200)
  expect(
    (await jsonRequest(base, author.token, platformDefinition)).status,
  ).toBe(409)
  process.env.TADAZZ_THEME_INSTALLER_ENABLED = "false"
  expect(
    (
      await httpFetch(`${url}/themes/catalog`, {
        headers: headers(author.token),
      })
    ).status,
  ).toBe(404)
  process.env.TADAZZ_THEME_INSTALLER_ENABLED = "true"
  getAccountDb().prepare("DELETE FROM sessions WHERE user_id=?").run(author.id)
  expect(
    (
      await httpFetch(`${url}/themes/catalog`, {
        headers: headers(author.token),
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await httpFetch(`${url}/media/raw/${mediaName}`, {
        headers: { Cookie: previewCookie! },
      })
    ).status,
  ).toBe(401)
}, 60_000)
