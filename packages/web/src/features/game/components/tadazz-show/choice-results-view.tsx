// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import {
  resolveCardStageAnimations,
  type CardStageAnimations,
  type ExtensionStateEnvelope,
  type QuestionEntrance as QuestionEntranceConfig,
} from "@razzia/extensions/core"
import { TadazzSurveyCards } from "@razzia/extensions/presentation"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import PhotoCardGrid from "@razzia/web/features/game/components/PhotoCardGrid"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { useTranslation } from "react-i18next"
import type { useResponseReveal } from "./use-response-reveal"

const normalizedResponseCount = (value: unknown): number => Number(value) || 0

/** Picture/survey result presentation; specialized upstream question renderers stay upstream. */
export function ChoiceResultsView({
  data,
  extensionState,
  reveal,
}: {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
  extensionState: ExtensionStateEnvelope | null
  reveal: ReturnType<typeof useResponseReveal>
}) {
  const { question, answers, responses, solutions, type } = data
  const {
    answerVisuals,
    isSurvey,
    revealDistribution,
    targetPercentages,
    timelineState,
  } = reveal
  const { t } = useTranslation()
  const { isRevealed } = timelineState

  const hasVisuals = Boolean(
    answerVisuals &&
    answerVisuals.length > 0 &&
    answerVisuals.some((v) => Boolean(v.url)),
  )

  const winnerIndices = (() => {
    let max = 0
    for (const count of Object.values(responses)) {
      const num = normalizedResponseCount(count)

      if (num > max) {
        max = num
      }
    }

    if (max === 0) {
      return []
    }

    return answers
      .map((_, i) => i)
      .filter((i) => normalizedResponseCount(responses[i]) === max)
  })()

  const isTie = winnerIndices.length > 1

  const defaultsObj = extensionState?.extras?.defaults as
    | {
        stageAnimations?: CardStageAnimations
        tadazzBackground?: { mode: "original" | "animated" | "static" }
      }
    | undefined

  const stageAnimations = resolveCardStageAnimations({
    questionEntrance: extensionState?.extras?.questionEntrance as
      QuestionEntranceConfig | undefined,
    stageAnimations: extensionState?.extras?.stageAnimations as
      CardStageAnimations | undefined,
    globalStageAnimations: defaultsObj?.stageAnimations,
  })

  const animationEpochKey = `${extensionState?.questionId ?? question}-${extensionState?.epoch ?? 0}-responses`

  const showTadazzCards =
    defaultsObj?.tadazzBackground?.mode !== undefined &&
    defaultsObj.tadazzBackground.mode !== "original" &&
    type === "single" &&
    isSurvey &&
    hasVisuals &&
    answers.length >= 2 &&
    answers.length <= 5

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden px-3 py-2 sm:p-4">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center gap-2 overflow-hidden sm:gap-4">
        <h2 className="max-w-4xl shrink-0 text-center text-lg leading-tight font-black tracking-tight break-words text-white drop-shadow-2xl sm:text-2xl md:text-3xl lg:text-4xl">
          {question}
        </h2>

        {/* Responders count badge */}
        {revealDistribution && (
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs font-semibold text-white/90 shadow-md backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
            <span>
              {t("extensions:reveal.answeredRatio", {
                responders: revealDistribution.totalResponders,
                eligible: revealDistribution.eligiblePlayers,
              })}
            </span>
          </div>
        )}

        {/* Answer Cards: PhotoCardGrid when visuals present; original AnswerButton grid otherwise */}
        {hasVisuals ? (
          <div className="flex min-h-0 w-full flex-1 flex-col justify-center overflow-hidden">
            {showTadazzCards ? (
              <TadazzSurveyCards
                key={animationEpochKey}
                answers={answers}
                visuals={answerVisuals}
                responses={responses}
                percentages={targetPercentages}
                resultStage
                serverRevealStartedAt={revealDistribution?.revealStartedAt}
                epochKey={animationEpochKey}
                animations={stageAnimations}
                readOnly
                leaderLabel={t("extensions:reveal.leader", "Most selected")}
                coLeaderLabel={t(
                  "extensions:reveal.coLeader",
                  "Joint favourite",
                )}
                votesLabel={() =>
                  t("extensions:studio.scene.votesSuffix", "votes")
                }
                resultsAriaLabel={t(
                  "extensions:studio.scene.interimResultsDefaultTitle",
                  "Survey results",
                )}
              />
            ) : (
              <PhotoCardGrid
                answers={answers}
                visuals={answerVisuals}
                responses={responses}
                percentages={timelineState.displayPercentages}
                winners={winnerIndices}
                isTie={isTie}
                isRevealed={isRevealed}
                isSurvey={isSurvey}
                readOnly
                stageAnimations={stageAnimations}
                animationEpochKey={animationEpochKey}
              />
            )}
          </div>
        ) : (
          <div className="mt-1 grid w-full max-w-5xl grid-cols-1 gap-2 sm:mt-2 sm:gap-3 md:grid-cols-2">
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
                  key={`${animationEpochKey}-${key}`}
                  answerIndex={key}
                  cardEntrance={stageAnimations.resultsRevealEntrance}
                  badgeEntrance={stageAnimations.answerBadgeEntrance}
                  animationEpochKey={animationEpochKey}
                  label={ANSWERS_LABELS[key]}
                  className={clsx(
                    "text-white transition-all duration-300",
                    cardColorClass,
                    answers.length === 5 && key === 4 && "md:col-span-2",
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
        )}
      </div>
    </div>
  )
}
