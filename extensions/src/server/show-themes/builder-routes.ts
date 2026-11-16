import { requireLibraryValue } from "../../core/show-library/required"
import { Hono } from "hono"
import type { SessionClaims } from "@razzia/common/types/auth"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import {
  ThemeInstallationError,
  type ThemeInstallationStore,
} from "./installation"
import type { ThemePrincipal } from "./review"
import type { BuilderDocument } from "../../components/theme-builder/document"
import type { BuilderPublicationAdmission } from "./application-composition-admission"

// Mount inside the existing manager-authenticated theme installer route only.
// Authenticated assignment is supplied by the existing host, never request JSON.
// This router saves candidate documents; it cannot install or grant renderer pins.
//
export function createThemeBuilderRoutes(options: {
  enabled: () => boolean
  principal: (
    claims: SessionClaims,
    tenantId: string,
  ) => Promise<ThemePrincipal> | ThemePrincipal
  store: () => ThemeInstallationStore
  admitPublication?: (
    principal: ThemePrincipal,
    document: BuilderDocument,
  ) => BuilderPublicationAdmission | Promise<BuilderPublicationAdmission>
}) {
  const app = new Hono<{ Variables: { claims: SessionClaims } }>()
  app.use("*", async (c, next) => {
    if (!options.enabled()) {
      return c.json({ error: "Not found" }, 404)
    }

    c.header("Cache-Control", "private, no-store")
    await next()
  })
  app.onError((error, c) => {
    if (error instanceof ThemeInstallationError) {
      return c.json(
        {
          error:
            (
              {
                409: "Draft revision conflict or quota exceeded",
                404: "Not found",
                403: "Forbidden",
              } as Record<number, string | undefined>
            )[error.status] ?? "Invalid authoring request",
        },
        error.status,
      )
    }

    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error &&
        /^(theme-builder|show-library):/u.test(error.message))
    ) {
      return c.json({ error: "Invalid authoring request" }, 400)
    }

    return c.json({ error: "Authoring service unavailable" }, 500)
  })
  const principal = async (claims: SessionClaims, tenantId: string) => {
    const p = await options.principal(claims, tenantId)

    if (p.tenantId !== tenantId) {
      throw new ThemeInstallationError("Not found", 404)
    }

    return p
  }
  app.get("/:tenantId/documents", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))

    return c.json({ documents: options.store().listBuilderDocuments(p) })
  })
  app.get("/:tenantId/publications", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))

    return c.json({
      publications: options.store().listPublishedBuilderDocuments(p),
    })
  })
  app.get("/:tenantId/documents/:documentId/published/:version", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))

    return c.json(
      options
        .store()
        .readPublishedBuilderVersion(
          p,
          c.req.param("documentId"),
          c.req.param("version"),
        ),
    )
  })
  app.get("/:tenantId/documents/:documentId", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))

    return c.json(
      await options.store().readBuilderDocument(p, c.req.param("documentId")),
    )
  })
  app.put(
    "/:tenantId/documents/:documentId",
    bodyLimit({ maxSize: 600_000 }),
    async (c) => {
      const p = await principal(c.get("claims"), c.req.param("tenantId"))
      const input = z
        .strictObject({
          expectedRevision: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER - 1),
          document: z.record(z.string(), z.unknown()),
        })
        .parse(await c.req.json())

      if (input.document.id !== c.req.param("documentId")) {
        throw new ThemeInstallationError("Draft identity mismatch")
      }

      return c.json(
        await options
          .store()
          .saveBuilderDocument(p, input.expectedRevision, input.document),
      )
    },
  )
  app.get("/:tenantId/documents/:documentId/versions", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))

    return c.json({
      versions: options
        .store()
        .listBuilderVersions(p, c.req.param("documentId")),
    })
  })
  const versionRequest = z.strictObject({
    expectedRevision: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER - 1),
    version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u),
  })
  app.get("/:tenantId/documents/:documentId/publication", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))

    return c.json(
      options.store().builderPublicationState(p, c.req.param("documentId")),
    )
  })
  const publicationRequest = versionRequest.extend({
    expectedHeadRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  for (const operation of ["publish", "rollback"] as const) {
    app.post(
      `/:tenantId/documents/:documentId/${operation}`,
      bodyLimit({ maxSize: 2048 }),
      async (c) => {
        const p = await principal(c.get("claims"), c.req.param("tenantId")),
          input = publicationRequest.parse(await c.req.json())

        if (!options.admitPublication) {
          throw new ThemeInstallationError(
            "Application publication unavailable",
          )
        }

        return c.json(
          await options
            .store()
            .publishBuilderVersion(
              p,
              c.req.param("documentId"),
              input.expectedRevision,
              input.expectedHeadRevision,
              input.version,
              (document) =>
                requireLibraryValue(options.admitPublication)(p, document),
              operation === "rollback",
            ),
        )
      },
    )
  }
  app.post(
    "/:tenantId/documents/:documentId/archive",
    bodyLimit({ maxSize: 2048 }),
    async (c) => {
      const p = await principal(c.get("claims"), c.req.param("tenantId"))
      const input = z
        .strictObject({
          expectedRevision: z.number().int().positive(),
          expectedHeadRevision: z.number().int().nonnegative(),
          archived: z.boolean(),
        })
        .parse(await c.req.json())

      return c.json(
        await options
          .store()
          .archiveBuilderDocument(
            p,
            c.req.param("documentId"),
            input.expectedRevision,
            input.expectedHeadRevision,
            input.archived,
          ),
      )
    },
  )
  for (const operation of ["versions", "restore"] as const) {
    app.post(
      `/:tenantId/documents/:documentId/${operation}`,
      bodyLimit({ maxSize: 2048 }),
      async (c) => {
        const p = await principal(c.get("claims"), c.req.param("tenantId"))
        const input = versionRequest.parse(await c.req.json())
        const store = options.store()

        return c.json(
          await (operation === "versions"
            ? store.createBuilderVersion(
                p,
                c.req.param("documentId"),
                input.expectedRevision,
                input.version,
              )
            : store.restoreBuilderVersion(
                p,
                c.req.param("documentId"),
                input.expectedRevision,
                input.version,
              )),
        )
      },
    )
  }

  return app
}
