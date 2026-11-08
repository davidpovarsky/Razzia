import type { QuestionDecoration } from "../core/index"
import { LottiePlayer } from "./lottie-player"

export function QuestionUnderline({
  decoration,
  className,
  playerClassName,
}: {
  decoration: QuestionDecoration
  className: string
  playerClassName: string
}) {
  if (!decoration.enabled || decoration.preset === "none") {
    return null
  }

  return (
    <div
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
          className={playerClassName}
          dataTestId="question-decoration-lottie"
        />
      ) : (
        <div className={`w-full tada-underline-${decoration.preset}`} />
      )}
    </div>
  )
}
