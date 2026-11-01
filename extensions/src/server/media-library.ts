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
  deleteSidecar,
  getSidecarDirectory,
  getSidecarFilePath,
  readSidecar,
  sidecarExists,
  writeSidecar,
  type StorageInjections,
} from "./storage/sidecar"
import {
  createStagedJournal,
  getJournalDirectory,
  recoverJournals,
  removeJournal,
  type JournalEntry,
  type RecoveryReport,
} from "./storage/journal"

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
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch (jsonErr) {
          unreadableFiles.push(`quizz/${file}: invalid JSON (${(jsonErr as Error).message})`)
          continue
        }

        if (!parsed || typeof parsed !== "object") {
          unreadableFiles.push(`quizz/${file}: not a valid JSON object`)
          continue
        }

        const quizObj = parsed as LoadedShowRecord["quizz"] & { id?: string }
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
      sidecarFiles = fs.readdirSync(sidecarDir).filter((f) => f.endsWith(".json"))
    } catch {
      // directory read failure
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
            unreadableFiles.push(`extensions/quizzes/${sf}: invalid sidecar schema`)
          } else {
            records.push({
              id: cleanQuizId,
              filePath: sPath,
              quizz: { subject: cleanQuizId, questions: [] },
              extras,
            })
          }
        } catch (err) {
          unreadableFiles.push(`extensions/quizzes/${sf}: ${(err as Error).message}`)
        }
      }
    }
  }

  return { records, unreadableFiles }
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
  const dir = path.join(getSidecarDirectory(getPath), ".journal", "media-delete")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export const getMediaQuarantineDirectory = (
  getPath: (subPath?: string) => string,
): string => {
  const dir = path.join(getMediaDeleteJournalDirectory(getPath), "quarantine")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
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
      try {
        options.deleteMediaFn()
      } catch (delErr) {
        return {
          allowed: false,
          references: [],
          detachedFromShows: [],
          error: `Failed to delete physical media file: ${(delErr as Error).message}`,
        }
      }
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
            // ignore
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
            // ignore
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
        // ignore
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
      writeCount++

      if (options?.faultInjection?.failAfterFirstShowWrite && writeCount === 1) {
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

    // Durable success reached: clean up quarantine and journal
    if (quarantinePath && fs.existsSync(quarantinePath)) {
      try {
        fs.unlinkSync(quarantinePath)
      } catch {
        // ignore
      }
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
} {
  const journalDir = getMediaDeleteJournalDirectory(getPath)
  if (!fs.existsSync(journalDir)) {
    return { recoveredCount: 0, recoveredQuizIds: [], restoredMediaNames: [] }
  }

  let files: string[] = []
  try {
    files = fs.readdirSync(journalDir).filter((f) => f.endsWith(".json"))
  } catch {
    return { recoveredCount: 0, recoveredQuizIds: [], restoredMediaNames: [] }
  }

  const recoveredQuizIds: string[] = []
  const restoredMediaNames: string[] = []

  for (const file of files) {
    const journalPath = path.join(journalDir, file)
    try {
      if (!fs.statSync(journalPath).isFile()) {
        continue
      }

      const raw = fs.readFileSync(journalPath, "utf-8")
      const entry = JSON.parse(raw) as Partial<MediaDeleteJournalEntry>

      // Fail-closed invariant: ignore/preserve unknown or incompatible journals
      if (entry.kind !== "media-delete" || entry.version !== 1) {
        console.warn(
          `[MediaJournal] Unknown or incompatible journal ${file}, preserving for manual inspection`,
        )
        continue
      }

      if (entry.status === "staged" && Array.isArray(entry.shows)) {
        let allRestored = true

        for (const s of entry.shows) {
          try {
            if (s.originalBaseRaw !== null && s.filePath) {
              try {
                if (fs.existsSync(s.filePath)) {
                  fs.chmodSync(s.filePath, 0o666)
                }
              } catch {
                // ignore
              }
              const tmpBase = `${s.filePath}.tmp.${Date.now()}`
              fs.writeFileSync(tmpBase, s.originalBaseRaw, "utf-8")
              fs.renameSync(tmpBase, s.filePath)
            }
            if (s.originalSidecarRaw !== null && s.sidecarPath) {
              try {
                if (fs.existsSync(s.sidecarPath)) {
                  fs.chmodSync(s.sidecarPath, 0o666)
                }
              } catch {
                // ignore
              }
              const tmpSidecar = `${s.sidecarPath}.tmp.${Date.now()}`
              fs.writeFileSync(tmpSidecar, s.originalSidecarRaw, "utf-8")
              fs.renameSync(tmpSidecar, s.sidecarPath)
            } else if (s.sidecarPath && fs.existsSync(s.sidecarPath)) {
              fs.unlinkSync(s.sidecarPath)
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

        // Restore media binary if quarantined and missing from media dir
        if (entry.quarantinePath && fs.existsSync(entry.quarantinePath)) {
          try {
            if (entry.mediaFilePath && !fs.existsSync(entry.mediaFilePath)) {
              fs.copyFileSync(entry.quarantinePath, entry.mediaFilePath)
              if (
                entry.cleanMediaName &&
                !restoredMediaNames.includes(entry.cleanMediaName)
              ) {
                restoredMediaNames.push(entry.cleanMediaName)
              }
            }
            // Cleanup quarantine once binary is safely in place or verified
            fs.unlinkSync(entry.quarantinePath)
          } catch (qErr) {
            allRestored = false
            console.error(
              `[MediaJournal] Failed to restore quarantined media ${entry.cleanMediaName}:`,
              qErr,
            )
          }
        }

        if (allRestored) {
          fs.unlinkSync(journalPath)
        } else {
          console.warn(
            `[MediaJournal] Partial recovery for journal ${file}, preserving for retry`,
          )
        }
      }
    } catch (err) {
      console.warn(`[MediaJournal] Failed reading journal ${file}:`, err)
    }
  }

  return {
    recoveredCount: recoveredQuizIds.length,
    recoveredQuizIds,
    restoredMediaNames,
  }
}

export interface StartupRecoveryOptions {
  getPath: (subPath?: string) => string
  updateQuizz?: (id: string, quizz: unknown) => void
  deleteQuizz?: (id: string) => void
}

/**
 * Orchestrates startup journal recovery across both composite quiz-save and media-delete families.
 * Invoked on process initialization before accepting HTTP/WebSocket connections.
 */
export function recoverStartupJournals(
  optionsOrGetPath: StartupRecoveryOptions | ((subPath?: string) => string),
): {
  quizRecovery: RecoveryReport
  mediaRecovery: {
    recoveredCount: number
    recoveredQuizIds: string[]
    restoredMediaNames: string[]
  }
} {
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

  const injections: StorageInjections = {
    getPath,
    getQuizzById: () => undefined,
    saveQuizz: () => ({ id: "" }),
    updateQuizz:
      updateQuizz ??
      ((id: string, data: unknown) => {
        const quizzDir = getPath("quizz")
        const filePath = path.join(quizzDir, `${id}.json`)
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
        return { id }
      }),
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

  if (quizRecovery.recoveredCount > 0 || mediaRecovery.recoveredCount > 0) {
    console.info(
      `[StartupRecovery] Recovered ${quizRecovery.recoveredCount} quiz journals and ${mediaRecovery.recoveredCount} media delete journals`,
    )
  }

  return { quizRecovery, mediaRecovery }
}

export interface EnrichedMediaCatalogItem extends UploadedMedia {
  usedInCurrentShow: boolean
  referenceCount: number
  references: CardMediaReference[]
}

export interface MediaCatalogResponse {
  media: EnrichedMediaCatalogItem[]
  builtInSounds: BuiltInSoundItem[]
  showMediaCatalog: ShowMediaCatalogItem[]
}

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
  const currentCatalogNames = new Set(
    showMediaCatalog.map((item) => item.name),
  )
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

  return {
    media: enriched,
    builtInSounds: BUILT_IN_SOUNDS,
    showMediaCatalog,
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
