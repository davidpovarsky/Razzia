import type { AnswerVisual } from "@razzia/extensions/core"
import { isValidAnswerVisual } from "@razzia/extensions/media"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { Check, ImageOff, Trophy, Users } from "lucide-react"
import { useEffect, useState } from "react"

export interface PhotoCardGridProps {
  answers: string[]
  visuals?: AnswerVisual[]
  onSubmit?: (_key: number) => void
  readOnly?: boolean
  selectedKey?: number | null
  // Results / reveal mode props:
  isRevealed?: boolean
  responses?: Record<number, number> | number[]
  percentages?: Record<number, number>
  winners?: number[]
  isTie?: boolean
  isSurvey?: boolean
  className?: string
}

export const PhotoCardGrid = ({
  answers,
  visuals,
  onSubmit,
  readOnly = false,
  selectedKey = null,
  isRevealed = false,
  responses,
  percentages,
  winners = [],
  isTie = false,
  isSurvey = true,
  className,
}: PhotoCardGridProps) => {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})

  // Preload images into browser cache
  useEffect(() => {
    if (!visuals) return
    for (const v of visuals) {
      if (v?.url) {
        const img = new Image()
        img.src = v.url
      }
    }
  }, [visuals])

  const totalVotes = responses
    ? Object.values(responses).reduce((acc: number, c) => acc + (Number(c) || 0), 0)
    : 0

  const hasZeroVotes = totalVotes === 0

  // Layout classes based on answer count:
  // For 5 options: 6-column grid with row 1 (3 items, 2 cols each) and row 2 (2 items, cols 2-3 and 4-5 centered!)
  const getCardColumnClass = (count: number, index: number) => {
    if (count === 5) {
      if (index === 0) return "col-span-6 sm:col-span-2 sm:col-start-1"
      if (index === 1) return "col-span-6 sm:col-span-2 sm:col-start-3"
      if (index === 2) return "col-span-6 sm:col-span-2 sm:col-start-5"
      if (index === 3) return "col-span-6 sm:col-span-2 sm:col-start-2"
      if (index === 4) return "col-span-6 sm:col-span-2 sm:col-start-4"
    }

    if (count === 4) {
      return "col-span-6 sm:col-span-3"
    }

    if (count === 3) {
      return "col-span-6 sm:col-span-2"
    }

    return "col-span-6 sm:col-span-3"
  }

  return (
    <div className="flex flex-col items-center w-full">
      {isRevealed && hasZeroVotes && (
        <div
          data-testid="zero-votes-notice"
          className="mb-2 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-1 text-sm font-semibold text-white/70 backdrop-blur-md"
        >
          <Users className="size-4 text-white/50" />
          <span>No votes yet</span>
        </div>
      )}
      <div
        className={clsx(
          "mx-auto grid w-full max-w-6xl grid-cols-6 gap-2.5 sm:gap-3.5 md:gap-4 px-2 py-1 content-center items-stretch",
          className,
        )}
        data-testid="photo-card-grid"
        data-answers-count={answers.length}
      >
      {answers.map((answer, index) => {
        const visual = visuals?.find((v) => v.answerIndex === index)
        const hasValidVisual = visual && isValidAnswerVisual(visual)
        const displayMode = hasValidVisual ? visual.display : "text"
        const showImage =
          hasValidVisual && (displayMode === "image" || displayMode === "both")
        const showText = !showImage || displayMode === "both"
        const isSelected = selectedKey === index
        const isWinner =
          isRevealed && !hasZeroVotes && winners.includes(index)

        const count = responses
          ? (Array.isArray(responses) ? responses[index] : responses[index]) ?? 0
          : undefined
        const pct = percentages ? percentages[index] ?? 0 : undefined

        const colorClass = ANSWERS_COLORS[index] ?? "bg-slate-700 text-white"
        const label = ANSWERS_LABELS[index] ?? String(index + 1)
        const hasError = imageErrors[index]

        const colClass = getCardColumnClass(answers.length, index)

        return (
          <div
            key={index}
            className={clsx(
              "flex flex-col",
              colClass,
            )}
          >
            <button
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && onSubmit?.(index)}
              aria-label={`${label}: ${answer}${visual?.alt ? ` (${visual.alt})` : ""}`}
              data-testid={`photo-card-choice-${index}`}
              data-answer-index={index}
              data-winner={isWinner}
              className={clsx(
                "group relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border p-2.5 sm:p-3 text-center transition-all duration-300 ease-out",
                !readOnly && "cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-white",
                readOnly && "cursor-default",
                isSelected && "ring-4 ring-white shadow-2xl scale-[1.02]",
                isWinner && "ring-4 ring-amber-400 bg-amber-950/40 shadow-2xl shadow-amber-500/25 scale-[1.05] z-10 border-amber-300",
                !isWinner && isRevealed && !hasZeroVotes && "opacity-90 border-white/20 bg-black/40",
                !isRevealed && "border-white/15 bg-black/50 hover:border-white/40 shadow-lg",
              )}
            >
              {/* Top Bar inside Card: Label Badge & Winner / Selected Badge */}
              <div className="flex w-full items-center justify-between gap-1 mb-1.5 z-10">
                <span
                  className={clsx(
                    "flex size-6 sm:size-7 md:size-8 shrink-0 items-center justify-center rounded-lg font-black text-sm sm:text-base md:text-lg shadow-md",
                    colorClass,
                  )}
                  data-testid={`photo-card-label-${index}`}
                >
                  {label}
                </span>

                {isWinner && (
                  <span
                    data-testid="card-winner-badge"
                    className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-black shadow-md"
                  >
                    <Trophy className="size-3.5 fill-black" />
                    <span>{isTie ? "Co-leader" : "Leader"}</span>
                  </span>
                )}

                {isSelected && !isRevealed && (
                  <span className="flex size-6 items-center justify-center rounded-full bg-white text-black shadow-md">
                    <Check className="size-4 stroke-[3]" />
                  </span>
                )}
              </div>

              {/* Photo Frame: Large square, object-contain (no cropping of illustrations) */}
              <div className="relative flex aspect-square w-full max-h-36 sm:max-h-48 md:max-h-56 items-center justify-center overflow-hidden rounded-xl bg-black/30 border border-white/10 shadow-inner">
                {showImage && !hasError ? (
                  <img
                    src={visual.url}
                    alt={visual.alt || answer}
                    data-testid={`photo-card-image-${index}`}
                    loading="eager"
                    onError={() =>
                      setImageErrors((prev) => ({ ...prev, [index]: true }))
                    }
                    className="h-full w-full object-contain p-1 rounded-lg transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 p-2 text-white/40">
                    <ImageOff className="size-8" />
                    <span className="text-xs font-semibold">{visual?.alt || answer}</span>
                  </div>
                )}

                {/* Percentage progress overlay inside photo frame when revealed */}
                {isRevealed && pct !== undefined && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-center"
                    data-testid={`photo-card-overlay-${index}`}
                  >
                    <div className="flex items-baseline justify-center gap-1.5 text-white">
                      <span className="text-lg sm:text-xl md:text-2xl font-black drop-shadow-md">
                        {pct}%
                      </span>
                      {count !== undefined && (
                        <span className="text-xs sm:text-sm font-semibold text-white/80">
                          ({count} {count === 1 ? "vote" : "votes"})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Caption / Label Text */}
              {showText ? (
                <div className="mt-2 flex w-full flex-col items-center justify-center px-1">
                  <p
                    className={clsx(
                      "w-full text-center font-bold text-white wrap-break-word drop-shadow-md line-clamp-2",
                      isWinner ? "text-sm sm:text-base md:text-lg text-amber-200" : "text-xs sm:text-sm md:text-base",
                    )}
                    data-testid={`photo-card-caption-${index}`}
                  >
                    {answer}
                  </p>
                </div>
              ) : (
                <span className="sr-only">{answer}</span>
              )}

              {/* Bottom bar when revealed */}
              {isRevealed && pct !== undefined && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-700 ease-out",
                      isWinner ? "bg-amber-400" : "bg-white",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    data-testid={`photo-card-bar-${index}`}
                  />
                </div>
              )}
            </button>
          </div>
        )
      })}
      </div>
    </div>
  )
}

export default PhotoCardGrid
