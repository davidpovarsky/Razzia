// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import {
  EXTENSION_EVENTS,
  resolveCardStageAnimations,
  resolveQuestionDecoration,
  type CardStageAnimations,
  type ExtensionStateEnvelope,
  type QuestionDecoration,
  type QuestionEntrance as QuestionEntranceConfig,
} from "@razzia/extensions/core"
import {
  getAuthoritativeEnvelope,
  useExtensionState,
} from "@razzia/web/features/game/contexts/extension-state-context"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useState, useEffect } from "react"

export function useQuestionPresentation(
  question: string,
  phase: "answers" | "show",
) {
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const effectiveExtensionState = getAuthoritativeEnvelope(
    extensionState,
    useExtensionState(),
  )
  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) =>
    setExtensionState(payload),
  )
  const defaultsObj = effectiveExtensionState?.extras?.defaults as
    | {
        stageAnimations?: CardStageAnimations
        questionDecoration?: QuestionDecoration
        tadazzBackground?: { mode: "original" | "animated" | "static" }
        motionKit?: "goldy-20261105"
      }
    | undefined

  const stageAnimations = resolveCardStageAnimations({
    questionEntrance: effectiveExtensionState?.extras?.questionEntrance as
      QuestionEntranceConfig | undefined,
    stageAnimations: effectiveExtensionState?.extras?.stageAnimations as
      CardStageAnimations | undefined,
    globalStageAnimations: defaultsObj?.stageAnimations,
  })

  const questionDecoration = resolveQuestionDecoration({
    questionDecoration: effectiveExtensionState?.extras?.questionDecoration as
      QuestionDecoration | undefined,
    globalDecoration: defaultsObj?.questionDecoration,
  })

  const animationEpochKey = `${effectiveExtensionState?.questionId ?? question}-${effectiveExtensionState?.epoch ?? 0}-${phase}`

  return {
    effectiveExtensionState,
    defaultsObj,
    stageAnimations,
    questionDecoration,
    animationEpochKey,
  }
}

/** Preserve the server's optional entrance window when using native answer controls. */
export function useNativeVotingGate(startsAt?: number, paused = false) {
  const [, refresh] = useState(0)
  useEffect(() => {
    if (!startsAt || paused) return
    const delay = startsAt - Date.now()
    if (delay <= 0) return
    const timer = window.setTimeout(
      () => refresh((value) => value + 1),
      delay + 10,
    )
    return () => window.clearTimeout(timer)
  }, [startsAt, paused])
  return !paused && (!startsAt || Date.now() >= startsAt)
}
