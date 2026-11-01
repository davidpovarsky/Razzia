import { zValidator } from "@hono/zod-validator"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { Hono, type MiddlewareHandler } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"
import {
  quizExtrasV1Schema,
  quizExtrasV2Schema,
  RevisionConflictError,
  showMediaCatalogItemSchema,
} from "../../core/index"
import {
  associateMediaWithShow,
  buildMediaCatalogResponse,
} from "../media-library"
import { CompositeStorageService } from "../storage/service"
import { CompositeStorageError } from "../storage/error"
import type { StorageInjections } from "../storage/sidecar"

const anyQuizExtrasSchema = z.union([quizExtrasV1Schema, quizExtrasV2Schema])

const saveCompositeBodySchema = z.strictObject({
  expectedRevision: z.number().int().positive().nullable(),
  quizz: quizzValidator,
  extras: anyQuizExtrasSchema,
})

const createCompositeBodySchema = z.strictObject({
  quizz: quizzValidator,
  extras: anyQuizExtrasSchema,
})

const associateMediaBodySchema = z.strictObject({
  quizId: z.string().min(1),
  item: showMediaCatalogItemSchema,
})

export const createExtensionRoutes = (
  injections: StorageInjections,
  requireManagerMiddleware?: MiddlewareHandler,
) => {
  const service = new CompositeStorageService(injections)
  const app = new Hono()

  if (requireManagerMiddleware) {
    app.use("*", requireManagerMiddleware)
  }

  // GET /quizzes/:id -> 200 { quizId, exists, extras: QuizExtrasV1 | null, baseDigest } or 404
  app.get("/quizzes/:id", (c) => {
    const id = c.req.param("id")

    try {
      const result = service.getCompositeQuiz(id)

      return c.json({
        quizId: result.quizId,
        exists: result.exists,
        extras: result.extras,
        baseDigest: result.baseDigest,
      })
    } catch (error) {
      if (
        error instanceof CompositeStorageError &&
        error.statusCode === StatusCodes.NOT_FOUND
      ) {
        return c.json({ error: "errors:quizz.notFound" }, StatusCodes.NOT_FOUND)
      }

      return c.json(
        { error: "errors:server.internal" },
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
  })

  // PUT /quizzes/:id -> 200 { quizId, revision, baseDigest }
  app.put("/quizzes/:id", zValidator("json", saveCompositeBodySchema), (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")

    try {
      const result = service.saveCompositeQuiz({
        quizId: id,
        expectedRevision: body.expectedRevision,
        quizz: body.quizz,
        extras: body.extras,
      })

      return c.json(result, StatusCodes.OK)
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        return c.json(
          {
            error: "errors:extensions.revisionConflict",
            currentRevision: error.currentRevision,
            expectedRevision: error.expectedRevision,
          },
          StatusCodes.CONFLICT,
        )
      }

      if (error instanceof CompositeStorageError) {
        return c.json(
          { error: error.message },
          error.statusCode as ContentfulStatusCode,
        )
      }

      return c.json(
        { error: "errors:server.internal" },
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
  })

  // POST /quizzes -> 201 { quizId, revision: 1, baseDigest }
  app.post("/quizzes", zValidator("json", createCompositeBodySchema), (c) => {
    const body = c.req.valid("json")

    try {
      const result = service.createCompositeQuiz({
        quizz: body.quizz,
        extras: body.extras,
      })

      return c.json(result, StatusCodes.CREATED)
    } catch (error) {
      if (error instanceof CompositeStorageError) {
        return c.json(
          { error: error.message },
          error.statusCode as ContentfulStatusCode,
        )
      }

      return c.json(
        { error: "errors:server.internal" },
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
  })

  // DELETE /quizzes/:id -> 204
  app.delete("/quizzes/:id", (c) => {
    const id = c.req.param("id")

    try {
      service.deleteCompositeQuiz(id)

      return c.body(null, StatusCodes.NO_CONTENT)
    } catch (error) {
      if (
        error instanceof CompositeStorageError &&
        error.statusCode === StatusCodes.NOT_FOUND
      ) {
        return c.json({ error: "errors:quizz.notFound" }, StatusCodes.NOT_FOUND)
      }

      return c.json(
        { error: "errors:server.internal" },
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
  })

  // GET /export/:id -> { bundleVersion: 1, quizz, extras }
  app.get("/export/:id", (c) => {
    const id = c.req.param("id")

    try {
      const bundle = service.exportEnhancedBundle(id)

      return c.json(bundle, StatusCodes.OK)
    } catch (error) {
      if (
        error instanceof CompositeStorageError &&
        error.statusCode === StatusCodes.NOT_FOUND
      ) {
        return c.json({ error: "errors:quizz.notFound" }, StatusCodes.NOT_FOUND)
      }

      return c.json(
        { error: "errors:server.internal" },
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
  })

  // POST /import -> 201 { quizId, revision: 1, baseDigest }
  app.post("/import", async (c) => {
    let rawBody: unknown = null

    try {
      rawBody = await c.req.json()
    } catch {
      return c.json(
        { error: "errors:common.invalidJson" },
        StatusCodes.BAD_REQUEST,
      )
    }

    try {
      const result = service.importEnhancedBundle(rawBody)

      return c.json(result, StatusCodes.CREATED)
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "errors:quizz.importFailed",
        },
        StatusCodes.BAD_REQUEST,
      )
    }
  })

  // GET /media/catalog -> 200 { media, builtInSounds, showMediaCatalog }
  app.get("/media/catalog", (c) => {
    const quizId = c.req.query("quizId") || undefined
    const uploaded = injections.listMedia ? injections.listMedia() : []
    const catalog = buildMediaCatalogResponse(
      injections.getPath,
      uploaded,
      quizId,
    )

    return c.json(catalog, StatusCodes.OK)
  })

  // POST /media/associate -> 200 { showMediaCatalog }
  app.post(
    "/media/associate",
    zValidator("json", associateMediaBodySchema),
    (c) => {
      const body = c.req.valid("json")
      const showMediaCatalog = associateMediaWithShow(
        injections.getPath,
        body.quizId,
        body.item,
      )

      return c.json({ showMediaCatalog }, StatusCodes.OK)
    },
  )

  return app
}
