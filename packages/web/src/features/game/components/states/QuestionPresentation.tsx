import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { MEDIA_TYPES, QUESTION_LEAD_IN_MS } from "@razzia/common/constants"
import clsx from "clsx"
import type {
  QuestionReveal,
  QuestionDecoration,
  resolveCardStageAnimations,
} from "@razzia/extensions/core"
import { QuestionUnderline, useStageFit } from "@razzia/extensions/presentation"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import QuestionEntrance from "@razzia/web/features/game/components/QuestionEntrance"

/** One heading node for every phase of a question. Its epoch changes only for a new question/replay. */
export function NativeQuestionHeading({
  question,
  stageAnimations,
  questionDecoration,
  epoch,
  compact = false,
  titleTestId = "game-question-title",
  controlledTimeMs,
  controlledPaused,
}: {
  question: string
  stageAnimations: ReturnType<typeof resolveCardStageAnimations>
  questionDecoration: QuestionDecoration
  epoch: string | number
  compact?: boolean
  titleTestId?: string
  controlledTimeMs?: number
  controlledPaused?: boolean
}) {
  const { isUltraCompact, isCompact } = useStageFit()

  return (
    <QuestionEntrance
      entrance={{
        ...stageAnimations.questionEntrance,
        durationMs: Math.min(
          stageAnimations.questionEntrance?.durationMs ?? 800,
          QUESTION_LEAD_IN_MS,
        ),
      }}
      epoch={epoch}
      fill={false}
      className="shrink-0 items-center justify-center gap-2 px-2 text-center"
    >
      <h2
        data-testid={titleTestId}
        data-native-question-heading
        className={clsx(
          "max-w-5xl text-center leading-tight font-bold break-words text-white drop-shadow-lg",
          isUltraCompact
            ? "text-lg sm:text-xl"
            : compact || isCompact
              ? "text-xl sm:text-2xl md:text-3xl"
              : "text-2xl sm:text-3xl md:text-4xl lg:text-5xl",
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
    </QuestionEntrance>
  )
}

/** Question-only body; the live round owner retains its heading across phases. */
export function NativeRazziaQuestion({
  data: { question, media },
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
  hideHeading = false,
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
  hideHeading?: boolean
}) {
  const { isUltraCompact, isCompact } = useStageFit()

  if (hideHeading && media?.type !== MEDIA_TYPES.IMAGE) {
    return null
  }

  return (
    <section className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-between overflow-hidden px-2 py-1 sm:px-4 sm:py-2">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden sm:gap-4">
        {!hideHeading && (
          <NativeQuestionHeading
            question={question}
            stageAnimations={stageAnimations}
            questionDecoration={questionDecoration}
            epoch={activeKey}
            titleTestId="show-question-title"
            controlledTimeMs={controlledTimeMs}
            controlledPaused={controlledPaused}
          />
        )}

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
      </div>
    </section>
  )
}
