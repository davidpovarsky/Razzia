import { EXAMPLE_QUIZZ_IMAGE, QUIZZ_MODES } from "@razzia/common/constants"
import type { GameResult } from "@razzia/common/types/game"
import { CompositeStorageService } from "@razzia/extensions/server"
import { readAccountPreviewSource } from "../../../../extensions/src/server/api/account-preview-source"
import { createHash } from "node:crypto"
import {
  deleteQuizz,
  deleteResult,
  getPath,
  getQuizz,
  getQuizzById,
  getQuizzMeta,
  getResultById,
  getResultsMeta,
  initConfig,
  saveQuizz,
  saveResult,
  updateQuizz,
} from "@razzia/socket/services/config"
import { DomainError } from "@razzia/socket/services/errors"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import fs from "fs"
import { dirname, join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const quizzDir = () => getPath("quizz")
const resultsDir = () => getPath("results")

const writeJson = (path: string, data: unknown) =>
  fs.writeFileSync(path, JSON.stringify(data))

const createResult = (overrides: Partial<GameResult> = {}): GameResult => ({
  id: "result",
  gameMode: QUIZZ_MODES.QUIZ,
  subject: "Subject",
  date: "2026-01-01T00:00:00.000Z",
  players: [],
  questions: [],
  ...overrides,
})

const expectDomainError = (fn: () => unknown, key: string) => {
  expect(fn).toThrow(DomainError)
  expect(fn).toThrow(key)
}

beforeEach(() => {
  fs.rmSync(getPath(), { recursive: true, force: true })
  initConfig()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("initConfig", () => {
  it("creates the example quizz on first launch", () => {
    expect(getQuizz().map((q) => q.subject)).toEqual(["Example Quizz"])
  })

  it("seeds real local image bytes admitted by the strict read-only preview", () => {
    const [example] = getQuizz()
    const source = getPath("quizz/example.json")
    const before = fs.readFileSync(source)
    const url = `/media/${EXAMPLE_QUIZZ_IMAGE.name}`
    const image = fs.readFileSync(getPath(`media/${EXAMPLE_QUIZZ_IMAGE.name}`))

    expect(image.length).toBe(EXAMPLE_QUIZZ_IMAGE.bytes)
    expect(image.readUInt32BE(16)).toBe(512)
    expect(image.readUInt32BE(20)).toBe(512)
    expect(createHash("sha256").update(image).digest("hex")).toBe(
      EXAMPLE_QUIZZ_IMAGE.sha256,
    )
    expect(
      example.questions.flatMap((question) =>
        question.media ? [question.media.url] : [],
      ),
    ).toEqual([url, url])
    const preview = readAccountPreviewSource({ getPath }, example.id)
    expect(preview.assets.filter((asset) => asset.url === url)).toEqual([
      {
        url,
        sha256: EXAMPLE_QUIZZ_IMAGE.sha256,
        bytes: EXAMPLE_QUIZZ_IMAGE.bytes,
      },
    ])
    expect(fs.readFileSync(source)).toEqual(before)
    expect(fs.existsSync(getPath("extensions/quizzes"))).toBe(false)
  })

  it("retains local image admission after same-owner export and import", () => {
    const [example] = getQuizz()
    const before = fs.readFileSync(getPath("quizz/example.json"))
    const service = new CompositeStorageService({
      getPath,
      getQuizzById,
      saveQuizz,
      updateQuizz,
      deleteQuizz,
    })
    const imported = service.importEnhancedBundle(
      service.exportEnhancedBundle(example.id),
    )
    expect(imported.quizId).not.toBe(example.id)
    expect(getQuizzById(imported.quizId).questions).toEqual(example.questions)
    const preview = readAccountPreviewSource({ getPath }, imported.quizId)
    expect(preview.assets).toContainEqual({
      url: `/media/${EXAMPLE_QUIZZ_IMAGE.name}`,
      sha256: EXAMPLE_QUIZZ_IMAGE.sha256,
      bytes: EXAMPLE_QUIZZ_IMAGE.bytes,
    })
    expect(fs.readFileSync(getPath("quizz/example.json"))).toEqual(before)
  })

  it("seeds a relocated native bundle from the configured built site", () => {
    const bytes = fs.readFileSync(getPath(`media/${EXAMPLE_QUIZZ_IMAGE.name}`))
    const dist = getPath("isolated-built-site")
    const artifact = join(dist, EXAMPLE_QUIZZ_IMAGE.publicPath)
    fs.mkdirSync(dirname(artifact), { recursive: true })
    fs.writeFileSync(artifact, bytes)
    fs.rmSync(quizzDir(), { recursive: true })
    fs.rmSync(getPath("media"), { recursive: true })
    vi.stubEnv("TADAZZ_SITE_DIST_DIR", dist)

    initConfig()

    const [example] = getQuizz()
    expect(
      fs.readFileSync(getPath(`media/${EXAMPLE_QUIZZ_IMAGE.name}`)),
    ).toEqual(bytes)
    expect(
      readAccountPreviewSource({ getPath }, example.id).assets,
    ).toContainEqual({
      url: `/media/${EXAMPLE_QUIZZ_IMAGE.name}`,
      sha256: EXAMPLE_QUIZZ_IMAGE.sha256,
      bytes: EXAMPLE_QUIZZ_IMAGE.bytes,
    })
  })

  it("never masks a missing configured build asset with a source-tree fallback", () => {
    const dist = getPath("incomplete-built-site")
    fs.mkdirSync(dist)
    fs.rmSync(quizzDir(), { recursive: true })
    fs.rmSync(getPath("media"), { recursive: true })
    vi.stubEnv("TADAZZ_SITE_DIST_DIR", dist)

    expect(initConfig).toThrow("Bundled example image unavailable")
    expect(fs.existsSync(quizzDir())).toBe(false)
    expect(fs.existsSync(getPath("media"))).toBe(false)
  })

  it("rejects a relative built site path instead of resolving it against cwd", () => {
    fs.rmSync(quizzDir(), { recursive: true })
    vi.stubEnv("TADAZZ_SITE_DIST_DIR", "relative-built-site")

    expect(initConfig).toThrow("Example image site dist must be absolute")
    expect(fs.existsSync(quizzDir())).toBe(false)
  })

  it("does not rewrite existing games or recreate their missing media on restart or read", () => {
    const file = getPath("quizz/example.json")
    const existing = fs
      .readFileSync(file, "utf8")
      .replaceAll(
        `/media/${EXAMPLE_QUIZZ_IMAGE.name}`,
        "https://placehold.co/600x400.png",
      )
    fs.writeFileSync(file, existing)
    const image = getPath(`media/${EXAMPLE_QUIZZ_IMAGE.name}`)
    fs.rmSync(image)

    initConfig()
    getQuizz()

    expect(fs.readFileSync(file, "utf8")).toBe(existing)
    expect(fs.existsSync(image)).toBe(false)
  })

  it("does not overwrite colliding user media or create a seed with wrong bytes", () => {
    fs.rmSync(quizzDir(), { recursive: true })
    const image = getPath(`media/${EXAMPLE_QUIZZ_IMAGE.name}`)
    fs.writeFileSync(image, "existing owner media")

    expect(initConfig).toThrow("Existing example image differs")
    expect(fs.readFileSync(image, "utf8")).toBe("existing owner media")
    expect(fs.existsSync(quizzDir())).toBe(false)
  })
})

describe("quizz storage", () => {
  it("saves, reads, updates and deletes a quizz", () => {
    const { id } = saveQuizz(createQuizz([createQuestion()]))

    expect(getQuizzById(id).subject).toBe("Test quizz")

    updateQuizz(id, { ...createQuizz([createQuestion()]), subject: "Renamed" })

    expect(getQuizzById(id).subject).toBe("Renamed")

    deleteQuizz(id)

    expectDomainError(() => getQuizzById(id), "errors:quizz.notFound")
  })

  it("rejects an invalid quizz with the first error key", () => {
    expectDomainError(
      () => saveQuizz(createQuizz([])),
      "errors:quizz.noQuestions",
    )
  })

  it("lists quizz sorted by subject, numbers included", () => {
    saveQuizz({ ...createQuizz([createQuestion()]), subject: "Quizz 10" })
    saveQuizz({ ...createQuizz([createQuestion()]), subject: "quizz 2" })

    expect(getQuizzMeta().map((q) => q.subject)).toEqual([
      "Example Quizz",
      "quizz 2",
      "Quizz 10",
    ])
  })

  it("includes the saved quiz timestamp and carries a result's quiz identity", () => {
    const file = join(quizzDir(), "edited-show.json")
    const editedAt = new Date("2026-11-25T08:00:00.000Z")
    writeJson(file, { id: "edited", ...createQuizz([createQuestion()]) })
    fs.utimesSync(file, editedAt, editedAt)
    saveResult(createResult({ quizId: "edited" }))

    expect(getQuizzMeta().find((quiz) => quiz.id === "edited")).toMatchObject({
      updatedAt: editedAt.toISOString(),
    })
    expect(getResultsMeta()[0]?.quizId).toBe("edited")
  })

  it("skips invalid files and assigns an id to files without one", () => {
    writeJson(join(quizzDir(), "broken.json"), { subject: "" })
    fs.writeFileSync(join(quizzDir(), "unreadable.json"), "{")
    writeJson(join(quizzDir(), "legacy.json"), {
      subject: "Legacy",
      questions: [
        {
          question: "Q",
          answers: ["A", "B"],
          solutions: 0,
          cooldown: 5,
          time: 10,
        },
      ],
    })

    const legacy = getQuizz().find((q) => q.subject === "Legacy")
    const stored = JSON.parse(
      fs.readFileSync(join(quizzDir(), "legacy.json"), "utf-8"),
    ) as { id?: string }

    expect(getQuizz()).toHaveLength(2)
    expect(legacy?.id).toBeTypeOf("string")
    expect(stored.id).toBe(legacy?.id)
  })

  it("never resolves an id to a file outside of the quizz folder", () => {
    writeJson(getPath("secret.json"), createQuizz([createQuestion()]))

    expectDomainError(() => deleteQuizz("../secret"), "errors:quizz.notFound")
    expect(fs.existsSync(getPath("secret.json"))).toBe(true)
  })
})

describe("results storage", () => {
  it("lists results from the most recent one", () => {
    saveResult(createResult({ id: "old", date: "2026-01-01T00:00:00.000Z" }))
    saveResult(createResult({ id: "new", date: "2026-02-01T00:00:00.000Z" }))

    expect(getResultsMeta().map((r) => r.id)).toEqual(["new", "old"])
  })

  it("reads results saved before survey mode as quiz results", () => {
    fs.mkdirSync(resultsDir(), { recursive: true })
    writeJson(join(resultsDir(), "legacy.json"), {
      ...createResult({ id: "legacy" }),
      gameMode: undefined,
    })

    expect(getResultById("legacy").gameMode).toBe(QUIZZ_MODES.QUIZ)
    expect(getResultsMeta()[0].gameMode).toBe(QUIZZ_MODES.QUIZ)
  })

  it("deletes a result", () => {
    saveResult(createResult({ id: "to-delete" }))
    deleteResult("to-delete")

    expect(getResultsMeta()).toEqual([])
    expectDomainError(
      () => getResultById("to-delete"),
      "errors:result.notFound",
    )
  })
})
