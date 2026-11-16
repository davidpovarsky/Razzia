import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { MEDIA_TYPES } from "@razzia/common/constants"
import clsx from "clsx"
import type {
  QuestionReveal,
  QuestionDecoration,
  resolveCardStageAnimations,
} from "@razzia/extensions/core"
import { QuestionUnderline, useStageFit } from "@razzia/extensions/presentation"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import QuestionEntrance from "@razzia/web/features/game/components/QuestionEntrance"

/** Exact original question markup, with live effects kept in its host wrapper. */
export function NativeRazziaQuestion({
  data: { question, media, cooldown },
  stageAnimations,
  questionDecoration,
  epoch: activeKey,
  reveal,
  serverStartedAt,
  currentEpoch,
  isManager = true,
  isManuallyRevealed,
  controlledTimeMs,
  controlledPaused,
  revealTimeMs,
}: {
  data: CommonStatusDataMap["SHOW_QUESTION"]
  stageAnimations: ReturnType<typeof resolveCardStageAnimations>
  questionDecoration: QuestionDecoration
  epoch: string | number
  reveal?: QuestionReveal
  serverStartedAt?: number
  currentEpoch?: number
  isManager?: boolean
  isManuallyRevealed?: boolean
  controlledTimeMs?: number
  controlledPaused?: boolean
  revealTimeMs?: number
}) {
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
          controlledTimeMs={controlledTimeMs}
          controlledPaused={controlledPaused}
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
              reveal={reveal}
              serverStartedAt={serverStartedAt}
              currentEpoch={currentEpoch}
              isManager={isManager}
              isManuallyRevealed={isManuallyRevealed}
              controlledTimeMs={revealTimeMs ?? controlledTimeMs}
            />
          </div>
        )}
      </QuestionEntrance>
      <div
        data-preview-clock={controlledTimeMs === undefined ? undefined : true}
        className="bg-primary mb-2 h-3 shrink-0 self-start justify-self-end rounded-full sm:mb-6 sm:h-4"
        style={{
          animation: `progressBar ${cooldown}s linear forwards`,
          ...(controlledTimeMs === undefined
            ? {}
            : {
                animationPlayState: "paused",
                animationDelay: `-${Math.min(controlledTimeMs, cooldown * 1000)}ms`,
              }),
        }}
      ></div>
    </section>
  )
}
