// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import fs from "node:fs"
import path from "node:path"
import { v7 as uuidv7 } from "uuid"
import type { UploadedMedia } from "@razzia/common/types/game"
import {
  BUILT_IN_SOUNDS_LIST,
  type BuiltInSoundItem,
  collectQuizMediaReferences,
  detachMediaFromShowData,
  extractMediaNameFromUrl,
  findMediaReferencesAcrossShows,
  type AnyQuizExtras,
  type CardMediaReference,
  type InspectableQuizShow,
  type ShowMediaCatalogItem,
} from "../core/index"
import {
  getSidecarDirectory,
  getSidecarFilePath,
  readSidecar,
  sidecarExists,
  writeSidecar,
  type StorageInjections,
} from "./storage/sidecar"
import { recoverJournals, type RecoveryReport } from "./storage/journal"

export { type BuiltInSoundItem }

export const BUILT_IN_SOUNDS: BuiltInSoundItem[] = BUILT_IN_SOUNDS_LIST

export interface LoadedShowRecord extends InspectableQuizShow {
  filePath: string
  mtimeMs?: number
}

export interface ShowHealthReport {
  records: LoadedShowRecord[]
  unreadableFiles: string[]
}

/**
 * Loads all quiz shows and their sidecars from disk, capturing any malformed or unreadable files.
 * Fail-closed guarantee: any syntax/parse failure is recorded in `unreadableFiles`.
 */
export function loadAllShowsHealth(
  getPath: (subPath?: string) => string,
): ShowHealthReport {
  const quizzDir = getPath("quizz")
  const records: LoadedShowRecord[] = []
  const unreadableFiles: string[] = []

  if (fs.existsSync(quizzDir)) {
    let files: string[] = []

    try {
      files = fs.readdirSync(quizzDir).filter((f) => f.endsWith(".json"))
    } catch (err) {
      unreadableFiles.push(`quizz: ${(err as Error).message}`)
    }

    for (const file of files) {
      const filePath = path.join(quizzDir, file)

      try {
        const stat = fs.lstatSync(filePath)

        if (!stat.isFile()) {
          continue
        }

        const raw = fs.readFileSync(filePath, "utf-8")
        let parsed: unknown = undefined

        try {
          parsed = JSON.parse(raw)
        } catch (jsonErr) {
          unreadableFiles.push(
            `quizz/${file}: invalid JSON (${(jsonErr as Error).message})`,
          )

          continue
        }

        if (!parsed || typeof parsed !== "object") {
          unreadableFiles.push(`quizz/${file}: not a valid JSON object`)

          continue
        }

        const quizObj = parsed as LoadedShowRecord["quizz"] & {
          id?: string
        }
        const quizId =
          typeof quizObj.id === "string" && quizObj.id.trim().length > 0
            ? quizObj.id
            : file.replace(/\.json$/iu, "")
        let extras: AnyQuizExtras | null = null

        if (sidecarExists(getPath, quizId)) {
          extras = readSidecar(getPath, quizId)

          if (!extras) {
            unreadableFiles.push(
              `extensions/quizzes/${quizId}.json: unreadable or invalid sidecar`,
            )
          }
        }

        records.push({
          id: quizId,
          filePath,
          quizz: quizObj,
          extras,
          mtimeMs: stat.mtimeMs,
        })
      } catch (err) {
        unreadableFiles.push(`quizz/${file}: ${(err as Error).message}`)
      }
    }
  }

  // Also inspect extensions/quizzes for any orphaned or unreadable sidecar files
  const sidecarDir = getSidecarDirectory(getPath)

  if (fs.existsSync(sidecarDir)) {
    let sidecarFiles: string[] = []

    try {
      sidecarFiles = fs
        .readdirSync(sidecarDir)
        .filter((f) => f.endsWith(".json"))
    } catch {
      // Directory read failure
    }

    for (const sf of sidecarFiles) {
      const cleanQuizId = sf.replace(/\.json$/iu, "")
      const alreadyLoaded = records.some((r) => r.id === cleanQuizId)

      if (!alreadyLoaded) {
        const sPath = path.join(sidecarDir, sf)

        try {
          const raw = fs.readFileSync(sPath, "utf-8")
          JSON.parse(raw)
          const extras = readSidecar(getPath, cleanQuizId)

          if (!extras) {
            unreadableFiles.push(
              `extensions/quizzes/${sf}: invalid sidecar schema`,
            )
          } else {
            records.push({
              id: cleanQuizId,
              filePath: sPath,
              quizz: {
                subject: cleanQuizId,
                questions: [],
              },
              extras,
            })
          }
        } catch (err) {
          unreadableFiles.push(
            `extensions/quizzes/${sf}: ${(err as Error).message}`,
          )
        }
      }
    }
  }

  return {
    records,
    unreadableFiles,
  }
}

