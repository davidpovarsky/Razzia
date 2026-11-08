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
import { isRevealValidForQuestion } from "@razzia/web/features/game/contexts/extension-state-context"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { useEffect, useMemo, useRef, useState } from "react"

/** Reveal lifecycle shared by the original state component without owning socket state. */
export function useResponseReveal(
  data: ManagerStatusDataMap["SHOW_RESPONSES"],
  extensionState: ExtensionStateEnvelope | null,
  sfxResults: () => unknown,
) {
  const { question, answers, responses, solutions, type } = data
  const { questionStates } = useQuestionStore()
  const soundPlayedRef = useRef(false)
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

      // Trigger SFX on transition into revealed stage (only when not managed by GameWrapper's AudioCuePlayer)
      if (
        nextState.isRevealed &&
        !soundPlayedRef.current &&
        !prefersReducedMotion &&
        !extensionState?.gameId
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
    extensionState?.gameId,
  ])

  return {
    answerVisuals,
    isSurvey,
    revealDistribution,
    targetPercentages,
    timelineState,
  }
}
