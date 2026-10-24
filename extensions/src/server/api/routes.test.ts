import type { MiddlewareHandler } from "hono"
import { describe, expect, it } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  generateQuestionIds,
} from "../../core/index"
import type { StorageInjections } from "../storage/sidecar"
import { createExtensionRoutes } from "./routes"

interface QuizResponse {
  quizId: string
  revision: number
  baseDigest: string
  exists?: boolean
  error?: string
}

describe("Hono Composite REST Routes (/api/extensions) (SEC01, CORE01, CORE04)", () => {
  const sampleQuiz = {
    gameMode: "quiz",
    subject: "Science Quiz",
    questions: [
      {
        type: "single",
        question: "What is H2O?",
        answers: ["Water", "Oxygen", "Hydrogen", "Helium"],
        solutions: [0],
        cooldown: 5,
        time: 15,
      },
    ],
  }

  const baseQuizzes = new Map<string, Record<string, unknown>>()
  const sidecars = new Map<string, string>()

  const injections: StorageInjections = {
    getPath: (subPath = "") => `/fake/${subPath}`,
    getQuizzById: (id: string) => {
      const found = baseQuizzes.get(id)

      if (!found) {
        throw new Error("errors:quizz.notFound")
      }

      return structuredClone(found)
    },
    saveQuizz: (data: unknown) => {
      const id = `quiz-${baseQuizzes.size + 1}`
      const record = { id, ...(data as Record<string, unknown>) }

      baseQuizzes.set(id, record)

      return { id }
    },
    updateQuizz: (id: string, data: unknown) => {
      if (!baseQuizzes.has(id)) {
        throw new Error("errors:quizz.notFound")
      }

      const record = { id, ...(data as Record<string, unknown>) }

      baseQuizzes.set(id, record)

      return { id }
    },
    deleteQuizz: (id: string) => {
      baseQuizzes.delete(id)
      sidecars.delete(id)
    },
  }

  // Create app without auth for testing business routes
  const app = createExtensionRoutes(injections)

  it("POST /quizzes creates composite quiz and returns 201", async () => {
    const qIds = generateQuestionIds(1)
    const baseDigest = computeCanonicalBaseDigest(sampleQuiz)
    const extras = createDefaultQuizExtras("temp-id", qIds, baseDigest)

    const res = await app.request("/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizz: sampleQuiz,
        extras,
      }),
    })

    expect(res.status).toBe(201)
    const data = (await res.json()) as QuizResponse

    expect(data.quizId).toBeDefined()
    expect(data.revision).toBe(1)
    expect(data.baseDigest).toBe(baseDigest)
  })

  it("GET /quizzes/:id returns 200 with composite data or 404 for unknown", async () => {
    // Unknown ID
    const res404 = await app.request("/quizzes/nonexistent")

    expect(res404.status).toBe(404)

    // Existing quiz created earlier
    const [existingId] = Array.from(baseQuizzes.keys())
    const res200 = await app.request(`/quizzes/${existingId}`)

    expect(res200.status).toBe(200)
    const data = (await res200.json()) as QuizResponse

    expect(data.quizId).toBe(existingId)
    expect(data.exists).toBe(true)
  })

  it("PUT /quizzes/:id returns 409 on revision conflict", async () => {
    const [existingId] = Array.from(baseQuizzes.keys())
    const qIds = generateQuestionIds(1)
    const baseDigest = computeCanonicalBaseDigest(sampleQuiz)
    const extras = createDefaultQuizExtras(existingId, qIds, baseDigest)

    // Save with revision 1 -> succeeds
    const res1 = await app.request(`/quizzes/${existingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: 1,
        quizz: sampleQuiz,
        extras,
      }),
    })

    expect(res1.status).toBe(200)

    // Save again with stale expectedRevision (expectedRevision: 1 when current is 2)
    const resConflict = await app.request(`/quizzes/${existingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: 1,
        quizz: sampleQuiz,
        extras: { ...extras, revision: 1 },
      }),
    })

    expect(resConflict.status).toBe(409)
    const conflictData = (await resConflict.json()) as QuizResponse

    expect(conflictData.error).toContain("revisionConflict")
  })

  it("GET /export/:id and POST /import remaps quiz bundle", async () => {
    const [existingId] = Array.from(baseQuizzes.keys())

    // Export
    const exportRes = await app.request(`/export/${existingId}`)

    expect(exportRes.status).toBe(200)
    const bundle: unknown = await exportRes.json()

    // Import
    const importRes = await app.request("/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    })

    expect(importRes.status).toBe(201)
    const importData = (await importRes.json()) as QuizResponse

    expect(importData.quizId).not.toBe(existingId)
    expect(importData.revision).toBe(1)
  })

  it("SEC01: rejects unauthenticated requests when requireManager is active", async () => {
    const authRejectMiddleware: MiddlewareHandler = async (c, next) => {
      const auth = c.req.header("Authorization")

      if (!auth?.startsWith("Bearer manager-token")) {
        return c.json({ error: "errors:auth.unauthorized" }, 401)
      }

      await next()
    }

    const secureApp = createExtensionRoutes(injections, authRejectMiddleware)

    // Request without auth
    const unauthRes = await secureApp.request("/quizzes/some-id")

    expect(unauthRes.status).toBe(401)

    // Request with valid auth
    const [firstId] = Array.from(baseQuizzes.keys())
    const authRes = await secureApp.request(`/quizzes/${firstId}`, {
      headers: { Authorization: "Bearer manager-token" },
    })

    expect(authRes.status).toBe(200)
  })
})
