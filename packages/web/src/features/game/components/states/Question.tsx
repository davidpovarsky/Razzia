import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type ExtensionStateEnvelope,
  type QuestionReveal,
} from "@razzia/extensions/core"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
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

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState(payload)
  })

  useEffect(() => {
    sfxShow()
  }, [sfxShow])

  return (
    <section className="relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center px-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <h2 className="anim-show text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>

        {media && (
          <QuestionMedia
            media={media}
            alt={question}
            reveal={extensionState?.extras.reveal as QuestionReveal | undefined}
            serverStartedAt={extensionState?.startedAt}
            currentEpoch={extensionState?.epoch}
            isManager={true}
            isManuallyRevealed={
              (
                extensionState?.extras.reveal as
                  { isRevealed?: boolean } | undefined
              )?.isRevealed
            }
          />
        )}
      </div>
      <div
        className="bg-primary mb-20 h-4 self-start justify-self-end rounded-full"
        style={{ animation: `progressBar ${cooldown}s linear forwards` }}
      ></div>
    </section>
  )
}

export default Question
