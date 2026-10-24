import { StatusCodes } from "http-status-codes"
import {
  computeCanonicalBaseDigest,
  ensureQuestionIds,
  isEnhancedBundle,
  nextRevision,
  quizExtrasV1Schema,
  remapQuestionIds,
  RevisionConflictError,
  validateRevision,
  type EnhancedBundle,
  type QuizExtrasV1,
} from "../../core/index"
import { CompositeStorageError } from "./error"
import { createStagedJournal, removeJournal } from "./journal"
import {
  deleteSidecar,
  readSidecar,
  writeSidecar,
  type StorageInjections,
} from "./sidecar"

export class CompositeStorageService {
  private readonly injections: StorageInjections

  constructor(injections: StorageInjections) {
    this.injections = injections
  }

  /**
   * Retrieves composite quiz data.
   * If sidecar is missing, returns `{ exists: true, quizz, extras: null, baseDigest }`
   * without creating any sidecar file on disk (CORE01).
   */
  getCompositeQuiz(quizId: string): {
    quizId: string
    exists: boolean
    quizz: Record<string, unknown>
    extras: QuizExtrasV1 | null
    baseDigest: string
    digestMatches: boolean
  } {
    let quizz: unknown = null

    try {
      quizz = this.injections.getQuizzById(quizId)
    } catch {
      quizz = null
    }

    if (!quizz) {
      throw new CompositeStorageError(
        `Quiz with ID ${quizId} not found`,
        StatusCodes.NOT_FOUND,
      )
    }

    const baseRecord = quizz as Record<string, unknown>
    const baseDigest = computeCanonicalBaseDigest(baseRecord)
    const extras = readSidecar(this.injections.getPath, quizId)
    const digestMatches = extras ? extras.baseDigest === baseDigest : true

    return {
      quizId,
      exists: true,
      quizz: baseRecord,
      extras,
      baseDigest,
      digestMatches,
    }
  }

