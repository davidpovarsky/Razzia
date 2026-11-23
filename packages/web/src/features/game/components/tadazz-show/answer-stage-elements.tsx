import { NO_TIME_LIMIT } from "@razzia/common/constants"
import type {
  AnswerVisual,
  ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import AnswerCountdown from "@razzia/web/features/game/components/AnswerCountdown"
import { TadazzMotionStage } from "@razzia/web/features/game/components/TadazzMotionStage"
import type { ViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

export function AnswerStageHud({
  time,
  cooldown,
  totalAnswer,
  totalPlayer,
  isUltraCompact,
  isVisualPlayerMode,
}: {
  time: number
  cooldown: number
  totalAnswer: number
  totalPlayer: number
  isUltraCompact: boolean
  isVisualPlayerMode: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-2 px-2",
        isUltraCompact ? "mb-0.5" : "mb-1.5 sm:mb-2.5",
      )}
    >
      {time !== NO_TIME_LIMIT && (
        <AnswerCountdown
          seconds={cooldown}
          totalSeconds={time}
          variant={isVisualPlayerMode ? "player" : "host"}
        />
      )}
      <div
        className={clsx(
          "flex items-center gap-2 rounded-lg bg-black/40",
          isUltraCompact ? "px-2 py-0.5" : "px-3 py-1 sm:px-4 sm:py-1.5",
        )}
      >
        <div className="flex flex-col items-center leading-none">
          <span className="text-sm font-semibold text-white">
            {t("game:hud.answers")}
          </span>
          <span
            data-testid="stage-hud-answer-counter"
            className={clsx(
              "font-display font-bold text-white tabular-nums",
              isUltraCompact
                ? "text-lg sm:text-xl"
                : "text-xl sm:text-2xl md:text-3xl",
            )}
          >
            {totalAnswer}/{totalPlayer}
          </span>
        </div>
      </div>
    </div>
  )
}

export function LegacyVotingMotion({
  showTadazzCards,
  defaultsObj,
  viewRole,
  isSpectator,
  currentVisuals,
  effectiveExtensionState,
  gameId,
  animationEpochKey,
  question,
  questionStates,
  answers,
  time,
}: {
  showTadazzCards: boolean
  defaultsObj?: { motionKit?: string }
  viewRole: ViewRole
  isSpectator: boolean
  currentVisuals?: AnswerVisual[]
  effectiveExtensionState: ExtensionStateEnvelope | null
  gameId: string | null
  animationEpochKey: string
  question: string
  questionStates: { current: number; total: number } | null
  answers: string[]
  time: number
}) {
  return (
    <>
      {" "}
      {showTadazzCards &&
        defaultsObj?.motionKit === "goldy-20261105" &&
        (viewRole === "manager" || isSpectator) &&
        currentVisuals?.length === 5 && (
          <TadazzMotionStage
            scene={{
              key: `${effectiveExtensionState?.gameId ?? gameId ?? ""}:${animationEpochKey}`,
              mode: "vote",
              question: {
                question,
                round: (questionStates?.current ?? 1) <= 5 ? 1 : 2,
                number: questionStates?.current ?? 1,
                totalQuestions: questionStates?.total ?? 10,
                options: answers.map((label, index) => ({
                  label,
                  image:
                    currentVisuals.find((v) => v.answerIndex === index)?.url ??
                    "",
                })),
              },
              seconds: time,
            }}
          />
        )}
    </>
  )
}
