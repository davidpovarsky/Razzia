/* oxlint-disable typescript/no-non-null-assertion -- Hono route parameters are present on these mounted workspace/artifact routes. */
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { themeMediaResponse } from "./theme-media-response"
import { z } from "zod"
import {
  installedPackageThemes,
  packageInstallerEnabled,
} from "@razzia/socket/services/package-installation"
import { apiFactory, type ApiEnv } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import {
  ThemeInstallationError,
  themeApprovalSchema,
} from "@razzia/extensions/server"
import { showThemeDefinitionSchema } from "@razzia/extensions/core"
import {
  demoCatalogEnabled,
  enabledDemoThemes,
  themeInstallerEnabled,
  themeInstallationStore,
  themeWorkspaceAssignments,
  themeWorkspacePrincipal,
  createThemePreviewTicket,
} from "@razzia/socket/services/theme-installation"

const actionSchema = z.strictObject({
  action: z.enum([
    "validate",
    "request-review",
    "stage",
    "publish",
    "rollback",
  ]),
})
const revisionSchema = z.number().int().positive()
const workspace = new Hono<ApiEnv>()
  .get("/", (c) => {
    const p = themeWorkspacePrincipal(
      c.get("claims").sub,
      c.req.param("tenantId")!,
    )

    return c.json({ artifacts: themeInstallationStore().list(p) })
  })
  .post(
    "/drafts",
    bodyLimit({ maxSize: 1_000_000 }),
    zValidator("json", showThemeDefinitionSchema),
    (c) => {
      const p = themeWorkspacePrincipal(
        c.get("claims").sub,
        c.req.param("tenantId")!,
      )

      return c.json(
        { artifactId: themeInstallationStore().draft(p, c.req.valid("json")) },
        201,
      )
    },
  )
  .get("/drafts/:artifactId", (c) => {
    const p = themeWorkspacePrincipal(
      c.get("claims").sub,
      c.req.param("tenantId")!,
    )

    return c.json(
      themeInstallationStore().details(p, c.req.param("artifactId")),
    )
  })
  .put(
    "/drafts/:artifactId",
    bodyLimit({ maxSize: 1_000_000 }),
    zValidator(
      "json",
      z.strictObject({
        expectedRevision: revisionSchema,
        manifest: showThemeDefinitionSchema,
      }),
    ),
    (c) => {
      const p = themeWorkspacePrincipal(
        c.get("claims").sub,
        c.req.param("tenantId")!,
      )
      const input = c.req.valid("json")

      return c.json({
        revision: themeInstallationStore().revise(
          p,
          c.req.param("artifactId"),
          input.expectedRevision,
          input.manifest,
        ),
      })
    },
  )
  .put(
    "/drafts/:artifactId/assets/:assetId",
    bodyLimit({ maxSize: 100_000_000 }),
    async (c) => {
      const p = themeWorkspacePrincipal(
        c.get("claims").sub,
        c.req.param("tenantId")!,
      )
      themeInstallationStore().upload(
        p,
        c.req.param("artifactId"),
        c.req.param("assetId"),
        Buffer.from(await c.req.arrayBuffer()),
      )

      return c.json({ uploaded: true })
    },
  )
  .post(
    "/drafts/:artifactId/actions",
    bodyLimit({ maxSize: 1000 }),
    zValidator("json", actionSchema),
    (c) => {
      const p = themeWorkspacePrincipal(
        c.get("claims").sub,
        c.req.param("tenantId")!,
      )
      const { action } = c.req.valid("json")
      const store = themeInstallationStore()
      const id = c.req.param("artifactId")

      switch (action) {
        case "validate":
          store.validate(p, id)

          break

        case "request-review":
          store.requestReview(p, id)

          break

        case "stage":
          store.stage(p, id)

          break

        case "publish":
          store.publish(p, id)

          break

        case "rollback":
          store.publish(p, id, true)

          break
      }

      return c.json({ action, artifactId: id })
    },
  )
  .post(
    "/drafts/:artifactId/approval",
    bodyLimit({ maxSize: 2000 }),
    zValidator("json", themeApprovalSchema),
    (c) => {
      const p = themeWorkspacePrincipal(
        c.get("claims").sub,
        c.req.param("tenantId")!,
      )
      themeInstallationStore().approve(
        p,
        c.req.param("artifactId"),
        c.req.valid("json"),
      )

      return c.json({ approved: true })
    },
  )
  .post(
    "/drafts/:artifactId/rejection",
    bodyLimit({ maxSize: 4000 }),
    zValidator(
      "json",
      z.strictObject({
        expectedRevision: revisionSchema,
        reason: z.string().trim().min(1).max(1000),
      }),
    ),
    (c) => {
      const p = themeWorkspacePrincipal(
        c.get("claims").sub,
        c.req.param("tenantId")!,
      )
      const input = c.req.valid("json")
      themeInstallationStore().reject(
        p,
        c.req.param("artifactId"),
        input.expectedRevision,
        input.reason,
      )

      return c.json({ returnedForRevision: true })
    },
  )
  .get("/drafts/:artifactId/preview", async (c) => {
    const p = themeWorkspacePrincipal(
      c.get("claims").sub,
      c.req.param("tenantId")!,
    )
    const receipt = themeInstallationStore().previewReceipt(
      p,
      c.req.param("artifactId"),
    )
    const ticket = await createThemePreviewTicket(
      c.get("claims"),
      p.tenantId,
      c.req.param("artifactId"),
      receipt.revision,
    )
    setCookie(c, "tdz_theme_preview", ticket, {
      path: "/media",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 300,
    })

    return c.json(receipt)
  })
  .get("/drafts/:artifactId/assets/:assetId", (c) => {
    const p = themeWorkspacePrincipal(
      c.get("claims").sub,
      c.req.param("tenantId")!,
    )

    return themeMediaResponse(
      c,
      themeInstallationStore().readAsset(
        p,
        c.req.param("artifactId"),
        c.req.param("assetId"),
      ),
    )
  })
  .get("/audit", (c) => {
    const p = themeWorkspacePrincipal(
      c.get("claims").sub,
      c.req.param("tenantId")!,
    )

    return c.json({ events: themeInstallationStore().auditLog(p) })
  })

