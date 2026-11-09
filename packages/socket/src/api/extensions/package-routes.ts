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
  packageReviewSchema,
  CompositeStorageService,
  packageThemeDefinitions,
  ThemeInstallationError,
} from "@razzia/extensions/server"
import { PACKAGE_LIMITS } from "@razzia/extensions/core"
import { requireManager, readClaims } from "@razzia/socket/api/middleware"
import type { ApiEnv } from "@razzia/socket/api/factory"
import {
  packageInstallerEnabled,
  packageRuntimeEnabled,
  packageRuntimeSecret,
  packageStore,
} from "@razzia/socket/services/package-installation"
import { themeWorkspacePrincipal } from "@razzia/socket/services/theme-installation"
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
