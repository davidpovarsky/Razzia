import fs from "node:fs"
import path from "node:path"
import { v7 as uuidv7 } from "uuid"
import {
  deleteSidecar,
  getSidecarDirectory,
  writeSidecar,
  type StorageInjections,
} from "./sidecar"
import { quizExtrasV1Schema } from "../../core/index"

export interface JournalEntry {
  version?: 1
  kind?: "quiz-save"
  id: string
  quizId: string
  createdAt: number
  status: "staged" | "committed"
  backupBase: unknown
  backupExtras: unknown
  targetBase: unknown
  targetExtras: unknown
}

export const getJournalDirectory = (
  getPath: (subPath?: string) => string,
): string => {
  const sidecarDir = getSidecarDirectory(getPath)
  const journalDir = path.join(sidecarDir, ".journal")

  if (!fs.existsSync(journalDir)) {
    fs.mkdirSync(journalDir, { recursive: true })
  }

  return journalDir
}

export const getJournalFilePath = (
  getPath: (subPath?: string) => string,
  quizId: string,
): string => {
  const cleanId = path.basename(quizId).replace(/\.json$/i, "")
  const dir = getJournalDirectory(getPath)

  return path.join(dir, `${cleanId}.journal.json`)
}

export const createStagedJournal = (
  getPath: (subPath?: string) => string,
  params: {
    quizId: string
    backupBase: unknown
    backupExtras: unknown
    targetBase: unknown
    targetExtras: unknown
  },
): JournalEntry => {
  const entry: JournalEntry = {
    version: 1,
    kind: "quiz-save",
    id: uuidv7(),
    quizId: params.quizId,
    createdAt: Date.now(),
    status: "staged",
    backupBase: params.backupBase,
    backupExtras: params.backupExtras,
    targetBase: params.targetBase,
    targetExtras: params.targetExtras,
  }

  const filePath = getJournalFilePath(getPath, params.quizId)

  const tmpPath = `${filePath}.tmp.${Date.now()}`
  fs.writeFileSync(tmpPath, JSON.stringify(entry, null, 2), "utf-8")
  fs.renameSync(tmpPath, filePath)

  return entry
}

export const removeJournal = (
  getPath: (subPath?: string) => string,
  quizId: string,
): void => {
  const filePath = getJournalFilePath(getPath, quizId)

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

export interface RecoveryReport {
  recoveredCount: number
  recoveredQuizIds: string[]
}

/**
 * Recovers from incomplete writes (e.g. simulated power-loss or crash)
 * by inspecting staged journal entries and restoring previous consistent state.
 */
export const recoverJournals = (
  injections: StorageInjections,
): RecoveryReport => {
  const journalDir = getJournalDirectory(injections.getPath)

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
      if (!fs.statSync(journalPath).isFile()) {
        continue
      }

      const raw = fs.readFileSync(journalPath, "utf-8")
      const entry = JSON.parse(raw) as JournalEntry

      // Skip media-delete entries; they are exclusively recovered by recoverMediaDeleteJournals
      if (entry.kind === "media-delete") {
        continue
      }

      if (entry.status === "staged") {
        // Roll back base quiz to backupBase
        if (entry.backupBase !== null && entry.backupBase !== undefined) {
          try {
            injections.updateQuizz(entry.quizId, entry.backupBase)
          } catch {
            // Base update failed
          }
        } else {
          // If there was no previous base quiz, delete partially written base
          try {
            injections.deleteQuizz(entry.quizId)
          } catch {
            // Already deleted or absent
          }
        }

        // Roll back sidecar to backupExtras
        if (entry.backupExtras !== null && entry.backupExtras !== undefined) {
          const parsedExtras = quizExtrasV1Schema.safeParse(entry.backupExtras)

          if (parsedExtras.success) {
            writeSidecar(injections.getPath, entry.quizId, parsedExtras.data)
          } else {
            deleteSidecar(injections.getPath, entry.quizId)
          }
        } else {
          deleteSidecar(injections.getPath, entry.quizId)
        }

        recoveredQuizIds.push(entry.quizId)
      }

      // Remove recovered journal file
      if (fs.existsSync(journalPath)) {
        fs.unlinkSync(journalPath)
      }
    } catch (error) {
      console.warn(`[Journal] Failed to recover journal ${file}:`, error)
    }
  }

  return {
    recoveredCount: recoveredQuizIds.length,
    recoveredQuizIds,
  }
}
