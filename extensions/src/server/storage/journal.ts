import fs from "node:fs"
import path from "node:path"
import { v7 as uuidv7 } from "uuid"
import {
  deleteSidecar,
  getSidecarDirectory,
  readSidecar,
  writeSidecar,
  type StorageInjections,
} from "./sidecar"
import {
  quizExtrasV1Schema,
  quizExtrasV2Schema,
  type AnyQuizExtras,
} from "../../core/index"

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
  unresolvedCount?: number
  unresolvedQuizIds?: string[]
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
    return {
      recoveredCount: 0,
      recoveredQuizIds: [],
      unresolvedCount: 0,
      unresolvedQuizIds: [],
    }
  }

  let files: string[] = []

  try {
    files = fs
      .readdirSync(journalDir)
      .filter((f) => f.endsWith(".journal.json"))
  } catch (err) {
    console.error("[Journal] Failed to read journal directory:", err)

    return {
      recoveredCount: 0,
      recoveredQuizIds: [],
      unresolvedCount: 1,
      unresolvedQuizIds: [],
    }
  }

  const recoveredQuizIds: string[] = []
  const unresolvedQuizIds: string[] = []

  for (const file of files) {
    const journalPath = path.join(journalDir, file)

    try {
      if (!fs.statSync(journalPath).isFile()) {
        continue
      }

      let raw: string

      try {
        raw = fs.readFileSync(journalPath, "utf-8")
      } catch (readErr) {
        console.error(`[Journal] Unreadable journal file ${file}:`, readErr)
        unresolvedQuizIds.push(file)

        continue
      }

      let entry: Omit<JournalEntry, "kind" | "version"> & {
        kind?: string
        version?: number
      }

      try {
        entry = JSON.parse(raw) as JournalEntry
      } catch (parseErr) {
        console.error(`[Journal] Malformed JSON in journal ${file}:`, parseErr)
        unresolvedQuizIds.push(file)

        continue
      }

      // Skip media-delete entries; they are exclusively recovered by recoverMediaDeleteJournals
      if (entry.kind === "media-delete") {
        continue
      }

      // 1. Kind and version validation: accept only clearly defined quiz-save journals
      if (entry.kind !== undefined && entry.kind !== "quiz-save") {
        console.warn(
          `[Journal] Incompatible journal kind "${entry.kind}" in ${file}, preserving`,
        )
        unresolvedQuizIds.push(file)

        continue
      }

      if (entry.version !== undefined && entry.version !== 1) {
        console.warn(
          `[Journal] Incompatible journal version "${entry.version}" in ${file}, preserving`,
        )
        unresolvedQuizIds.push(file)

        continue
      }

      // 2. Quiz ID path traversal and sanity validation
      if (
        typeof entry.quizId !== "string" ||
        !entry.quizId.trim() ||
        entry.quizId.includes("..") ||
        entry.quizId.includes("/") ||
        entry.quizId.includes("\\")
      ) {
        console.error(
          `[Journal] Invalid or unsafe quizId in journal ${file}: "${entry.quizId}", preserving`,
        )
        unresolvedQuizIds.push(file)

        continue
      }

      const cleanId = path.basename(entry.quizId).replace(/\.json$/i, "")

      if (!cleanId) {
        console.error(`[Journal] Empty cleanId for quiz in ${file}, preserving`)
        unresolvedQuizIds.push(file)

        continue
      }

      // Check status: only "staged" requires active rollback. Unknown status is preserved.
      if (entry.status !== "staged") {
        console.warn(
          `[Journal] Non-staged or unknown status "${entry.status}" in ${file}, preserving`,
        )
        unresolvedQuizIds.push(cleanId)

        continue
      }

      // 3. Concurrency check: do not blindly restore over a newer concurrent revision
      const currentSidecar = readSidecar(injections.getPath, cleanId)
      const targetRevision =
        typeof entry.targetExtras === "object" && entry.targetExtras !== null
          ? (entry.targetExtras as Record<string, unknown>).revision
          : undefined

      if (
        currentSidecar &&
        typeof targetRevision === "number" &&
        currentSidecar.revision > targetRevision
      ) {
        console.warn(
          `[Journal] Quiz ${cleanId} has current sidecar revision ${currentSidecar.revision} > target revision ${targetRevision}; skipping rollback to prevent overwriting newer revision`,
        )
        unresolvedQuizIds.push(cleanId)

        continue
      }

      // 4. Version-discriminate backup extras using public schema exports
      let parsedExtras: AnyQuizExtras | null = null

      if (entry.backupExtras !== null && entry.backupExtras !== undefined) {
        if (typeof entry.backupExtras === "object") {
          const obj = entry.backupExtras as Record<string, unknown>

          if (obj.schemaVersion === 2) {
            const v2 = quizExtrasV2Schema.safeParse(entry.backupExtras)

            if (v2.success) {
              parsedExtras = v2.data
            }
          } else {
            const v1 = quizExtrasV1Schema.safeParse(entry.backupExtras)

            if (v1.success) {
              parsedExtras = v1.data
            } else {
              const v2Fallback = quizExtrasV2Schema.safeParse(
                entry.backupExtras,
              )

              if (v2Fallback.success) {
                parsedExtras = v2Fallback.data
              }
            }
          }
        }

        if (!parsedExtras) {
          // FAIL CLOSED: Never delete sidecar on invalid non-null backup!
          console.error(
            `[Journal] Non-null backupExtras for quiz ${cleanId} failed schema parsing; preserving sidecar and journal for manual recovery`,
          )
          unresolvedQuizIds.push(cleanId)

          continue
        }
      }

      // 5. Rollback base quiz without swallowing errors
      if (entry.backupBase !== null && entry.backupBase !== undefined) {
        injections.updateQuizz(cleanId, entry.backupBase)
      } else {
        injections.deleteQuizz(cleanId)
      }

      // 6. Rollback sidecar
      if (parsedExtras) {
        writeSidecar(injections.getPath, cleanId, parsedExtras)
      } else {
        deleteSidecar(injections.getPath, cleanId)
      }

      // 7. Verification before removing journal
      if (entry.backupBase !== null && entry.backupBase !== undefined) {
        let verifiedBase: unknown = null

        try {
          verifiedBase = injections.getQuizzById(cleanId)
        } catch {
          // GetQuizzById may throw if unmocked or missing
        }

        if (!verifiedBase) {
          const quizzDir = injections.getPath("quizz")
          const filePath = path.join(quizzDir, `${cleanId}.json`)

          if (fs.existsSync(filePath)) {
            try {
              verifiedBase = JSON.parse(fs.readFileSync(filePath, "utf-8"))
            } catch {
              // Ignore
            }
          }
        }

        if (!verifiedBase) {
          throw new Error(`Failed to verify rolled back base quiz ${cleanId}`)
        }
      }

      if (parsedExtras) {
        const verifiedSidecar = readSidecar(injections.getPath, cleanId)

        if (
          !verifiedSidecar ||
          verifiedSidecar.revision !== parsedExtras.revision
        ) {
          throw new Error(`Failed to verify rolled back sidecar ${cleanId}`)
        }
      } else {
        const verifiedSidecar = readSidecar(injections.getPath, cleanId)

        if (verifiedSidecar !== null) {
          throw new Error(
            `Expected null sidecar after delete for ${cleanId}, but sidecar exists`,
          )
        }
      }

      // 8. Remove journal only after verified restoration
      if (fs.existsSync(journalPath)) {
        fs.unlinkSync(journalPath)
      }

      recoveredQuizIds.push(cleanId)
    } catch (error) {
      console.warn(`[Journal] Failed to recover journal ${file}:`, error)
      unresolvedQuizIds.push(file)
    }
  }

  return {
    recoveredCount: recoveredQuizIds.length,
    recoveredQuizIds,
    unresolvedCount: unresolvedQuizIds.length,
    unresolvedQuizIds,
  }
}
