import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import CricleCheck from "../../../../packages/web/src/features/game/components/icons/CricleCheck"
import CricleXmark from "../../../../packages/web/src/features/game/components/icons/CricleXmark"
import { useTranslation } from "react-i18next"

/** Original Razzia result markup; its live store/SFX effects remain in the host. */
export function NativeRazziaPlayerResult({
  data: { correct, message, points, rank, aheadOfMe },
}: {
  data: CommonStatusDataMap["SHOW_RESULT"]
}) {
  const { t } = useTranslation()

  return (
    <section
      data-testid="native-razzia-player-result"
      className="anim-show relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center"
    >
      {correct ? (
        <CricleCheck className="aspect-square max-h-60 min-h-0 w-full shrink" />
      ) : (
        <CricleXmark className="aspect-square max-h-60 min-h-0 w-full shrink" />
      )}
      <h2 className="mt-1 text-4xl font-bold text-white drop-shadow-lg">
        {t(message)}
      </h2>
      <p className="mt-1 text-xl font-bold text-white drop-shadow-lg">
        {t("game:resultTop")}
        {t("game:rank", { count: rank, ordinal: true })}
        {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
      </p>
      {correct && (
        <span className="mt-2 rounded-lg bg-black/40 px-4 py-2 text-2xl font-bold text-white drop-shadow-lg">
          +{points}
        </span>
      )}
    </section>
  )
}

export function NativeClassicPlayerResult({
  correct,
  message,
  points,
  rank,
  aheadOfMe,
  survey,
}: {
  correct: boolean
  message: string
  points: number
  rank: number
  aheadOfMe: string | null
  survey: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-player-result">
      {!survey && (
        <div
          className={["tz-result-badge", !correct && "is-wrong"]
            .filter(Boolean)
            .join(" ")}
        >
          {correct ? "✓" : "✕"}
        </div>
      )}
      <div className="tz-x-headline">{t(message)}</div>
      {!survey && (
        <div className="tz-x-sub" style={{ letterSpacing: ".12em" }}>
          {t("game:resultTop")}
          {t("game:rank", { count: rank, ordinal: true })}
          {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
        </div>
      )}
      {!survey && correct && (
        <div className="tz-x-big" style={{ fontSize: 120 }}>
          +{points}
        </div>
      )}
    </div>
  )
}
