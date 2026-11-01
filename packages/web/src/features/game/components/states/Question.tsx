import { MEDIA_TYPES } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import clsx from "clsx"
import {
  EXTENSION_EVENTS,
  resolveCardStageAnimations,
  type CardStageAnimations,
  type ExtensionStateEnvelope,
  type QuestionEntrance as QuestionEntranceConfig,
  type QuestionReveal,
} from "@razzia/extensions/core"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import QuestionEntrance from "@razzia/web/features/game/components/QuestionEntrance"
import { useStageFit } from "@razzia/extensions/presentation"
import {
  getAuthoritativeEnvelope,
  useExtensionState,
} from "@razzia/web/features/game/contexts/extension-state-context"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect, useState } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({ data: { question, media, cooldown } }: Props) => {
  const [sfxShow] = useSound(SFX.SHOW_SOUND, { volume: 0.5 })
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const contextExtensionState = useExtensionState()
  const effectiveExtensionState = getAuthoritativeEnvelope(
    extensionState,
    contextExtensionState,
  )

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState(payload)
  })

  useEffect(() => {
    // When extensionState is present, GameWrapper's unified AudioCuePlayer manages phase audio
    if (effectiveExtensionState?.gameId) {
      return
    }
    sfxShow()
  }, [sfxShow, effectiveExtensionState?.gameId])

  const stageAnimations = resolveCardStageAnimations({
    questionEntrance: effectiveExtensionState?.extras?.questionEntrance as
      | QuestionEntranceConfig
      | undefined,
    stageAnimations: effectiveExtensionState?.extras?.stageAnimations as
      | CardStageAnimations
      | undefined,
  })

  const activeKey = `${effectiveExtensionState?.questionId ?? question}-${effectiveExtensionState?.epoch ?? 0}-show`
  const { isUltraCompact, isCompact } = useStageFit()

  return (
    <section className="relative mx-auto flex min-h-0 h-full w-full max-w-7xl flex-1 flex-col items-center justify-between overflow-hidden px-2 sm:px-4 py-1 sm:py-2">
      <QuestionEntrance
        entrance={stageAnimations.questionEntrance}
        epoch={activeKey}
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 sm:gap-4 overflow-hidden"
      >
        <h2
          data-testid="show-question-title"
          className={clsx(
            "anim-show max-w-5xl text-center font-bold text-white drop-shadow-lg line-clamp-3 sm:line-clamp-4",
            isUltraCompact
              ? "text-lg sm:text-xl"
              : isCompact
                ? "text-xl sm:text-2xl md:text-3xl"
                : "text-2xl sm:text-3xl md:text-4xl lg:text-5xl",
          )}
        >
          {question}
        </h2>

        {media?.type === MEDIA_TYPES.IMAGE && (
          <div
            className={clsx(
              "flex min-h-0 w-full items-center justify-center overflow-hidden",
              isUltraCompact
                ? "max-h-[30vh]"
                : isCompact
                  ? "max-h-[38vh]"
                  : "max-h-[45vh]",
            )}
          >
            <QuestionMedia
              media={media}
              alt={question}
              reveal={
                effectiveExtensionState?.extras.reveal as
                  | QuestionReveal
                  | undefined
              }
              serverStartedAt={effectiveExtensionState?.startedAt}
              currentEpoch={effectiveExtensionState?.epoch}
              isManager={true}
              isManuallyRevealed={
                (
                  effectiveExtensionState?.extras.reveal as
                    | { isRevealed?: boolean }
                    | undefined
                )?.isRevealed
              }
            />
          </div>
        )}
      </QuestionEntrance>
      <div
        className="bg-primary mb-2 sm:mb-6 h-3 sm:h-4 shrink-0 self-start justify-self-end rounded-full"
        style={{ animation: `progressBar ${cooldown}s linear forwards` }}
      ></div>
    </section>
  )
}

export default Question
