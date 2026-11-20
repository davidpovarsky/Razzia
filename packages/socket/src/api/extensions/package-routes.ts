import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { HTTPException } from "hono/http-exception"
import { getCookie, setCookie } from "hono/cookie"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { SESSION_ROLES } from "@razzia/common/constants"
import {
  PackageError,
  inspectPackage,
  issueRuntimeAccess,
  normalizePackageDocument,
  packageMediaName,
  packageReviewSchema,
  CompositeStorageService,
  packageThemeDefinitions,
  ThemeInstallationError,
} from "@razzia/extensions/server"
import { PACKAGE_LIMITS } from "@razzia/extensions/core"
import { tadaShowV1Schema } from "@razzia/extensions/core"
import { requireManager, readClaims } from "@razzia/socket/api/middleware"
import type { ApiEnv } from "@razzia/socket/api/factory"
import {
  packageInstallerEnabled,
  packageRuntimeEnabled,
  packageRuntimeSecret,
  packageStore,
} from "@razzia/socket/services/package-installation"
import { themeWorkspacePrincipal } from "@razzia/socket/services/theme-installation"
import { packageTransfers } from "@razzia/socket/services/package-transfers"
import Registry from "@razzia/socket/services/registry"
import { verifyMediaAccess } from "@razzia/socket/services/media-access"
import {
  getPath,
  getQuizzById,
  saveQuizz,
  updateQuizz,
  deleteQuizz,
} from "@razzia/socket/services/config"

const revisionSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  selected: z.array(z.string().max(80)).min(1).max(40),
  useClassicWhenThemeSkipped: z.boolean().default(false),
})
const app = new Hono<ApiEnv>()
let activeImports = 0
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store")

  if (!packageInstallerEnabled()) {
    return c.json({ error: "not-found" }, 404)
  }

  await next()

  if (c.res.status >= 400 && !["GET", "HEAD"].includes(c.req.method)) {
    c.header("Connection", "close")
  }
})

