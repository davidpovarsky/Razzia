import { NO_TIME_LIMIT } from "@razzia/common/constants"
import clsx from "clsx"
import { Timer } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface AnswerCountdownProps {
  seconds: number | null
  totalSeconds?: number
  variant?: "host" | "display"
  className?: string
  "data-testid"?: string
}

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

  if (seconds === null || seconds === NO_TIME_LIMIT) {
    return null
  }

  // Authoritative server bounds: strictly non-negative
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const isUrgent = safeSeconds <= 5 && safeSeconds > 0
  const isExpired = safeSeconds === 0

  const isDisplay = variant === "display"

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${t("game:hud.time", "Time")}: ${safeSeconds}s`}
      data-testid={testId}
      data-urgent={isUrgent ? "true" : undefined}
      data-expired={isExpired ? "true" : undefined}
      className={clsx(
        "relative flex items-center justify-center font-rubik tracking-tight select-none transition-colors duration-300",
        // Container styling depending on variant
        isDisplay
          ? "gap-2.5 rounded-2xl border px-6 py-2 shadow-2xl backdrop-blur-md"
          : "gap-2 rounded-xl border px-4 py-1.5 shadow-lg backdrop-blur-md",
        // Color states: normal vs urgent (<= 5s) vs expired (0s)
        isExpired
          ? "border-red-500/50 bg-red-950/60 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
          : isUrgent
            ? "border-amber-400/60 bg-amber-950/50 text-amber-300 motion-safe:animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.25)]"
            : "border-white/15 bg-black/60 text-white shadow-black/40",
        className,
      )}
    >
      <Timer
        className={clsx(
          "shrink-0 transition-transform",
          isDisplay ? "size-6 sm:size-7" : "size-4 sm:size-5",
          isUrgent && "text-amber-400",
          isExpired && "text-red-400",
          !isUrgent && !isExpired && "text-white/60",
        )}
        aria-hidden="true"
      />

      <div className="flex flex-col items-center leading-none">
        <span
          className={clsx(
            "uppercase font-bold tracking-wider text-white/60",
            isDisplay ? "text-[10px] sm:text-xs" : "text-[9px] sm:text-[10px]",
          )}
        >
          {t("game:hud.time", "Time")}
        </span>

        {/* Large conspicuous countdown digits */}
        <span
          className={clsx(
            "font-mono font-black tabular-nums transition-transform",
            isDisplay
              ? "text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
              : "text-2xl sm:text-3xl md:text-4xl",
            isUrgent && "text-amber-300 scale-105",
            isExpired && "text-red-400",
            !isUrgent && !isExpired && "text-primary",
          )}
        >
          {safeSeconds}
          {isDisplay && <span className="text-sm sm:text-base font-bold text-white/60 ml-0.5">s</span>}
        </span>
      </div>

      {/* Progress accent bar */}
      {totalSeconds && totalSeconds > 0 && (
        <div
          className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full overflow-hidden bg-white/10"
          aria-hidden="true"
        >
          <div
            className={clsx(
              "h-full transition-all duration-1000 linear",
              isExpired
                ? "bg-red-500"
                : isUrgent
                  ? "bg-amber-400"
                  : "bg-primary",
            )}
            style={{
              width: `${Math.min(100, Math.max(0, (safeSeconds / totalSeconds) * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}

export default AnswerCountdown