export function loadAllShowsFromDisk(
  getPath: (subPath?: string) => string,
): LoadedShowRecord[] {
  return loadAllShowsHealth(getPath).records
}

export interface MediaDeleteSafetyResult {
  allowed: boolean
  references: CardMediaReference[]
  detachedFromShows: string[]
  unreadableFiles?: string[]
  error?: string
  journalId?: string
}

export const getMediaDeleteJournalDirectory = (
  getPath: (subPath?: string) => string,
): string => {
  const dir = path.join(
    getSidecarDirectory(getPath),
    ".journal",
    "media-delete",
  )

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true,
    })
  }

  return dir
}

export const getMediaQuarantineDirectory = (
  getPath: (subPath?: string) => string,
): string => {
  const dir = path.join(getMediaDeleteJournalDirectory(getPath), "quarantine")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true,
    })
  }

  return dir
}

export interface MediaDeleteJournalEntry {
  version: 1
  kind: "media-delete"
  id: string
  mediaNameOrUrl: string
  cleanMediaName: string
  mediaFilePath?: string | null
  quarantinePath?: string | null
  createdAt: number
  status: "staged" | "committed"
  shows: Array<{
    quizId: string
    filePath: string
    sidecarPath: string
    originalBaseRaw: string | null
    originalSidecarRaw: string | null
  }>
}

export interface ExecuteMediaDeleteOptions {
  detach?: boolean
  baselineShows?: LoadedShowRecord[]
  deleteMediaFn?: () => void
  faultInjection?: {
    failBeforeShowWrite?: boolean
    failAfterFirstShowWrite?: boolean
    failBeforeDeleteMedia?: boolean
    failDuringRollback?: boolean
    failBeforeCommittedWrite?: boolean
    failAfterCommittedWrite?: boolean
    failBeforeQuarantineUnlink?: boolean
    failAfterQuarantineUnlink?: boolean
    failJournalUnlink?: boolean
  }
}

/**
 * Executes a durable, atomic media delete transaction.
 * - Fail-closed: If ANY show or sidecar on disk is unreadable, operation is blocked.
 * - If media is referenced and `detach !== true`, returns `allowed: false` with references.
 * - If `detach === true`, performs a staged two-phase commit:
 *   1. Quarantines media binary before touching any file.
 *   2. Stages isolated media-delete journal with exact original show & sidecar bytes.
 *   3. Detaches references via atomic temp-file + rename.
 *   4. Verifies post-condition: zero surviving references and zero unreadable files.
 *   5. Calls `deleteMediaFn()` if provided, ensuring physical binary deletion.
 *   6. Cleans up quarantine and journal ONLY on durable success.
 *   7. On failure: rolls back all changes, restores binary from quarantine, and preserves journal if rollback fails.
 */
