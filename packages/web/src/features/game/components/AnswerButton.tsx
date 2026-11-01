import type { AnswerVisual, StageAnimationSlot } from "@razzia/extensions/core"
import { isValidAnswerVisual } from "@razzia/extensions/media"
import clsx from "clsx"
import { Check, X } from "lucide-react"
import type { ButtonHTMLAttributes, CSSProperties, PropsWithChildren } from "react"

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

  const hasValidVisual = visual && isValidAnswerVisual(visual)
  const displayMode = hasValidVisual ? visual.display : "text"
  const showImage =
    hasValidVisual && (displayMode === "image" || displayMode === "both")
  const showText = !showImage || displayMode === "both"

  const accessibleLabel = showImage
    ? `${label}: ${typeof children === "string" ? children : ""} (${visual.alt})`
    : undefined

  const cardPreset = cardEntrance?.preset ?? "none"
  const cardDelayMs =
    cardEntrance?.timing === "sequential"
      ? answerIndex * (cardEntrance.staggerMs ?? 90)
      : 0
  const cardStyle: CSSProperties =
    cardPreset !== "none"
      ? {
          ...style,
          animationDuration: `${cardEntrance?.durationMs ?? 800}ms`,
          animationDelay: `${cardDelayMs}ms`,
          animationFillMode: "both",
        }
      : style ?? {}

  const badgePreset = badgeEntrance?.preset ?? "none"
  const badgeDelayMs =
    badgeEntrance?.timing === "sequential"
      ? answerIndex * (badgeEntrance.staggerMs ?? 90)
      : 0
  const badgeStyle: CSSProperties | undefined =
    badgePreset !== "none"
      ? {
          animationDuration: `${badgeEntrance?.durationMs ?? 800}ms`,
          animationDelay: `${badgeDelayMs}ms`,
          animationFillMode: "both",
        }
      : undefined

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
      {percentage !== undefined && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-150 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          data-testid="answer-horizontal-bar"
        />
      )}

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
        <div
          className={clsx(
            "col-span-3 row-start-2 flex flex-col items-start gap-1.5 sm:gap-2 wrap-break-word drop-shadow-md sm:col-span-1 sm:col-start-2 sm:row-start-1",
          )}
        >
          {showImage && (
            <div className="relative max-h-20 sm:max-h-28 md:max-h-32 w-auto overflow-hidden rounded-lg bg-black/10">
              <img
                src={visual.url}
                alt={visual.alt}
                data-testid="answer-visual-image"
                className="max-h-20 sm:max-h-28 md:max-h-32 w-auto rounded-lg object-contain"
                loading="lazy"
              />
            </div>
          )}

          {showText ? (
            <p
              className={clsx(
                "line-clamp-2",
                large ? "text-sm sm:text-lg md:text-xl" : "text-xs sm:text-sm md:text-lg",
              )}
            >
              {children}
            </p>
          ) : (
            <span className="sr-only" data-testid="accessible-answer-text">
              {children}
            </span>
          )}
        </div>

        <div className="col-start-3 row-start-1 flex items-center gap-2">
          {percentage !== undefined && (
            <div className="flex flex-col items-end text-right leading-tight">
              <span className="text-base font-extrabold drop-shadow-md md:text-xl">
                {percentage}%
              </span>
              {count !== undefined && (
                <span className="text-xs font-medium text-white/80 drop-shadow-sm">
                  {count}
                </span>
              )}
            </div>
          )}

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
