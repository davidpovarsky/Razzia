import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import type {
  AnswerVisual,
  ExtensionStateEnvelope,
  RevealDistributionSnapshot,
} from "@razzia/extensions/core"
import {
  calculateAggregatePercentages,
  calculateRevealState,
} from "@razzia/extensions/presentation"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import AnswerNote from "@razzia/web/features/game/components/AnswerNote"
import {
  isRevealValidForQuestion,
  useExtensionState,
} from "@razzia/web/features/game/contexts/extension-state-context"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import clsx from "clsx"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
  extensionState?: ExtensionStateEnvelope | null
}

const Responses = ({ data, extensionState: propExtensionState }: Props) => {
  const { question, answers, responses, solutions, type, note } = data
  const { ResponsesComponent } = QUESTION_REGISTRY[type]
  const contextExtensionState = useExtensionState()
  const { questionStates } = useQuestionStore()
  const soundPlayedRef = useRef(false)
  const { t } = useTranslation()

  // Single authoritative extension state source: explicit prop (e.g. testing) or context/store
  const extensionState =
    propExtensionState !== undefined
      ? propExtensionState
      : contextExtensionState

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

  // Current 0-indexed question number
  const currentQuestionIndex = questionStates
    ? questionStates.current - 1
    : null

  const rawRevealDistribution = extensionState?.extras.revealDistribution as
    RevealDistributionSnapshot | undefined

  // Ensure reveal state belongs to currently displayed question and current epoch
  const isDistributionValid = useMemo(
    () =>
      isRevealValidForQuestion({
        revealDistribution: rawRevealDistribution,
        currentType: type,
        currentQuestionIndex,
        currentQuestionId: extensionState?.questionId,
        answersCount: answers.length,
      }),
    [
      rawRevealDistribution,
      type,
      currentQuestionIndex,
      extensionState?.questionId,
      answers.length,
    ],
  )

  const revealDistribution = isDistributionValid
    ? rawRevealDistribution
    : undefined

  const rawAnswerVisuals = extensionState?.extras.answerVisuals as
    AnswerVisual[] | undefined

  const answerVisuals =
    isDistributionValid || !rawRevealDistribution ? rawAnswerVisuals : undefined

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

    // Never normalize multi-choice percentages by total selections;
    // use the server's authoritative unique-respondent denominator.
    let uniqueDenominator: number | undefined = undefined

    if (
      revealDistribution?.totalResponders &&
      revealDistribution.totalResponders > 0
    ) {
      uniqueDenominator = revealDistribution.totalResponders
    } else if (
      revealDistribution?.eligiblePlayers &&
      revealDistribution.eligiblePlayers > 0
    ) {
      uniqueDenominator = revealDistribution.eligiblePlayers
    }

    return calculateAggregatePercentages(responses, uniqueDenominator)
  }, [
    optionsSnapshot,
    responses,
    revealDistribution?.totalResponders,
    revealDistribution?.eligiblePlayers,
  ])

  const currentQuestionKey = `${question}:${extensionState?.epoch ?? 0}`
  const timelineKey = `${question}:${extensionState?.epoch ?? 0}:${extensionState?.seq ?? 0}`

  const clientStartedAtRef = useRef(0)
  const [prevQuestionKey, setPrevQuestionKey] = useState(currentQuestionKey)
  const [timelineState, setTimelineState] = useState(() => {
    const startedAt = revealDistribution?.revealStartedAt ?? Date.now()

    return calculateRevealState(
      {
        timelineKey,
        targetPercentages,
        barDurationMs: 800,
        pauseDurationMs: 250,
        startedAt,
        reducedMotion: prefersReducedMotion,
        isSurvey,
      },
      startedAt,
    )
  })

  // Clear old answer bars, coloring, and animation state immediately on question or epoch changes
  if (prevQuestionKey !== currentQuestionKey) {
    setPrevQuestionKey(currentQuestionKey)

    setTimelineState(
      calculateRevealState(
        {
          timelineKey,
          targetPercentages,
          barDurationMs: 800,
          pauseDurationMs: 250,
          startedAt: 0,
          reducedMotion: prefersReducedMotion,
          isSurvey,
        },
        0,
      ),
    )
  }

  useEffect(() => {
    soundPlayedRef.current = false
    clientStartedAtRef.current = Date.now()
  }, [currentQuestionKey, timelineKey])

  useEffect(() => {
    let rafId = 0

    const tick = () => {
      const now = Date.now()
      const startedAt =
        revealDistribution?.revealStartedAt ??
        (clientStartedAtRef.current || now)

      const nextState = calculateRevealState(
        {
          timelineKey,
          targetPercentages,
          barDurationMs: 800,
          pauseDurationMs: 250,
          startedAt,
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
    revealDistribution?.revealStartedAt,
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
              {t("extensions:reveal.answeredRatio", {
                responders: revealDistribution.totalResponders,
                eligible: revealDistribution.eligiblePlayers,
              })}
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
