import type {
  QuestionEntrance as QuestionEntranceConfig,
  QuestionEntrancePreset,
} from "@razzia/extensions/core"
import clsx from "clsx"
import React, { useMemo } from "react"

export interface QuestionEntranceProps {
  entrance?: QuestionEntranceConfig | null
  epoch?: number | string
  className?: string
  children: React.ReactNode
}

export const QUESTION_ENTRANCE_PRESET_OPTIONS: Array<{
  value: QuestionEntrancePreset
  labelKey: string
  defaultDurationMs: number
}> = [
  { value: "none", labelKey: "extensions:entrance.none", defaultDurationMs: 0 },
  { value: "fade", labelKey: "extensions:entrance.fade", defaultDurationMs: 800 },
  { value: "slide-up", labelKey: "extensions:entrance.slideUp", defaultDurationMs: 800 },
  { value: "slide-side", labelKey: "extensions:entrance.slideSide", defaultDurationMs: 800 },
  { value: "zoom-soft", labelKey: "extensions:entrance.zoomSoft", defaultDurationMs: 800 },
  { value: "spotlight", labelKey: "extensions:entrance.spotlight", defaultDurationMs: 1000 },
  { value: "curtain", labelKey: "extensions:entrance.curtain", defaultDurationMs: 1000 },
]

export const QuestionEntrance = ({
  entrance,
  epoch,
  className,
  children,
}: QuestionEntranceProps) => {
  const preset = entrance?.preset ?? "none"
  const durationMs = entrance?.durationMs ?? 800

  // Key ensures animation triggers once per question epoch and does not re-trigger on timer ticks/votes
  const animationKey = useMemo(() => `${preset}-${epoch ?? "static"}`, [preset, epoch])

  if (!preset || preset === "none") {
    return (
      <div className={clsx("w-full h-full min-h-0 flex flex-col", className)}>
        {children}
      </div>
    )
  }

  const animationClass = `tada-entrance-${preset}`

  return (
    <div
      key={animationKey}
      data-tada-entrance={preset}
      className={clsx(
        "w-full h-full min-h-0 flex flex-col",
        animationClass,
        className,
      )}
      style={{
        animationDuration: `${durationMs}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  )
}

export default QuestionEntrance
