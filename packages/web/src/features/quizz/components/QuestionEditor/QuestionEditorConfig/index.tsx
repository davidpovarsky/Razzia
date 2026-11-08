import type { QuestionType } from "@razzia/common/types/game"
import { resolveQuestionPlayMode } from "@razzia/extensions/core"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
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
  } = useQuizzEditor()
  const { t } = useTranslation()
  const questionType = currentQuestion.type

  const handleTypeChange = (nextType: QuestionType) => {
    const { defaultOptions, initialValues } = QUESTION_REGISTRY[nextType]

    updateQuestion(currentIndex, {
      type: nextType,
      options: defaultOptions,
      ...initialValues(currentQuestion),
    })
  }

  const { ConfigComponent } = QUESTION_REGISTRY[questionType]

  const typeOptions = QUESTION_TYPE_LIST.map((type) => ({
    value: type,
    label: t(QUESTION_REGISTRY[type].labelKey),
  }))

  return (
    <aside className="bg-background z-10 m-2 flex w-[calc(100%-1rem)] shrink-0 flex-col gap-3 rounded-xl p-3 shadow-sm lg:m-3 lg:max-h-[calc(100%-1.5rem)] lg:w-64 xl:w-68 lg:self-start lg:overflow-y-auto lg:p-4">
      <ConfigField>
        <ConfigField.Label
          icon={<LayoutList className="size-4" />}
          label={t("quizz:question.config.answerMode")}
        />
        <Select value={questionType} onValueChange={handleTypeChange}>
          <SelectTrigger aria-label={t("quizz:question.config.answerMode")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigField>

      {resolveQuestionPlayMode(currentQuestion, gameMode) === "quiz" && (
        <CategoryField />
      )}

      <ConfigComponent key={currentQuestionId} />
    </aside>
  )
}

export default QuestionEditorConfig
