import type { StorageInjections } from "./sidecar"

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