export const themeRoutes = apiFactory
  .createApp()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store")

    const demoRead =
      demoCatalogEnabled() &&
      c.req.method === "GET" &&
      c.req.path === "/api/themes/catalog"

    if (
      !themeInstallerEnabled() &&
      !demoRead &&
      !(
        packageInstallerEnabled() &&
        c.req.method === "GET" &&
        c.req.path === "/api/themes/catalog"
      )
    ) {
      c.header("Connection", "close")

      return c.json({ error: "not-found" }, 404)
    }

    await next()

    // Early rejection may leave an unread upload that the Node adapter drains
    // or closes. Do not advertise that connection as reusable to API clients.
    if (c.res.status >= 400 && !["GET", "HEAD"].includes(c.req.method)) {
      c.header("Connection", "close")
    }
  })
  .use("*", requireManager)
  .use("*", async (c, next) => {
    await next()

    if (!themeInstallerEnabled()) {
      return
    }

    // Record authenticated access/denial without copying request bodies or tokens.
    const claims = c.get("claims")
    const requested = c.req.param("tenantId")
    const assigned =
      requested && themeWorkspaceAssignments(claims.sub)[requested]
    themeInstallationStore().recordHttpAccess(
      {
        userId: claims.sub,
        tenantId: assigned ? requested : claims.sub,
        grants: [],
      },
      {
        method: c.req.method,
        path: c.req.path.slice(0, 2048),
        status: c.res.status,
      },
    )
  })
  .onError((error, c) => {
    if (error instanceof ThemeInstallationError) {
      return c.json({ error: error.message }, error.status)
    }

    if (error instanceof HTTPException) {
      return c.json({ error: "invalid-theme-request" }, error.status)
    }

    if (error instanceof z.ZodError) {
      return c.json({ error: "invalid-theme-input" }, 400)
    }

    console.error("Theme installation failed", error.name)

    return c.json({ error: "theme-installation-failed" }, 500)
  })
  .get("/workspaces", (c) =>
    c.json({ workspaces: themeWorkspaceAssignments(c.get("claims").sub) }),
  )
  .get("/catalog", (c) => {
    const owner = c.get("claims").sub
    const store = themeInstallerEnabled() ? themeInstallationStore() : null
    const demos = enabledDemoThemes()

    return c.json({
      definitions: demos.concat(
        store ? store.catalog(owner).concat(store.catalog("platform")) : [],
        installedPackageThemes(owner),
      ),
      available: demos
        .filter((theme) => theme.version === "2.0.0")
        .map(({ id, version }) => ({ id, version }))
        .concat(
          store
            ? store
                .availableVersions(owner)
                .concat(store.availableVersions("platform"))
            : [],
        )
        .concat(
          installedPackageThemes(owner, true).map(({ id, version }) => ({
            id,
            version,
          })),
        ),
    })
  })
  .route("/workspaces/:tenantId", workspace)
