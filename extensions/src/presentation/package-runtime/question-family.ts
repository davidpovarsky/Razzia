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

type PackageFrameScene =
  | { kind: "other" }
  | { kind: "prepared"; number: number }
  | { kind: "question"; identity: string; number?: number }

interface PackageFrame {
  scope: string
  generation: number
  scene: PackageFrameScene
}

/** Reuse a prepared document only for the question it was prepared to display. */
export function selectPackageFrame(
  current: PackageFrame | null,
  scope: string,
  scene: PackageFrameScene,
): PackageFrame {
  if (current?.scope !== scope) {
    return { scope, generation: 0, scene }
  }

  const previous = current.scene

  if (
    (previous.kind === "other" && scene.kind === "other") ||
    (previous.kind === "prepared" &&
      scene.kind === "prepared" &&
      previous.number === scene.number) ||
    (previous.kind === "question" &&
      scene.kind === "question" &&
      previous.identity === scene.identity)
  ) {
    return current
  }

  const preparedForQuestion =
    previous.kind === "prepared" &&
    scene.kind === "question" &&
    previous.number === scene.number

  return {
    scope,
    generation: current.generation + (preparedForQuestion ? 0 : 1),
    scene,
  }
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

/** Await initial dependencies, then keep one renderer until the question ends. */
export function createPackageQuestionAdmission() {
  let currentIdentity: string | null = null
  let state: "pending" | "admitted" | "rejected" = "rejected"

  return {
    select(input: {
      identity: string
      supported: boolean | undefined
      available: boolean
      /** Unresolved acquisition is not a settled fallback decision. */
      pending?: boolean
    }): boolean {
      if (input.identity !== currentIdentity) {
        currentIdentity = input.identity
        state = input.supported === true ? "pending" : "rejected"
      }

      if (input.supported === false || (!input.pending && !input.available)) {
        state = "rejected"
      } else if (state === "pending" && !input.pending) {
        state = "admitted"
      }

      return state === "admitted"
    },
    reject(identity: string): boolean {
      if (identity !== currentIdentity || state !== "admitted") {
        return false
      }

      state = "rejected"

      return true
    },
  }
}
