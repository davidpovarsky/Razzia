import type { RuntimeSnapshot } from "../../core/packages/protocol"

type PackageSlots = Partial<
  Readonly<Record<RuntimeSnapshot["phase"], "implemented" | "classic">>
>

const QUESTION_FAMILY_PHASES: ReadonlyArray<RuntimeSnapshot["phase"]> = [
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "results",
  "personalResult",
]

/**
 * A question has one renderer for its entire lifetime. Mixing native and
 * sandbox slots would replace its heading when answers or results appear.
 * Non-question scenes keep their existing independent slot selection.
 */
export function packageUsesSandboxForPhase(
  slots: PackageSlots | undefined,
  phase: RuntimeSnapshot["phase"],
): boolean {
  if (slots?.[phase] !== "implemented") {
    return false
  }

  return (
    !QUESTION_FAMILY_PHASES.includes(phase) ||
    QUESTION_FAMILY_PHASES.every((member) => slots[member] === "implemented")
  )
}

export interface PackageQuestionContent {
  questionType?: string
  mediaType?: string
}

/** Unknown legacy metadata stays native; no answer or media URL is needed. */
export function packageQuestionContentSupported(
  content: PackageQuestionContent | undefined,
): boolean | undefined {
  if (!content?.questionType) {
    return undefined
  }

  return (
    ["single", "multi"].includes(content.questionType) &&
    content.mediaType?.toLowerCase() !== "video"
  )
}

/** Admit once per question. A fallback never promotes back mid-question. */
export function createPackageQuestionAdmission() {
  let currentIdentity: string | null = null
  let admitted = false

  return {
    select(input: {
      identity: string
      supported: boolean | undefined
      available: boolean
    }): boolean {
      if (input.identity !== currentIdentity) {
        currentIdentity = input.identity
        admitted = input.supported === true && input.available
      } else if (input.supported === false || !input.available) {
        admitted = false
      }

      return admitted
    },
    reject(identity: string): boolean {
      if (identity !== currentIdentity || !admitted) {
        return false
      }

      admitted = false

      return true
    },
  }
}
