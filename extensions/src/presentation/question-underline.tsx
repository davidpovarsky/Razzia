import { useLayoutEffect, useRef } from "react"
import type { QuestionDecoration } from "../core/index"
import { LottiePlayer } from "./lottie-player"

export function QuestionUnderline({
  decoration,
  className,
  playerClassName,
  controlledTimeMs,
  controlledPaused,
}: {
  decoration: QuestionDecoration
  className: string
  playerClassName: string
  controlledTimeMs?: number
  controlledPaused?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (controlledTimeMs === undefined && controlledPaused === undefined) {
      return
    }

    for (const animation of root.current?.getAnimations({ subtree: true }) ??
      []) {
      if (controlledTimeMs !== undefined) {
        // The preview clock owns every frame, including while playing.
        animation.pause()
        animation.currentTime = Math.max(0, controlledTimeMs)
      } else if (controlledPaused ?? true) {
        animation.pause()
      } else {
        animation.play()
      }
    }
  }, [
    controlledTimeMs,
    controlledPaused,
    decoration.enabled,
    decoration.preset,
  ])

  if (!decoration.enabled || decoration.preset === "none") {
    return null
  }

  return (
    <div
      ref={root}
      data-controlled-underline={
        controlledTimeMs !== undefined || controlledPaused !== undefined
          ? true
          : undefined
      }
      data-testid="question-decoration-underline"
      data-tada-underline={decoration.preset}
      className={className}
    >
      {(decoration.preset === "lottie" ||
        (decoration.preset as string) === "custom-lottie") &&
      decoration.lottieUrl ? (
        <LottiePlayer
          src={decoration.lottieUrl}
          loop={true}
          paused={controlledPaused}
          seekTimeMs={controlledTimeMs}
          className={playerClassName}
          dataTestId="question-decoration-lottie"
        />
      ) : (
        <div className={`w-full tada-underline-${decoration.preset}`} />
      )}
    </div>
  )
}
