import { NO_TIME_LIMIT } from "@razzia/common/constants"
import clsx from "clsx"
import { useTranslation } from "react-i18next"
export interface AnswerCountdownProps {
  seconds: number | null
  totalSeconds?: number
  variant?: "host" | "display" | "player"
  className?: string
  "data-testid"?: string
}
/** Same Rubik, badge, spacing and hierarchy as the original Razzia answer HUD. */
export const AnswerCountdown = ({
  seconds,
  totalSeconds,
  variant = "host",
  className,
  "data-testid": testId = variant === "display"
    ? "audience-cooldown"
    : "answer-cooldown",
}: AnswerCountdownProps) => {
  const { t } = useTranslation()
  if (seconds === null || seconds === NO_TIME_LIMIT) return null
  const safeSeconds = Math.max(0, Math.floor(seconds))
  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${t("game:hud.time")}: ${safeSeconds}s`}
      data-testid={testId}
      data-urgent={safeSeconds > 0 && safeSeconds <= 5 ? "true" : undefined}
      data-expired={safeSeconds === 0 ? "true" : undefined}
      className={clsx(
        "font-display relative flex shrink-0 flex-col items-center rounded-lg bg-black/40 px-4 py-1 text-lg font-bold text-white tabular-nums",
        variant === "display" && "md:text-2xl",
        className,
      )}
    >
      <span className="text-sm font-semibold">{t("game:hud.time")}</span>
      <span>{safeSeconds}</span>
      {totalSeconds && totalSeconds > 0 ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-white/20"
        >
          <span
            className="bg-primary block h-full transition-[width] duration-300"
            style={{
              width: `${Math.min(100, (safeSeconds / totalSeconds) * 100)}%`,
            }}
          />
        </span>
      ) : null}
    </div>
  )
}
export default AnswerCountdown
