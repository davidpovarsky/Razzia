import { StatusCodes } from "http-status-codes"
import {
  authoredShowToNativeBundleDraft,
  computeCanonicalBaseDigest,
  ensureQuestionIds,
  isEnhancedBundle,
  nextRevision,
  quizExtrasV1Schema,
  quizExtrasV2Schema,
  remapQuestionIds,
  RevisionConflictError,
  upgradeLegacyExtrasToV2,
  validateRevision,
  type AnyQuizExtras,
  type EnhancedBundle,
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
    extras: AnyQuizExtras | null
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
    extras: AnyQuizExtras
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

    // 2. Validate extras schema (V1 or V2)
    const extrasValidation =
      extras.schemaVersion === 2
        ? quizExtrasV2Schema.safeParse(extras)
        : quizExtrasV1Schema.safeParse(extras)

    if (!extrasValidation.success) {
      throw new CompositeStorageError(
        `Invalid extras payload: ${JSON.stringify(extrasValidation.error.issues)}`,
        StatusCodes.BAD_REQUEST,
      )
    }

    const questionsCount = Array.isArray(quizz.questions)
      ? quizz.questions.length
      : 0

    if (extras.questionIds.length !== questionsCount) {
      throw new CompositeStorageError(
        `Question IDs count mismatch: extras has ${extras.questionIds.length} IDs but base quiz has ${questionsCount} questions`,
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

    const updatedExtras: AnyQuizExtras = {
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
   * Pre-validates extras before saving and implements atomic rollback
   * if sidecar writing or validation fails.
   */
  createCompositeQuiz(params: {
    quizz: Record<string, unknown>
    extras: AnyQuizExtras
  }): {
    quizId: string
    revision: number
    baseDigest: string
  } {
    const { quizz, extras } = params
    const baseDigest = computeCanonicalBaseDigest(quizz)

    // Ensure question IDs are aligned
    const questionsCount = Array.isArray(quizz.questions)
      ? quizz.questions.length
      : 0
    const alignedQuestionIds = ensureQuestionIds(
      extras.questionIds,
      questionsCount,
    )

    const schemaToUse =
      extras.schemaVersion === 2 ? quizExtrasV2Schema : quizExtrasV1Schema

    // Pre-validate extras payload structure before touching disk or saving base quiz
    const preValidation = schemaToUse.safeParse({
      ...extras,
      quizId: "00000000-0000-0000-0000-000000000000",
      baseDigest,
      revision: 1,
      questionIds: alignedQuestionIds,
    })

    if (!preValidation.success) {
      throw new CompositeStorageError(
        `Invalid extras payload: ${JSON.stringify(preValidation.error.issues)}`,
        StatusCodes.BAD_REQUEST,
      )
    }

    // Save base quiz with atomic rollback recovery if sidecar write fails
    let quizId = ""

    try {
      const saveResult = this.injections.saveQuizz(quizz)
      quizId = saveResult.id

      const initialExtras: AnyQuizExtras = {
        ...extras,
        quizId,
        baseDigest,
        revision: 1,
        questionIds: alignedQuestionIds,
      }

      const validatedExtras = schemaToUse.parse(initialExtras)

      writeSidecar(this.injections.getPath, quizId, validatedExtras)

      return {
        quizId,
        revision: 1,
        baseDigest,
      }
    } catch (writeError) {
      // Safe rollback so an invalid sidecar or write failure cannot leave an unintended partial quiz
      if (quizId) {
        try {
          this.injections.deleteQuizz(quizId)
          deleteSidecar(this.injections.getPath, quizId)
        } catch {
          // Ignore secondary cleanup error
        }
      }

      if (writeError instanceof CompositeStorageError) {
        throw writeError
      }

      throw new CompositeStorageError(
        `Failed to create composite quiz: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
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
    const { quizz, extras, baseDigest } = this.getCompositeQuiz(quizId)

    const effectiveExtras =
      extras ??
      upgradeLegacyExtrasToV2(quizz, null, { quizId, baseDigest })

    return {
      bundleVersion: 1,
      quizz,
      extras: effectiveExtras,
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
    let effectivePayload = payload

    // Accept friendly Tada Show format and normalize to enhanced bundle
    if (
      typeof payload === "object" &&
      payload !== null &&
      "format" in payload &&
      (payload as { format?: unknown }).format === "tada-show"
    ) {
      const converted = authoredShowToNativeBundleDraft(payload)
      if (!converted.ok || !converted.bundleDraft) {
        throw new CompositeStorageError(
          `Invalid authored show: ${converted.diagnostics.map((d) => d.message).join(", ")}`,
          StatusCodes.BAD_REQUEST,
        )
      }
      effectivePayload = {
        bundleVersion: 1,
        quizz: converted.bundleDraft.quizz,
        extras: converted.bundleDraft.extras,
      }
    }

    if (
      typeof effectivePayload === "object" &&
      effectivePayload !== null &&
      "bundleVersion" in effectivePayload
    ) {
      if (!isEnhancedBundle(effectivePayload)) {
        throw new CompositeStorageError(
          "Invalid enhanced bundle format or extras schema",
          StatusCodes.BAD_REQUEST,
        )
      }

      const { quizz, extras } = effectivePayload
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
      const baseDigest = computeCanonicalBaseDigest(quizz)

      const idMap = new Map<string, string>()
      for (let i = 0; i < extras.questionIds.length; i += 1) {
        if (freshQuestionIds[i]) {
          idMap.set(extras.questionIds[i], freshQuestionIds[i])
        }
      }

      const freshLeaderboard = extras.leaderboard
        ? {
            ...extras.leaderboard,
            afterQuestionIds: extras.leaderboard.afterQuestionIds?.map(
              (oldId) => idMap.get(oldId) ?? oldId,
            ),
          }
        : undefined

      const freshTimeline =
        extras.schemaVersion === 2
          ? extras.timeline.map((item) => {
              const freshTimelineItemId = crypto.randomUUID()
              if (item.kind === "question") {
                const freshId = idMap.get(item.questionId)

                if (freshId) {
                  return {
                    ...item,
                    id: freshTimelineItemId,
                    questionId: freshId,
                  }
                }
              }

              return { ...item, id: freshTimelineItemId }
            })
          : undefined

      const schemaToUse =
        extras.schemaVersion === 2 ? quizExtrasV2Schema : quizExtrasV1Schema

      // Pre-validate extras payload before touching disk or saving base quiz
      const preValidation = schemaToUse.safeParse({
        ...extras,
        quizId: "00000000-0000-0000-0000-000000000000",
        baseDigest,
        revision: 1,
        questionIds: ensuredFreshIds,
        perQuestion: freshPerQuestion,
        ...(freshLeaderboard ? { leaderboard: freshLeaderboard } : {}),
        ...(freshTimeline ? { timeline: freshTimeline } : {}),
      })

      if (!preValidation.success) {
        throw new CompositeStorageError(
          `Invalid extras payload in bundle: ${JSON.stringify(preValidation.error.issues)}`,
          StatusCodes.BAD_REQUEST,
        )
      }

      // Mint new quiz ID by saving base quiz with atomic rollback recovery
      let newQuizId = ""

      try {
        const saveResult = this.injections.saveQuizz(quizz)
        newQuizId = saveResult.id

        const importedExtras: AnyQuizExtras = {
          ...extras,
          quizId: newQuizId,
          revision: 1,
          baseDigest,
          questionIds: ensuredFreshIds,
          perQuestion: freshPerQuestion,
          ...(freshLeaderboard ? { leaderboard: freshLeaderboard } : {}),
          ...(freshTimeline ? { timeline: freshTimeline } : {}),
        } as AnyQuizExtras

        const validated = schemaToUse.parse(importedExtras)

        writeSidecar(this.injections.getPath, newQuizId, validated)

        return {
          quizId: newQuizId,
          revision: 1,
          baseDigest,
        }
      } catch (writeError) {
        if (newQuizId) {
          try {
            this.injections.deleteQuizz(newQuizId)
            deleteSidecar(this.injections.getPath, newQuizId)
          } catch {
            // Ignore secondary cleanup error
          }
        }

        if (writeError instanceof CompositeStorageError) {
          throw writeError
        }

        throw new CompositeStorageError(
          `Failed to import enhanced bundle: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
          StatusCodes.INTERNAL_SERVER_ERROR,
        )
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
