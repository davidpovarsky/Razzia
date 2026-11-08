import { useOptionalShowTheme } from "@razzia/extensions/presentation"
import { RAZZIA_THEME_ID } from "@razzia/extensions/core"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import PhotoCardGrid from "@razzia/web/features/game/components/PhotoCardGrid"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import type { AnswerComponentProps } from "@razzia/web/features/questions/types"
import clsx from "clsx"

const SingleAnswers = ({
  answers,
  onSubmit,
  readOnly,
  fill,
  visuals,
  stageAnimations,
  animationEpochKey,
}: AnswerComponentProps) => {
  const theme = useOptionalShowTheme()
  const handleSubmit = (key: number) => onSubmit([key])

  const hasVisuals = Boolean(
    visuals && visuals.length > 0 && visuals.some((v) => Boolean(v.url)),
  )

  if (hasVisuals && theme?.definition.id !== RAZZIA_THEME_ID) {
    return (
      <div className="min-h-0 w-full flex-1 flex flex-col justify-center overflow-hidden">
        <PhotoCardGrid
          answers={answers}
          visuals={visuals}
          onSubmit={handleSubmit}
          readOnly={readOnly}
          stageAnimations={stageAnimations}
          animationEpochKey={animationEpochKey}
        />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        "mx-auto mb-2 sm:mb-4 grid w-full max-w-7xl gap-1.5 sm:gap-2 px-2 text-base font-bold text-white sm:text-lg md:text-xl",
        fill ? "flex-1 auto-rows-fr grid-cols-1 sm:grid-cols-2" : "grid-cols-2",
      )}
    >
      {answers.map((answer, key) => (
        <AnswerButton
          key={`${animationEpochKey ?? "static"}-${key}`}
          visual={visuals?.find((item) => item.answerIndex === key)}
          answerIndex={key}
          cardEntrance={stageAnimations?.answerEntrance}
          badgeEntrance={stageAnimations?.answerBadgeEntrance}
          animationEpochKey={animationEpochKey}
          className={clsx(
            ANSWERS_COLORS[key],
            answers.length === 5 && key === 4 && "col-span-2",
          )}
          label={ANSWERS_LABELS[key]}
          onClick={() => handleSubmit(key)}
          disabled={readOnly}
          large={fill}
        >
          {answer}
        </AnswerButton>
      ))}
    </div>
  )
}

export default SingleAnswers
