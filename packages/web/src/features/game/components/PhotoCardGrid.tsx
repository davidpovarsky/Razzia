import type { AnswerVisual, ResolvedCardStageAnimations, StageAnimationSlot } from "@razzia/extensions/core"
import { isValidAnswerVisual } from "@razzia/extensions/media"
import {
  CANONICAL_ANSWER_COLORS,
  computePollRanking,
  useStageFit,
  type PollOptionItem,
} from "@razzia/extensions/presentation"
import {
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { Check, ImageOff, Trophy, Users } from "lucide-react"
import { type CSSProperties, useEffect, useState } from "react"

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
  stageAnimations?: ResolvedCardStageAnimations
  animationEpochKey?: string
}

const buildSlotStyle = (
  slot: StageAnimationSlot | undefined,
  index: number,
  extra?: CSSProperties,
): CSSProperties => {
  if (!slot || slot.preset === "none") {
    return extra ?? {}
  }
  const delayMs =
    slot.timing === "sequential" ? index * (slot.staggerMs ?? 90) : 0
  return {
    ...extra,
    animationDuration: `${slot.durationMs ?? 800}ms`,
    animationDelay: `${delayMs}ms`,
    animationFillMode: "both",
  }
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
  winners: _winners = [],
  isTie: _isTie = false,
  isSurvey: _isSurvey = true,
  className,
  stageAnimations,
  animationEpochKey = "static",
}: PhotoCardGridProps) => {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})
  const {
    isUltraCompact,
    isCompact,
    isNarrowMobile,
    isPortrait,
    maxPhotoHeightPx,
    availableHeight,
  } = useStageFit()

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

  const heroPhotoHeightPx = isUltraCompact
    ? Math.min(80, Math.max(50, Math.floor(availableHeight * 0.14)))
    : isCompact || isPortrait || isNarrowMobile
      ? Math.min(120, Math.max(70, Math.floor(availableHeight * 0.18)))
      : 180

  const runnerPhotoHeightPx = isUltraCompact
    ? Math.min(48, Math.max(36, Math.floor(availableHeight * 0.08)))
    : isCompact || isPortrait || isNarrowMobile
      ? Math.min(68, Math.max(44, Math.floor(availableHeight * 0.10)))
      : 96

  const votingPhotoHeightPx = isUltraCompact
    ? Math.min(56, Math.max(40, Math.floor(availableHeight * 0.09)))
    : isNarrowMobile || isPortrait
      ? Math.min(84, Math.max(50, Math.floor(availableHeight * 0.11)))
      : isCompact
        ? Math.min(110, Math.max(64, Math.floor(availableHeight * 0.16)))
        : 160

  const totalVotes = responses
    ? Object.values(responses).reduce(
        (acc: number, c) => acc + (Number(c) || 0),
        0,
      )
    : 0

  const hasZeroVotes = totalVotes === 0

  const getCardColor = (index: number) =>
    CANONICAL_ANSWER_COLORS[index] ?? "#334155"

  // Layout classes for voting state (5 options: 3 on top row, 2 centered below; 2 columns on mobile too so zero-scroll holds on 390x844 and 320x568)
  const getCardColumnClass = (count: number, index: number) => {
    if (count === 5) {
      if (index === 0) return "col-span-3 sm:col-span-2 sm:col-start-1"
      if (index === 1) return "col-span-3 sm:col-span-2 sm:col-start-3"
      if (index === 2) return "col-span-3 sm:col-span-2 sm:col-start-5"
      if (index === 3) return "col-span-3 sm:col-span-2 sm:col-start-2"
      if (index === 4) return "col-span-6 sm:col-span-2 sm:col-start-4"
    }

    if (count === 4) {
      return "col-span-3 sm:col-span-3"
    }

    if (count === 3) {
      if (index === 2) return "col-span-6 sm:col-span-2"
      return "col-span-3 sm:col-span-2"
    }

    return "col-span-3 sm:col-span-3"
  }

  const activeCardSlot = isRevealed
    ? stageAnimations?.resultsRevealEntrance
    : stageAnimations?.answerEntrance
  const activeBadgeSlot = stageAnimations?.answerBadgeEntrance

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
        className={clsx(
          "flex min-h-0 flex-1 flex-col items-center justify-center w-full px-1.5 sm:px-2 py-0.5",
          className,
        )}
        data-testid="photo-card-grid"
        data-answers-count={answers.length}
        data-revealed="true"
      >
        {/* Top Dominant Hero Section */}
        <div
          data-testid="results-hero-section"
          className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 w-full max-w-5xl mb-2 sm:mb-3"
        >
          {rankedWinners.map((winner, wIdx) => {
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
            const cardPreset = activeCardSlot?.preset ?? "none"
            const badgePreset = activeBadgeSlot?.preset ?? "none"

            return (
              <div
                key={`${animationEpochKey}-winner-${index}`}
                data-testid={`photo-card-choice-${index}`}
                data-answer-index={index}
                data-winner="true"
                data-tada-entrance={cardPreset !== "none" ? cardPreset : undefined}
                style={buildSlotStyle(activeCardSlot, wIdx, { backgroundColor: cardBg })}
                className={clsx(
                  "relative flex flex-col items-center justify-between overflow-hidden rounded-xl sm:rounded-2xl border-2 border-amber-300 ring-2 sm:ring-4 ring-amber-400 p-2 sm:p-3 text-center shadow-2xl shadow-amber-500/30 transition-all duration-500",
                  cardPreset !== "none" && `tada-entrance-${cardPreset}`,
                  rankedWinners.length === 1
                    ? "w-full max-w-xs sm:max-w-sm md:max-w-md"
                    : "w-[calc(50%-0.5rem)] max-w-xs sm:max-w-sm",
                )}
              >
                {/* Top bar inside Hero */}
                <div className="flex w-full items-center justify-between gap-1.5 mb-1 z-10">
                  <span
                    className={clsx(
                      "flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-black/35 text-white font-black text-xs sm:text-sm border border-white/25 shadow-md",
                      badgePreset !== "none" && `tada-entrance-${badgePreset}`,
                    )}
                    style={buildSlotStyle(activeBadgeSlot, wIdx)}
                    data-tada-entrance={badgePreset !== "none" ? badgePreset : undefined}
                    data-testid={`photo-card-label-${index}`}
                  >
                    {label}
                  </span>

                  <span
                    data-testid="card-winner-badge"
                    className="flex items-center gap-1 rounded-full bg-amber-400 px-2 sm:px-3 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-black shadow-lg"
                  >
                    <Trophy className="size-3.5 sm:size-4 fill-black" />
                    <span>{rankingTie ? "Co-leader" : "Leader"}</span>
                  </span>

                  <div className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold text-white shadow-md">
                    <span>{winner.percentage}%</span>
                    <span className="text-white/80">
                      ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                    </span>
                  </div>
                </div>

                {/* Photo frame inside Hero */}
                <div
                  className="relative flex w-full items-center justify-center overflow-hidden rounded-lg sm:rounded-xl border border-black/20 shadow-inner"
                  style={{
                    backgroundColor: cardBg,
                    height: `${heroPhotoHeightPx}px`,
                    maxHeight: `${heroPhotoHeightPx}px`,
                  }}
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
                      className="h-full w-full object-contain p-1 rounded-lg transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-2 text-white/80">
                      <ImageOff className="size-6 sm:size-8" />
                      <span className="text-xs font-semibold break-words leading-tight">
                        {winner.alt || winner.label}
                      </span>
                    </div>
                  )}

                  {/* Overlay percentage */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-1 sm:p-1.5 text-center"
                    data-testid={`photo-card-overlay-${index}`}
                  >
                    <div className="flex items-baseline justify-center gap-1.5 text-white">
                      <span className="text-base sm:text-xl md:text-2xl font-black drop-shadow-md">
                        {winner.percentage}%
                      </span>
                      <span className="text-[10px] sm:text-xs font-semibold text-white/90">
                        ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Caption text */}
                {showText ? (
                  <div className="mt-1 sm:mt-1.5 flex w-full flex-col items-center justify-center px-1">
                    <p
                      className="w-full text-center font-black text-white text-[11px] sm:text-xs md:text-sm break-words leading-tight drop-shadow-md"
                      data-testid={`photo-card-caption-${index}`}
                    >
                      {winner.label}
                    </p>
                  </div>
                ) : (
                  <span className="sr-only">{winner.label}</span>
                )}

                {/* Bottom vote bar */}
                <div className="mt-1 sm:mt-1.5 h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-white/25">
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
            className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 w-full max-w-5xl"
          >
            {runnersUp.map((runner, rIdx) => {
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
              const orderIdx = rankedWinners.length + rIdx
              const cardPreset = activeCardSlot?.preset ?? "none"
              const badgePreset = activeBadgeSlot?.preset ?? "none"

              return (
                <div
                  key={`${animationEpochKey}-runner-${index}`}
                  data-testid={`photo-card-choice-${index}`}
                  data-answer-index={index}
                  data-winner="false"
                  data-tada-entrance={cardPreset !== "none" ? cardPreset : undefined}
                  style={buildSlotStyle(activeCardSlot, orderIdx, { backgroundColor: cardBg })}
                  className={clsx(
                    "relative flex flex-col items-center justify-between overflow-hidden rounded-lg sm:rounded-xl border border-black/20 p-1.5 sm:p-2 text-center shadow-lg opacity-95 transition-all duration-300",
                    cardPreset !== "none" && `tada-entrance-${cardPreset}`,
                  )}
                >
                  {/* Top Bar */}
                  <div className="flex w-full items-center justify-between gap-1 mb-0.5 z-10">
                    <span
                      className={clsx(
                        "flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-md bg-black/35 text-white font-black text-[10px] sm:text-xs border border-white/20 shadow-md",
                        badgePreset !== "none" && `tada-entrance-${badgePreset}`,
                      )}
                      style={buildSlotStyle(activeBadgeSlot, orderIdx)}
                      data-tada-entrance={badgePreset !== "none" ? badgePreset : undefined}
                      data-testid={`photo-card-label-${index}`}
                    >
                      {label}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-white bg-black/35 px-1.5 py-0.5 rounded-full">
                      {runner.count} {runner.count === 1 ? "vote" : "votes"}
                    </span>
                  </div>

                  {/* Photo Frame */}
                  <div
                    className="relative flex w-full items-center justify-center overflow-hidden rounded-md sm:rounded-lg border border-black/15 shadow-inner"
                    style={{
                      backgroundColor: cardBg,
                      height: `${runnerPhotoHeightPx}px`,
                      maxHeight: `${runnerPhotoHeightPx}px`,
                    }}
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
                        className="h-full w-full object-contain p-0.5 rounded-md transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-0.5 p-1 text-white/80">
                        <ImageOff className="size-4 sm:size-5" />
                        <span className="text-[10px] font-semibold break-words leading-tight">
                          {runner.alt || runner.label}
                        </span>
                      </div>
                    )}

                    {/* Percentage overlay */}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-0.5 text-center"
                      data-testid={`photo-card-overlay-${index}`}
                    >
                      <span className="text-xs sm:text-sm font-black text-white drop-shadow-md">
                        {runner.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Caption */}
                  {showText ? (
                    <div className="mt-1 flex w-full flex-col items-center justify-center px-0.5">
                      <p
                        className="w-full text-center font-bold text-white text-[10px] sm:text-xs break-words leading-tight drop-shadow-md"
                        data-testid={`photo-card-caption-${index}`}
                      >
                        {runner.label}
                      </p>
                    </div>
                  ) : (
                    <span className="sr-only">{runner.label}</span>
                  )}

                  {/* Vote bar */}
                  <div className="mt-1 h-1 sm:h-1.5 w-full overflow-hidden rounded-full bg-white/20">
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
  const isFiveOrMore = answers.length >= 4
  const frameHeightClass = isFiveOrMore
    ? "max-h-[13vh] sm:max-h-[18vh] md:max-h-[22vh]"
    : "max-h-[18vh] sm:max-h-[26vh] md:max-h-[32vh]"

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center w-full">
      {isRevealed && hasZeroVotes && (
        <div
          data-testid="zero-votes-notice"
          className="mb-1.5 flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-0.5 text-xs sm:text-sm font-semibold text-white/70 backdrop-blur-md"
        >
          <Users className="size-3.5 text-white/50" />
          <span>No votes yet</span>
        </div>
      )}
      <div
        className={clsx(
          "mx-auto grid w-full max-w-6xl grid-cols-6 gap-1.5 sm:gap-2.5 md:gap-3.5 px-1.5 sm:px-2 py-0.5 content-center items-stretch",
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
          const cardPreset = activeCardSlot?.preset ?? "none"
          const badgePreset = activeBadgeSlot?.preset ?? "none"

          return (
            <div
              key={`${animationEpochKey}-vote-${index}`}
              className={clsx("flex flex-col min-h-0", colClass)}
            >
              <button
                type="button"
                disabled={readOnly}
                onClick={() => !readOnly && onSubmit?.(index)}
                aria-label={`${label}: ${answer}${visual?.alt ? ` (${visual.alt})` : ""}`}
                data-testid={`photo-card-choice-${index}`}
                data-answer-index={index}
                data-winner="false"
                data-tada-entrance={cardPreset !== "none" ? cardPreset : undefined}
                style={buildSlotStyle(activeCardSlot, index, { backgroundColor: cardBg })}
                className={clsx(
                  "group relative flex h-full flex-col items-center justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-black/20 text-center transition-all duration-300 ease-out shadow-lg",
                  isUltraCompact ? "p-1" : "p-1.5 sm:p-2.5",
                  cardPreset !== "none" && `tada-entrance-${cardPreset}`,
                  !readOnly &&
                    "cursor-pointer hover:scale-[1.01] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-white",
                  readOnly && "cursor-default",
                  isSelected && "ring-4 ring-white shadow-2xl scale-[1.01]",
                )}
              >
                {/* Top bar inside Card */}
                <div className="flex w-full items-center justify-between gap-1 mb-1 z-10">
                  <span
                    className={clsx(
                      "flex size-5 sm:size-6 md:size-7 shrink-0 items-center justify-center rounded-md sm:rounded-lg bg-black/35 text-white font-black text-xs sm:text-sm md:text-base border border-white/20 shadow-md",
                      badgePreset !== "none" && `tada-entrance-${badgePreset}`,
                    )}
                    style={buildSlotStyle(activeBadgeSlot, index)}
                    data-tada-entrance={badgePreset !== "none" ? badgePreset : undefined}
                    data-testid={`photo-card-label-${index}`}
                  >
                    {label}
                  </span>

                  {isSelected && !isRevealed && (
                    <span className="flex size-5 sm:size-6 items-center justify-center rounded-full bg-white text-black shadow-md">
                      <Check className="size-3.5 sm:size-4 stroke-[3]" />
                    </span>
                  )}
                </div>

                {/* Photo Frame */}
                <div
                  className="relative flex w-full items-center justify-center overflow-hidden rounded-lg sm:rounded-xl border border-black/15 shadow-inner"
                  style={{
                    backgroundColor: cardBg,
                    height: `${votingPhotoHeightPx}px`,
                    maxHeight: `${votingPhotoHeightPx}px`,
                  }}
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
                      className="h-full w-full object-contain p-0.5 sm:p-1 rounded-lg transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-1.5 text-white/80">
                      <ImageOff className="size-5 sm:size-7" />
                      <span className="text-[10px] sm:text-xs font-semibold line-clamp-1">
                        {visual?.alt || answer}
                      </span>
                    </div>
                  )}

                  {/* Percentage progress overlay inside photo frame when revealed in zero-votes state */}
                  {isRevealed && pct !== undefined && (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 sm:p-1.5 text-center"
                      data-testid={`photo-card-overlay-${index}`}
                    >
                      <div className="flex items-baseline justify-center gap-1 text-white">
                        <span className="text-sm sm:text-lg md:text-xl font-black drop-shadow-md">
                          {pct}%
                        </span>
                        {count !== undefined && (
                          <span className="text-[10px] sm:text-xs font-semibold text-white/80">
                            ({count} {count === 1 ? "vote" : "votes"})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Caption / Label Text */}
                {showText ? (
                  <div className="mt-1 sm:mt-1.5 flex w-full flex-col items-center justify-center px-0.5">
                    <p
                      className="w-full text-center font-bold text-white break-words leading-tight drop-shadow-md text-[11px] sm:text-xs md:text-sm"
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
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
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
