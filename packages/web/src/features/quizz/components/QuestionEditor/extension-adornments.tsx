// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { Question } from "@razzia/common/types/game"
import { evaluateCardStageFitWarnings } from "@razzia/extensions/core"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"

export function EditorStageFitNotice({ question }: { question: Question }) {
  const { t } = useTranslation()
  const stageFitWarnings = evaluateCardStageFitWarnings({
    question: question.question,
    answers: question.answers,
  })

  return (
    <>
      {" "}
      {stageFitWarnings.length > 0 && (
        <div
          data-testid="stage-fit-warning-banner"
          className="z-10 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-900 shadow-xs dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="flex flex-col gap-0.5">
            <span className="font-bold">
              {t("extensions:stageFit.warningTitle", "Stage Fit Notice")}
            </span>
            {stageFitWarnings.map((w, idx) => (
              <span key={idx}>
                {t(w.messageKey, {
                  current: w.currentLength,
                  max: w.recommendedMax,
                  index: (w.index ?? 0) + 1,
                  defaultValue: `Length (${w.currentLength}/${w.recommendedMax}) may wrap on compact screens.`,
                })}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export function EditorCardBackgroundPreview() {
  const { currentQuestionId, extras } = useQuizzEditor()
  const currentPerQ =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const cardBackground = currentPerQ?.background

  return (
    <>
      {" "}
      {cardBackground?.url && (
        <div
          data-testid="editor-card-background-overlay"
          className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
        >
          <img
            src={cardBackground.url}
            alt=""
            className={clsx(
              "h-full w-full",
              cardBackground.fit === "contain"
                ? "object-contain"
                : "object-cover",
            )}
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: cardBackground.overlayOpacity ?? 0.35 }}
          />
        </div>
      )}
    </>
  )
}
