import { evaluateCardStageFitWarnings } from "@razzia/extensions/core"
import GameBackground from "@razzia/web/components/GameBackground"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorNote from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorNote"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"

const QuestionEditor = () => {
  const {
    currentQuestion,
    currentQuestionId,
    isRemoving,
    hasCurrentQuestion,
    extras,
  } = useQuizzEditor()
  const { t } = useTranslation()

  if (isRemoving || !hasCurrentQuestion) {
    return null
  }

  const AnswersEditor =
    QUESTION_REGISTRY[currentQuestion.type].AnswersEditor ??
    QuestionEditorAnswers

  const currentPerQ =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const cardBackground = currentPerQ?.background

  const stageFitWarnings = evaluateCardStageFitWarnings({
    question: currentQuestion.question,
    answers: currentQuestion.answers,
  })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <main className="relative mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-4 p-3 sm:p-6 lg:overflow-y-auto">
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

        <QuestionEditorTitle />
        <QuestionEditorMedia />
        <QuestionEditorNote />
        <AnswersEditor key={currentQuestionId} />

        <GameBackground />
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
      </main>
      <QuestionEditorConfig />
    </div>
  )
}

export default QuestionEditor
