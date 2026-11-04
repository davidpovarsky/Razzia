import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import type { AnswerVisual } from "../core/media"
import type { ResolvedCardStageAnimations, StageAnimationSlot } from "../core/card-appearance"
import { calculateAggregatePercentages, calculateRevealState, type RevealTimelineState } from "./reveal-timeline"
import { computePollRanking } from "./poll-ranking"
import "./tadazz-answer-cards.css"

const BLANK_ANIMATIONS: ResolvedCardStageAnimations = {
  questionEntrance: { preset: "none", durationMs: 800, timing: "simultaneous", staggerMs: 90 },
  answerEntrance: { preset: "none", durationMs: 800, timing: "simultaneous", staggerMs: 90 },
  answerBadgeEntrance: { preset: "none", durationMs: 800, timing: "simultaneous", staggerMs: 90 },
  resultsRevealEntrance: { preset: "none", durationMs: 800, timing: "simultaneous", staggerMs: 90 },
}

export interface TadazzSurveyCardsProps {
  answers: string[]
  visuals?: AnswerVisual[]
  responses?: Record<number, number> | number[]
  percentages?: Record<number, number>
  resultStage?: boolean
  serverRevealStartedAt?: number
  epochKey: string
  selectedKey?: number | null
  onSubmit?: (index: number) => void
  readOnly?: boolean
  isSurvey?: boolean
  animations?: ResolvedCardStageAnimations
  leaderLabel?: string
  coLeaderLabel?: string
  className?: string
}

const motionStyle = (slot: StageAnimationSlot, index: number): CSSProperties => ({
  "--tdz-duration": `${slot.durationMs}ms`,
  "--tdz-delay": `${slot.timing === "sequential" ? index * slot.staggerMs : 0}ms`,
}) as CSSProperties

