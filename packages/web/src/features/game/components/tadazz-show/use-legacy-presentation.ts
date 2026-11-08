// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import { MEDIA_TYPES } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  resolveEffectiveCardBackground,
  resolveTadazzStageBackground,
  type CardBackgroundOverride,
  type CueId,
  type ExtensionStateEnvelope,
  type TadazzShowBackground,
} from "@razzia/extensions/core"
import { TADAZZ_IMAGE_URL } from "@razzia/extensions/presentation"
import type { TadazzMotionScene } from "@razzia/web/features/game/components/TadazzMotionStage"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import type { ViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import { useMemo, useState } from "react"

interface LegacyPresentationOptions {
  extensionState: ExtensionStateEnvelope | null
  manager?: boolean
  effectiveRole: ViewRole
  statusName: Status | undefined
  status: { data?: unknown } | null
  questionStates: { current: number; total: number } | null
}

/** Legacy effects are retained for rollback; the Classic renderer has its own lifecycle. */
export function useLegacyPresentation({
  extensionState,
  manager,
  effectiveRole,
  statusName,
  status,
  questionStates,
}: LegacyPresentationOptions) {
  const playerStatus = usePlayerStore((s) => s.status)
  const activeStatus = status ?? playerStatus
  const activeStatusMediaType = (
    activeStatus?.data as { media?: { type?: string } } | undefined
  )?.media?.type

  const currentSceneObj = extensionState?.extras.currentScene as
    | {
        id?: string
        mediaType?: string
        mediaUrl?: string
        muted?: boolean
        background?: CardBackgroundOverride
        audio?: {
          mode?: "inherit" | "mute" | "custom"
          cueId?: CueId
          url?: string
          volume?: number
          loop?: boolean
        }
      }
    | undefined

  const rawCardBackground =
    (extensionState?.extras.cardBackground as
      CardBackgroundOverride | undefined) ?? currentSceneObj?.background

  const effectiveBackground = useMemo(
    () => resolveEffectiveCardBackground(rawCardBackground),
    [rawCardBackground],
  )

  const [cardBgErrorUrl, setCardBgErrorUrl] = useState<string | null>(null)
  const showCustomCardBackground =
    effectiveBackground.mode === "card" &&
    Boolean(effectiveBackground.url) &&
    cardBgErrorUrl !== effectiveBackground.url

  const [tadazzImageUnavailable, setTadazzImageUnavailable] = useState(false)
  const tadazzSettings = (
    extensionState?.extras.defaults as
      { tadazzBackground?: TadazzShowBackground } | undefined
  )?.tadazzBackground
  // Video scenes and card-specific art always override the show backdrop.
  const tadazzBackdrop = resolveTadazzStageBackground({
    settings: tadazzSettings,
    cardBackground: showCustomCardBackground ? rawCardBackground : undefined,
    fullScreenVideo:
      (extensionState?.phase === "scene" &&
        currentSceneObj?.mediaType === "video") ||
      activeStatusMediaType === MEDIA_TYPES.VIDEO,
    imageReady: !tadazzImageUnavailable,
    tadazzImageUrl: TADAZZ_IMAGE_URL,
  })

  const activePhaseCueId: CueId | undefined = useMemo(() => {
    if (!extensionState) {
      return undefined
    }

    if (extensionState.extras.audioCue) {
      return extensionState.extras.audioCue as CueId
    }

    if (extensionState.phase === "scene") {
      return (
        currentSceneObj?.audio?.cueId ??
        (currentSceneObj?.audio?.url ? "start" : undefined)
      )
    }

    if (statusName === STATUS.SHOW_QUESTION) {
      return "showQuestion"
    }

    if (statusName === STATUS.SELECT_ANSWER) {
      return "answersMusic"
    }

    if (statusName === STATUS.SHOW_RESPONSES) {
      return "revealResults"
    }

    if (statusName === STATUS.SHOW_LEADERBOARD) {
      return "leaderboard"
    }

    return undefined
  }, [extensionState, statusName, currentSceneObj])

  const hasCompetingMediaAudio =
    activeStatusMediaType === MEDIA_TYPES.VIDEO ||
    activeStatusMediaType === MEDIA_TYPES.AUDIO ||
    (extensionState?.phase === "scene" &&
      (currentSceneObj?.mediaType === "video" ||
        currentSceneObj?.mediaType === "audio") &&
      !currentSceneObj?.muted &&
      Boolean(currentSceneObj?.mediaUrl))

  const activeCardKey =
    extensionState?.phase === "scene"
      ? (currentSceneObj?.id ?? "scene")
      : (extensionState?.questionId ?? "question")

  // Goldy's original Motion Kit is an explicitly opt-in visual presentation layer.
  // The underlying Razzia manager/player logic remains the source of truth.
  const motionEnabled =
    (Boolean(manager) || effectiveRole === "spectator") &&
    (extensionState?.extras.defaults as { motionKit?: string } | undefined)
      ?.motionKit === "goldy-20261105"
  const sceneKind = (
    extensionState?.extras.currentScene as { kind?: string } | undefined
  )?.kind
  const activeSceneData = extensionState?.extras.activeSceneData as
    | {
        interimResults?: {
          questionText: string
          options: Array<{
            answerIndex?: number
            label: string
            imageUrl?: string
            count?: number
          }>
        }
      }
    | undefined
  const motionResults = activeSceneData?.interimResults
  const motionQuestionIndex = questionStates?.current ?? 1
  const motionQuestion =
    motionResults?.options?.length === 5 && sceneKind === "interimResults"
      ? {
          question: motionResults.questionText,
          round: motionQuestionIndex <= 5 ? 1 : 2,
          number: motionQuestionIndex,
          totalQuestions: questionStates?.total ?? 10,
          options: motionResults.options.map((opt) => ({
            label: opt.label,
            image: opt.imageUrl ?? "",
          })),
        }
      : undefined
  let motionMode: "intro" | "transition" | "results" | null = null

  if (sceneKind === "opening") {
    motionMode = "intro"
  } else if (sceneKind === "transition") {
    motionMode = "transition"
  } else if (sceneKind === "interimResults") {
    motionMode = "results"
  }

  const motionScene: TadazzMotionScene | null =
    motionEnabled &&
    motionMode &&
    (motionMode === "intro" ||
      motionMode === "transition" ||
      (motionQuestion?.question &&
        motionQuestion.options.every((option) => Boolean(option.image))))
      ? {
          key: [
            extensionState?.gameId ?? "",
            motionMode,
            motionQuestionIndex,
            extensionState?.epoch ?? 0,
            extensionState?.questionId ?? "",
            sceneKind ?? "",
          ].join(":"),
          mode: motionMode,
          question: motionQuestion,
          counts: motionResults?.options.map((opt) => opt.count ?? 0),
        }
      : null

  return {
    currentSceneObj,
    effectiveBackground,
    showCustomCardBackground,
    setCardBgErrorUrl,
    tadazzBackdrop,
    setTadazzImageUnavailable,
    activePhaseCueId,
    hasCompetingMediaAudio,
    activeCardKey,
    motionEnabled,
    sceneKind,
    motionScene,
  }
}
