import { Hono } from "hono"
import type { SessionClaims } from "@razzia/common/types/auth"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import {
  ThemeInstallationError,
  type ThemeInstallationStore,
} from "./installation"
import type { ThemePrincipal } from "./review"

/** Mount inside the existing manager-authenticated theme installer route only.
 * Authenticated assignment is supplied by the existing host, never request JSON.
 * This router saves candidate documents; it cannot install or grant renderer pins.
 */
export function createThemeBuilderRoutes(options: {
  enabled: () => boolean
  principal: (
    claims: SessionClaims,
    tenantId: string,
  ) => Promise<ThemePrincipal> | ThemePrincipal
  store: () => ThemeInstallationStore
}) {
  const app = new Hono<{ Variables: { claims: SessionClaims } }>()
  app.use("*", async (c, next) => {
    if (!options.enabled()) return c.json({ error: "Not found" }, 404)
    c.header("Cache-Control", "private, no-store")
    await next()
  })
  app.onError((error, c) => {
    if (error instanceof ThemeInstallationError)
      return c.json(
        {
          error:
            error.status === 409
              ? "Draft revision conflict or quota exceeded"
              : error.status === 404
                ? "Not found"
                : error.status === 403
                  ? "Forbidden"
                  : "Invalid authoring request",
        },
        error.status,
      )
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error &&
        /^(theme-builder|show-library):/u.test(error.message))
    )
      return c.json({ error: "Invalid authoring request" }, 400)
    return c.json({ error: "Authoring service unavailable" }, 500)
  })
  const principal = async (claims: SessionClaims, tenantId: string) => {
    const p = await options.principal(claims, tenantId)
    if (p.tenantId !== tenantId)
      throw new ThemeInstallationError("Not found", 404)
    return p
  }
  app.get("/:tenantId/documents", async (c) => {
    const p = await principal(c.get("claims"), c.req.param("tenantId"))
    return c.json({ documents: options.store().listBuilderDocuments(p) })
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
      if (input.document.id !== c.req.param("documentId"))
        throw new ThemeInstallationError("Draft identity mismatch")
      return c.json(
        await options
          .store()
          .saveBuilderDocument(p, input.expectedRevision, input.document),
      )
    },
  )
  return app
}
