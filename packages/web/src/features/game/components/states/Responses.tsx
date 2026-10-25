import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type AnswerVisual,
  type ExtensionStateEnvelope,
  type RevealDistributionSnapshot,
} from "@razzia/extensions/core"
import {
  calculateAggregatePercentages,
  calculateRevealState,
} from "@razzia/extensions/presentation"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import AnswerNote from "@razzia/web/features/game/components/AnswerNote"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import clsx from "clsx"
import { useEffect, useMemo, useRef, useState } from "react"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

const Responses = ({ data }: Props) => {
  const { question, answers, responses, solutions, type, note } = data
  const { ResponsesComponent } = QUESTION_REGISTRY[type]
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const soundPlayedRef = useRef(false)
  const [mountTime] = useState(() => Date.now())

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState(payload)
  })

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  // Detect prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") {
      return false
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const revealDistribution = extensionState?.extras.revealDistribution as
    RevealDistributionSnapshot | undefined

  const answerVisuals = extensionState?.extras.answerVisuals as
    AnswerVisual[] | undefined

  const isSurvey = !solutions || solutions.length === 0
  const optionsSnapshot = revealDistribution?.options

  // Target percentages: authoritative snapshot or calculated from responses
  const targetPercentages = useMemo(() => {
    if (optionsSnapshot) {
      const result: Record<number, number> = {}
      for (const [idx, opt] of Object.entries(optionsSnapshot)) {
        result[Number(idx)] = opt.percentage
      }

      return result
    }

    return calculateAggregatePercentages(responses)
  }, [optionsSnapshot, responses])

  const revealStartedAt = revealDistribution?.revealStartedAt ?? mountTime
  const timelineKey = `${question}:${extensionState?.epoch ?? 0}:${extensionState?.seq ?? 0}`

  // Animation timeline state
  const [timelineState, setTimelineState] = useState(() =>
    calculateRevealState(
      {
        timelineKey,
        targetPercentages,
        barDurationMs: 800,
        pauseDurationMs: 250,
        startedAt: revealStartedAt,
        reducedMotion: prefersReducedMotion,
        isSurvey,
      },
      mountTime,
    ),
  )

  useEffect(() => {
    soundPlayedRef.current = false
  }, [timelineKey])

  useEffect(() => {
    let rafId = 0

    const tick = () => {
      const now = Date.now()
      const nextState = calculateRevealState(
        {
          timelineKey,
          targetPercentages,
          barDurationMs: 800,
          pauseDurationMs: 250,
          startedAt: revealStartedAt,
          reducedMotion: prefersReducedMotion,
          isSurvey,
        },
        now,
      )

      setTimelineState(nextState)

      // Trigger SFX on transition into revealed stage
      if (
        nextState.isRevealed &&
        !soundPlayedRef.current &&
        !prefersReducedMotion
      ) {
        soundPlayedRef.current = true

        try {
          sfxResults()
        } catch {
          // Gracefully continue if audio blocked
        }
      }

      if (nextState.stage !== "revealed") {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [
    timelineKey,
    targetPercentages,
    revealStartedAt,
    prefersReducedMotion,
    isSurvey,
    sfxResults,
  ])

  // Specialized questions (e.g. estimation) retain their dedicated result renderer
  if (ResponsesComponent) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-8 pb-4">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>
        <ResponsesComponent data={data} />
        <AnswerNote note={note} />
      </div>
    )
  }

  const { isRevealed } = timelineState

  return (
    <div className="flex h-full flex-1 flex-col justify-between p-4">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-6">
        <h2 className="max-w-4xl text-center text-2xl font-black tracking-tight text-white drop-shadow-2xl md:text-4xl lg:text-5xl">
          {question}
        </h2>

        {/* Responders count badge */}
        {revealDistribution && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-1.5 text-sm font-semibold text-white/90 shadow-md backdrop-blur-md">
            <span>
              {revealDistribution.totalResponders} /{" "}
              {revealDistribution.eligiblePlayers} answered
            </span>
          </div>
        )}

        {/* Answer Cards with Integrated 2D Horizontal Progress Bars & Reveal Animation */}
        <div className="mt-4 grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
          {answers.map((answer, key) => {
            const pct = timelineState.displayPercentages[key] ?? 0
            const count = responses[key] ?? 0
            const isSolution = solutions?.includes(key)
            const visual = answerVisuals?.find((v) => v.answerIndex === key)

            // Reveal coloring
            let cardColorClass = ANSWERS_COLORS[key]
            let isCorrectForButton: boolean | undefined = undefined

            if (isRevealed && !isSurvey) {
              if (isSolution) {
                cardColorClass =
                  "bg-emerald-600 ring-4 ring-emerald-400 text-white shadow-xl"
                isCorrectForButton = true
              } else {
                cardColorClass = "bg-red-700/80 opacity-65 text-white/90"
                isCorrectForButton = false
              }
            }

            return (
              <AnswerButton
                key={key}
                label={ANSWERS_LABELS[key]}
                className={clsx(
                  "text-white transition-all duration-300",
                  cardColorClass,
                )}
                percentage={pct}
                count={count}
                correct={isCorrectForButton}
                visual={visual}
                data-testid={`answer-card-${key}`}
                data-percentage={pct}
                data-revealed={isRevealed}
              >
                {answer}
              </AnswerButton>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <AnswerNote note={note} />
      </div>
    </div>
  )
}

export default Responses
