import type { StorageInjections } from "./sidecar"
import { computeCanonicalBaseDigest } from "../../core/index"

/** Only a matching storage wrapper ID may differ; retain every other field/type. */
export function recoveryBasePayload(value: unknown, quizId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid recovery base object")
  const record = value as Record<string, unknown>
  if (!("id" in record)) return record
  if (record.id !== quizId) throw new Error("Recovery base identity mismatch")
  const { id: _matchedStorageId, ...payload } = record
  return payload
}
export function sameRecoveryBase(
  left: unknown,
  right: unknown,
  quizId: string,
) {
  return (
    computeCanonicalBaseDigest(recoveryBasePayload(left, quizId)) ===
    computeCanonicalBaseDigest(recoveryBasePayload(right, quizId))
  )
}

/** Only an explicit missing-record response permits creation rollback to skip deletion. */
export function readRecoveryBase(
  injections: StorageInjections,
  quizId: string,
): unknown {
  try {
    return injections.getQuizzById(quizId)
  } catch (error) {
    const details = error as {
      code?: string
      status?: number
      message?: string
    }
    if (
      details.code === "ENOENT" ||
      details.status === 404 ||
      details.message === "errors:quizz.notFound"
    )
      return null
    throw error
  }
}
