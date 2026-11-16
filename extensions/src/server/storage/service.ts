// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { StatusCodes } from "http-status-codes"
import {
  normalizeLegacyQuizz,
  quizzValidator,
} from "@razzia/common/validators/quizz"
import {
  authoredShowToNativeBundleDraft,
  computeCanonicalBaseDigest,
  ensureQuestionIds,
  isEnhancedBundle,
  isSafeMediaUrl,
  nextRevision,
  quizExtrasV1Schema,
  quizExtrasV2Schema,
  remapQuestionIds,
  RevisionConflictError,
  upgradeLegacyExtrasToV2,
  validateBundleMedia,
  validateRevision,
  type AnyQuizExtras,
  type EnhancedBundle,
} from "../../core/index"
import { CompositeStorageError } from "./error"
import { createStagedJournal, removeJournal } from "./journal"
import { readRecoveryBase } from "./recovery-state"
import {
  deleteSidecar,
  readSidecar,
  sidecarExists,
  writeSidecar,
  type StorageInjections,
} from "./sidecar"

function logicalPayload(record: Record<string, unknown>, quizId: string) {
  if (!("id" in record)) {
    return record
  }

  if (record.id !== quizId) {
    throw new CompositeStorageError(
      "Stored quiz identity mismatch",
      StatusCodes.CONFLICT,
    )
  }

  const { id: _storageId, ...payload } = record

  return payload
}

export class CompositeStorageService {
  private readonly injections: StorageInjections

  constructor(injections: StorageInjections) {
    this.injections = injections
  }

  private assertNativeCreationScope() {
    try {
      this.injections.creation?.assertScope()
    } catch (error) {
      throw new CompositeStorageError(
        `Native creation scope denied: ${error instanceof Error ? error.message : String(error)}`,
        StatusCodes.FORBIDDEN,
      )
    }
  }

  private createReservedQuiz(
    quizz: Record<string, unknown>,
    extras: AnyQuizExtras | null,
  ) {
    try {
      const { creation } = this.injections

      if (!creation) {
        throw new Error("Creation storage adapter unavailable")
      }

      return creation.create(quizz, extras)
    } catch (error) {
      const failure = new CompositeStorageError(
        "errors:server.internal",
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
      // Trusted in-process diagnostics retain the exact cause. Routes serialize
      // only the stable message, never a pre-intent allocated ID or fs path.
      Object.defineProperty(failure, "cause", { value: error })
      throw failure
    }
  }

  private createJournaledQuiz(
    quizz: Record<string, unknown>,
    extras: AnyQuizExtras,
  ): {
    quizId: string
    revision: number
    baseDigest: string
  } {
    if (this.injections.creation) {
      return this.createReservedQuiz(quizz, extras)
    }

    let quizId = ""
    let journalCreated = false

    try {
      quizId = this.injections.saveQuizz(quizz).id
      const schema =
        extras.schemaVersion === 2 ? quizExtrasV2Schema : quizExtrasV1Schema
      const validated = schema.parse({ ...extras, quizId, revision: 1 })
      // SaveQuizz owns ID allocation. Once it returns, persist rollback intent
      // before the sidecar write. A crash inside saveQuizz remains an adapter gate.
      createStagedJournal(this.injections.getPath, {
        quizId,
        backupBase: null,
        backupExtras: null,
        targetBase: quizz,
        targetExtras: validated,
      })
      journalCreated = true
      writeSidecar(this.injections.getPath, quizId, validated)
      removeJournal(this.injections.getPath, quizId)

      return { quizId, revision: 1, baseDigest: validated.baseDigest }
    } catch (error) {
      const cleanupErrors: unknown[] = []

      if (quizId) {
        // Attempt both cleanups independently; a failed base deletion must not
        // hide a sidecar cleanup error or destroy the recovery journal.
        try {
          if (readRecoveryBase(this.injections, quizId)) {
            this.injections.deleteQuizz(quizId)
          }

          if (readRecoveryBase(this.injections, quizId)) {
            throw new Error("Base survived creation rollback")
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError)
        }

        try {
          deleteSidecar(this.injections.getPath, quizId)

          if (sidecarExists(this.injections.getPath, quizId)) {
            throw new Error("Sidecar survived creation rollback")
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError)
        }

        if (cleanupErrors.length === 0 && journalCreated) {
          try {
            removeJournal(this.injections.getPath, quizId)
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError)
          }
        }
      }

      const reason = error instanceof Error ? error.message : String(error)
      const recovery =
        cleanupErrors.length > 0
          ? `; rollback incomplete (${cleanupErrors.map((item) => (item instanceof Error ? item.message : String(item))).join("; ")}); ${journalCreated ? "recovery journal preserved" : "no durable recovery journal could be established"}`
          : ""
      throw new CompositeStorageError(
        `Failed to create composite quiz: ${reason}${recovery}`,
        StatusCodes.INTERNAL_SERVER_ERROR,
      )
    }
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
    const baseDigest = computeCanonicalBaseDigest(
      logicalPayload(baseRecord, quizId),
    )
    const extras = readSidecar(this.injections.getPath, quizId)
    const digestMatches = extras
      ? extras.quizId === quizId &&
        (extras.baseDigest === baseDigest ||
          extras.baseDigest === computeCanonicalBaseDigest(baseRecord))
      : true

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
    this.assertNativeCreationScope()
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

    return this.createJournaledQuiz(quizz, preValidation.data)
  }

