import { v7 as uuidv7 } from "uuid"
import type { PerQuestionItem } from "./quiz-extras"

/**
 * Generates a stable unique UUID for a question.
 */
export const generateQuestionId = (): string => uuidv7()

/**
 * Generates an array of n distinct stable question UUIDs.
 */
export const generateQuestionIds = (count: number): string[] => {
  if (count <= 0) {
    return []
  }

  return Array.from({ length: count }, () => generateQuestionId())
}

/**
 * Ensures that an existing or new quiz has an aligned list of question UUIDs.
 */
export const ensureQuestionIds = (
  existingIds: string[] | undefined,
  questionCount: number,
): string[] => {
  const result: string[] = []
  const used = new Set<string>()

  if (existingIds) {
    for (const id of existingIds) {
      if (
        typeof id === "string" &&
        id.length > 0 &&
        !used.has(id) &&
        result.length < questionCount
      ) {
        result.push(id)
        used.add(id)
      }
    }
  }

  while (result.length < questionCount) {
    const newId = generateQuestionId()

    if (!used.has(newId)) {
      result.push(newId)
      used.add(newId)
    }
  }

  return result
}

/**
 * Reorders question IDs from a source index to a destination index.
 * Note: perQuestion entries are keyed by stable question UUIDs, so their
 * attachments naturally follow the reordered question without swapping.
 */
export const reorderQuestionIds = (
  questionIds: string[],
  fromIndex: number,
  toIndex: number,
): string[] => {
  if (
    fromIndex < 0 ||
    fromIndex >= questionIds.length ||
    toIndex < 0 ||
    toIndex >= questionIds.length ||
    fromIndex === toIndex
  ) {
    return [...questionIds]
  }

  const updated = [...questionIds]
  const [movedId] = updated.splice(fromIndex, 1)

  updated.splice(toIndex, 0, movedId)

  return updated
}

/**
 * Duplicates a question: generates a fresh UUID, inserts it directly after the
 * target index, and deep-clones the perQuestion extras for that question.
 */
export const duplicateQuestion = <
  T extends Record<string, unknown> = PerQuestionItem,
>(
  questionIds: string[],
  perQuestion: Record<string, T | undefined>,
  targetIndex: number,
): {
  questionIds: string[]
  perQuestion: Record<string, T>
  newQuestionId: string
} => {
  if (targetIndex < 0 || targetIndex >= questionIds.length) {
    throw new RangeError(
      `duplicateQuestion: targetIndex ${targetIndex} is out of bounds (length: ${questionIds.length})`,
    )
  }

  const sourceId = questionIds[targetIndex]
  const newQuestionId = generateQuestionId()
  const updatedIds = [...questionIds]

  updatedIds.splice(targetIndex + 1, 0, newQuestionId)

  const updatedPerQuestion: Record<string, T> = {}

  for (const [key, value] of Object.entries(perQuestion)) {
    if (value !== undefined) {
      updatedPerQuestion[key] = value
    }
  }

  const sourceExtras = perQuestion[sourceId]

  if (sourceExtras !== undefined) {
    updatedPerQuestion[newQuestionId] = structuredClone(sourceExtras)
  }

  return {
    questionIds: updatedIds,
    perQuestion: updatedPerQuestion,
    newQuestionId,
  }
}

/**
 * Removes a question at targetIndex, updating questionIds and cleaning up
 * any perQuestion entry to guarantee no orphan references remain.
 */
export const removeQuestion = <
  T extends Record<string, unknown> = PerQuestionItem,
>(
  questionIds: string[],
  perQuestion: Record<string, T | undefined>,
  targetIndex: number,
): {
  questionIds: string[]
  perQuestion: Record<string, T>
  removedQuestionId: string
} => {
  if (targetIndex < 0 || targetIndex >= questionIds.length) {
    throw new RangeError(
      `removeQuestion: targetIndex ${targetIndex} is out of bounds (length: ${questionIds.length})`,
    )
  }

  const removedQuestionId = questionIds[targetIndex]
  const updatedIds = questionIds.filter((_, idx) => idx !== targetIndex)
  const updatedPerQuestion: Record<string, T> = {}

  for (const [key, value] of Object.entries(perQuestion)) {
    if (key !== removedQuestionId && value !== undefined) {
      updatedPerQuestion[key] = value
    }
  }

  return {
    questionIds: updatedIds,
    perQuestion: updatedPerQuestion,
    removedQuestionId,
  }
}

/**
 * Remaps all question IDs to fresh unique UUIDs (for bundle import),
 * preserving all perQuestion metadata associations.
 */
export const remapQuestionIds = <
  T extends Record<string, unknown> = PerQuestionItem,
>(
  sourceQuestionIds: string[],
  perQuestion: Record<string, T | undefined>,
): {
  questionIds: string[]
  perQuestion: Record<string, T>
  idMap: Map<string, string>
} => {
  const idMap = new Map<string, string>()
  const freshIds: string[] = []
  const freshPerQuestion: Record<string, T> = {}

  for (const oldId of sourceQuestionIds) {
    const freshId = generateQuestionId()

    idMap.set(oldId, freshId)
    freshIds.push(freshId)

    const existingExtras = perQuestion[oldId]

    if (existingExtras !== undefined) {
      freshPerQuestion[freshId] = structuredClone(existingExtras)
    }
  }

  return {
    questionIds: freshIds,
    perQuestion: freshPerQuestion,
    idMap,
  }
}
