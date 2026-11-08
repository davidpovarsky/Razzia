import type { AnswerVisual, StageAnimationSlot } from "@razzia/extensions/core"
import {
  prepareAnswerButton,
  AnswerVisualContent,
  AnswerPercentageBar,
  AnswerPercentageLabel,
} from "@razzia/extensions/media"
import clsx from "clsx"
import { Check, X } from "lucide-react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type Props = PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
    correct?: boolean
    selected?: boolean
    large?: boolean
    visual?: AnswerVisual
    percentage?: number
    count?: number
    answerIndex?: number
    cardEntrance?: StageAnimationSlot
    badgeEntrance?: StageAnimationSlot
    animationEpochKey?: string
  }

const AnswerButton = ({
  className,
  label,
  children,
  correct,
  selected,
  large,
  visual,
  percentage,
  count,
  answerIndex = 0,
  cardEntrance,
  badgeEntrance,
  animationEpochKey: _animationEpochKey,
  style,
  ...otherProps
}: Props) => {
  const CorrectIcon = correct ? Check : X

  const {
    image,
    showText,
    accessibleLabel,
    cardPreset,
    cardStyle,
    badgePreset,
    badgeStyle,
  } = prepareAnswerButton({
    visual,
    label,
    children,
    answerIndex,
    cardEntrance,
    badgeEntrance,
    style,
  })

  return (
    <button
      className={clsx(
        "relative flex overflow-hidden rounded-xl sm:rounded-2xl p-2.5 sm:p-4 text-left",
        cardPreset !== "none" && `tada-entrance-${cardPreset}`,
        className,
      )}
      style={cardStyle}
      data-tada-entrance={cardPreset !== "none" ? cardPreset : undefined}
      aria-label={accessibleLabel}
      {...otherProps}
    >
      <AnswerPercentageBar percentage={percentage} />

      <div className="relative z-10 grid w-full grid-cols-[auto_1fr_auto] content-start items-center gap-x-2.5 sm:gap-x-3 gap-y-1.5 sm:content-center">
        <span
          data-testid={`answer-badge-${answerIndex}`}
          data-tada-entrance={badgePreset !== "none" ? badgePreset : undefined}
          style={badgeStyle}
          className={clsx(
            "col-start-1 row-start-1 flex shrink-0 items-center justify-center bg-black/20 font-bold",
            badgePreset !== "none" && `tada-entrance-${badgePreset}`,
            large
              ? "size-6 rounded-md text-sm sm:size-7 sm:text-base md:size-9 md:text-lg"
              : "size-5 rounded text-xs sm:size-7 sm:rounded-md sm:text-sm md:size-8 md:text-base",
          )}
        >
          {label}
        </span>
        <AnswerVisualContent image={image} showText={showText} large={large}>
          {children}
        </AnswerVisualContent>

        <div className="col-start-3 row-start-1 flex items-center gap-2">
          <AnswerPercentageLabel percentage={percentage} count={count} />

          {correct !== undefined && (
            <CorrectIcon className="size-5 stroke-[3] md:size-7" />
          )}
        </div>

        {selected !== undefined && correct === undefined && (
          <span
            className={clsx(
              "text-foreground col-start-3 row-start-1 flex shrink-0 items-center justify-center rounded-md",
              large ? "size-6 md:size-8" : "size-5 md:size-6",
              selected ? "bg-white" : "bg-white/20",
            )}
          >
            {selected && (
              <Check
                className={clsx(
                  "stroke-5",
                  large ? "size-4 md:size-5" : "size-3 md:size-4",
                )}
              />
            )}
          </span>
        )}
      </div>
    </button>
  )
}

export default AnswerButton
