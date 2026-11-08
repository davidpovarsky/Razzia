import NativeButton from "@razzia/web/components/Button"
import type {
  AnswerVisual,
  ResolvedCardStageAnimations,
  StageAnimationSlot,
} from "@razzia/extensions/core"
import { isValidAnswerVisual } from "@razzia/extensions/media"
import {
  CANONICAL_ANSWER_COLORS,
  computePollRanking,
  useStageFit,
  type PollOptionItem,
} from "@razzia/extensions/presentation"
import { ANSWERS_LABELS } from "@razzia/web/features/game/utils/constants"
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
    availableHeight,
  } = useStageFit()

  // Reset image errors when question or media changes
  useEffect(() => {
    setImageErrors({})
  }, [answers, visuals])

  // Preload images into browser cache
  useEffect(() => {
    if (!visuals) {
      return
    }
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
      ? Math.min(68, Math.max(44, Math.floor(availableHeight * 0.1)))
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
      if (index === 0) {
        return "col-span-3 sm:col-span-2 sm:col-start-1"
      }
      if (index === 1) {
        return "col-span-3 sm:col-span-2 sm:col-start-3"
      }
      if (index === 2) {
        return "col-span-3 sm:col-span-2 sm:col-start-5"
      }
      if (index === 3) {
        return "col-span-3 sm:col-span-2 sm:col-start-2"
      }
      if (index === 4) {
        return "col-span-6 sm:col-span-2 sm:col-start-4"
      }
    }

    if (count === 4) {
      return "col-span-3 sm:col-span-3"
    }

    if (count === 3) {
      if (index === 2) {
        return "col-span-6 sm:col-span-2"
      }
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
        ? ((Array.isArray(responses) ? responses[index] : responses[index]) ??
          0)
        : 0
      const percentage = percentages ? (percentages[index] ?? 0) : 0

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
          "flex min-h-0 w-full flex-1 flex-col items-center justify-center px-1.5 py-0.5 sm:px-2",
          className,
        )}
        data-testid="photo-card-grid"
        data-answers-count={answers.length}
        data-revealed="true"
      >
        {/* Top Dominant Hero Section */}
        <div
          data-testid="results-hero-section"
          className="mb-2 flex w-full max-w-5xl flex-wrap items-center justify-center gap-2 sm:mb-3 sm:gap-4"
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
                data-tada-entrance={
                  cardPreset !== "none" ? cardPreset : undefined
                }
                style={buildSlotStyle(activeCardSlot, wIdx, {
                  backgroundColor: cardBg,
                })}
                className={clsx(
                  "relative flex flex-col items-center justify-between overflow-hidden rounded-xl border-2 border-amber-300 p-2 text-center shadow-2xl ring-2 shadow-amber-500/30 ring-amber-400 transition-all duration-500 sm:rounded-2xl sm:p-3 sm:ring-4",
                  cardPreset !== "none" && `tada-entrance-${cardPreset}`,
                  rankedWinners.length === 1
                    ? "w-full max-w-xs sm:max-w-sm md:max-w-md"
                    : "w-[calc(50%-0.5rem)] max-w-xs sm:max-w-sm",
                )}
              >
                {/* Top bar inside Hero */}
                <div className="z-10 mb-1 flex w-full items-center justify-between gap-1.5">
                  <span
                    className={clsx(
                      "flex size-6 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-black/35 text-xs font-black text-white shadow-md sm:size-7 sm:text-sm",
                      badgePreset !== "none" && `tada-entrance-${badgePreset}`,
                    )}
                    style={buildSlotStyle(activeBadgeSlot, wIdx)}
                    data-tada-entrance={
                      badgePreset !== "none" ? badgePreset : undefined
                    }
                    data-testid={`photo-card-label-${index}`}
                  >
                    {label}
                  </span>

                  <span
                    data-testid="card-winner-badge"
                    className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black tracking-wider text-black uppercase shadow-lg sm:px-3 sm:text-xs"
                  >
                    <Trophy className="size-3.5 fill-black sm:size-4" />
                    <span>{rankingTie ? "Co-leader" : "Leader"}</span>
                  </span>

                  <div className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-md sm:text-xs">
                    <span>{winner.percentage}%</span>
                    <span className="text-white/80">
                      ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                    </span>
                  </div>
                </div>

                {/* Photo frame inside Hero */}
                <div
                  className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-black/20 shadow-inner sm:rounded-xl"
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
                      className="h-full w-full rounded-lg object-contain p-1 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-2 text-white/80">
                      <ImageOff className="size-6 sm:size-8" />
                      <span className="text-xs leading-tight font-semibold break-words">
                        {winner.alt || winner.label}
                      </span>
                    </div>
                  )}

                  {/* Overlay percentage */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-1 text-center sm:p-1.5"
                    data-testid={`photo-card-overlay-${index}`}
                  >
                    <div className="flex items-baseline justify-center gap-1.5 text-white">
                      <span className="text-base font-black drop-shadow-md sm:text-xl md:text-2xl">
                        {winner.percentage}%
                      </span>
                      <span className="text-[10px] font-semibold text-white/90 sm:text-xs">
                        ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Caption text */}
                {showText ? (
                  <div className="mt-1 flex w-full flex-col items-center justify-center px-1 sm:mt-1.5">
                    <p
                      className="w-full text-center text-[11px] leading-tight font-black break-words text-white drop-shadow-md sm:text-xs md:text-sm"
                      data-testid={`photo-card-caption-${index}`}
                    >
                      {winner.label}
                    </p>
                  </div>
                ) : (
                  <span className="sr-only">{winner.label}</span>
                )}

                {/* Bottom vote bar */}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/25 sm:mt-1.5 sm:h-2">
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
            className="grid w-full max-w-5xl grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2.5"
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
                  data-tada-entrance={
                    cardPreset !== "none" ? cardPreset : undefined
                  }
                  style={buildSlotStyle(activeCardSlot, orderIdx, {
                    backgroundColor: cardBg,
                  })}
                  className={clsx(
                    "relative flex flex-col items-center justify-between overflow-hidden rounded-lg border border-black/20 p-1.5 text-center opacity-95 shadow-lg transition-all duration-300 sm:rounded-xl sm:p-2",
                    cardPreset !== "none" && `tada-entrance-${cardPreset}`,
                  )}
                >
                  {/* Top Bar */}
                  <div className="z-10 mb-0.5 flex w-full items-center justify-between gap-1">
                    <span
                      className={clsx(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border border-white/20 bg-black/35 text-[10px] font-black text-white shadow-md sm:size-6 sm:text-xs",
                        badgePreset !== "none" &&
                          `tada-entrance-${badgePreset}`,
                      )}
                      style={buildSlotStyle(activeBadgeSlot, orderIdx)}
                      data-tada-entrance={
                        badgePreset !== "none" ? badgePreset : undefined
                      }
                      data-testid={`photo-card-label-${index}`}
                    >
                      {label}
                    </span>
                    <span className="rounded-full bg-black/35 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                      {runner.count} {runner.count === 1 ? "vote" : "votes"}
                    </span>
                  </div>

                  {/* Photo Frame */}
                  <div
                    className="relative flex w-full items-center justify-center overflow-hidden rounded-md border border-black/15 shadow-inner sm:rounded-lg"
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
                        className="h-full w-full rounded-md object-contain p-0.5 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-0.5 p-1 text-white/80">
                        <ImageOff className="size-4 sm:size-5" />
                        <span className="text-[10px] leading-tight font-semibold break-words">
                          {runner.alt || runner.label}
                        </span>
                      </div>
                    )}

                    {/* Percentage overlay */}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-0.5 text-center"
                      data-testid={`photo-card-overlay-${index}`}
                    >
                      <span className="text-xs font-black text-white drop-shadow-md sm:text-sm">
                        {runner.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Caption */}
                  {showText ? (
                    <div className="mt-1 flex w-full flex-col items-center justify-center px-0.5">
                      <p
                        className="w-full text-center text-[10px] leading-tight font-bold break-words text-white drop-shadow-md sm:text-xs"
                        data-testid={`photo-card-caption-${index}`}
                      >
                        {runner.label}
                      </p>
                    </div>
                  ) : (
                    <span className="sr-only">{runner.label}</span>
                  )}

                  {/* Vote bar */}
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20 sm:h-1.5">
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
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
      {isRevealed && hasZeroVotes && (
        <div
          data-testid="zero-votes-notice"
          className="mb-1.5 flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-0.5 text-xs font-semibold text-white/70 backdrop-blur-md sm:text-sm"
        >
          <Users className="size-3.5 text-white/50" />
          <span>No votes yet</span>
        </div>
      )}
      <div
        className={clsx(
          "mx-auto grid w-full max-w-6xl grid-cols-6 content-center items-stretch gap-1.5 px-1.5 py-0.5 sm:gap-2.5 sm:px-2 md:gap-3.5",
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
            ? ((Array.isArray(responses)
                ? responses[index]
                : responses[index]) ?? 0)
            : undefined
          const pct = percentages ? (percentages[index] ?? 0) : undefined
          const label = ANSWERS_LABELS[index] ?? String(index + 1)
          const hasError = imageErrors[index]
          const colClass = getCardColumnClass(answers.length, index)
          const cardBg = getCardColor(index)
          const cardPreset = activeCardSlot?.preset ?? "none"
          const badgePreset = activeBadgeSlot?.preset ?? "none"

          return (
            <div
              key={`${animationEpochKey}-vote-${index}`}
              className={clsx("flex min-h-0 flex-col", colClass)}
            >
              <NativeButton size="sm" classNameContent="contents"
                type="button"
                disabled={readOnly}
                onClick={() => !readOnly && onSubmit?.(index)}
                aria-label={`${label}: ${answer}${visual?.alt ? ` (${visual.alt})` : ""}`}
                data-testid={`photo-card-choice-${index}`}
                data-answer-index={index}
                data-winner="false"
                data-tada-entrance={
                  cardPreset !== "none" ? cardPreset : undefined
                }
                style={buildSlotStyle(activeCardSlot, index, {
                  backgroundColor: cardBg,
                })}
                className={clsx(
                  "group relative flex h-full flex-col items-center justify-between overflow-hidden rounded-xl border border-black/20 text-center shadow-lg transition-all duration-300 ease-out sm:rounded-2xl",
                  isUltraCompact ? "p-1" : "p-1.5 sm:p-2.5",
                  cardPreset !== "none" && `tada-entrance-${cardPreset}`,
                  !readOnly &&
                    "cursor-pointer hover:scale-[1.01] focus-visible:ring-4 focus-visible:ring-white active:scale-[0.98]",
                  readOnly && "cursor-default disabled:opacity-100",
                  isSelected && "scale-[1.01] shadow-2xl ring-4 ring-white",
                )}
              >
                {/* Top bar inside Card */}
                <div className="z-10 mb-1 flex w-full items-center justify-between gap-1">
                  <span
                    className={clsx(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border border-white/20 bg-black/35 text-xs font-black text-white shadow-md sm:size-6 sm:rounded-lg sm:text-sm md:size-7 md:text-base",
                      badgePreset !== "none" && `tada-entrance-${badgePreset}`,
                    )}
                    style={buildSlotStyle(activeBadgeSlot, index)}
                    data-tada-entrance={
                      badgePreset !== "none" ? badgePreset : undefined
                    }
                    data-testid={`photo-card-label-${index}`}
                  >
                    {label}
                  </span>

                  {isSelected && !isRevealed && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-white text-black shadow-md sm:size-6">
                      <Check className="size-3.5 stroke-[3] sm:size-4" />
                    </span>
                  )}
                </div>

                {/* Photo Frame */}
                <div
                  className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-black/15 shadow-inner sm:rounded-xl"
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
                      className="h-full w-full rounded-lg object-contain p-0.5 transition-transform duration-300 group-hover:scale-105 sm:p-1"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-1.5 text-white/80">
                      <ImageOff className="size-5 sm:size-7" />
                      <span className="line-clamp-1 text-[10px] font-semibold sm:text-xs">
                        {visual?.alt || answer}
                      </span>
                    </div>
                  )}

                  {/* Percentage progress overlay inside photo frame when revealed in zero-votes state */}
                  {isRevealed && pct !== undefined && (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 text-center sm:p-1.5"
                      data-testid={`photo-card-overlay-${index}`}
                    >
                      <div className="flex items-baseline justify-center gap-1 text-white">
                        <span className="text-sm font-black drop-shadow-md sm:text-lg md:text-xl">
                          {pct}%
                        </span>
                        {count !== undefined && (
                          <span className="text-[10px] font-semibold text-white/80 sm:text-xs">
                            ({count} {count === 1 ? "vote" : "votes"})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Caption / Label Text */}
                {showText ? (
                  <div className="mt-1 flex w-full flex-col items-center justify-center px-0.5 sm:mt-1.5">
                    <p
                      className="w-full text-center text-[11px] leading-tight font-bold break-words text-white drop-shadow-md sm:text-xs md:text-sm"
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
              </NativeButton>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PhotoCardGrid