export function executeMediaDeleteTransaction(
  getPath: (subPath?: string) => string,
  mediaNameOrUrl: string,
  options?: ExecuteMediaDeleteOptions,
): MediaDeleteSafetyResult {
  const rawMediaName =
    extractMediaNameFromUrl(mediaNameOrUrl) ||
    mediaNameOrUrl.replace(/^\/?media\//iu, "")
  const cleanMediaName = path.basename(rawMediaName)
  const mediaFilePath = path.join(getPath("media"), cleanMediaName)
  const mediaExists = fs.existsSync(mediaFilePath)

  // Verify concurrent modification against baseline if supplied
  if (options?.baselineShows) {
    for (const b of options.baselineShows) {
      if (b.mtimeMs !== undefined && fs.existsSync(b.filePath)) {
        const currentMtime = fs.statSync(b.filePath).mtimeMs

        if (Math.abs(currentMtime - b.mtimeMs) > 1) {
          return {
            allowed: false,
            references: [],
            detachedFromShows: [],
            error: `Concurrent modification detected on show file ${b.filePath}`,
          }
        }
      }
    }
  }

  const health = loadAllShowsHealth(getPath)

  // Fail-closed invariant: an unreadable file or sidecar prevents verifying reference safety
  if (health.unreadableFiles.length > 0) {
    return {
      allowed: false,
      references: [],
      detachedFromShows: [],
      unreadableFiles: health.unreadableFiles,
      error: `Cannot safely delete media while one or more show files are unreadable: ${health.unreadableFiles.join("; ")}`,
    }
  }

  const shows = health.records
  const references = findMediaReferencesAcrossShows(mediaNameOrUrl, shows)

  if (references.length > 0 && !options?.detach) {
    return {
      allowed: false,
      references,
      detachedFromShows: [],
    }
  }

  if (references.length === 0) {
    if (options?.deleteMediaFn) {
      options.deleteMediaFn()
    }

    return {
      allowed: true,
      references: [],
      detachedFromShows: [],
    }
  }

  // Explicit detach requested with active references: execute staged transaction
  const affectedShows = shows.filter((show) =>
    references.some((r) => r.quizId === show.id),
  )
  const journalId = uuidv7()
  const quarantineDir = getMediaQuarantineDirectory(getPath)
  const quarantinePath = mediaExists
    ? path.join(quarantineDir, `${journalId}-${cleanMediaName}`)
    : null

  // 1. Quarantine media binary if it exists
  if (mediaExists && quarantinePath) {
    try {
      fs.copyFileSync(mediaFilePath, quarantinePath)
    } catch (qErr) {
      return {
        allowed: false,
        references,
        detachedFromShows: [],
        error: `Failed to quarantine media binary: ${(qErr as Error).message}`,
      }
    }
  }

  // 2. Stage durable journal entry
  const journalShows = affectedShows.map((show) => {
    const originalBaseRaw = fs.existsSync(show.filePath)
      ? fs.readFileSync(show.filePath, "utf-8")
      : null
    const sidecarPath = getSidecarFilePath(getPath, show.id)
    const originalSidecarRaw = fs.existsSync(sidecarPath)
      ? fs.readFileSync(sidecarPath, "utf-8")
      : null

    return {
      quizId: show.id,
      filePath: show.filePath,
      sidecarPath,
      originalBaseRaw,
      originalSidecarRaw,
    }
  })
  const journalEntry: MediaDeleteJournalEntry = {
    version: 1,
    kind: "media-delete",
    id: journalId,
    mediaNameOrUrl,
    cleanMediaName,
    mediaFilePath: mediaExists ? mediaFilePath : null,
    quarantinePath,
    createdAt: Date.now(),
    status: "staged",
    shows: journalShows,
  }
  const journalDir = getMediaDeleteJournalDirectory(getPath)
  const journalFilePath = path.join(
    journalDir,
    `media-${cleanMediaName}-${journalId}.media-journal.json`,
  )
  const tmpJournal = `${journalFilePath}.tmp.${Date.now()}`
  fs.writeFileSync(tmpJournal, JSON.stringify(journalEntry, null, 2), "utf-8")
  fs.renameSync(tmpJournal, journalFilePath)
  const rollback = (): boolean => {
    let allSucceeded = true
    for (const b of journalShows) {
      try {
        if (b.originalBaseRaw !== null) {
          try {
            if (fs.existsSync(b.filePath)) {
              fs.chmodSync(b.filePath, 0o666)
            }
          } catch {
            // Ignore
          }

          const tmpBase = `${b.filePath}.tmp.${Date.now()}`
          fs.writeFileSync(tmpBase, b.originalBaseRaw, "utf-8")
          fs.renameSync(tmpBase, b.filePath)
        }

        if (b.originalSidecarRaw !== null) {
          try {
            if (fs.existsSync(b.sidecarPath)) {
              fs.chmodSync(b.sidecarPath, 0o666)
            }
          } catch {
            // Ignore
          }

          const tmpSidecar = `${b.sidecarPath}.tmp.${Date.now()}`
          fs.writeFileSync(tmpSidecar, b.originalSidecarRaw, "utf-8")
          fs.renameSync(tmpSidecar, b.sidecarPath)
        } else if (fs.existsSync(b.sidecarPath)) {
          fs.unlinkSync(b.sidecarPath)
        }
      } catch (rbErr) {
        allSucceeded = false
        console.error(
          `[MediaRollback] Failed to restore show ${b.quizId}:`,
          rbErr,
        )
      }
    }

    if (mediaExists && quarantinePath && fs.existsSync(quarantinePath)) {
      try {
        if (!fs.existsSync(mediaFilePath)) {
          fs.copyFileSync(quarantinePath, mediaFilePath)
        }
      } catch (qErr) {
        allSucceeded = false
        console.error(
          `[MediaRollback] Failed to restore media from quarantine:`,
          qErr,
        )
      }
    }

    if (options?.faultInjection?.failDuringRollback) {
      allSucceeded = false
    }

    if (allSucceeded) {
      try {
        if (quarantinePath && fs.existsSync(quarantinePath)) {
          fs.unlinkSync(quarantinePath)
        }

        if (fs.existsSync(journalFilePath)) {
          fs.unlinkSync(journalFilePath)
        }
      } catch {
        // Ignore
      }
    } else {
      console.warn(
        `[MediaRollback] Rollback failed or was partial; PRESERVING journal ${journalFilePath} for crash recovery`,
      )
    }

    return allSucceeded
  }
  const detachedFromShows: string[] = []

  try {
    if (options?.faultInjection?.failBeforeShowWrite) {
      throw new Error("Simulated failure before writing detached show")
    }

    let writeCount = 0
    for (const show of affectedShows) {
      if (show.mtimeMs !== undefined && fs.existsSync(show.filePath)) {
        const currentMtime = fs.statSync(show.filePath).mtimeMs

        if (Math.abs(currentMtime - show.mtimeMs) > 1) {
          throw new Error(
            `Concurrent modification detected on show file ${show.filePath}`,
          )
        }
      }

      const detached = detachMediaFromShowData(
        mediaNameOrUrl,
        show.quizz,
        show.extras,
      )

      if (fs.existsSync(show.filePath)) {
        const tmpBase = `${show.filePath}.tmp.${Date.now()}`
        fs.writeFileSync(
          tmpBase,
          JSON.stringify(detached.quizz, null, 2),
          "utf-8",
        )
        fs.renameSync(tmpBase, show.filePath)
      }

      if (detached.extras) {
        writeSidecar(getPath, show.id, detached.extras as AnyQuizExtras)
      }

      detachedFromShows.push(show.id)
      writeCount += 1

      if (
        options?.faultInjection?.failAfterFirstShowWrite &&
        writeCount === 1
      ) {
        throw new Error("Simulated failure after writing first detached show")
      }
    }

    // Post-commit re-scan verification: verify zero references survive before allowing delete
    const postHealth = loadAllShowsHealth(getPath)

    if (postHealth.unreadableFiles.length > 0) {
      throw new Error(
        `Unreadable files detected after detach: ${postHealth.unreadableFiles.join("; ")}`,
      )
    }

    const postRefs = findMediaReferencesAcrossShows(
      mediaNameOrUrl,
      postHealth.records,
    )

    if (postRefs.length > 0) {
      throw new Error(
        `Active references (${postRefs.length}) survived detach operation`,
      )
    }

    // Physical deletion of media binary if hook provided
    if (options?.deleteMediaFn) {
      if (options?.faultInjection?.failBeforeDeleteMedia) {
        throw new Error("Simulated failure before deleting media binary")
      }

      options.deleteMediaFn()

      if (fs.existsSync(mediaFilePath)) {
        throw new Error("Physical media file was not removed after delete call")
      }
    }

    // POINT OF NO RETURN:
    // Update journal status to "committed" BEFORE releasing quarantine!
    if (options?.faultInjection?.failBeforeCommittedWrite) {
      throw new Error("Simulated failure before committed marker write")
    }

    journalEntry.status = "committed"
    const tmpCommitted = `${journalFilePath}.tmp.${Date.now()}`
    fs.writeFileSync(
      tmpCommitted,
      JSON.stringify(journalEntry, null, 2),
      "utf-8",
    )
    fs.renameSync(tmpCommitted, journalFilePath)

    if (options?.faultInjection?.failAfterCommittedWrite) {
      throw new Error("Simulated failure after committed marker write")
    }

    // Now durable committed status is written. Clean up quarantine and journal.
    if (options?.faultInjection?.failBeforeQuarantineUnlink) {
      throw new Error("Simulated failure before quarantine unlink")
    }

    if (quarantinePath && fs.existsSync(quarantinePath)) {
      try {
        fs.unlinkSync(quarantinePath)
      } catch {
        // Ignore
      }
    }

    if (options?.faultInjection?.failAfterQuarantineUnlink) {
      throw new Error("Simulated failure after quarantine unlink")
    }

    if (options?.faultInjection?.failJournalUnlink) {
      throw new Error("Simulated failure unlinking journal")
    }

    if (fs.existsSync(journalFilePath)) {
      fs.unlinkSync(journalFilePath)
    }

    return {
      allowed: true,
      references,
      detachedFromShows,
    }
  } catch (error) {
    if (journalEntry.status === "committed") {
      // Point of no return already reached. Do NOT roll back to old references!
      if (quarantinePath && fs.existsSync(quarantinePath)) {
        try {
          fs.unlinkSync(quarantinePath)
        } catch {
          // Ignore
        }
      }

      return {
        allowed: true,
        references: [],
        detachedFromShows,
        error: `Committed delete completed but cleanup had warning: ${(error as Error).message}`,
        journalId,
      }
    }

    const rollbackSuccess = rollback()

    if (rollbackSuccess) {
      return {
        allowed: false,
        references,
        detachedFromShows: [],
        error: `Detach failed and was safely rolled back: ${(error as Error).message}`,
      }
    }

    return {
      allowed: false,
      references,
      detachedFromShows: [],
      error: `Detach failed and rollback encountered errors. Journal preserved for recovery: ${(error as Error).message}`,
      journalId,
    }
  }
}

/**
 * Checks whether a media file can be safely deleted from the shared media store.
 * Delegates to executeMediaDeleteTransaction for consistent fail-closed transactional guarantees.
 */
export function checkMediaDeleteSafety(
  getPath: (subPath?: string) => string,
  mediaNameOrUrl: string,
  options?: ExecuteMediaDeleteOptions,
): MediaDeleteSafetyResult {
  return executeMediaDeleteTransaction(getPath, mediaNameOrUrl, options)
}

/**
 * Recovers from incomplete media detach journals (e.g. simulated server restart).
 * Examines dedicated .journal/media-delete directory and restores shows & quarantined media.
 */
export function recoverMediaDeleteJournals(
  getPath: (subPath?: string) => string,
): {
  recoveredCount: number
  recoveredQuizIds: string[]
  restoredMediaNames: string[]
  unresolvedCount?: number
  unresolvedJournals?: string[]
} {
  const journalDir = getMediaDeleteJournalDirectory(getPath)

  if (!fs.existsSync(journalDir)) {
    return {
      recoveredCount: 0,
      recoveredQuizIds: [],
      restoredMediaNames: [],
      unresolvedCount: 0,
      unresolvedJournals: [],
    }
  }

  let files: string[] = []

  try {
    files = fs.readdirSync(journalDir).filter((f) => f.endsWith(".json"))
  } catch (err) {
    console.error("[MediaJournal] Failed reading journal directory:", err)

    return {
      recoveredCount: 0,
      recoveredQuizIds: [],
      restoredMediaNames: [],
      unresolvedCount: 1,
      unresolvedJournals: [],
    }
  }

  const recoveredQuizIds: string[] = []
  const restoredMediaNames: string[] = []
  const unresolvedJournals: string[] = []
  let recoveredCount = 0
  const authorizedMediaDir = getPath("media")
  const authorizedQuarantineDir = getMediaQuarantineDirectory(getPath)
  const authorizedQuizzDir = getPath("quizz")
  for (const file of files) {
    const journalPath = path.join(journalDir, file)

    try {
      if (!fs.statSync(journalPath).isFile()) {
        continue
      }

      let raw = ""

      try {
        raw = fs.readFileSync(journalPath, "utf-8")
      } catch (readErr) {
        console.error(
          `[MediaJournal] Unreadable journal file ${file}:`,
          readErr,
        )
        unresolvedJournals.push(file)

        continue
      }

      let entry: Partial<MediaDeleteJournalEntry> | undefined = undefined

      try {
        entry = JSON.parse(raw) as Partial<MediaDeleteJournalEntry>
      } catch (parseErr) {
        console.error(
          `[MediaJournal] Malformed JSON in journal ${file}:`,
          parseErr,
        )
        unresolvedJournals.push(file)

        continue
      }

      // 1. Fail-closed invariant: ignore/preserve unknown or incompatible journals
      if (entry.kind !== "media-delete" || entry.version !== 1) {
        console.warn(
          `[MediaJournal] Unknown or incompatible journal ${file}, preserving for manual inspection`,
        )
        unresolvedJournals.push(file)

        continue
      }

      // 2. Validate cleanMediaName & path traversal
      const rawCleanName = entry.cleanMediaName

      if (
        typeof rawCleanName !== "string" ||
        !rawCleanName.trim() ||
        rawCleanName.includes("..") ||
        rawCleanName.includes("/") ||
        rawCleanName.includes("\\")
      ) {
        console.error(
          `[MediaJournal] Invalid or unsafe cleanMediaName in journal ${file}: "${rawCleanName}", preserving`,
        )
        unresolvedJournals.push(file)

        continue
      }

      const cleanMediaName = path.basename(rawCleanName)
      const targetMediaFilePath = path.join(authorizedMediaDir, cleanMediaName)

      // Validate quarantinePath: must be located within authorizedQuarantineDir
      let targetQuarantinePath: string | null = null

      if (entry.quarantinePath) {
        const quarantineBase = path.basename(entry.quarantinePath)
        targetQuarantinePath = path.join(
          authorizedQuarantineDir,
          quarantineBase,
        )

        if (
          entry.quarantinePath.includes("..") ||
          !quarantineBase.includes(cleanMediaName)
        ) {
          console.error(
            `[MediaJournal] Invalid or unsafe quarantinePath in journal ${file}: "${entry.quarantinePath}", preserving`,
          )
          unresolvedJournals.push(file)

          continue
        }
      }

      // Validate show IDs & paths
      let showsValid = true
      const validatedShows: Array<{
        quizId: string
        filePath: string
        sidecarPath: string
        originalBaseRaw: string | null
        originalSidecarRaw: string | null
      }> = []

      if (Array.isArray(entry.shows)) {
        for (const s of entry.shows) {
          if (
            typeof s.quizId !== "string" ||
            !s.quizId.trim() ||
            s.quizId.includes("..") ||
            s.quizId.includes("/") ||
            s.quizId.includes("\\")
          ) {
            showsValid = false

            break
          }

          const cleanQuizId = path.basename(s.quizId).replace(/\.json$/i, "")
          const filePath = path.join(authorizedQuizzDir, `${cleanQuizId}.json`)
          const sidecarPath = getSidecarFilePath(getPath, cleanQuizId)
          validatedShows.push({
            quizId: cleanQuizId,
            filePath,
            sidecarPath,
            originalBaseRaw: s.originalBaseRaw ?? null,
            originalSidecarRaw: s.originalSidecarRaw ?? null,
          })
        }
      } else {
        showsValid = false
      }

      if (!showsValid) {
        console.error(
          `[MediaJournal] Invalid shows configuration or path traversal in journal ${file}, preserving`,
        )
        unresolvedJournals.push(file)

        continue
      }

      // CASE 1: COMMITTED (Point of no return already crossed)
      if (entry.status === "committed") {
        // Forward cleanup: verify no references survive and binary is deleted
        const health = loadAllShowsHealth(getPath)
        const activeRefs = findMediaReferencesAcrossShows(
          cleanMediaName,
          health.records,
        )

        if (activeRefs.length > 0) {
          console.error(
            `[MediaJournal] Committed delete in journal ${file} still has ${activeRefs.length} active references; preserving journal`,
          )
          unresolvedJournals.push(file)

          continue
        }

        // Unlink quarantine binary if still present
        if (targetQuarantinePath && fs.existsSync(targetQuarantinePath)) {
          try {
            fs.unlinkSync(targetQuarantinePath)
          } catch (qUnlinkErr) {
            console.warn(
              `[MediaJournal] Could not unlink quarantine binary:`,
              qUnlinkErr,
            )
          }
        }

        // Unlink journal
        if (fs.existsSync(journalPath)) {
          fs.unlinkSync(journalPath)
        }

        recoveredCount += 1

        continue
      }

      // CASE 2: STAGED (Rollback to original references & binary)
      if (entry.status === "staged") {
        // INVARIANT CHECK: Can original binary be restored?
        const hadBinaryQuarantined = Boolean(entry.quarantinePath)
        const mediaExists = fs.existsSync(targetMediaFilePath)
        const quarantineExists = targetQuarantinePath
          ? fs.existsSync(targetQuarantinePath)
          : false

        if (hadBinaryQuarantined && !mediaExists && !quarantineExists) {
          // Point-of-no-return violation: binary was quarantined, but is now gone from both media and quarantine!
          // NEVER roll back shows to point to a missing binary!
          console.error(
            `[MediaJournal] Critical data integrity failure in ${file}: media "${cleanMediaName}" was quarantined but is missing from both media directory and quarantine! Rollback blocked to prevent dangling references.`,
          )
          unresolvedJournals.push(file)

          continue
        }

        let allRestored = true

        // 1. Restore media binary from quarantine if missing
        if (!mediaExists && quarantineExists && targetQuarantinePath) {
          try {
            fs.copyFileSync(targetQuarantinePath, targetMediaFilePath)

            if (!restoredMediaNames.includes(cleanMediaName)) {
              restoredMediaNames.push(cleanMediaName)
            }
          } catch (copyErr) {
            allRestored = false
            console.error(
              `[MediaJournal] Failed restoring media binary from quarantine:`,
              copyErr,
            )
          }
        }

        if (
          !allRestored ||
          (hadBinaryQuarantined && !fs.existsSync(targetMediaFilePath))
        ) {
          unresolvedJournals.push(file)

          continue
        }

        // 2. Restore shows and sidecars
        for (const s of validatedShows) {
          try {
            if (s.originalBaseRaw !== null) {
              const tmpBase = `${s.filePath}.tmp.${Date.now()}`
              fs.writeFileSync(tmpBase, s.originalBaseRaw, "utf-8")
              fs.renameSync(tmpBase, s.filePath)
            }

            if (s.originalSidecarRaw !== null) {
              const tmpSidecar = `${s.sidecarPath}.tmp.${Date.now()}`
              fs.writeFileSync(tmpSidecar, s.originalSidecarRaw, "utf-8")
              fs.renameSync(tmpSidecar, s.sidecarPath)
            } else if (fs.existsSync(s.sidecarPath)) {
              fs.unlinkSync(s.sidecarPath)
            }

            // Verify restored show and sidecar
            if (s.originalBaseRaw !== null) {
              JSON.parse(fs.readFileSync(s.filePath, "utf-8"))
            }

            if (s.originalSidecarRaw !== null) {
              readSidecar(getPath, s.quizId)
            }

            if (!recoveredQuizIds.includes(s.quizId)) {
              recoveredQuizIds.push(s.quizId)
            }
          } catch (showErr) {
            allRestored = false
            console.error(
              `[MediaJournal] Failed to restore show ${s.quizId}:`,
              showErr,
            )
          }
        }

        if (!allRestored) {
          console.warn(
            `[MediaJournal] Partial recovery for journal ${file}, preserving for retry`,
          )
          unresolvedJournals.push(file)

          continue
        }

        // 3. Unlink quarantine and journal ONLY after verified rollback
        if (targetQuarantinePath && fs.existsSync(targetQuarantinePath)) {
          try {
            fs.unlinkSync(targetQuarantinePath)
          } catch (qErr) {
            console.warn(`[MediaJournal] Failed unlinking quarantine:`, qErr)
          }
        }

        if (fs.existsSync(journalPath)) {
          fs.unlinkSync(journalPath)
        }

        recoveredCount += 1

        continue
      }

      // CASE 3: Unknown status -> fail closed
      console.warn(
        `[MediaJournal] Unknown status "${entry.status}" in ${file}, preserving`,
      )
      unresolvedJournals.push(file)
    } catch (err) {
      console.warn(`[MediaJournal] Failed reading journal ${file}:`, err)
      unresolvedJournals.push(file)
    }
  }

  return {
    recoveredCount,
    recoveredQuizIds,
    restoredMediaNames,
    unresolvedCount: unresolvedJournals.length,
    unresolvedJournals,
  }
}

export interface StartupRecoveryOptions {
  getPath: (subPath?: string) => string
  updateQuizz?: (id: string, quizz: unknown) => void
  deleteQuizz?: (id: string) => void
  throwOnUnresolved?: boolean
}

export interface StartupRecoveryResult {
  status: "clean" | "recovered" | "failed"
  unresolvedCount: number
  quizRecovery: RecoveryReport
  mediaRecovery: {
    recoveredCount: number
    recoveredQuizIds: string[]
    restoredMediaNames: string[]
    unresolvedCount?: number
    unresolvedJournals?: string[]
  }
}

/**
 * Orchestrates startup journal recovery across both composite quiz-save and media-delete families.
 * Invoked on process initialization before accepting HTTP/WebSocket connections.
 */
export function recoverStartupJournals(
  optionsOrGetPath: StartupRecoveryOptions | ((subPath?: string) => string),
): StartupRecoveryResult {
  const getPath =
    typeof optionsOrGetPath === "function"
      ? optionsOrGetPath
      : optionsOrGetPath.getPath
  const updateQuizz =
    typeof optionsOrGetPath === "function"
      ? undefined
      : optionsOrGetPath.updateQuizz
  const deleteQuizz =
    typeof optionsOrGetPath === "function"
      ? undefined
      : optionsOrGetPath.deleteQuizz
  const throwOnUnresolved =
    typeof optionsOrGetPath === "function"
      ? false
      : (optionsOrGetPath.throwOnUnresolved ?? true)
  const injections: StorageInjections = {
    getPath,
    getQuizzById: (id: string) => {
      const quizzDir = getPath("quizz")
      const filePath = path.join(quizzDir, `${id}.json`)

      if (!fs.existsSync(filePath)) {
        throw new Error("errors:quizz.notFound")
      }

      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
        string,
        unknown
      >
    },
    saveQuizz: () => ({
      id: "",
    }),
    updateQuizz: (id: string, data: unknown) => {
      if (updateQuizz) {
        updateQuizz(id, data)

        return {
          id,
        }
      }

      const quizzDir = getPath("quizz")
      const filePath = path.join(quizzDir, `${id}.json`)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")

      return {
        id,
      }
    },
    deleteQuizz:
      deleteQuizz ??
      ((id: string) => {
        const quizzDir = getPath("quizz")
        const filePath = path.join(quizzDir, `${id}.json`)

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }),
  }
  const quizRecovery = recoverJournals(injections)
  const mediaRecovery = recoverMediaDeleteJournals(getPath)
  const totalUnresolved =
    (quizRecovery.unresolvedCount ?? 0) + (mediaRecovery.unresolvedCount ?? 0)
  const status: "clean" | "recovered" | "failed" = (() => {
    if (totalUnresolved > 0) {
      return "failed"
    }

    if (quizRecovery.recoveredCount > 0 || mediaRecovery.recoveredCount > 0) {
      return "recovered"
    }

    return "clean"
  })()

  if (status === "failed" && throwOnUnresolved) {
    const errorMsg = `[StartupRecovery] Server startup blocked: ${totalUnresolved} critical journal(s) unresolved. Check journal files in .journal/`
    console.error(errorMsg)
    throw new Error(errorMsg)
  }

  if (quizRecovery.recoveredCount > 0 || mediaRecovery.recoveredCount > 0) {
    console.info(
      `[StartupRecovery] Recovered ${quizRecovery.recoveredCount} quiz journals and ${mediaRecovery.recoveredCount} media delete journals`,
    )
  }

  return {
    status,
    unresolvedCount: totalUnresolved,
    quizRecovery,
    mediaRecovery,
  }
}

export interface EnrichedMediaCatalogItem extends UploadedMedia {
  usedInCurrentShow: boolean
  referenceCount: number
  references: CardMediaReference[]
}

export interface EnrichedLottieCatalogItem {
  name: string
  url: string
  type: "lottie"
  usedInCurrentShow: boolean
  referenceCount: number
  references: CardMediaReference[]
}

export interface MediaCatalogResponse {
  media: EnrichedMediaCatalogItem[]
  builtInSounds: BuiltInSoundItem[]
  showMediaCatalog: ShowMediaCatalogItem[]
  lottieAssets: EnrichedLottieCatalogItem[]
}

const LOTTIE_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.(json|lottie)$/u

export function buildMediaCatalogResponse(
  getPath: (subPath?: string) => string,
  uploadedMedia: UploadedMedia[],
  currentQuizId?: string,
): MediaCatalogResponse {
  const shows = loadAllShowsFromDisk(getPath)
  const allRefs: CardMediaReference[] = []
  for (const show of shows) {
    allRefs.push(...collectQuizMediaReferences(show))
  }
  const currentShow = currentQuizId
    ? shows.find((s) => s.id === currentQuizId)
    : undefined
  const showMediaCatalog: ShowMediaCatalogItem[] =
    currentShow?.extras?.mediaCatalog ?? []
  const currentCatalogNames = new Set(showMediaCatalog.map((item) => item.name))
  const currentCatalogUrls = new Set(showMediaCatalog.map((item) => item.url))
  const enriched: EnrichedMediaCatalogItem[] = uploadedMedia.map((item) => {
    const itemRefs = allRefs.filter(
      (r) => r.mediaName === item.name || r.url === item.url,
    )
    const usedInCurrentShow = Boolean(
      currentQuizId &&
      (itemRefs.some((r) => r.quizId === currentQuizId) ||
        currentCatalogNames.has(item.name) ||
        currentCatalogUrls.has(item.url)),
    )

    return {
      ...item,
      usedInCurrentShow,
      referenceCount: itemRefs.length,
      references: itemRefs,
    }
  })

  // Discover uploaded .json and .lottie assets in media/ directory + show catalogs
  const mediaDir = getPath("media")
  const lottieNames = new Map<string, number>()

  if (fs.existsSync(mediaDir)) {
    try {
      for (const file of fs.readdirSync(mediaDir)) {
        if (!LOTTIE_FILENAME_PATTERN.test(file)) {
          continue
        }

        const fullPath = path.join(mediaDir, file)

        try {
          const stat = fs.lstatSync(fullPath)

          if (stat.isFile()) {
            lottieNames.set(file, stat.mtimeMs)
          }
        } catch {
          // Ignore unreadable entry
        }
      }
    } catch {
      // Ignore directory read error
    }
  }

  for (const catItem of showMediaCatalog) {
    if (catItem.type === "lottie" && !lottieNames.has(catItem.name)) {
      lottieNames.set(catItem.name, catItem.addedAt ?? 0)
    }
  }
  const lottieAssets: EnrichedLottieCatalogItem[] = [...lottieNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => {
      const url = `/media/${name}`
      const itemRefs = allRefs.filter(
        (r) => r.mediaName === name || r.url === url,
      )
      const usedInCurrentShow = Boolean(
        currentQuizId &&
        (itemRefs.some((r) => r.quizId === currentQuizId) ||
          currentCatalogNames.has(name) ||
          currentCatalogUrls.has(url)),
      )

      return {
        name,
        url,
        type: "lottie" as const,
        usedInCurrentShow,
        referenceCount: itemRefs.length,
        references: itemRefs,
      }
    })

  return {
    media: enriched,
    builtInSounds: BUILT_IN_SOUNDS,
    showMediaCatalog,
    lottieAssets,
  }
}

export function associateMediaWithShow(
  getPath: (subPath?: string) => string,
  quizId: string,
  item: ShowMediaCatalogItem,
): ShowMediaCatalogItem[] {
  const existing = readSidecar(getPath, quizId)

  if (!existing) {
    return [item]
  }

  const currentCatalog = existing.mediaCatalog ? [...existing.mediaCatalog] : []
  const alreadyPresent = currentCatalog.some(
    (entry) => entry.url === item.url || entry.name === item.name,
  )

  if (!alreadyPresent) {
    currentCatalog.unshift({
      ...item,
      addedAt: item.addedAt ?? Date.now(),
    })
  }

  const updated: AnyQuizExtras = {
    ...existing,
    mediaCatalog: currentCatalog,
  }
  writeSidecar(getPath, quizId, updated)

  return currentCatalog
}
