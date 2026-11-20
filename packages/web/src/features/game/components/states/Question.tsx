import { useQuestionPresentation } from "../tadazz-show/use-question-presentation"
import { NativeRazziaQuestion } from "@razzia/extensions/presentation"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { type QuestionReveal } from "@razzia/extensions/core"

import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
  hideHeading?: boolean
}

const Question = ({ data: { question, media, cooldown }, hideHeading }: Props) => {
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

  const pause = effectiveExtensionState?.pause
  const remaining = pause?.remainingMs
  const questionElapsed =
    typeof remaining === "number"
      ? Math.max(0, cooldown * 1000 - remaining)
      : undefined
  const startedAt =
    typeof pause?.deadline === "number"
      ? pause.deadline - cooldown * 1000
      : effectiveExtensionState?.startedAt

  return (
    <NativeRazziaQuestion
      data={{ question, media, cooldown }}
      hideHeading={hideHeading}
      stageAnimations={stageAnimations}
      questionDecoration={questionDecoration}
      epoch={activeKey}
      reveal={
        effectiveExtensionState?.extras.reveal as QuestionReveal | undefined
      }
      serverStartedAt={startedAt}
      currentEpoch={effectiveExtensionState?.epoch}
      isManuallyRevealed={
        (
          effectiveExtensionState?.extras.reveal as
            { isRevealed?: boolean } | undefined
        )?.isRevealed
      }
      revealTimeMs={pause?.paused ? questionElapsed : undefined}
      controlledPaused={pause?.paused}
    />
  )
}

export default Question