// Initialize/recover the enabled private store during API composition, before listen.
if (packageInstallerEnabled()) {
  packageStore()
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: "PACKAGE_REQUEST_LIMIT" }, error.status)
  }

  if (error instanceof PackageError) {
    return c.json({ error: error.code }, error.status)
  }

  if (error instanceof ThemeInstallationError) {
    return c.json(
      {
        error: error.status === 404 ? "PACKAGE_NOT_FOUND" : "PACKAGE_FORBIDDEN",
      },
      error.status,
    )
  }

  if (error instanceof z.ZodError) {
    return c.json({ error: "PACKAGE_SCHEMA" }, 422)
  }

  // Parser/build input diagnostics are stable codes, never stack/source/credentials.
  if (error.message.startsWith("PACKAGE_")) {
    return c.json({ error: error.message.split(":")[0] }, 422)
  }

  return c.json({ error: "PACKAGE_REQUEST_FAILED" }, 400)
})
app.get("/capabilities", requireManager, (c) =>
  c.json({ installer: true, runtime: packageRuntimeEnabled() }),
)
app.get("/runtime/:source/:themeId", async (c) => {
  if (!packageRuntimeEnabled()) {
    return c.json({ error: "not-found" }, 404)
  }

  const claims = await readClaims(c)
  let owner: string | undefined = undefined
  const roomId = c.req.query("roomId")
  const game = roomId ? Registry.getInstance().getGameById(roomId) : null

  if (claims?.role === SESSION_ROLES.MANAGER) {
    owner = themeWorkspacePrincipal(
      claims.sub,
      c.req.header("X-Tadazz-Workspace") ?? claims.sub,
    ).tenantId
  }

  // Same public unguessable-room boundary as /games/:id/display-media; below
  // we additionally require that room to reference this exact package's media.
  if (game) {
    owner = game.manager.clientId
  }

  if (!owner) {
    const token = getCookie(c, "tdz_room")

    if (!token || !game) {
      return c.json({ error: "unauthorized" }, 401)
    }

    try {
      if ((await verifyMediaAccess(token)).gameId === roomId) {
        owner = game.manager.clientId
      }
    } catch {
      /* Fail closed */
    }
  }

  if (!owner) {
    return c.json({ error: "unauthorized" }, 401)
  }

  const store = packageStore()
  const row = store.db
    .prepare(
      "SELECT upload FROM packages WHERE tenant=? AND source=? AND phase IN ('preview-ready','installed')",
    )
    .get(owner, c.req.param("source"))

  if (!row) {
    return c.json({ error: "not-found" }, 404)
  }

  const principal = { tenantId: owner, userId: owner, grants: [] }
  const receipt = store.details(principal, String(row.upload))
  const theme = receipt.manifest.contents.find(
    (t) =>
      t.id === c.req.param("themeId") && t.kind === "sandboxed-react-theme",
  )

  if (!theme) {
    return c.json({ error: "not-found" }, 404)
  }

  // Guests must be in a room referencing an asset unique to this immutable package.
  if (
    game &&
    !receipt.manifest.files.some((f) =>
      game.canViewMedia(
        `pkg_${c.req.param("source").slice(0, 24)}_${f.sha256}.${f.path.split(".").at(-1)}`,
      ),
    )
  ) {
    return c.json({ error: "not-found" }, 404)
  }

  const origin = process.env.TADAZZ_PACKAGE_RUNTIME_ORIGIN
  const parent = process.env.TADAZZ_PACKAGE_PARENT_ORIGIN

  if (!origin || !parent || new URL(origin).origin === new URL(parent).origin) {
    return c.json({ error: "PACKAGE_RUNTIME_ORIGIN" }, 409)
  }

  const ticket = issueRuntimeAccess(
    store,
    principal,
    String(row.upload),
    packageRuntimeSecret(),
  )

  return c.json({
    url: `${new URL(origin).origin}/render?ticket=${encodeURIComponent(ticket)}&theme=${encodeURIComponent(theme.id)}`,
  })
})
// A five-minute ticket stages only the exact bytes declared by an authenticated
// MCP call. It has no read, build, install, or account authority.
app.post(
  "/mcp-transfer/:ticket",
  bodyLimit({ maxSize: PACKAGE_LIMITS.archiveBytes }),
  async (c) => {
    const transfers = packageTransfers()
    const expectedBytes = transfers.ticketUploadSize(c.req.param("ticket"))
    const declared = c.req.header("Content-Length")
    if (
      declared &&
      (!/^[0-9]+$/u.test(declared) || Number(declared) !== expectedBytes)
    ) {
      return c.json({ error: "PACKAGE_TRANSFER_INPUT" }, 422)
    }
    if (activeImports >= 2) return c.json({ error: "PACKAGE_IMPORT_BUSY" }, 429)
    activeImports += 1
    try {
      return c.json(
        transfers.receiveTicket(
          c.req.param("ticket"),
          Buffer.from(await c.req.arrayBuffer()),
        ),
      )
    } finally {
      activeImports -= 1
    }
  },
)
app.get("/mcp-export/:ticket", (c) => {
  const store = packageStore()
  const ticket = packageTransfers().readExportTicket(c.req.param("ticket"))
  const p = { tenantId: ticket.owner, userId: ticket.owner, grants: [] }
  const receipt = store.details(p, ticket.uploadId)
  if (
    receipt.sourceDigest !== ticket.sourceDigest ||
    receipt.revision !== ticket.revision
  )
    throw new PackageError("PACKAGE_DIGEST_CHANGED", 409)
  const bytes = store.export(p, ticket.uploadId)
  return c.body(Uint8Array.from(bytes).buffer, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="package.tadazz"',
  })
})
app.use("*", requireManager)
app.use("*", async (c, next) => {
  const importBody =
    c.req.method === "POST" && /\/(?:preflight|uploads)$/u.test(c.req.path)

  if (!importBody) {
    await next()

    return
  }

  if (activeImports >= 2) {
    c.header("Retry-After", "3")

    return c.json({ error: "PACKAGE_IMPORT_BUSY" }, 429)
  }

  activeImports += 1

  try {
    await next()
  } finally {
    activeImports -= 1
  }
})
const rateWindows = new Map<string, { start: number; count: number }>()
app.use("*", async (c, next) => {
  const now = Date.now(),
    mutation = !["GET", "HEAD"].includes(c.req.method)
  const key = `${c.get("claims").sub}:${mutation ? "write" : "read"}`
  for (const [id, value] of rateWindows) {
    if (now - value.start > 60_000) {
      rateWindows.delete(id)
    }
  }
  const window = rateWindows.get(key) ?? { start: now, count: 0 }
  window.count += 1
  rateWindows.set(key, window)

  if (window.count > (mutation ? 30 : 180) || rateWindows.size > 10_000) {
    c.header("Retry-After", "60")

    return c.json({ error: "PACKAGE_RATE_LIMIT" }, 429)
  }

  await next()
})
const principal = (c: import("hono").Context<ApiEnv>) =>
  themeWorkspacePrincipal(
    c.get("claims").sub,
    c.req.header("X-Tadazz-Workspace") ?? c.get("claims").sub,
  )