/** All five images remain in the same slots throughout reveal, including ties and zero votes. */
export function TadazzSurveyCards({
  answers, visuals, responses, percentages, resultStage = false,
  serverRevealStartedAt, epochKey, selectedKey = null, onSubmit,
  readOnly = false, isSurvey = true, animations = BLANK_ANIMATIONS,
  leaderLabel = "Audience favourite", coLeaderLabel = "Joint favourite", className,
}: TadazzSurveyCardsProps) {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})
  const target = useMemo(
    () => percentages ?? calculateAggregatePercentages(responses ?? {}, undefined),
    [percentages, responses],
  )
  const [reveal, setReveal] = useState<RevealTimelineState>(() => ({
    stage: "animating", progress: 0, isRevealed: false, displayPercentages: {},
  }))
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    setImageErrors({})
  }, [epochKey])

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(mql.matches)
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!resultStage) return
    const startedAt = serverRevealStartedAt ?? Date.now()
    let raf = 0
    let lastTick = -Infinity
    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick)
      if (now - lastTick < 1000 / 30) return
      lastTick = now
      const progress = calculateRevealState({
        timelineKey: epochKey, targetPercentages: target, barDurationMs: 950,
        pauseDurationMs: 180, startedAt, reducedMotion: reduceMotion, isSurvey,
      }, Date.now())
      setReveal(progress)
      if (progress.isRevealed) window.cancelAnimationFrame(raf)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [epochKey, resultStage, serverRevealStartedAt, target, reduceMotion, isSurvey])

  const total = Object.values(responses ?? {}).reduce<number>((sum, x) => sum + Number(x || 0), 0)
  const ranking = useMemo(() => computePollRanking(answers.map((label, index) => ({
    answerIndex: index, label,
    count: Number(responses?.[index] ?? 0),
    percentage: Number(target[index] ?? 0),
  }))), [answers, responses, target])
  const leaders = new Set(ranking.winners.map(w => w.answerIndex))
  const isFinal = resultStage && reveal.isRevealed
  const slot = resultStage ? animations.resultsRevealEntrance : animations.answerEntrance
  return (
    <div role="group" aria-label={resultStage ? "Survey results" : "Answer choices"}
      className={`tdz-answer-cards ${className ?? ""}`}
      data-testid="tadazz-answer-cards" data-answers-count={answers.length}
      data-result-state={resultStage ? reveal.stage : "voting"}>
      {answers.map((answer, index) => {
        const visual = visuals?.find(v => v.answerIndex === index)
        const showImage = Boolean(visual?.url) && visual?.display !== "text" && !imageErrors[index]
        const caption = answer || visual?.alt || String(index + 1)
        const percent = resultStage ? Number(reveal.displayPercentages[index] ?? 0) : undefined
        const votes = Number(responses?.[index] ?? 0)
        const isLeader = total > 0 && leaders.has(index) && isFinal
        const isSelected = !resultStage && selectedKey === index
        const animated = slot.preset !== "none" && !reduceMotion
        return (
          <button key={`${epochKey}-card-${index}`} type="button"
            data-testid={`tadazz-answer-choice-${index}`}
            data-answer-index={index} data-motion={animated ? slot.preset : undefined}
            data-leader={isLeader ? "true" : "false"}
            disabled={readOnly || resultStage}
            onClick={() => { if (!readOnly && !resultStage) onSubmit?.(index) }}
            style={animated ? motionStyle(slot, index) : undefined}
            className={`tdz-answer-card${animated ? " tdz-answer-card--motion" : ""}${isSelected ? " tdz-answer-card--selected" : ""}${isFinal ? " tdz-answer-card--revealed" : ""}${isLeader ? " tdz-answer-card--leader" : ""}`}
            aria-pressed={!resultStage ? isSelected : undefined}
            aria-label={`${index + 1}. ${caption}${resultStage ? `, ${votes} votes, ${Number(target[index] ?? 0)} percent` : ""}`}>
            <span className="tdz-answer-card__number" aria-hidden="true">{index + 1}</span>
            {isLeader && <span className="tdz-answer-card__leader-tag" data-testid="tadazz-leader-tag">
              {ranking.isTie ? coLeaderLabel : leaderLabel}
            </span>}
            {isSelected && <span className="tdz-answer-card__selected-tag" aria-hidden="true">✓</span>}
            <span className="tdz-answer-card__photo">
              {showImage && visual?.url ? (
                <img src={visual.url} alt={visual.alt || caption} loading="eager"
                  onError={() => setImageErrors(prev => ({...prev, [index]: true}))}/>
              ) : (
                <span className="tdz-answer-card__missing">{caption}</span>
              )}
            </span>
            <span className="tdz-answer-card__caption">{caption}</span>
            {resultStage && <>
              <span className="tdz-answer-card__results">
                <span className="tdz-answer-card__percentage" data-testid={`tadazz-percent-${index}`}>
                  {percent ?? 0}%
                </span>
                <span className="tdz-answer-card__count">{votes} {votes === 1 ? "vote" : "votes"}</span>
                <span className="tdz-answer-card__track" aria-hidden="true">
                  <span className="tdz-answer-card__progress" style={{display:"block",width:`${percent ?? 0}%`}} />
                </span>
              </span>
            </>}
          </button>
        )
      })}
    </div>
  )
}

export interface TadazzQuestionFrameProps {
  question: string
  children: ReactNode
  kicker?: string
  className?: string
}

/** Reusable question frame; existing Razzia controls/timer remain outside this content layer. */
export function TadazzQuestionFrame({ question, kicker, children, className }: TadazzQuestionFrameProps) {
  return (
    <section className={`tdz-question-frame ${className ?? ""}`} data-testid="tadazz-question-frame">
      <div className="tdz-question-frame__head">
        {kicker && <div className="tdz-question-frame__kicker">{kicker}</div>}
        <h2 className="tdz-question-frame__title">{question}</h2>
      </div>
      {children}
    </section>
  )
}