  /**
   * Deletes both base quiz and sidecar.
   */
  deleteCompositeQuiz(quizId: string): void {
    // Resolve through the current account scope before either deletion. Besides
    // protecting sidecars, this normalizes absent/foreign IDs to the composite
    // API's existing 404 contract instead of leaking a backend exception as 500.
    this.getCompositeQuiz(quizId)
    this.injections.deleteQuizz(quizId)
    deleteSidecar(this.injections.getPath, quizId)
  }

  /**
   * Exports an enhanced bundle { bundleVersion: 1, quizz, extras } (CORE06).
   */
  exportEnhancedBundle(quizId: string): EnhancedBundle {
    const { quizz, extras, baseDigest } = this.getCompositeQuiz(quizId)

    const effectiveExtras =
      extras ?? upgradeLegacyExtrasToV2(quizz, null, { quizId, baseDigest })

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
    this.assertNativeCreationScope()
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

      const mediaCheck = validateBundleMedia(effectivePayload)

      if (!mediaCheck.ok) {
        throw new CompositeStorageError(
          `errors:extensions.invalidMediaUrl: ${mediaCheck.path}`,
          StatusCodes.BAD_REQUEST,
        )
      }

      const { quizz, extras } = effectivePayload
      const quizzValidation = quizzValidator.safeParse(quizz)

      if (!quizzValidation.success) {
        throw new CompositeStorageError(
          `Invalid base quizz in bundle: ${quizzValidation.error.issues.map((i) => i.message).join(", ")}`,
          StatusCodes.BAD_REQUEST,
        )
      }

      // A source bundle's storage ID is not the new allocation's identity.
      // Check it against the source sidecar before omitting only that root ID.
      const importedPayload = logicalPayload(
        quizz as Record<string, unknown>,
        extras.quizId,
      )

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
      const baseDigest = computeCanonicalBaseDigest(importedPayload)

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

      const freshScenes =
        extras.schemaVersion === 2
          ? Object.fromEntries(
              Object.entries(extras.scenes).map(([id, scene]) => [
                id,
                scene.kind === "answerRecap" && scene.startQuestionId
                  ? {
                      ...scene,
                      startQuestionId:
                        idMap.get(scene.startQuestionId) ??
                        scene.startQuestionId,
                    }
                  : scene,
              ]),
            )
          : undefined
      // A cloned game's new question UUIDs still address the original immutable
      // publication's card scopes. Flatten aliases when cloning an earlier clone.
      const scopeAliases =
        extras.schemaVersion === 2
          ? quizExtrasV2Schema.shape.defaults.shape.showCompositionScopeAliases.parse(
              extras.defaults.showCompositionScopeAliases,
            )
          : undefined
      const freshDefaults =
        extras.schemaVersion === 2 && extras.defaults.showComposition
          ? {
              ...extras.defaults,
              showCompositionScopeAliases: Object.fromEntries([
                ...Object.entries(scopeAliases ?? {}).filter(
                  ([id]) => !idMap.has(id),
                ),
                ...[...idMap].map(([oldId, newId]): [string, string] => [
                  newId,
                  scopeAliases?.[oldId] ?? oldId,
                ]),
              ]),
            }
          : undefined

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
        ...(freshScenes ? { scenes: freshScenes } : {}),
        ...(freshDefaults ? { defaults: freshDefaults } : {}),
      })

      if (!preValidation.success) {
        throw new CompositeStorageError(
          `Invalid extras payload in bundle: ${JSON.stringify(preValidation.error.issues)}`,
          StatusCodes.BAD_REQUEST,
        )
      }

      return this.createJournaledQuiz(importedPayload, preValidation.data)
    }

    // Legacy quiz format
    const normalized = normalizeLegacyQuizz(payload)
    const quizzValidation = quizzValidator.safeParse(normalized)

    if (!quizzValidation.success) {
      throw new CompositeStorageError(
        `Invalid legacy quiz format: ${quizzValidation.error.issues.map((i) => i.message).join(", ")}`,
        StatusCodes.BAD_REQUEST,
      )
    }

    const validatedQuizz = quizzValidation.data

    if (Array.isArray(validatedQuizz.questions)) {
      for (let i = 0; i < validatedQuizz.questions.length; i += 1) {
        const q = validatedQuizz.questions[i]

        if (
          q &&
          typeof q === "object" &&
          "media" in q &&
          (q as { media?: { url?: string } }).media?.url
        ) {
          if (!isSafeMediaUrl((q as { media: { url: string } }).media.url)) {
            throw new CompositeStorageError(
              `errors:extensions.invalidMediaUrl: questions[${i}].media`,
              StatusCodes.BAD_REQUEST,
            )
          }
        }
      }
    }

    if (this.injections.creation) {
      return this.createReservedQuiz(validatedQuizz, null)
    }

    const saveResult = this.injections.saveQuizz(validatedQuizz)
    const baseDigest = computeCanonicalBaseDigest(validatedQuizz)

    return {
      quizId: saveResult.id,
      revision: 1,
      baseDigest,
    }
  }
}
