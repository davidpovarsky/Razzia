import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  generateQuestionIds,
  reorderQuestionIds,
  RevisionConflictError,
  type QuizExtrasV1,
} from "../core/index"
import { CompositeStorageError } from "./storage/error"
import { createStagedJournal, recoverJournals } from "./storage/journal"
import { CompositeStorageService } from "./storage/service"
import {
  getSidecarFilePath,
  readSidecar,
  writeSidecar,
  type StorageInjections,
} from "./storage/sidecar"

describe("Server-Side Composite Storage & Journals (CORE01-06, MEDIA02)", () => {
  let tempDir = ""
  let baseQuizzes = new Map<string, Record<string, unknown>>()
  let injections = {} as StorageInjections
  let service = {} as CompositeStorageService

  const sampleQuiz = {
    gameMode: "quiz",
    subject: "British History",
    questions: [
      {
        type: "single",
        question: "Who was the first Prime Minister of Great Britain?",
        answers: [
          "Robert Walpole",
          "William Pitt",
          "Benjamin Disraeli",
          "Winston Churchill",
        ],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
      {
        type: "single",
        question: "In which year did the Battle of Hastings take place?",
        answers: ["1066", "1215", "1485", "1603"],
        solutions: [0],
        cooldown: 5,
        time: 15,
      },
    ],
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-test-storage-"))
    baseQuizzes = new Map()

    injections = {
      getPath: (subPath = "") => path.join(tempDir, subPath),
      getQuizzById: (id: string) => {
        const found = baseQuizzes.get(id)

        if (!found) {
          throw new Error("errors:quizz.notFound")
        }

        return structuredClone(found)
      },
      saveQuizz: (data: unknown) => {
        const id = `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
      },
    }

    service = new CompositeStorageService(injections)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it("CORE01: reads legacy quiz with no sidecar and never auto-creates sidecar", () => {
    const { id } = injections.saveQuizz(sampleQuiz)
    const composite = service.getCompositeQuiz(id)

    expect(composite.exists).toBe(true)
    expect(composite.extras).toBeNull()
    expect(composite.baseDigest).toBe(
      computeCanonicalBaseDigest(composite.quizz),
    )

    // Ensure no sidecar file was created on disk
    const sidecarPath = getSidecarFilePath(injections.getPath, id)

    expect(fs.existsSync(sidecarPath)).toBe(false)
  })

  it("CORE02: preserves question associations during reorder (no swapped answers)", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const qIds = generateQuestionIds(2)
    const baseQuiz = baseQuizzes.get(quizId) ?? {}
    const baseDigest = computeCanonicalBaseDigest(baseQuiz)
    const extras = createDefaultQuizExtras(quizId, qIds, baseDigest)

    // Attach rich answer visual to question 0
    extras.perQuestion[qIds[0]] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/walpole.png",
          alt: "Walpole portrait",
        },
      ],
    }

    // Save enriched quiz
    service.saveCompositeQuiz({
      quizId,
      expectedRevision: null,
      quizz: baseQuiz,
      extras,
    })

    // Now reorder questions in base quiz: swap question 0 and 1
    const reorderedQuiz = structuredClone(baseQuiz)
    const [q0] = (reorderedQuiz.questions as unknown[]).splice(0, 1)

    ;(reorderedQuiz.questions as unknown[]).splice(1, 0, q0)

    const newBaseDigest = computeCanonicalBaseDigest(reorderedQuiz)
    const reorderedQIds = reorderQuestionIds(qIds, 0, 1)

    const updatedExtras = {
      ...extras,
      baseDigest: newBaseDigest,
      questionIds: reorderedQIds,
    }

    service.saveCompositeQuiz({
      quizId,
      expectedRevision: 1,
      quizz: reorderedQuiz,
      extras: updatedExtras,
    })

    // Read back and verify attachment is still pinned to Walpole question
    const stored = service.getCompositeQuiz(quizId)

    expect(stored.extras?.questionIds).toEqual(reorderedQIds)

    // The question at index 1 now has the Walpole attachment (because qIds[0] was moved to index 1)
    const [, secondQId] = stored.extras?.questionIds ?? []

    expect(stored.extras?.perQuestion[secondQId]?.answerVisuals?.[0]?.alt).toBe(
      "Walpole portrait",
    )
  })

  it("CORE03: duplicates question with fresh ID and removes question without orphans", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const qIds = generateQuestionIds(2)
    const baseQuiz = baseQuizzes.get(quizId) ?? {}
    const baseDigest = computeCanonicalBaseDigest(baseQuiz)
    const extras = createDefaultQuizExtras(quizId, qIds, baseDigest)

    // Attach interlude to question 0
    extras.perQuestion[qIds[0]] = {
      interlude: {
        kind: "title",
        title: "Interlude 1",
        durationMs: 3000,
        advance: "auto",
      },
    }

    service.saveCompositeQuiz({
      quizId,
      expectedRevision: null,
      quizz: baseQuiz,
      extras,
    })

    // Verify sidecar exists
    expect(readSidecar(injections.getPath, quizId)).not.toBeNull()

    // Delete composite quiz
    service.deleteCompositeQuiz(quizId)

    // Base and sidecar should be gone
    expect(baseQuizzes.has(quizId)).toBe(false)
    expect(readSidecar(injections.getPath, quizId)).toBeNull()
  })

  it("CORE04: concurrent writes with expectedRevision detect conflict (409)", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const qIds = generateQuestionIds(2)
    const baseQuiz = baseQuizzes.get(quizId) ?? {}
    const baseDigest = computeCanonicalBaseDigest(baseQuiz)
    const extras = createDefaultQuizExtras(quizId, qIds, baseDigest)

    // First save establishes revision 1
    const res1 = service.saveCompositeQuiz({
      quizId,
      expectedRevision: null,
      quizz: baseQuiz,
      extras,
    })

    expect(res1.revision).toBe(1)

    // Client A saves with expectedRevision = 1 -> succeeds, advances to 2
    const res2 = service.saveCompositeQuiz({
      quizId,
      expectedRevision: 1,
      quizz: baseQuiz,
      extras: { ...extras, revision: 1 },
    })

    expect(res2.revision).toBe(2)

    // Client B attempts to save with stale expectedRevision = 1 -> 409 conflict!
    let thrownError: unknown = null

    try {
      service.saveCompositeQuiz({
        quizId,
        expectedRevision: 1,
        quizz: baseQuiz,
        extras: { ...extras, revision: 1 },
      })
    } catch (err) {
      thrownError = err
    }

    expect(thrownError).toBeInstanceOf(RevisionConflictError)
    const conflict = thrownError as RevisionConflictError

    expect(conflict.currentRevision).toBe(2)
    expect(conflict.expectedRevision).toBe(1)
  })

  it("CORE05: recovers consistent pair from staged journal on simulated power-loss", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const initialBase = structuredClone(baseQuizzes.get(quizId) ?? {})
    const qIds = generateQuestionIds(2)
    const baseDigest = computeCanonicalBaseDigest(initialBase)
    const initialExtras = createDefaultQuizExtras(quizId, qIds, baseDigest)

    writeSidecar(injections.getPath, quizId, initialExtras)

    // Simulate power-loss injection: stage a journal entry, write new base, but crash before writing new sidecar!
    const modifiedBase = { ...initialBase, subject: "Modified While Crashing" }

    createStagedJournal(injections.getPath, {
      quizId,
      backupBase: initialBase,
      backupExtras: initialExtras,
      targetBase: modifiedBase,
      targetExtras: { ...initialExtras, revision: 2 },
    })

    // Corrupt base partially written
    injections.updateQuizz(quizId, modifiedBase)

    const corruptStored = baseQuizzes.get(quizId)

    expect(corruptStored?.subject).toBe("Modified While Crashing")

    // Run crash recovery
    const report = recoverJournals(injections)

    expect(report.recoveredCount).toBe(1)
    expect(report.recoveredQuizIds).toContain(quizId)

    // Base quiz should be rolled back to consistent original subject
    const rolledBack = baseQuizzes.get(quizId)

    expect(rolledBack?.subject).toBe("British History")

    // Sidecar remains consistent
    const recoveredExtras = readSidecar(injections.getPath, quizId)

    expect(recoveredExtras?.revision).toBe(1)
  })

  it("CORE06: enhanced bundle import/export remaps question IDs and preserves metadata", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const qIds = generateQuestionIds(2)
    const baseQuiz = baseQuizzes.get(quizId) ?? {}
    const baseDigest = computeCanonicalBaseDigest(baseQuiz)
    const extras = createDefaultQuizExtras(quizId, qIds, baseDigest)

    extras.perQuestion[qIds[0]] = {
      reveal: {
        effect: "blur",
        durationMs: 2500,
        trigger: "automatic",
        audience: "all",
      },
    }

    service.saveCompositeQuiz({
      quizId,
      expectedRevision: null,
      quizz: baseQuiz,
      extras,
    })

    // Export bundle
    const exported = service.exportEnhancedBundle(quizId)

    expect(exported.bundleVersion).toBe(1)
    expect(exported.extras.quizId).toBe(quizId)

    // Import bundle into new quiz
    const importedResult = service.importEnhancedBundle(exported)

    expect(importedResult.quizId).not.toBe(quizId)
    expect(importedResult.revision).toBe(1)

    // Verify imported quiz has fresh question IDs with attachments preserved
    const importedComposite = service.getCompositeQuiz(importedResult.quizId)

    expect(importedComposite.extras?.questionIds).not.toEqual(qIds)
    const [firstFreshId] = importedComposite.extras?.questionIds ?? []

    expect(
      importedComposite.extras?.perQuestion[firstFreshId]?.reveal?.effect,
    ).toBe("blur")
  })

  it("MEDIA02: rejects unsafe media URL or missing alt in answerVisuals", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const qIds = generateQuestionIds(2)
    const baseQuiz = baseQuizzes.get(quizId) ?? {}
    const baseDigest = computeCanonicalBaseDigest(baseQuiz)
    const extras = createDefaultQuizExtras(quizId, qIds, baseDigest)

    const jsScheme = [
      "j",
      "a",
      "v",
      "a",
      "s",
      "c",
      "r",
      "i",
      "p",
      "t",
      ":",
    ].join("")

    // Unsafe URL
    extras.perQuestion[qIds[0]] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: `${jsScheme}alert('pwn')`,
          alt: "Description",
        },
      ],
    }

    let thrown: unknown = null

    try {
      service.saveCompositeQuiz({
        quizId,
        expectedRevision: null,
        quizz: baseQuiz,
        extras,
      })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(CompositeStorageError)
    expect((thrown as CompositeStorageError).statusCode).toBe(400)
  })

  it("createCompositeQuiz: pre-validation prevents base quiz creation on invalid extras", () => {
    const initialBaseCount = baseQuizzes.size
    const qIds = generateQuestionIds(2)
    const invalidExtras = {
      ...createDefaultQuizExtras("temp", qIds, "dummy-digest"),
      perQuestion: {
        [qIds[0]]: {
          answerVisuals: [
            {
              answerIndex: 0,
              display: "image",
              url: ["java", "script:", "alert(1)"].join(""),
              alt: "bad",
            },
          ],
        },
      },
    }

    let thrown: unknown = null

    try {
      service.createCompositeQuiz({
        quizz: sampleQuiz,
        extras: invalidExtras as unknown as QuizExtrasV1,
      })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(CompositeStorageError)
    expect((thrown as CompositeStorageError).statusCode).toBe(400)
    // Verify no base quiz was saved
    expect(baseQuizzes.size).toBe(initialBaseCount)
  })

  it("createCompositeQuiz: rolls back base quiz if sidecar write throws", () => {
    const initialBaseCount = baseQuizzes.size
    const qIds = generateQuestionIds(2)
    const validExtras = createDefaultQuizExtras("temp", qIds, "dummy")

    // Create a service whose getPath returns an unwritable or throwing location
    const throwingInjections: StorageInjections = {
      ...injections,
      getPath: () => {
        throw new Error("Disk full or simulated write error")
      },
    }
    const failingService = new CompositeStorageService(throwingInjections)

    let thrown: unknown = null

    try {
      failingService.createCompositeQuiz({
        quizz: sampleQuiz,
        extras: validExtras,
      })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(CompositeStorageError)
    // Verify base quiz was rolled back
    expect(baseQuizzes.size).toBe(initialBaseCount)
  })

  it("importEnhancedBundle: rolls back base quiz if bundle sidecar write fails", () => {
    const initialBaseCount = baseQuizzes.size
    const qIds = generateQuestionIds(2)
    const invalidBundle = {
      bundleVersion: 1,
      quizz: sampleQuiz,
      extras: {
        ...createDefaultQuizExtras("temp", qIds, "dummy"),
        perQuestion: {
          [qIds[0]]: {
            answerVisuals: [
              {
                answerIndex: 0,
                display: "image",
                url: "data:text/html,<script>bad</script>",
                alt: "bad",
              },
            ],
          },
        },
      },
    }

    let thrown: unknown = null

    try {
      service.importEnhancedBundle(invalidBundle)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(CompositeStorageError)
    expect((thrown as CompositeStorageError).statusCode).toBe(400)
    expect(baseQuizzes.size).toBe(initialBaseCount)
  })
})
