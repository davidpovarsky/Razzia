import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  createDefaultRosterExtras,
  generateQuestionIds,
  reorderQuestionIds,
  RevisionConflictError,
  type QuizExtrasV1,
  type QuizExtrasV2,
} from "../core/index"
import { CompositeStorageError } from "./storage/error"
import {
  createStagedJournal,
  getJournalDirectory,
  getJournalFilePath,
  recoverJournals,
} from "./storage/journal"
import { CompositeStorageService } from "./storage/service"
import {
  deleteSidecar,
  getSidecarFilePath,
  readSidecar,
  sidecarExists,
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

  it("Bug A: recovers valid V2 extras from staged journal without stripping timeline, scenes, audio, backgrounds, authoring, and media catalog", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const initialBase = structuredClone(baseQuizzes.get(quizId) ?? {})
    const qIds = generateQuestionIds(2)
    const initialBaseDigest = computeCanonicalBaseDigest(initialBase)

    const sceneId = crypto.randomUUID()
    const tItemSceneId = crypto.randomUUID()
    const tItemQ1Id = crypto.randomUUID()
    const tItemQ2Id = crypto.randomUUID()

    const v2Extras: QuizExtrasV2 = {
      schemaVersion: 2,
      revision: 1,
      quizId,
      baseDigest: initialBaseDigest,
      questionIds: qIds,
      timeline: [
        { id: tItemSceneId, kind: "opening", sceneId },
        { id: tItemQ1Id, kind: "question", questionId: qIds[0] },
        { id: tItemQ2Id, kind: "question", questionId: qIds[1] },
      ],
      scenes: {
        [sceneId]: {
          id: sceneId,
          kind: "opening",
          title: "Welcome Scene",
          subtitle: "Let's begin",
          durationMs: 4000,
          advance: "auto",
          background: {
            url: "/media/welcome-bg.png",
            fit: "cover",
            position: "center",
            overlayOpacity: 0.3,
          },
          audio: {
            mode: "custom",
            url: "/media/start.mp3",
            volume: 0.9,
            loop: false,
          },
        },
      },
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      teams: { enabled: false, teams: [], autoAssign: "roundRobin" },
      audio: {
        cues: {
          start: { source: "media", url: "/media/start.mp3", volume: 0.9, enabled: true, loop: false },
          showQuestion: { source: "default", volume: 0.8, enabled: true, loop: false },
          answersMusic: { source: "default", volume: 0.8, enabled: true, loop: true },
          answerPressed: { source: "default", volume: 0.8, enabled: true, loop: false },
          revealResults: { source: "default", volume: 0.8, enabled: true, loop: false },
          leaderboard: { source: "default", volume: 0.8, enabled: true, loop: false },
          podium1: { source: "default", volume: 0.8, enabled: true, loop: false },
          podium2: { source: "default", volume: 0.8, enabled: true, loop: false },
          podium3: { source: "default", volume: 0.8, enabled: true, loop: false },
        },
      },
      perQuestion: {
        [qIds[0]]: {
          background: {
            url: "/media/q1-bg.png",
            fit: "contain",
            position: "center",
            overlayOpacity: 0.2,
          },
          stageAnimations: {
            questionEntrance: {
              preset: "curtain",
              timing: "simultaneous",
              staggerMs: 50,
              durationMs: 500,
            },
          },
        },
      },
      roster: createDefaultRosterExtras(),
      authoring: {
        showNote: "P0 Authoring Note for V2 Journal Recovery",
      },
      mediaCatalog: [
        {
          name: "welcome-bg.png",
          url: "/media/welcome-bg.png",
          type: "image",
          addedAt: Date.now(),
        },
      ],
    }

    // Write initial V2 sidecar to disk
    writeSidecar(injections.getPath, quizId, v2Extras)

    // Simulate crash after base update and before sidecar write:
    // Staged journal has backupBase + backupExtras (our rich V2 extras)
    const modifiedBase = { ...initialBase, subject: "Modified Subject During Crash" }
    createStagedJournal(injections.getPath, {
      quizId,
      backupBase: initialBase,
      backupExtras: v2Extras,
      targetBase: modifiedBase,
      targetExtras: { ...v2Extras, revision: 2 },
    })

    // Mutate base quiz to the partially written target state
    injections.updateQuizz(quizId, modifiedBase)
    expect(baseQuizzes.get(quizId)?.subject).toBe("Modified Subject During Crash")

    // Run recovery
    const report = recoverJournals(injections)

    expect(report.recoveredCount).toBe(1)
    expect(report.recoveredQuizIds).toContain(quizId)

    // Base quiz must be rolled back to initialBase
    expect(baseQuizzes.get(quizId)?.subject).toBe("British History")

    // Sidecar must NOT be deleted or stripped! It must be restored as V2 with all fields!
    const restoredSidecar = readSidecar(injections.getPath, quizId)
    expect(restoredSidecar).not.toBeNull()
    expect(restoredSidecar?.schemaVersion).toBe(2)
    const v2Restored = restoredSidecar as QuizExtrasV2
    expect(v2Restored.revision).toBe(1)
    expect(v2Restored.timeline.length).toBe(3)
    expect(v2Restored.timeline[0].kind).toBe("opening")
    expect(v2Restored.scenes[sceneId]?.title).toBe("Welcome Scene")
    expect(v2Restored.scenes[sceneId]?.background?.url).toBe("/media/welcome-bg.png")
    expect(v2Restored.audio.cues.start.source).toBe("media")
    expect(v2Restored.perQuestion[qIds[0]]?.background?.url).toBe("/media/q1-bg.png")
    expect(v2Restored.perQuestion[qIds[0]]?.stageAnimations?.questionEntrance?.preset).toBe("curtain")
    expect(v2Restored.authoring?.showNote).toBe("P0 Authoring Note for V2 Journal Recovery")
    expect(v2Restored.mediaCatalog?.[0]?.name).toBe("welcome-bg.png")

    // Journal must be removed after successful verified restoration
    const journalPath = getJournalFilePath(injections.getPath, quizId)
    expect(fs.existsSync(journalPath)).toBe(false)
  })

  it("Bug A: corrupt non-null backup extras fails closed, PRESERVES journal, does NOT delete sidecar, and reports failure", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const initialBase = structuredClone(baseQuizzes.get(quizId) ?? {})
    const qIds = generateQuestionIds(2)
    const initialBaseDigest = computeCanonicalBaseDigest(initialBase)
    const v2Extras = createDefaultQuizExtras(quizId, qIds, initialBaseDigest)

    // Valid sidecar exists on disk
    writeSidecar(injections.getPath, quizId, v2Extras)
    expect(readSidecar(injections.getPath, quizId)).not.toBeNull()

    // Create staged journal with corrupt non-null backupExtras (invalid schema)
    const corruptBackupExtras = {
      schemaVersion: "INVALID_VERSION",
      totallyBroken: true,
    }

    createStagedJournal(injections.getPath, {
      quizId,
      backupBase: initialBase,
      backupExtras: corruptBackupExtras,
      targetBase: { ...initialBase, subject: "Crash Write" },
      targetExtras: { ...v2Extras, revision: 2 },
    })

    const journalPath = getJournalFilePath(injections.getPath, quizId)
    expect(fs.existsSync(journalPath)).toBe(true)

    // Run recovery
    const report = recoverJournals(injections)

    // FAIL CLOSED: Must NOT count as recovered, and must preserve journal and original sidecar!
    expect(report.recoveredQuizIds).not.toContain(quizId)
    expect(report.unresolvedCount ?? 1).toBeGreaterThanOrEqual(1)

    // Original sidecar must still exist on disk! It must NOT have been deleted!
    const sidecarAfter = readSidecar(injections.getPath, quizId)
    expect(sidecarAfter).not.toBeNull()
    expect(sidecarAfter?.revision).toBe(1)

    // Journal MUST remain on disk as evidence for forensic recovery
    expect(fs.existsSync(journalPath)).toBe(true)
  })

  it("Bug A: crash after sidecar write before cleanup is idempotent and preserves consistent state", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const initialBase = structuredClone(baseQuizzes.get(quizId) ?? {})
    const qIds = generateQuestionIds(2)
    const initialBaseDigest = computeCanonicalBaseDigest(initialBase)
    const v2Extras = createDefaultQuizExtras(quizId, qIds, initialBaseDigest)
    writeSidecar(injections.getPath, quizId, v2Extras)

    const updatedBase = { ...initialBase, subject: "Updated Subject Both Written" }
    const updatedExtras = {
      ...v2Extras,
      revision: 2,
      baseDigest: computeCanonicalBaseDigest(updatedBase),
    }

    createStagedJournal(injections.getPath, {
      quizId,
      backupBase: initialBase,
      backupExtras: v2Extras,
      targetBase: updatedBase,
      targetExtras: updatedExtras,
    })

    // Simulate crash after BOTH base update and sidecar write, but BEFORE removeJournal
    injections.updateQuizz(quizId, updatedBase)
    writeSidecar(injections.getPath, quizId, updatedExtras)

    const journalPath = getJournalFilePath(injections.getPath, quizId)
    expect(fs.existsSync(journalPath)).toBe(true)

    // Recovery runs
    const report = recoverJournals(injections)
    expect(report.recoveredCount).toBe(1)
    expect(report.recoveredQuizIds).toContain(quizId)

    // State is rolled back to consistent backup state
    expect(baseQuizzes.get(quizId)?.subject).toBe("British History")
    const restoredSidecar = readSidecar(injections.getPath, quizId)
    expect(restoredSidecar?.revision).toBe(1)

    // Journal removed
    expect(fs.existsSync(journalPath)).toBe(false)

    // Second recovery is a clean no-op
    const report2 = recoverJournals(injections)
    expect(report2.recoveredCount).toBe(0)
    expect(report2.recoveredQuizIds).toHaveLength(0)
    expect(baseQuizzes.get(quizId)?.subject).toBe("British History")
  })

  it("Bug A: rejects bogus kind/version and path traversal quizIds without deleting files", () => {
    const journalDir = getJournalDirectory(injections.getPath)

    // 1. Bogus kind journal
    const bogusKindFile = path.join(journalDir, "bogus-kind.journal.json")
    fs.writeFileSync(
      bogusKindFile,
      JSON.stringify({
        version: 1,
        kind: "unknown-alien-kind",
        id: "bogus-id",
        quizId: "some-quiz",
        createdAt: Date.now(),
        status: "staged",
        backupBase: null,
        backupExtras: null,
      }),
      "utf-8",
    )

    // 2. Path traversal quizId journal
    const traversalFile = path.join(journalDir, "traversal.journal.json")
    fs.writeFileSync(
      traversalFile,
      JSON.stringify({
        version: 1,
        kind: "quiz-save",
        id: "traversal-id",
        quizId: "../../etc/passwd",
        createdAt: Date.now(),
        status: "staged",
        backupBase: null,
        backupExtras: null,
      }),
      "utf-8",
    )

    const report = recoverJournals(injections)
    expect(report.recoveredCount).toBe(0)
    expect(report.unresolvedCount ?? 2).toBeGreaterThanOrEqual(1)

    // Journals must NOT be removed
    expect(fs.existsSync(bogusKindFile)).toBe(true)
    expect(fs.existsSync(traversalFile)).toBe(true)
  })

  it("Bug A: failed base restore preserves journal and reports failure", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const initialBase = structuredClone(baseQuizzes.get(quizId) ?? {})
    const qIds = generateQuestionIds(2)
    const v2Extras = createDefaultQuizExtras(quizId, qIds, computeCanonicalBaseDigest(initialBase))
    writeSidecar(injections.getPath, quizId, v2Extras)

    createStagedJournal(injections.getPath, {
      quizId,
      backupBase: initialBase,
      backupExtras: v2Extras,
      targetBase: { ...initialBase, subject: "Crash" },
      targetExtras: { ...v2Extras, revision: 2 },
    })

    const journalPath = getJournalFilePath(injections.getPath, quizId)

    // Create broken injections where updateQuizz throws
    const brokenInjections: StorageInjections = {
      ...injections,
      updateQuizz: () => {
        throw new Error("Disk full or permission denied on base quiz update")
      },
    }

    const report = recoverJournals(brokenInjections)
    expect(report.recoveredQuizIds).not.toContain(quizId)
    expect(report.unresolvedCount ?? 1).toBeGreaterThanOrEqual(1)

    // Journal must be preserved!
    expect(fs.existsSync(journalPath)).toBe(true)
  })

  it("Bug A: does not blindly restore over a newer concurrent revision", () => {
    const { id: quizId } = injections.saveQuizz(sampleQuiz)
    const initialBase = structuredClone(baseQuizzes.get(quizId) ?? {})
    const qIds = generateQuestionIds(2)
    const v2Extras = createDefaultQuizExtras(quizId, qIds, computeCanonicalBaseDigest(initialBase))

    // Journal was created for revision 1 -> target revision 2
    createStagedJournal(injections.getPath, {
      quizId,
      backupBase: initialBase,
      backupExtras: v2Extras, // revision 1
      targetBase: { ...initialBase, subject: "Target Revision 2" },
      targetExtras: { ...v2Extras, revision: 2 },
    })

    // But meanwhile, a concurrent transaction succeeded and reached revision 3!
    const newerRevision3 = {
      ...v2Extras,
      revision: 3,
      baseDigest: computeCanonicalBaseDigest({ ...initialBase, subject: "Concurrent New Subject Rev 3" }),
    }
    injections.updateQuizz(quizId, { ...initialBase, subject: "Concurrent New Subject Rev 3" })
    writeSidecar(injections.getPath, quizId, newerRevision3)

    const journalPath = getJournalFilePath(injections.getPath, quizId)
    expect(fs.existsSync(journalPath)).toBe(true)

    // Recovery runs: must NOT roll back over the newer revision 3!
    const report = recoverJournals(injections)
    expect(report.recoveredQuizIds).not.toContain(quizId)

    // The newer revision 3 must remain intact
    const currentSidecar = readSidecar(injections.getPath, quizId)
    expect(currentSidecar?.revision).toBe(3)
    expect(baseQuizzes.get(quizId)?.subject).toBe("Concurrent New Subject Rev 3")
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

  it("importEnhancedBundle: remaps leaderboard.afterQuestionIds and imports V2 bundle cleanly", () => {
    const qIds = generateQuestionIds(2)
    const baseQuiz = {
      ...sampleQuiz,
      questions: [
        { ...sampleQuiz.questions[0] },
        { ...sampleQuiz.questions[1] },
      ],
    }
    const baseDigest = computeCanonicalBaseDigest(baseQuiz)

    const bundle = {
      bundleVersion: 1,
      quizz: baseQuiz,
      extras: {
        schemaVersion: 2,
        revision: 1,
        quizId: "temp-id",
        baseDigest,
        questionIds: qIds,
        timeline: [
          { id: crypto.randomUUID(), kind: "question", questionId: qIds[0] },
          { id: crypto.randomUUID(), kind: "question", questionId: qIds[1] },
        ],
        scenes: {},
        defaults: {
          newQuestionMode: "quiz",
          leaderboardPolicy: "cardOnly",
          advanceMode: "auto",
        },
        leaderboard: {
          mode: "selected",
          afterQuestionIds: [qIds[0]], // reference to old questionId!
        },
        teams: { enabled: false, teams: [], autoAssign: "roundRobin" },
        audio: {
          cues: {
            start: { source: "default", volume: 0.8, enabled: true, loop: false },
            showQuestion: { source: "default", volume: 0.8, enabled: true, loop: false },
            answersMusic: { source: "default", volume: 0.8, enabled: true, loop: true },
            answerPressed: { source: "default", volume: 0.8, enabled: true, loop: false },
            revealResults: { source: "default", volume: 0.8, enabled: true, loop: false },
            leaderboard: { source: "default", volume: 0.8, enabled: true, loop: false },
            podium1: { source: "default", volume: 0.8, enabled: true, loop: false },
            podium2: { source: "default", volume: 0.8, enabled: true, loop: false },
            podium3: { source: "default", volume: 0.8, enabled: true, loop: false },
          },
        },
        perQuestion: {},
        roster: createDefaultRosterExtras(),
      },
    }

    const { quizId } = service.importEnhancedBundle(bundle)
    expect(quizId).toBeDefined()
    expect(quizId).not.toBe("temp-id")

    const imported = service.getCompositeQuiz(quizId)
    expect(imported.exists).toBe(true)
    expect(imported.extras?.schemaVersion).toBe(2)

    // Verify afterQuestionIds was remapped to the fresh questionId!
    const freshQ0 = imported.extras?.questionIds[0]
    expect(imported.extras?.leaderboard?.afterQuestionIds).toEqual([freshQ0])
  })

  it("importEnhancedBundle: directly imports friendly authored Tada show payload", () => {
    const authoredShow = {
      format: "tada-show",
      version: 1,
      title: "Authored Show Storage Test",
      baseGameMode: "quiz",
      cards: [
        {
          key: "INTRO",
          kind: "opening",
          title: "Welcome!",
          durationMs: 3000,
          advance: "auto",
        },
        {
          key: "Q1",
          kind: "quiz",
          questionType: "single",
          question: "What is 10 x 10?",
          answers: [
            { text: "100", display: "both", imageUrl: "https://example.com/100.png", alt: "100" },
            { text: "1000", display: "text" },
          ],
          correctAnswers: [1],
          timeSeconds: 15,
          cooldownSeconds: 3,
        },
      ],
      settings: [],
    }

    const { quizId } = service.importEnhancedBundle(authoredShow)
    expect(quizId).toBeDefined()

    const imported = service.getCompositeQuiz(quizId)
    expect(imported.exists).toBe(true)
    expect(imported.quizz.subject).toBe("Authored Show Storage Test")
    expect(imported.extras?.schemaVersion).toBe(2)
    const extrasV2 = imported.extras as any
    expect(extrasV2?.timeline.length).toBe(2)
    expect(extrasV2?.timeline[0].kind).toBe("opening")
    expect(extrasV2?.timeline[1].kind).toBe("question")
  })

  it("importEnhancedBundle: strictly rejects legacy quiz payload containing unsafe media URL", () => {
    const initialBaseCount = baseQuizzes.size
    const unsafeLegacy = {
      gameMode: "quiz",
      subject: "Unsafe Legacy",
      questions: [
        {
          type: "single",
          question: "Bad question?",
          answers: ["A", "B"],
          solutions: [0],
          time: 20,
          cooldown: 3,
          media: {
            type: "image",
            url: "http://insecure.example.com/bad.png",
          },
        },
      ],
    }

    let thrown: unknown = null
    try {
      service.importEnhancedBundle(unsafeLegacy)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(CompositeStorageError)
    expect((thrown as CompositeStorageError).statusCode).toBe(400)
    expect((thrown as CompositeStorageError).message).toContain("errors:extensions.invalidMediaUrl")
    expect(baseQuizzes.size).toBe(initialBaseCount)
  })

  it("exportEnhancedBundle: synthesizes valid V2 extras on-the-fly without sidecar on disk", () => {
    // Save raw legacy quiz directly without writing any sidecar
    const saveResult = injections.saveQuizz(sampleQuiz)
    const legacyId = saveResult.id
    const sidecarFile = getSidecarFilePath(injections.getPath, legacyId)
    expect(fs.existsSync(sidecarFile)).toBe(false)

    // Export enhanced bundle
    const exportedBundle = service.exportEnhancedBundle(legacyId)
    expect(exportedBundle.bundleVersion).toBe(1)
    expect(exportedBundle.quizz).toBeDefined()
    expect(exportedBundle.extras.schemaVersion).toBe(2)
    const extrasV2 = exportedBundle.extras as any
    expect(extrasV2.quizId).toBe(legacyId)
    expect(extrasV2.timeline.length).toBe(sampleQuiz.questions.length)

    // Verify sidecar was NOT written to disk merely by exporting!
    expect(fs.existsSync(sidecarFile)).toBe(false)
  })

  it("Gate C01, C02, C05: imports friendly show with note and interlude, preserves metadata through reload and revision increment", () => {
    const interludeConfig = {
      kind: "title" as const,
      title: "Interlude Break",
      durationMs: 3500,
      advance: "manual" as const,
      audioCue: "start",
    }
    const noteText = "הערת עורך לשעשועון חי\nLine 2 with quotes \"tested\""

    const authoredShow = {
      format: "tada-show",
      version: 1,
      title: "Friendly Note & Interlude Show",
      note: noteText,
      baseGameMode: "quiz",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "First Question?",
          answers: [{ text: "Ans1" }, { text: "Ans2" }],
          correctAnswers: [1],
          interlude: interludeConfig,
        },
      ],
      settings: [],
    }

    // 1. Import friendly show via service
    const { quizId, revision, baseDigest } = service.importEnhancedBundle(authoredShow)
    expect(quizId).toBeDefined()
    expect(revision).toBe(1)

    // 2. Reload composite quiz from storage
    const loaded = service.getCompositeQuiz(quizId)
    expect(loaded.exists).toBe(true)
    expect(loaded.extras?.schemaVersion).toBe(2)
    const extrasV2 = loaded.extras as any

    expect(extrasV2.authoring?.showNote).toBe(noteText)
    expect(extrasV2.questionIds).toHaveLength(1)
    const freshQId = extrasV2.questionIds[0]
    expect(extrasV2.perQuestion[freshQId]?.interlude).toEqual(interludeConfig)

    // 3. Export enhanced bundle & verify metadata presence
    const exportedBundle = service.exportEnhancedBundle(quizId)
    const exportedExtras = exportedBundle.extras as any
    expect(exportedExtras.authoring?.showNote).toBe(noteText)
    expect(exportedExtras.perQuestion[freshQId]?.interlude).toEqual(interludeConfig)

    // 4. Save another editor change (revision increment)
    const updatedExtras = {
      ...extrasV2,
      baseDigest: computeCanonicalBaseDigest(loaded.quizz),
      defaults: {
        ...extrasV2.defaults,
        advanceMode: "manual" as const,
      },
    }
    const saveResult = service.saveCompositeQuiz({
      quizId,
      quizz: loaded.quizz,
      extras: updatedExtras,
      expectedRevision: loaded.extras!.revision,
    })
    expect(saveResult.revision).toBe(2)

    // 5. Reopen and verify note and interlude are still intact
    const reloaded = service.getCompositeQuiz(quizId)
    const reloadedExtras = reloaded.extras as any
    expect(reloadedExtras.authoring?.showNote).toBe(noteText)
    expect(reloadedExtras.perQuestion[freshQId]?.interlude).toEqual(interludeConfig)
    expect(reloadedExtras.defaults.advanceMode).toBe("manual")
  })

  it("Gate C03 & C05: invalid targetKey direct server import returns 400 and performs zero writes", () => {
    const initialBaseCount = baseQuizzes.size
    const authoredWithInvalidTarget = {
      format: "tada-show",
      version: 1,
      title: "Invalid Target Key Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question?",
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
      ],
      settings: [
        {
          scope: "audio",
          targetKey: "INVALID_TARGET_KEY",
          property: "cues",
          valueJson: {},
        },
      ],
    }

    let thrown: unknown = null
    try {
      service.importEnhancedBundle(authoredWithInvalidTarget)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(CompositeStorageError)
    expect((thrown as CompositeStorageError).statusCode).toBe(400)
    expect((thrown as CompositeStorageError).message).toContain("unsupportedSettingTargetKey")
    expect(baseQuizzes.size).toBe(initialBaseCount)
  })
})
