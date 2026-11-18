import { useState } from "react"
import AlertDialog from "@razzia/web/components/AlertDialog"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import type { QuestionType } from "@razzia/common/types/game"
import { resolveQuestionPlayMode } from "@razzia/extensions/core"
import {
  QUESTION_REGISTRY,
  QUESTION_TYPE_LIST,
} from "@razzia/web/features/questions"
import CategoryField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/CategoryField"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { LayoutList } from "lucide-react"
import { useTranslation } from "react-i18next"

const QuestionEditorConfig = () => {
  const {
    currentQuestion,
    currentQuestionId,
    currentIndex,
    gameMode,
    updateQuestion,
    extras,
    setExtras,
  } = useQuizzEditor()
  const { t } = useTranslation()
  const questionType = currentQuestion.type
  const [pendingType, setPendingType] = useState<{
    questionId: string
    type: QuestionType
  } | null>(null)

  const applyTypeChange = (nextType: QuestionType) => {
    const { defaultOptions, initialValues } = QUESTION_REGISTRY[nextType]

    updateQuestion(currentIndex, {
      type: nextType,
      options: defaultOptions,
      ...initialValues(currentQuestion),
      ...(nextType === "single" && currentQuestion.type === "multi"
        ? { solutions: currentQuestion.solutions?.slice(0, 1) ?? [0] }
        : {}),
    })

    if (nextType === "estimation" && currentQuestionId) {
      setExtras((previous) => {
        if (!previous?.perQuestion[currentQuestionId]) {
          return previous
        }

        const { answerVisuals: _answerVisuals, ...rest } =
          previous.perQuestion[currentQuestionId]

        return {
          ...previous,
          perQuestion: { ...previous.perQuestion, [currentQuestionId]: rest },
        }
      })
    }

    setPendingType(null)
  }

  const handleTypeChange = (nextType: QuestionType) => {
    if (nextType === questionType) {
      return
    }

    const replacesAnswers =
      nextType === "estimation" || questionType === "estimation"
    const hasAnswerContent =
      currentQuestion.answers.some((answer) => answer.trim()) ||
      Boolean(extras?.perQuestion[currentQuestionId]?.answerVisuals?.length) ||
      (questionType === "estimation" &&
        JSON.stringify(currentQuestion.options) !==
          JSON.stringify(QUESTION_REGISTRY.estimation.defaultOptions))

    if (replacesAnswers && hasAnswerContent) {
      setPendingType({ questionId: currentQuestionId, type: nextType })

      return
    }

    applyTypeChange(nextType)
  }

  const { ConfigComponent } = QUESTION_REGISTRY[questionType]

  const typeOptions = QUESTION_TYPE_LIST.map((type) => ({
    value: type,
    label: t(QUESTION_REGISTRY[type].labelKey),
  }))

  return (
    <aside
      data-testid="question-config"
      aria-label={t("quizz:question.config.answerMode")}
      className="bg-background z-10 m-2 flex w-[calc(100%-1rem)] shrink-0 flex-col gap-3 rounded-xl p-3 shadow-sm lg:m-3 lg:max-h-[calc(100%-1.5rem)] lg:w-64 lg:self-start lg:overflow-y-auto lg:p-4 xl:w-68"
    >
      <ConfigField>
        <ConfigField.Label
          icon={<LayoutList className="size-4" />}
          label={t("quizz:question.config.answerMode")}
        />
        <ToggleGroup
          aria-label={t("quizz:question.config.answerMode")}
          value={questionType}
          onChange={handleTypeChange}
          items={typeOptions}
          itemMetadata={(value) => ({ "data-testid": `answer-type-${value}` })}
          className="h-auto flex-wrap [&>button]:min-h-9 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2 [&>button]:text-xs"
        />
      </ConfigField>

      {resolveQuestionPlayMode(currentQuestion, gameMode) === "quiz" && (
        <CategoryField />
      )}

      <ConfigComponent key={currentQuestionId} />
      <AlertDialog
        open={Boolean(
          pendingType && pendingType.questionId === currentQuestionId,
        )}
        onOpenChange={(open) => {
          if (!open) {
            setPendingType(null)
          }
        }}
        title={t("extensions:editor.answerTypeChangeTitle")}
        description={t("extensions:editor.answerTypeChangeDescription")}
        confirmLabel={t("extensions:editor.confirmAnswerTypeChange")}
        onConfirm={() => {
          if (pendingType?.questionId === currentQuestionId) {
            applyTypeChange(pendingType.type)
          }
        }}
      />
    </aside>
  )
}

export default QuestionEditorConfig