  /**
   * Saves an existing quiz and its sidecar atomically with revision check
   * and staged journal recovery (CORE04, CORE05).
   */
  saveCompositeQuiz(params: {
    quizId: string
    expectedRevision: number | null
    quizz: Record<string, unknown>
    extras: QuizExtrasV1
  }): {
    quizId: string
    revision: number
    baseDigest: string
  } {
    const { quizId, expectedRevision, quizz, extras } = params

    // 1. Verify base quiz exists
    let existingBase: unknown = null

    try {
      existingBase = this.injections.getQuizzById(quizId)
    } catch {
      throw new CompositeStorageError(
        `Quiz ${quizId} not found`,
        StatusCodes.NOT_FOUND,
      )
    }

    // 2. Validate extras schema
    const extrasValidation = quizExtrasV1Schema.safeParse(extras)

    if (!extrasValidation.success) {
      throw new CompositeStorageError(
        `Invalid extras payload: ${JSON.stringify(extrasValidation.error.issues)}`,
        StatusCodes.BAD_REQUEST,
      )
    }

    // 3. Verify base digest matches submitted quizz
    const actualBaseDigest = computeCanonicalBaseDigest(quizz)

    if (actualBaseDigest !== extras.baseDigest) {
      throw new CompositeStorageError(
        `Digest conflict: base quiz digest (${actualBaseDigest}) does not match extras baseDigest (${extras.baseDigest})`,
        StatusCodes.CONFLICT,
      )
    }

    // 4. Verify revision against existing sidecar (if any)
    const existingExtras = readSidecar(this.injections.getPath, quizId)
    let newRevision = 1

    if (existingExtras !== null) {
      const revisionCheck = validateRevision(
        existingExtras.revision,
        expectedRevision,
      )

      if (!revisionCheck.valid) {
        throw new RevisionConflictError(
          existingExtras.revision,
          expectedRevision,
        )
      }

      newRevision = nextRevision(existingExtras.revision)
    } else if (expectedRevision !== null && expectedRevision !== 1) {
      throw new RevisionConflictError(1, expectedRevision)
    }

    const updatedExtras: QuizExtrasV1 = {
      ...extras,
      quizId,
      baseDigest: actualBaseDigest,
      revision: newRevision,
    }

    // 5. Atomic-equivalent two-phase write with journal
    createStagedJournal(this.injections.getPath, {
      quizId,
      backupBase: existingBase,
      backupExtras: existingExtras,
      targetBase: quizz,
      targetExtras: updatedExtras,
    })

    try {
      this.injections.updateQuizz(quizId, quizz)
      writeSidecar(this.injections.getPath, quizId, updatedExtras)
      removeJournal(this.injections.getPath, quizId)
    } catch (writeError) {
      // If error occurs, leave journal for crash recovery or rollback immediately
      throw new CompositeStorageError(
        `Failed to save composite quiz: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }

    return {
      quizId,
      revision: newRevision,
      baseDigest: actualBaseDigest,
    }
  }

  /**
   * Creates a new composite quiz and writes both base and sidecar.
   */
  createCompositeQuiz(params: {
    quizz: Record<string, unknown>
    extras: QuizExtrasV1
  }): {
    quizId: string
    revision: number
    baseDigest: string
  } {
    const { quizz, extras } = params
    const baseDigest = computeCanonicalBaseDigest(quizz)

    // Save base quiz first to mint ID
    const saveResult = this.injections.saveQuizz(quizz)
    const quizId = saveResult.id

    // Ensure question IDs are aligned
    const questionsCount = Array.isArray(quizz.questions)
      ? quizz.questions.length
      : 0
    const alignedQuestionIds = ensureQuestionIds(
      extras.questionIds,
      questionsCount,
    )

    const initialExtras: QuizExtrasV1 = {
      ...extras,
      quizId,
      baseDigest,
      revision: 1,
      questionIds: alignedQuestionIds,
    }

    const validatedExtras = quizExtrasV1Schema.parse(initialExtras)

    writeSidecar(this.injections.getPath, quizId, validatedExtras)

    return {
      quizId,
      revision: 1,
      baseDigest,
    }
  }

  /**
   * Deletes both base quiz and sidecar.
   */
  deleteCompositeQuiz(quizId: string): void {
    this.injections.deleteQuizz(quizId)
    deleteSidecar(this.injections.getPath, quizId)
  }

  /**
   * Exports an enhanced bundle { bundleVersion: 1, quizz, extras } (CORE06).
   */
  exportEnhancedBundle(quizId: string): EnhancedBundle {
    const { quizz, extras } = this.getCompositeQuiz(quizId)

    if (!extras) {
      throw new CompositeStorageError(
        `Quiz ${quizId} does not have enhanced extras`,
        StatusCodes.NOT_FOUND,
      )
    }

    return {
      bundleVersion: 1,
      quizz,
      extras,
    }
  }

  /**
   * Imports an enhanced bundle or legacy quiz JSON.
   * Remaps question IDs and mints a new quiz ID to prevent overwriting existing quizzes (CORE06).
   */
  importEnhancedBundle(payload: unknown): {
    quizId: string
    revision: number
    baseDigest: string
  } {
    if (isEnhancedBundle(payload)) {
      const { quizz, extras } = payload
      const questionsCount =
        typeof quizz === "object" &&
        quizz !== null &&
        Array.isArray((quizz as { questions?: unknown[] }).questions)
          ? (quizz as { questions: unknown[] }).questions.length
          : 0

      // Remap question UUIDs to fresh IDs while preserving perQuestion attachments
      const { questionIds: freshQuestionIds, perQuestion: freshPerQuestion } =
        remapQuestionIds(extras.questionIds, extras.perQuestion)

      const ensuredFreshIds = ensureQuestionIds(
        freshQuestionIds,
        questionsCount,
      )

      // Mint new quiz ID by saving base quiz
      const saveResult = this.injections.saveQuizz(quizz)
      const newQuizId = saveResult.id
      const baseDigest = computeCanonicalBaseDigest(quizz)

      const importedExtras: QuizExtrasV1 = {
        ...extras,
        quizId: newQuizId,
        revision: 1,
        baseDigest,
        questionIds: ensuredFreshIds,
        perQuestion: freshPerQuestion,
      }

      const validated = quizExtrasV1Schema.parse(importedExtras)

      writeSidecar(this.injections.getPath, newQuizId, validated)

      return {
        quizId: newQuizId,
        revision: 1,
        baseDigest,
      }
    }

    // Legacy quiz format
    const saveResult = this.injections.saveQuizz(payload)
    const baseDigest = computeCanonicalBaseDigest(payload)

    return {
      quizId: saveResult.id,
      revision: 1,
      baseDigest,
    }
  }
}
