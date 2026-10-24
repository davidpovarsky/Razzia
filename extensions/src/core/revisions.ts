export class RevisionConflictError extends Error {
  readonly currentRevision: number
  readonly expectedRevision: number | null

  constructor(currentRevision: number, expectedRevision: number | null) {
    super(
      `Revision conflict: expected revision ${expectedRevision}, but current stored revision is ${currentRevision}`,
    )
    this.name = "RevisionConflictError"
    this.currentRevision = currentRevision
    this.expectedRevision = expectedRevision
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