app.get("/", (c) => c.json({ packages: packageStore().list(principal(c)) }))
app.get("/save-consents/:requestId", (c) => {
  const p = themeWorkspacePrincipal(c.get("claims").sub, c.get("claims").sub)
  const intent = packageTransfers().readInstallIntent(
    p.tenantId,
    c.req.param("requestId"),
  )
  const receipt = packageStore().details(p, intent.uploadId)
  if (
    receipt.revision !== intent.revision ||
    receipt.sourceDigest !== intent.sourceDigest ||
    receipt.buildDigest !== intent.buildDigest
  ) {
    return c.json({ error: "PACKAGE_CONSENT_STALE" }, 409)
  }
  const contents = receipt.manifest.contents.filter((item) =>
    intent.selectedContentIds.includes(item.id),
  )
  if (contents.length !== intent.selectedContentIds.length)
    return c.json({ error: "PACKAGE_SELECTION" }, 409)
  return c.json({
    requestId: intent.requestId,
    uploadId: intent.uploadId,
    revision: intent.revision,
    sourceDigest: intent.sourceDigest,
    buildDigest: intent.buildDigest,
    title: receipt.manifest.displayName,
    contents: contents.map(({ id, kind }) => ({ id, kind })),
    reviewed: receipt.reviewed,
    canInstall:
      receipt.phase === "installed" ||
      (receipt.phase === "preview-ready" &&
        (receipt.reviewed || contents.every((item) => item.kind === "game"))),
    expiresAt: intent.expiresAt,
    outcome: intent.outcome,
  })
})
app.post(
  "/save-consents/:requestId/approve",
  bodyLimit({ maxSize: 4000 }),
  zValidator(
    "json",
    z.strictObject({
      decision: z.literal("approve"),
      expectedRevision: z.number().int().positive(),
      sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    }),
  ),
  (c) => {
    const p = themeWorkspacePrincipal(c.get("claims").sub, c.get("claims").sub),
      input = c.req.valid("json"),
      transfers = packageTransfers()
    const intent = transfers.readInstallIntent(
      p.tenantId,
      c.req.param("requestId"),
    )
    if (
      intent.revision !== input.expectedRevision ||
      intent.sourceDigest !== input.sourceDigest
    )
      return c.json({ error: "PACKAGE_CONSENT_STALE" }, 409)
    const result = transfers.approveInstall(
      p.tenantId,
      intent.requestId,
      (selection) => {
        const store = packageStore(),
          receipt = store.details(p, selection.uploadId)
        if (
          receipt.revision !== selection.revision ||
          receipt.sourceDigest !== selection.sourceDigest ||
          receipt.buildDigest !== selection.buildDigest
        )
          throw new PackageError("PACKAGE_CONSENT_STALE", 409)
        const saved = store.install(
          p,
          selection.uploadId,
          selection.revision,
          selection.selectedContentIds,
        )
        return {
          uploadId: selection.uploadId,
          revision: saved.revision,
          installedGameIds: saved.installedGames,
        }
      },
    )
    return c.json(result)
  },
)
app.get("/uploads/:upload/games/:gameId/preview", (c) => {
  const p = principal(c),
    store = packageStore(),
    id = c.req.param("upload")
  store.acceptBuild(p, id)
  const receipt = store.details(p, id)
  if (
    !["preview-ready", "installed"].includes(receipt.phase) ||
    !receipt.buildDigest ||
    (receipt.code && !packageRuntimeEnabled())
  ) {
    return c.json({ error: "PACKAGE_RUNTIME_NOT_READY" }, 409)
  }
  const content = receipt.manifest.contents.find(
    (item) => item.kind === "game" && item.id === c.req.param("gameId"),
  )
  if (!content) return c.json({ error: "PACKAGE_NOT_FOUND" }, 404)
  const row = store.own(p, id),
    pkg = store.readPackage(row)
  const definitions = packageThemeDefinitions(pkg).map((definition) => ({
    ...definition,
    ...(definition.sandbox
      ? {
          runtime: {
            packageId: pkg.manifest.id,
            version: pkg.manifest.version,
            sourceDigest: receipt.sourceDigest,
            buildDigest: receipt.buildDigest,
          },
        }
      : {}),
  }))
  const show = tadaShowV1Schema.parse(
    normalizePackageDocument(pkg, content.path),
  )
  if (content.themeRef) {
    const [themeId, version] = content.themeRef.split("@")
    if (
      !definitions.some(
        (definition) =>
          definition.id === themeId && definition.version === version,
      )
    )
      return c.json({ error: "PACKAGE_DEPENDENCY" }, 409)
    show.defaults = {
      ...show.defaults,
      showTheme: {
        overrides: {},
        ...show.defaults?.showTheme,
        id: themeId,
        version,
      },
    }
  }
  // Only the verified manager receives authored source. Raw roster/settings and
  // executable code are never posted to the isolated theme frame.
  show.settings = []
  const ticket = issueRuntimeAccess(store, p, id, packageRuntimeSecret())
  const runtimeUrls: Record<string, string> = {}
  const origin = process.env.TADAZZ_PACKAGE_RUNTIME_ORIGIN
  const parent = process.env.TADAZZ_PACKAGE_PARENT_ORIGIN
  if (definitions.some((definition) => definition.sandbox)) {
    if (
      !origin ||
      !parent ||
      new URL(origin).protocol !== "https:" ||
      new URL(origin).origin === new URL(parent).origin
    )
      return c.json({ error: "PACKAGE_RUNTIME_ORIGIN" }, 409)
    for (const definition of definitions)
      if (definition.sandbox) {
        runtimeUrls[definition.id] =
          `${new URL(origin).origin}/render?ticket=${encodeURIComponent(ticket)}&theme=${encodeURIComponent(definition.id)}`
      }
  }
  setCookie(c, "tdz_theme_preview", `pkg.${ticket}`, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/media",
    maxAge: 300,
  })
  return c.json({
    uploadId: id,
    revision: receipt.revision,
    sourceDigest: receipt.sourceDigest,
    buildDigest: receipt.buildDigest,
    show,
    definitions,
    runtimeUrls,
    assets: pkg.manifest.files
      .filter((file) => !["source", "style", "descriptor"].includes(file.kind))
      .map((file) => ({
        url: `/media/${packageMediaName(pkg, file.path)}`,
        sha256: file.sha256,
        bytes: file.bytes,
      })),
  })
})
app.post(
  "/preflight",
  bodyLimit({ maxSize: PACKAGE_LIMITS.archiveBytes }),
  async (c) => {
    const { report } = inspectPackage(Buffer.from(await c.req.arrayBuffer()))

    if (report.code && !packageRuntimeEnabled()) {
      return c.json({ error: "PACKAGE_RUNTIME_DISABLED" }, 409)
    }

    return c.json(report)
  },
)
app.post(
  "/uploads",
  bodyLimit({ maxSize: PACKAGE_LIMITS.archiveBytes }),
  async (c) => {
    const bytes = Buffer.from(await c.req.arrayBuffer())

    if (inspectPackage(bytes).report.code && !packageRuntimeEnabled()) {
      return c.json({ error: "PACKAGE_RUNTIME_DISABLED" }, 409)
    }

    return c.json(
      packageStore().upload(
        principal(c),
        bytes,
        c.req.header("Idempotency-Key") ?? "",
      ),
      201,
    )
  },
)
app.get("/uploads/:upload", (c) => {
  const p = principal(c),
    id = c.req.param("upload")
  packageStore().acceptBuild(p, id)

  return c.json(packageStore().details(p, id))
})
app.get("/uploads/:upload/preview/:themeId", (c) => {
  const store = packageStore(),
    p = principal(c),
    id = c.req.param("upload")
  const row = store.own(p, id)
  const ticket = issueRuntimeAccess(store, p, id, packageRuntimeSecret())
  const definition = packageThemeDefinitions(store.readPackage(row)).find(
    (d) => d.id === c.req.param("themeId") && d.kind === "declarative",
  )

  if (!definition) {
    return c.json({ error: "not-found" }, 404)
  }

  setCookie(c, "tdz_theme_preview", `pkg.${ticket}`, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/media",
    maxAge: 300,
  })

  return c.json({ definition })
})
app.post("/uploads/:upload/build", (c) => {
  if (
    !packageRuntimeEnabled() &&
    packageStore().details(principal(c), c.req.param("upload")).code
  ) {
    return c.json({ error: "PACKAGE_RUNTIME_DISABLED" }, 409)
  }

  packageStore().requestBuild(principal(c), c.req.param("upload"))

  return c.json({ status: "building" }, 202)
})
app.post(
  "/uploads/:upload/approval",
  bodyLimit({ maxSize: 4000 }),
  zValidator("json", packageReviewSchema),
  (c) => {
    packageStore().approve(
      principal(c),
      c.req.param("upload"),
      c.req.valid("json"),
    )

    return c.json({ reviewed: true })
  },
)
app.post(
  "/uploads/:upload/install",
  bodyLimit({ maxSize: 8000 }),
  zValidator("json", revisionSchema),
  (c) => {
    const input = c.req.valid("json")

    return c.json(
      packageStore().install(
        principal(c),
        c.req.param("upload"),
        input.expectedRevision,
        input.selected,
        input.useClassicWhenThemeSkipped,
      ),
      201,
    )
  },
)
app.post("/uploads/:upload/rollback", (c) => {
  packageStore().rollback(principal(c), c.req.param("upload"))

  return c.json({ rolledBack: true })
})
app.post("/uploads/:upload/export", (c) => {
  const bytes = packageStore().export(principal(c), c.req.param("upload"))

  return c.body(Uint8Array.from(bytes).buffer, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="export.tadazz"',
  })
})
app.post("/uploads/:upload/games/:quizId/export", (c) => {
  const p = principal(c)

  // Composite storage runs in the authenticated account scope, never a client-supplied tenant.
  if (p.tenantId !== c.get("claims").sub) {
    return c.json({ error: "PACKAGE_FORBIDDEN" }, 403)
  }

  const service = new CompositeStorageService({
    getPath,
    getQuizzById,
    saveQuizz,
    updateQuizz,
    deleteQuizz,
  })
  const bundle = service.exportEnhancedBundle(c.req.param("quizId"))
  const bytes = packageStore().exportGame(p, c.req.param("upload"), bundle)

  return c.body(Uint8Array.from(bytes).buffer, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="game.tadazz"',
  })
})
app.delete("/uploads/:upload", (c) => {
  packageStore().uninstall(principal(c), c.req.param("upload"))

  return c.body(null, 204)
})

export const packageRoutes = app
