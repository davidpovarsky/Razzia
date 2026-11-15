import fs from "node:fs"
import {
  computeCanonicalBaseDigest,
  quizExtrasV1Schema,
  quizExtrasV2Schema,
} from "../../core/index"
import { readPhysicalFile, resolvePhysicalBase } from "./physical-binding"
import type { JournalEntry } from "./journal"
import type { StorageInjections } from "./sidecar"

class NativeBindingError extends Error {
  readonly code = "TADAZZ_NATIVE_RECOVERY_BINDING"
}
type Snapshot = ReturnType<typeof readPhysicalFile>
type Intent = {
  entry: JournalEntry
  journal: NonNullable<Snapshot>
  baseRelative: string | null
  base: Snapshot
  sidecar: Snapshot
}
const equalSnapshot = (a: Snapshot, b: Snapshot) =>
  a === null || b === null
    ? a === b
    : a.raw === b.raw &&
      a.sha256 === b.sha256 &&
      a.length === b.length &&
      a.dev === b.dev &&
      a.ino === b.ino
function basePayload(value: unknown, id: string) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as Record<string, unknown>).questions) ||
    "schemaVersion" in value
  )
    throw new Error("Invalid logical base intent")
  const record = value as Record<string, unknown>
  if (!("id" in record)) return record
  if (record.id !== id) throw new Error("Logical base identity mismatch")
  const { id: _matchedStorageId, ...payload } = record
  return payload
}
const sameBase = (actual: unknown, expected: unknown, id: string) =>
  expected !== null &&
  computeCanonicalBaseDigest(basePayload(actual, id)) ===
    computeCanonicalBaseDigest(basePayload(expected, id))
function validateExtras(value: unknown, id: string) {
  if (value === null) return
  const record = value as Record<string, unknown>
  const schema =
    record?.schemaVersion === 2 ? quizExtrasV2Schema : quizExtrasV1Schema
  if (!schema.safeParse(value).success || record.quizId !== id)
    throw new Error("Invalid logical sidecar intent")
}

/** Explicit native startup adapter. Generic callback-backed stagers never enter it.
 * V1 intent proves exact logical states; it cannot prove a pre-crash inode.
 * Persisted pre-mutation inode ownership remains the Media V2 contract.
 */
