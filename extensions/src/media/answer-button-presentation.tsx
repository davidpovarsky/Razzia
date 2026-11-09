// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { AnswerVisual, StageAnimationSlot } from "../core/index"
import type { CSSProperties, ReactNode } from "react"
import { isValidAnswerVisual } from "./rich-answer-card"

export function prepareAnswerButton({
  visual,
  label,
  children,
  answerIndex,
  cardEntrance,
  badgeEntrance,
  style,
}: {
  visual?: AnswerVisual
  label: string
  children: ReactNode
  answerIndex: number
  cardEntrance?: StageAnimationSlot
  badgeEntrance?: StageAnimationSlot
  style?: CSSProperties
}) {
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
      : (style ?? {})

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

  return {
    image: showImage ? visual : undefined,
    showText,
    accessibleLabel,
    cardPreset,
    cardStyle,
    badgePreset,
    badgeStyle,
  }
}

export function AnswerVisualContent({
  image,
  showText,
  large,
  children,
}: {
  image?: AnswerVisual
  showText: boolean
  large?: boolean
  children: ReactNode
}) {
  return (
    <div className="col-span-3 row-start-2 flex flex-col items-start gap-1.5 wrap-break-word drop-shadow-md sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:gap-2">
      {image && (
        <div className="relative max-h-20 w-auto overflow-hidden rounded-lg bg-black/10 sm:max-h-28 md:max-h-32">
          <img
            src={image.url}
            alt={image.alt}
            data-testid="answer-visual-image"
            className="max-h-20 w-auto rounded-lg object-contain sm:max-h-28 md:max-h-32"
            loading="lazy"
          />
        </div>
      )}

      {showText ? (
        <p
          className={
            large
              ? "text-sm leading-tight break-words sm:text-lg md:text-xl"
              : "text-xs leading-tight break-words sm:text-sm md:text-lg"
          }
        >
          {children}
        </p>
      ) : (
        <span className="sr-only" data-testid="accessible-answer-text">
          {children}
        </span>
      )}
    </div>
  )
}

export function AnswerPercentageBar({ percentage }: { percentage?: number }) {
  return (
    <>
      {" "}
      {percentage !== undefined && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-150 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          data-testid="answer-horizontal-bar"
        />
      )}
    </>
  )
}

export function AnswerPercentageLabel({
  percentage,
  count,
}: {
  percentage?: number
  count?: number
}) {
  return (
    <>
      {" "}
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
    </>
  )
}
