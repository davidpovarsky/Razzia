import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
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
  validateDotLottieContainer,
  validateLottieJson,
} from "../../core/index"
import {
  associateMediaWithShow,
  buildMediaCatalogResponse,
  executeMediaDeleteTransaction,
} from "../media-library"
import { CompositeStorageService } from "../storage/service"
import { CompositeStorageError } from "../storage/error"
import type { StorageInjections } from "../storage/sidecar"

let cachedDotLottieWasmBytes: Uint8Array | null = null

function loadSelfHostedDotLottieWasm(): Uint8Array | null {
  if (cachedDotLottieWasmBytes) {
    return cachedDotLottieWasmBytes
  }
  // The tiny production runner contains the socket bundle, not pnpm node_modules.
  // The official WASM binary is copied into this fixed runtime path by Docker.
  const productionWasm = process.env.TADAZZ_DOTLOTTIE_WASM_PATH ??
    "/app/runtime/dotlottie-player.wasm"
  if (fs.existsSync(productionWasm)) {
    cachedDotLottieWasmBytes = new Uint8Array(fs.readFileSync(productionWasm))
    return cachedDotLottieWasmBytes
  }
  try {
    const req = createRequire(import.meta.url)
    const reactEntry = req.resolve("@lottiefiles/dotlottie-react")
    const reactReq = createRequire(reactEntry)
    const webEntry = reactReq.resolve("@lottiefiles/dotlottie-web")
    const wasmPath = path.join(path.dirname(webEntry), "dotlottie-player.wasm")
    if (fs.existsSync(wasmPath)) {
      cachedDotLottieWasmBytes = new Uint8Array(fs.readFileSync(wasmPath))
      return cachedDotLottieWasmBytes
    }
  } catch {
    // Fallback below if resolution path differs
  }
  return null
}

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

const uploadLottieBodySchema = z
  .strictObject({
    name: z.string().min(1).max(160),
    format: z.enum(["json", "dotlottie", "zip"]).optional(),
    content: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    contentBase64: z.string().min(1).optional(),
    quizId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.content === undefined && !val.contentBase64) {
      ctx.addIssue({
        code: "custom",
        path: ["content"],
        message: "errors:extensions.invalidLottieJson",
      })
    }
  })

