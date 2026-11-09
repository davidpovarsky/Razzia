import { useQuestionPresentation } from "../tadazz-show/use-question-presentation"
import { QuestionUnderline, useStageFit } from "@razzia/extensions/presentation"
import { MEDIA_TYPES } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import clsx from "clsx"
import { type QuestionReveal } from "@razzia/extensions/core"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import QuestionEntrance from "@razzia/web/features/game/components/QuestionEntrance"

import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({ data: { question, media, cooldown } }: Props) => {
  const [sfxShow] = useSound(SFX.SHOW_SOUND, { volume: 0.5 })
  const {
    effectiveExtensionState,
    stageAnimations,
    questionDecoration,
    animationEpochKey: activeKey,
  } = useQuestionPresentation(question, "show")

  useEffect(() => {
    // When extensionState is present, GameWrapper's unified AudioCuePlayer manages phase audio
    if (effectiveExtensionState?.gameId) {
      return
    }

    sfxShow()
  }, [sfxShow, effectiveExtensionState?.gameId])

  const { isUltraCompact, isCompact } = useStageFit()

  return (
    <section className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-between overflow-hidden px-2 py-1 sm:px-4 sm:py-2">
      <QuestionEntrance
        entrance={stageAnimations.questionEntrance}
        epoch={activeKey}
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden sm:gap-4"
      >
        <h2
          data-testid="show-question-title"
          className={clsx(
            "anim-show max-w-5xl text-center leading-tight font-bold break-words text-white drop-shadow-lg",
            (() => {
              if (isUltraCompact) {
                return "text-lg sm:text-xl"
              }

              if (isCompact) {
                return "text-xl sm:text-2xl md:text-3xl"
              }

              return "text-2xl sm:text-3xl md:text-4xl lg:text-5xl"
            })(),
          )}
        >
          {question}
        </h2>

        <QuestionUnderline
          decoration={questionDecoration}
          className="flex w-48 items-center justify-center sm:w-64"
          playerClassName="h-5 w-full"
        />

        {media?.type === MEDIA_TYPES.IMAGE && (
          <div
            className={clsx(
              "flex min-h-0 w-full items-center justify-center overflow-hidden",
              (() => {
                if (isUltraCompact) {
                  return "max-h-[30vh]"
                }

                if (isCompact) {
                  return "max-h-[38vh]"
                }

                return "max-h-[45vh]"
              })(),
            )}
          >
            <QuestionMedia
              media={media}
              alt={question}
              reveal={
                effectiveExtensionState?.extras.reveal as
                  QuestionReveal | undefined
              }
              serverStartedAt={effectiveExtensionState?.startedAt}
              currentEpoch={effectiveExtensionState?.epoch}
              isManager={true}
              isManuallyRevealed={
                (
                  effectiveExtensionState?.extras.reveal as
                    { isRevealed?: boolean } | undefined
                )?.isRevealed
              }
            />
          </div>
        )}
      </QuestionEntrance>
      <div
        className="bg-primary mb-2 h-3 shrink-0 self-start justify-self-end rounded-full sm:mb-6 sm:h-4"
        style={{ animation: `progressBar ${cooldown}s linear forwards` }}
      ></div>
    </section>
  )
}

export default Question
