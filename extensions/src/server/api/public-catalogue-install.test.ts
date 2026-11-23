import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { MiddlewareHandler } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  publicDemoCatalogue,
  getPublicDemo,
} from "../../core/show-library/public-demo-catalogue"
import { CompositeStorageService } from "../storage/service"
import type { StorageInjections } from "../storage/sidecar"
import { installPublicCatalogueGame } from "./public-catalogue-install"
import { createExtensionRoutes } from "./routes"

const roots: string[] = []

function account() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tadazz-gallery-"))
  roots.push(root)
  const quizzes = new Map<string, Record<string, unknown>>()
  const injections: StorageInjections = {
    getPath: (subPath = "") => path.join(root, subPath),
    getQuizzById: (id) => {
      const quiz = quizzes.get(id)

      if (!quiz) {
        throw new Error("Not found")
      }

      return structuredClone(quiz)
    },
    saveQuizz: (input) => {
      const id = randomUUID()
      quizzes.set(id, { id, ...(input as Record<string, unknown>) })

      return { id }
    },
    updateQuizz: (id, input) => {
      if (!quizzes.has(id)) {
        throw new Error("Not found")
      }

      quizzes.set(id, { id, ...(input as Record<string, unknown>) })

      return { id }
    },
    deleteQuizz: (id) => {
      quizzes.delete(id)
    },
  }

  return { injections, quizzes, root }
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("public gallery installation", () => {
  it("imports every public game with its questions and site-wide theme", () => {
    vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
    const owner = account()
    const service = new CompositeStorageService(owner.injections)
    for (const metadata of publicDemoCatalogue) {
      const installed = installPublicCatalogueGame(
        owner.injections,
        metadata.id,
      )
      const saved = service.getCompositeQuiz(installed.quizzId)
      expect(installed.created).toBe(true)
      expect(saved.quizz.subject).toBe(metadata.title)
      expect(saved.extras?.schemaVersion).toBe(2)

      if (saved.extras?.schemaVersion !== 2) {
        throw new Error("Missing native show")
      }

      expect(saved.extras.defaults.showTheme?.id).toBe(metadata.themeId)
      expect(saved.quizz.questions).toHaveLength(metadata.questionCount)
      expect(installed.editorUrl).toBe(`/manager/quizz/${installed.quizzId}`)
      expect(installed.launchUrl).toBe(
        `/studio/prepare?quiz=${installed.quizzId}`,
      )
    }
    expect(owner.quizzes.size).toBe(publicDemoCatalogue.length)
  })

  it("reuses only the current account's copy and preserves user edits on repeated clicks", () => {
    vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
    const alice = account(),
      bob = account()
    const first = installPublicCatalogueGame(alice.injections, "quiz")
    const foreign = installPublicCatalogueGame(bob.injections, "quiz")
    expect(first.quizzId).not.toBe(foreign.quizzId)
    const edited = alice.quizzes.get(first.quizzId)!
    edited.subject = "My personalised quiz"
    const next = installPublicCatalogueGame(alice.injections, "quiz")
    expect(next).toMatchObject({ quizzId: first.quizzId, created: false })
    expect(alice.quizzes.get(first.quizzId)?.subject).toBe(
      "My personalised quiz",
    )
    expect(bob.quizzes.get(foreign.quizzId)?.subject).toBe(
      getPublicDemo("quiz")?.metadata.title,
    )
    expect(alice.quizzes.size).toBe(1)
    expect(bob.quizzes.size).toBe(1)
  })

  it("allows a deleted copy to be recreated without reusing its old native IDs", () => {
    vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
    const owner = account()
    const first = installPublicCatalogueGame(owner.injections, "family")
    new CompositeStorageService(owner.injections).deleteCompositeQuiz(
      first.quizzId,
    )
    const second = installPublicCatalogueGame(owner.injections, "family")
    expect(second.created).toBe(true)
    expect(second.quizzId).not.toBe(first.quizzId)
    expect(owner.quizzes.size).toBe(1)
  })

  it("denies unknown IDs, traversal and withdrawn public content without writing", () => {
    const owner = account()
    vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
    for (const id of ["../quiz", "private-user-game", "quiz/../../other"]) {
      expect(() => installPublicCatalogueGame(owner.injections, id)).toThrow()
    }
    vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "false")
    expect(() => installPublicCatalogueGame(owner.injections, "quiz")).toThrow()
    expect(owner.quizzes.size).toBe(0)
    expect(fs.readdirSync(owner.root)).toEqual([])
  })

  it("serves public content without credentials but never allows anonymous installation", async () => {
    vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
    vi.stubEnv("TADAZZ_INLINE_GAME_PREVIEW_ENABLED", "true")
    const owner = account()
    const auth: MiddlewareHandler = async (c, next) => {
      if (c.req.header("Authorization") !== "Bearer gallery-test") {
        return c.json({ error: "Unauthorized" }, 401)
      }

      await next()
    }
    const app = createExtensionRoutes(owner.injections, auth)
    expect((await app.request("/catalogue")).status).toBe(200)
    expect((await app.request("/preview/public/family")).status).toBe(200)
    expect(
      (await app.request("/catalogue/family/install", { method: "POST" }))
        .status,
    ).toBe(401)
    expect(owner.quizzes.size).toBe(0)
    const response = await app.request("/catalogue/family/install", {
      method: "POST",
      headers: { Authorization: "Bearer gallery-test" },
    })
    expect(response.status).toBe(201)
    expect(owner.quizzes.size).toBe(1)
    expect(
      (
        await app.request("/catalogue/family/install", {
          method: "POST",
          headers: { Authorization: "Bearer gallery-test" },
        })
      ).status,
    ).toBe(200)
  })
})