export const createExtensionRoutes = (
  injections: StorageInjections,
  requireManagerMiddleware?: MiddlewareHandler,
) => {
  const service = new CompositeStorageService(injections)
  const app = new Hono()

  // Public self-hosted WASM endpoint so Host, Player, /display, and Editor
  // load the official dotLottie runtime strictly offline with zero CDN calls.
  app.get("/lottie-wasm", (c) => {
    const wasmBytes = loadSelfHostedDotLottieWasm()
    if (!wasmBytes) {
      return c.json(
        { error: "errors:server.internal" },
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
    return c.body(wasmBytes as unknown as ArrayBuffer, StatusCodes.OK, {
      "Content-Type": "application/wasm",
      "Cache-Control": "public, max-age=86400",
    })
  })

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

  // POST /lottie -> 201 { name, url, type: "lottie", lottieMeta }
  app.post("/lottie", zValidator("json", uploadLottieBodySchema), (c) => {
    const body = c.req.valid("json")
    const rawBaseName = body.name
      .replace(/\.(lottie|json|zip)$/iu, "")
      .replace(/[^a-zA-Z0-9_-]/gu, "-")
      .replace(/-+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 64)

    const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const mediaDir = injections.getPath("media")
    fs.mkdirSync(mediaDir, { recursive: true })

    const isBinaryRequest = Boolean(
      body.contentBase64 ||
      /\.(lottie|zip)$/iu.test(body.name.trim()),
    )

    if (isBinaryRequest) {
      let rawBytes: Uint8Array
      try {
        if (body.contentBase64) {
          const cleanB64 = body.contentBase64.replace(
            /^data:[^;]+;base64,/iu,
            "",
          )
          rawBytes = new Uint8Array(Buffer.from(cleanB64, "base64"))
        } else if (typeof body.content === "string") {
          rawBytes = new Uint8Array(Buffer.from(body.content, "base64"))
        } else {
          return c.json(
            {
              error: "errors:extensions.corruptDotLottieArchive",
              code: "errors:extensions.corruptDotLottieArchive",
            },
            StatusCodes.BAD_REQUEST,
          )
        }
      } catch {
        return c.json(
          {
            error: "errors:extensions.corruptDotLottieArchive",
            code: "errors:extensions.corruptDotLottieArchive",
          },
          StatusCodes.BAD_REQUEST,
        )
      }

      const archiveValidation = validateDotLottieContainer(rawBytes)
      if (!archiveValidation.valid) {
        return c.json(
          {
            error: archiveValidation.error,
            code: archiveValidation.code,
            reason: archiveValidation.reason,
          },
          StatusCodes.BAD_REQUEST,
        )
      }

      const safeName = `${rawBaseName || "lottie"}-${uniqueSuffix}.lottie`
      const filePath = path.join(mediaDir, safeName)
      const tmpPath = `${filePath}.${process.pid}.tmp`
      fs.writeFileSync(tmpPath, archiveValidation.archiveBytes)
      fs.renameSync(tmpPath, filePath)

      const url = `/media/${safeName}`
      const item = {
        name: safeName,
        url,
        type: "lottie" as const,
        format: "dotlottie" as const,
        size: archiveValidation.archiveBytes.byteLength,
        addedAt: Date.now(),
        lottieMeta: archiveValidation.meta,
        convertedFromBodymovinZip: archiveValidation.convertedFromBodymovinZip,
      }

      if (body.quizId) {
        associateMediaWithShow(injections.getPath, body.quizId, {
          name: item.name,
          url: item.url,
          type: item.type,
          size: item.size,
          addedAt: item.addedAt,
          lottieMeta: item.lottieMeta,
        })
      }

      return c.json(item, StatusCodes.CREATED)
    }

    const validation = validateLottieJson(body.content)
    if (!validation.valid) {
      return c.json(
        {
          error: validation.error,
          code: validation.code,
          reason: validation.reason,
        },
        StatusCodes.BAD_REQUEST,
      )
    }

    const safeName = `${rawBaseName || "lottie"}-${uniqueSuffix}.json`
    const filePath = path.join(mediaDir, safeName)
    const tmpPath = `${filePath}.${process.pid}.tmp`
    const serialized = validation.sanitizedJson
    fs.writeFileSync(tmpPath, serialized, "utf-8")
    fs.renameSync(tmpPath, filePath)

    const url = `/media/${safeName}`
    const item = {
      name: safeName,
      url,
      type: "lottie" as const,
      format: "json" as const,
      size: Buffer.byteLength(serialized, "utf-8"),
      addedAt: Date.now(),
      lottieMeta: validation.meta,
    }

    if (body.quizId) {
      associateMediaWithShow(injections.getPath, body.quizId, item)
    }

    return c.json(item, StatusCodes.CREATED)
  })

  // GET /lottie/:name -> 200 JSON or .lottie binary
  app.get("/lottie/:name", (c) => {
    const name = c.req.param("name")
    if (
      !/^[a-zA-Z0-9_-]+\.(json|lottie)$/u.test(name) ||
      name.includes("..")
    ) {
      return c.json(
        { error: "errors:media.invalidName" },
        StatusCodes.BAD_REQUEST,
      )
    }
    const mediaDir = injections.getPath("media")
    const filePath = path.join(mediaDir, name)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return c.json({ error: "errors:media.notFound" }, StatusCodes.NOT_FOUND)
    }

    if (name.toLowerCase().endsWith(".lottie")) {
      const rawBytes = new Uint8Array(fs.readFileSync(filePath))
      const validation = validateDotLottieContainer(rawBytes, {
        allowBodymovinZipConversion: false,
      })
      if (!validation.valid) {
        return c.json({ error: validation.error }, StatusCodes.BAD_REQUEST)
      }
      return c.body(rawBytes as unknown as ArrayBuffer, StatusCodes.OK, {
        "Content-Type": "application/zip",
      })
    }

    const raw = fs.readFileSync(filePath, "utf-8")
    const validation = validateLottieJson(raw)
    if (!validation.valid) {
      return c.json({ error: validation.error }, StatusCodes.BAD_REQUEST)
    }
    return c.body(raw, StatusCodes.OK, {
      "Content-Type": "application/json; charset=utf-8",
    })
  })

  // DELETE /lottie/:name -> 204 or 409 Conflict when referenced
  app.delete("/lottie/:name", (c) => {
    const name = c.req.param("name")
    if (
      !/^[a-zA-Z0-9_-]+\.(json|lottie)$/u.test(name) ||
      name.includes("..")
    ) {
      return c.json(
        { error: "errors:media.invalidName" },
        StatusCodes.BAD_REQUEST,
      )
    }
    const detach = c.req.query("detach") === "true"
    const mediaDir = injections.getPath("media")
    const filePath = path.join(mediaDir, name)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return c.json({ error: "errors:media.notFound" }, StatusCodes.NOT_FOUND)
    }

    const txResult = executeMediaDeleteTransaction(injections.getPath, name, {
      detach,
      deleteMediaFn: () => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      },
    })

    if (!txResult.allowed) {
      return c.json(
        {
          error: txResult.error ?? "errors:extensions.mediaInUse",
          references: txResult.references,
        },
        StatusCodes.CONFLICT,
      )
    }

    return c.body(null, StatusCodes.NO_CONTENT)
  })

  return app
}