export function createNativeRecoveryAdapter(options: {
  getPath: (subPath?: string) => string
  updateQuizz?: (id: string, data: unknown) => void
  deleteQuizz?: (id: string) => void
}): StorageInjections {
  const { getPath } = options
  const admitted = new Map<string, Intent>()
  const protect = <T>(operation: () => T): T => {
    try {
      return operation()
    } catch (error) {
      throw new NativeBindingError(
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  const journalRelative = (id: string) => {
    if (!/^[A-Za-z0-9_-]+$/.test(id))
      throw new Error("Unsafe recovery identity")
    return `extensions/quizzes/.journal/${id}.journal.json`
  }
  const admit = (id: string): Intent => {
    const journal = readPhysicalFile(getPath, journalRelative(id))
    if (!journal) throw new Error("Missing native logical recovery intent")
    const entry = JSON.parse(journal.raw) as JournalEntry
    if (
      entry.quizId !== id ||
      entry.status !== "staged" ||
      (entry.kind !== undefined && entry.kind !== "quiz-save") ||
      (entry.version !== undefined && entry.version !== 1) ||
      entry.backupBase === undefined ||
      entry.backupExtras === undefined ||
      !entry.targetBase ||
      !entry.targetExtras
    )
      throw new Error("Insufficient native logical recovery intent")
    basePayload(entry.targetBase, id)
    if (entry.backupBase !== null) basePayload(entry.backupBase, id)
    validateExtras(entry.backupExtras, id)
    validateExtras(entry.targetExtras, id)
    const baseRelative = resolvePhysicalBase(getPath, id)
    const base = baseRelative ? readPhysicalFile(getPath, baseRelative) : null
    if (
      base
        ? !sameBase(JSON.parse(base.raw), entry.backupBase, id) &&
          !sameBase(JSON.parse(base.raw), entry.targetBase, id)
        : entry.backupBase !== null
    )
      throw new Error(
        "Current native base differs from complete logical intent",
      )
    const sidecar = readPhysicalFile(getPath, `extensions/quizzes/${id}.json`)
    if (sidecar) {
      const current = JSON.parse(sidecar.raw)
      validateExtras(current, id)
      if (
        ![entry.backupExtras, entry.targetExtras].some(
          (expected) =>
            expected !== null &&
            computeCanonicalBaseDigest(current) ===
              computeCanonicalBaseDigest(expected),
        )
      )
        throw new Error(
          "Current native sidecar differs from complete logical intent",
        )
    }
    const intent = { entry, journal, baseRelative, base, sidecar }
    admitted.set(id, intent)
    return intent
  }
  const assertJournal = (id: string, intent: Intent) => {
    if (
      !equalSnapshot(
        readPhysicalFile(getPath, journalRelative(id)),
        intent.journal,
      )
    )
      throw new Error("Logical recovery journal changed")
  }
  const assertBase = (id: string, intent: Intent) => {
    assertJournal(id, intent)
    const relative = resolvePhysicalBase(getPath, id)
    if (
      intent.base
        ? relative !== intent.baseRelative ||
          !equalSnapshot(readPhysicalFile(getPath, relative!), intent.base)
        : relative !== null
    )
      throw new Error("Native base binding changed after admission")
  }
  const assertBoth = (id: string, intent: Intent) => {
    assertBase(id, intent)
    if (
      !equalSnapshot(
        readPhysicalFile(getPath, `extensions/quizzes/${id}.json`),
        intent.sidecar,
      )
    )
      throw new Error("Native sibling changed after admission")
  }
  return {
    getPath,
    recoveryBoundary: (id, phase) =>
      protect(() => {
        const intent = admitted.get(id) ?? admit(id)
        if (phase === "after-sidecar") {
          assertBase(id, intent)
          const restored = readPhysicalFile(
            getPath,
            `extensions/quizzes/${id}.json`,
          )
          if (
            intent.entry.backupExtras === null
              ? restored !== null
              : !restored ||
                computeCanonicalBaseDigest(JSON.parse(restored.raw)) !==
                  computeCanonicalBaseDigest(intent.entry.backupExtras)
          )
            throw new Error(
              "Native sidecar restoration lost or changed content",
            )
          // This snapshot follows this invocation's authorized write. It does not
          // prove persisted pre-crash inode ownership for callback-backed V1.
          intent.sidecar = restored
        } else assertBoth(id, intent)
      }),
    saveQuizz: () => ({ id: "" }),
    getQuizzById: (id) =>
      protect(() => {
        const intent = admitted.get(id) ?? admit(id)
        assertBoth(id, intent)
        if (!intent.base) return null
        return JSON.parse(intent.base.raw) as Record<string, unknown>
      }),
    updateQuizz: (id, data) =>
      protect(() => {
        const intent = admitted.get(id) ?? admit(id)
        assertBoth(id, intent)
        if (
          !intent.baseRelative ||
          !sameBase(data, intent.entry.backupBase, id)
        )
          throw new Error("Unbound native restore target")
        if (options.updateQuizz) options.updateQuizz(id, data)
        else
          fs.writeFileSync(
            getPath(intent.baseRelative),
            JSON.stringify(data, null, 2),
            "utf8",
          )
        const relative = resolvePhysicalBase(getPath, id)
        const restored = relative ? readPhysicalFile(getPath, relative) : null
        if (
          relative !== intent.baseRelative ||
          !restored ||
          !sameBase(JSON.parse(restored.raw), intent.entry.backupBase, id)
        )
          throw new Error(
            "Native restore did not produce the complete original base",
          )
        if (
          !equalSnapshot(
            readPhysicalFile(getPath, `extensions/quizzes/${id}.json`),
            intent.sidecar,
          )
        )
          throw new Error("Native sibling changed during base restore")
        intent.base = restored
        return { id }
      }),
    deleteQuizz: (id) =>
      protect(() => {
        const intent = admitted.get(id) ?? admit(id)
        assertBoth(id, intent)
        if (intent.entry.backupBase !== null)
          throw new Error("Cannot delete a saved native base")
        if (intent.baseRelative) {
          if (options.deleteQuizz) options.deleteQuizz(id)
          else fs.unlinkSync(getPath(intent.baseRelative))
        }
        if (resolvePhysicalBase(getPath, id))
          throw new Error("Native base survived deletion")
        if (
          !equalSnapshot(
            readPhysicalFile(getPath, `extensions/quizzes/${id}.json`),
            intent.sidecar,
          )
        )
          throw new Error("Native sibling changed during base deletion")
        intent.base = null
      }),
  }
}
