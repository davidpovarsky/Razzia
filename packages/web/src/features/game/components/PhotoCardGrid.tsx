import type { AnswerVisual } from "@razzia/extensions/core"
import { isValidAnswerVisual } from "@razzia/extensions/media"
import {
  CANONICAL_ANSWER_COLORS,
  computePollRanking,
  type PollOptionItem,
} from "@razzia/extensions/presentation"
import {
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

  // Reset image errors when question or media changes
  useEffect(() => {
    setImageErrors({})
  }, [answers, visuals])

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
    ? Object.values(responses).reduce(
        (acc: number, c) => acc + (Number(c) || 0),
        0,
      )
    : 0

  const hasZeroVotes = totalVotes === 0

  const getCardColor = (index: number) =>
    CANONICAL_ANSWER_COLORS[index] ?? "#334155"

  // Layout classes for voting state (5 options: 3 on top row, 2 centered below)
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

  // Authoritative ranking when revealed with votes
  if (isRevealed && !hasZeroVotes) {
    const optionItems: PollOptionItem[] = answers.map((answer, index) => {
      const visual = visuals?.find((v) => v.answerIndex === index)
      const count = responses
        ? (Array.isArray(responses) ? responses[index] : responses[index]) ?? 0
        : 0
      const percentage = percentages ? percentages[index] ?? 0 : 0
      return {
        answerIndex: index,
        label: answer,
        count,
        percentage,
        imageUrl: visual?.url,
        alt: visual?.alt,
      }
    })

    const ranking = computePollRanking(optionItems)
    const { winners: rankedWinners, runnersUp, isTie: rankingTie } = ranking

    return (
      <div
        className={clsx("flex flex-col items-center w-full px-2 py-1", className)}
        data-testid="photo-card-grid"
        data-answers-count={answers.length}
        data-revealed="true"
      >
        {/* Top Dominant Hero Section */}
        <div
          data-testid="results-hero-section"
          className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 w-full max-w-5xl mb-4 sm:mb-6"
        >
          {rankedWinners.map((winner) => {
            const index = winner.answerIndex
            const visual = visuals?.find((v) => v.answerIndex === index)
            const hasValidVisual = visual && isValidAnswerVisual(visual)
            const displayMode = hasValidVisual ? visual.display : "text"
            const showImage =
              hasValidVisual &&
              (displayMode === "image" || displayMode === "both")
            const showText = !showImage || displayMode === "both"
            const label = ANSWERS_LABELS[index] ?? String(index + 1)
            const hasError = imageErrors[index]
            const cardBg = getCardColor(index)

            return (
              <div
                key={`winner-${index}`}
                data-testid={`photo-card-choice-${index}`}
                data-answer-index={index}
                data-winner="true"
                style={{ backgroundColor: cardBg }}
                className={clsx(
                  "relative flex flex-col items-center justify-between overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-amber-300 ring-4 sm:ring-8 ring-amber-400 p-3 sm:p-5 text-center shadow-2xl shadow-amber-500/30 transition-all duration-500",
                  rankedWinners.length === 1
                    ? "w-full max-w-sm sm:max-w-md md:max-w-lg"
                    : "w-full sm:w-[calc(50%-1rem)] max-w-md",
                )}
              >
                {/* Top bar inside Hero */}
                <div className="flex w-full items-center justify-between gap-2 mb-2 z-10">
                  <span
                    className="flex size-7 sm:size-9 shrink-0 items-center justify-center rounded-xl bg-black/35 text-white font-black text-sm sm:text-lg border border-white/25 shadow-md"
                    data-testid={`photo-card-label-${index}`}
                  >
                    {label}
                  </span>

                  <span
                    data-testid="card-winner-badge"
                    className="flex items-center gap-1.5 rounded-full bg-amber-400 px-3 sm:px-4 py-1 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-lg"
                  >
                    <Trophy className="size-4 sm:size-5 fill-black" />
                    <span>{rankingTie ? "Co-leader" : "Leader"}</span>
                  </span>

                  <div className="flex items-center gap-1 rounded-full bg-black/35 px-2.5 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm font-mono font-bold text-white shadow-md">
                    <span>{winner.percentage}%</span>
                    <span className="text-white/80">
                      ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                    </span>
                  </div>
                </div>

                {/* Photo frame inside Hero: Dominant large square, solid background */}
                <div
                  className="relative flex aspect-square w-full max-h-48 sm:max-h-64 md:max-h-72 items-center justify-center overflow-hidden rounded-xl sm:rounded-2xl border border-black/20 shadow-inner"
                  style={{ backgroundColor: cardBg }}
                >
                  {showImage && !hasError && winner.imageUrl ? (
                    <img
                      src={winner.imageUrl}
                      alt={winner.alt || winner.label}
                      data-testid={`photo-card-image-${index}`}
                      loading="eager"
                      onError={() =>
                        setImageErrors((prev) => ({ ...prev, [index]: true }))
                      }
                      className="h-full w-full object-contain p-2 rounded-xl transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-3 text-white/80">
                      <ImageOff className="size-10" />
                      <span className="text-sm font-semibold">
                        {winner.alt || winner.label}
                      </span>
                    </div>
                  )}

                  {/* Overlay percentage */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2 text-center"
                    data-testid={`photo-card-overlay-${index}`}
                  >
                    <div className="flex items-baseline justify-center gap-2 text-white">
                      <span className="text-xl sm:text-2xl md:text-3xl font-black drop-shadow-md">
                        {winner.percentage}%
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-white/90">
                        ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Caption text */}
                {showText ? (
                  <div className="mt-2.5 flex w-full flex-col items-center justify-center px-1">
                    <p
                      className="w-full text-center font-black text-white text-sm sm:text-base md:text-lg wrap-break-word drop-shadow-md line-clamp-2"
                      data-testid={`photo-card-caption-${index}`}
                    >
                      {winner.label}
                    </p>
                  </div>
                ) : (
                  <span className="sr-only">{winner.label}</span>
                )}

                {/* Bottom vote bar */}
                <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.min(100, Math.max(0, winner.percentage))}%`,
                    }}
                    data-testid={`photo-card-bar-${index}`}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Runners-up Section: Smaller cards sorted descending by votes */}
        {runnersUp.length > 0 && (
          <div
            data-testid="results-runners-up-section"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5 md:gap-4 w-full max-w-5xl"
          >
            {runnersUp.map((runner) => {
              const index = runner.answerIndex
              const visual = visuals?.find((v) => v.answerIndex === index)
              const hasValidVisual = visual && isValidAnswerVisual(visual)
              const displayMode = hasValidVisual ? visual.display : "text"
              const showImage =
                hasValidVisual &&
                (displayMode === "image" || displayMode === "both")
              const showText = !showImage || displayMode === "both"
              const label = ANSWERS_LABELS[index] ?? String(index + 1)
              const hasError = imageErrors[index]
              const cardBg = getCardColor(index)

              return (
                <div
                  key={`runner-${index}`}
                  data-testid={`photo-card-choice-${index}`}
                  data-answer-index={index}
                  data-winner="false"
                  style={{ backgroundColor: cardBg }}
                  className="relative flex flex-col items-center justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-black/20 p-2 sm:p-2.5 text-center shadow-lg opacity-95 transition-all duration-300"
                >
                  {/* Top Bar */}
                  <div className="flex w-full items-center justify-between gap-1 mb-1 z-10">
                    <span
                      className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-black/35 text-white font-black text-xs sm:text-sm border border-white/20 shadow-md"
                      data-testid={`photo-card-label-${index}`}
                    >
                      {label}
                    </span>
                    <span className="text-[10px] sm:text-xs font-mono font-bold text-white bg-black/35 px-2 py-0.5 rounded-full">
                      {runner.count} {runner.count === 1 ? "vote" : "votes"}
                    </span>
                  </div>

                  {/* Photo Frame */}
                  <div
                    className="relative flex aspect-square w-full max-h-24 sm:max-h-28 md:max-h-32 items-center justify-center overflow-hidden rounded-lg sm:rounded-xl border border-black/15 shadow-inner"
                    style={{ backgroundColor: cardBg }}
                  >
                    {showImage && !hasError && runner.imageUrl ? (
                      <img
                        src={runner.imageUrl}
                        alt={runner.alt || runner.label}
                        data-testid={`photo-card-image-${index}`}
                        loading="eager"
                        onError={() =>
                          setImageErrors((prev) => ({ ...prev, [index]: true }))
                        }
                        className="h-full w-full object-contain p-1 rounded-lg transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 p-2 text-white/80">
                        <ImageOff className="size-6" />
                        <span className="text-xs font-semibold">
                          {runner.alt || runner.label}
                        </span>
                      </div>
                    )}

                    {/* Percentage overlay */}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 text-center"
                      data-testid={`photo-card-overlay-${index}`}
                    >
                      <span className="text-sm sm:text-base font-black text-white drop-shadow-md">
                        {runner.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Caption */}
                  {showText ? (
                    <div className="mt-1.5 flex w-full flex-col items-center justify-center px-1">
                      <p
                        className="w-full text-center font-bold text-white text-xs sm:text-sm wrap-break-word drop-shadow-md line-clamp-2"
                        data-testid={`photo-card-caption-${index}`}
                      >
                        {runner.label}
                      </p>
                    </div>
                  ) : (
                    <span className="sr-only">{runner.label}</span>
                  )}

                  {/* Vote bar */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min(100, Math.max(0, runner.percentage))}%`,
                      }}
                      data-testid={`photo-card-bar-${index}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Voting stage or Zero Votes state
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
            hasValidVisual &&
            (displayMode === "image" || displayMode === "both")
          const showText = !showImage || displayMode === "both"
          const isSelected = selectedKey === index
          const count = responses
            ? (Array.isArray(responses) ? responses[index] : responses[index]) ?? 0
            : undefined
          const pct = percentages ? percentages[index] ?? 0 : undefined
          const label = ANSWERS_LABELS[index] ?? String(index + 1)
          const hasError = imageErrors[index]
          const colClass = getCardColumnClass(answers.length, index)
          const cardBg = getCardColor(index)

          return (
            <div key={index} className={clsx("flex flex-col", colClass)}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => !readOnly && onSubmit?.(index)}
                aria-label={`${label}: ${answer}${visual?.alt ? ` (${visual.alt})` : ""}`}
                data-testid={`photo-card-choice-${index}`}
                data-answer-index={index}
                data-winner="false"
                style={{ backgroundColor: cardBg }}
                className={clsx(
                  "group relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border border-black/20 p-2.5 sm:p-3 text-center transition-all duration-300 ease-out shadow-lg",
                  !readOnly &&
                    "cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-white",
                  readOnly && "cursor-default",
                  isSelected && "ring-4 ring-white shadow-2xl scale-[1.02]",
                )}
              >
                {/* Top bar inside Card */}
                <div className="flex w-full items-center justify-between gap-1 mb-1.5 z-10">
                  <span
                    className="flex size-6 sm:size-7 md:size-8 shrink-0 items-center justify-center rounded-lg bg-black/35 text-white font-black text-sm sm:text-base md:text-lg border border-white/20 shadow-md"
                    data-testid={`photo-card-label-${index}`}
                  >
                    {label}
                  </span>

                  {isSelected && !isRevealed && (
                    <span className="flex size-6 items-center justify-center rounded-full bg-white text-black shadow-md">
                      <Check className="size-4 stroke-[3]" />
                    </span>
                  )}
                </div>

                {/* Photo Frame */}
                <div
                  className="relative flex aspect-square w-full max-h-36 sm:max-h-48 md:max-h-56 items-center justify-center overflow-hidden rounded-xl border border-black/15 shadow-inner"
                  style={{ backgroundColor: cardBg }}
                >
                  {showImage && !hasError && visual?.url ? (
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
                    <div className="flex flex-col items-center justify-center gap-1 p-2 text-white/80">
                      <ImageOff className="size-8" />
                      <span className="text-xs font-semibold">
                        {visual?.alt || answer}
                      </span>
                    </div>
                  )}

                  {/* Percentage progress overlay inside photo frame when revealed in zero-votes state */}
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
                      className="w-full text-center font-bold text-white wrap-break-word drop-shadow-md line-clamp-2 text-xs sm:text-sm md:text-base"
                      data-testid={`photo-card-caption-${index}`}
                    >
                      {answer}
                    </p>
                  </div>
                ) : (
                  <span className="sr-only">{answer}</span>
                )}

                {/* Bottom bar when revealed in zero-votes state */}
                {isRevealed && pct !== undefined && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-700 ease-out"
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
