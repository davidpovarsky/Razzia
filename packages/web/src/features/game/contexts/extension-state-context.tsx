import type {
  ExtensionStateEnvelope,
  RevealDistributionSnapshot,
} from "@razzia/extensions/core"
import { createContext, useContext, type PropsWithChildren } from "react"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"

/**
 * Compares two ExtensionStateEnvelopes by epoch and sequence number.
 * An envelope is strictly newer if its epoch is higher, or if its epoch is equal and seq is higher.
 */
export function isNewerEnvelope(
  incoming: ExtensionStateEnvelope | null | undefined,
  current: ExtensionStateEnvelope | null | undefined,
): boolean {
  if (!incoming) {
    return false
  }

  if (!current) {
    return true
  }

  if (incoming.epoch > current.epoch) {
    return true
  }

  if (incoming.epoch < current.epoch) {
    return false
  }

  return incoming.seq > current.seq
}

/**
 * Returns the authoritative (newer) envelope between two candidates.
 */
export function getAuthoritativeEnvelope(
  a: ExtensionStateEnvelope | null | undefined,
  b: ExtensionStateEnvelope | null | undefined,
): ExtensionStateEnvelope | null {
  if (!a) {
    return b ?? null
  }

  if (!b) {
    return a
  }

  return isNewerEnvelope(a, b) ? a : b
}

export interface RevealValidationParams {
  revealDistribution: RevealDistributionSnapshot | null | undefined
  currentType: string
  currentQuestionIndex?: number | null
  currentQuestionId?: string | null
  answersCount?: number
}

/**
 * Validates whether a revealDistribution snapshot belongs to the current question and epoch.
 * Rejects snapshots from previous questions, mismatched types, or invalid indices.
 */
export function isRevealValidForQuestion({
  revealDistribution,
  currentType,
  currentQuestionIndex,
  currentQuestionId,
  answersCount,
}: RevealValidationParams): boolean {
  if (!revealDistribution) {
    return false
  }

  // Question type must match if present in distribution
  if (
    revealDistribution.questionType &&
    revealDistribution.questionType !== currentType
  ) {
    return false
  }

  // Question index must match if currentQuestionIndex is known
  if (
    typeof currentQuestionIndex === "number" &&
    revealDistribution.questionIndex !== currentQuestionIndex
  ) {
    return false
  }

  // Question ID must match if both are present
  if (
    currentQuestionId &&
    revealDistribution.questionId &&
    revealDistribution.questionId !== currentQuestionId
  ) {
    return false
  }

  // Options bounds check
  if (typeof answersCount === "number" && revealDistribution.options) {
    const optionIndices = Object.keys(revealDistribution.options).map(Number)
    const hasOutOfBounds = optionIndices.some(
      (idx) => idx < 0 || idx >= answersCount,
    )

    if (hasOutOfBounds) {
      return false
    }
  }

  return true
}

export const ExtensionStateContext =
  createContext<ExtensionStateEnvelope | null>(null)

export const useExtensionState = (): ExtensionStateEnvelope | null => {
  const contextValue = useContext(ExtensionStateContext)
  const storeValue = useManagerStore((s) => s.extensionState)

  return getAuthoritativeEnvelope(contextValue, storeValue)
}

export const ExtensionStateProvider = ({
  value,
  children,
}: PropsWithChildren<{ value: ExtensionStateEnvelope | null }>) => (
  <ExtensionStateContext.Provider value={value}>
    {children}
  </ExtensionStateContext.Provider>
)
