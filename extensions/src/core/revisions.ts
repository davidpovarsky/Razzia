export class RevisionConflictError extends Error {
  readonly currentRevision: number
  readonly expectedRevision: number | null
  readonly status: number = 409

  get serverRevision(): number {
    return this.currentRevision
  }

  constructor(
    currentOrMessage: number | string,
    expectedOrDetails?:
      | number
      | null
      | { serverRevision?: number; expectedRevision?: number | null },
  ) {
    if (typeof currentOrMessage === "number") {
      const current = currentOrMessage
      const expected = (expectedOrDetails as number | null | undefined) ?? null

      super(
        `Revision conflict: expected revision ${expected}, but current stored revision is ${current}`,
      )
      this.currentRevision = current
      this.expectedRevision = expected
    } else {
      const message = currentOrMessage
      const details = expectedOrDetails as
        | { serverRevision?: number; expectedRevision?: number | null }
        | undefined

      super(message)
      this.currentRevision = details?.serverRevision ?? 0
      this.expectedRevision = details?.expectedRevision ?? null
    }

    this.name = "RevisionConflictError"
  }
}

/**
 * Validates expected revision against current stored revision.
 * A null expectedRevision allows first write or legacy unversioned client.
 */
export const validateRevision = (
  currentRevision: number,
  expectedRevision: number | null,
): { valid: boolean; reason?: string } => {
  if (expectedRevision === null) {
    return { valid: true }
  }

  if (expectedRevision !== currentRevision) {
    return {
      valid: false,
      reason: `Revision mismatch: expected ${expectedRevision}, current stored is ${currentRevision}`,
    }
  }

  return { valid: true }
}

/**
 * Asserts expected revision matches current stored revision.
 * Throws RevisionConflictError on mismatch.
 */
export const assertRevisionMatch = (
  currentRevision: number,
  expectedRevision: number | null,
): void => {
  const result = validateRevision(currentRevision, expectedRevision)

  if (!result.valid) {
    throw new RevisionConflictError(currentRevision, expectedRevision)
  }
}

/**
 * Calculates the next monotonic revision number.
 */
export const nextRevision = (currentRevision: number): number => {
  if (!Number.isInteger(currentRevision) || currentRevision < 1) {
    return 1
  }

  return currentRevision + 1
}
