import fs from "node:fs"
import path from "node:path"
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
} from "./storage/sidecar"
import {
  createStagedJournal,
  getJournalDirectory,
  removeJournal,
  type JournalEntry,
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
}

/**
 * Checks whether a media file can be safely deleted from the shared media store.
 * - Fail-closed: If ANY show or sidecar on disk is unreadable or malformed, deletion is blocked.
 * - If referenced by any show/card/catalog and `detach !== true`, returns `allowed: false` with full reference list.
 * - If `detach === true`, performs an atomic two-phase detachment with staged journal and rollback on ANY failure.
 */
export function checkMediaDeleteSafety(
  getPath: (subPath?: string) => string,
  mediaNameOrUrl: string,
  options?: {
    detach?: boolean
    baselineShows?: LoadedShowRecord[]
  },
): MediaDeleteSafetyResult {
  // If baseline shows provided from previous inspection, verify no file has changed in the interim
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
    return {
      allowed: true,
      references: [],
      detachedFromShows: [],
    }
  }

  // Explicit detach: execute atomic two-phase write with rollback on any failure
  const affectedShows = shows.filter((show) =>
    references.some((r) => r.quizId === show.id),
  )

  const backups: Array<{
    show: LoadedShowRecord
    originalBaseRaw: string | null
    originalSidecarRaw: string | null
    sidecarPath: string
  }> = []

  // 1. Stage in-memory and on-disk journal backups before mutating any file
  for (const show of affectedShows) {
    const originalBaseRaw = fs.existsSync(show.filePath)
      ? fs.readFileSync(show.filePath, "utf-8")
      : null
    const sidecarPath = getSidecarFilePath(getPath, show.id)
    const originalSidecarRaw = fs.existsSync(sidecarPath)
      ? fs.readFileSync(sidecarPath, "utf-8")
      : null

    backups.push({
      show,
      originalBaseRaw,
      originalSidecarRaw,
      sidecarPath,
    })

    createStagedJournal(getPath, {
      quizId: show.id,
      backupBase: originalBaseRaw ? JSON.parse(originalBaseRaw) : null,
      backupExtras: originalSidecarRaw ? JSON.parse(originalSidecarRaw) : null,
      targetBase: null,
      targetExtras: null,
    })
  }

  const detachedFromShows: string[] = []
  const rollback = () => {
    for (const b of backups) {
      try {
        if (b.originalBaseRaw !== null) {
          fs.writeFileSync(b.show.filePath, b.originalBaseRaw, "utf-8")
        }
        if (b.originalSidecarRaw !== null) {
          fs.writeFileSync(b.sidecarPath, b.originalSidecarRaw, "utf-8")
        } else if (fs.existsSync(b.sidecarPath)) {
          fs.unlinkSync(b.sidecarPath)
        }
      } catch {
        // Suppress secondary rollback errors
      }
      try {
        removeJournal(getPath, b.show.id)
      } catch {
        // Suppress journal cleanup error
      }
    }
  }

  try {
    for (const show of affectedShows) {
      // Concurrency check: verify mtime hasn't changed since initial load
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
    }

    // Post-commit re-scan verification: verify zero references survive before allowing delete
    const postHealth = loadAllShowsHealth(getPath)
    const postRefs = findMediaReferencesAcrossShows(
      mediaNameOrUrl,
      postHealth.records,
    )
    if (postRefs.length > 0) {
      throw new Error(
        `Active references (${postRefs.length}) survived detach operation`,
      )
    }

    // Success: remove staged journals
    for (const show of affectedShows) {
      removeJournal(getPath, show.id)
    }

    return {
      allowed: true,
      references,
      detachedFromShows,
    }
  } catch (error) {
    rollback()
    return {
      allowed: false,
      references,
      detachedFromShows: [],
      error: `Detach failed and was safely rolled back: ${(error as Error).message}`,
    }
  }
}

/**
 * Recovers from incomplete media detach journals (e.g. simulated server restart).
 */
export function recoverMediaDeleteJournals(
  getPath: (subPath?: string) => string,
): { recoveredCount: number; recoveredQuizIds: string[] } {
  const journalDir = getJournalDirectory(getPath)
  if (!fs.existsSync(journalDir)) {
    return { recoveredCount: 0, recoveredQuizIds: [] }
  }

  const files = fs
    .readdirSync(journalDir)
    .filter((f) => f.endsWith(".journal.json"))
  const recoveredQuizIds: string[] = []

  for (const file of files) {
    const journalPath = path.join(journalDir, file)
    try {
      const raw = fs.readFileSync(journalPath, "utf-8")
      const entry = JSON.parse(raw) as JournalEntry
      if (entry.status === "staged") {
        if (entry.backupBase !== null && entry.backupBase !== undefined) {
          const quizFile = path.join(getPath("quizz"), `${entry.quizId}.json`)
          fs.writeFileSync(
            quizFile,
            JSON.stringify(entry.backupBase, null, 2),
            "utf-8",
          )
        }
        if (entry.backupExtras !== null && entry.backupExtras !== undefined) {
          writeSidecar(
            getPath,
            entry.quizId,
            entry.backupExtras as AnyQuizExtras,
          )
        } else {
          deleteSidecar(getPath, entry.quizId)
        }
        recoveredQuizIds.push(entry.quizId)
      }
      fs.unlinkSync(journalPath)
    } catch (err) {
      console.warn(`[MediaJournal] Failed to recover journal ${file}:`, err)
    }
  }

  return {
    recoveredCount: recoveredQuizIds.length,
    recoveredQuizIds,
  }
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
