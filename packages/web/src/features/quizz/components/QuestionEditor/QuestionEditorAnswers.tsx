import { useAnswerVisualEditor } from "./use-answer-visual-editor"
import { AnswerVisualControls } from "./AnswerVisualControls"
import { resolveQuestionPlayMode } from "@razzia/extensions/core"
import { MAX_ANSWERS, MIN_ANSWERS } from "@razzia/common/constants"
import FieldError from "@razzia/web/components/forms/FieldError"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Minus, Plus } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"

const QuestionEditorAnswers = () => {
  const {
    currentQuestion,
    currentIndex,
    gameMode,
    updateQuestion,
    questionPath,
  } = useQuizzEditor()
  const { control } = useFormContext<QuizzFormValues>()
  const { t } = useTranslation()

  const questionType = currentQuestion.type
  const { SolutionPicker } = QUESTION_REGISTRY[questionType]
  const { answers } = currentQuestion

  const {
    pickingAnswerIdx,
    setPickingAnswerIdx,
    getVisualForAnswer,
    handleSelectAnswerMedia,
    handleDisplayModeChange,
    handleRemoveAnswerImage,
    handleAltChange,
    trimAnswerVisuals,
  } = useAnswerVisualEditor()

  const addAnswer = () => {
    if (answers.length >= MAX_ANSWERS) {
      return
    }

    updateQuestion(currentIndex, { answers: [...answers, ""] })
  }

  const removeAnswer = () => {
    if (answers.length <= MIN_ANSWERS) {
      return
    }

    const next = answers.slice(0, -1)
    const maxIndex = next.length - 1
    const nextSolution = (currentQuestion.solutions ?? []).filter(
      (s) => s <= maxIndex,
    )

    updateQuestion(currentIndex, {
      answers: next,
      solutions: nextSolution.length > 0 ? nextSolution : [0],
    })

    trimAnswerVisuals(maxIndex)
  }

  return (
    <div className="z-10 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground bg-background rounded-lg px-2 py-1 text-sm font-semibold">
          {answers.length}
          {t("quizz:answersCountSuffix")}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={removeAnswer}
            aria-label={t("quizz:removeAnswer")}
            disabled={answers.length <= MIN_ANSWERS}
            className="bg-accent text-accent-foreground hover:bg-accent flex size-7 items-center justify-center rounded-lg disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={addAnswer}
            aria-label={t("quizz:addAnswer")}
            disabled={answers.length >= MAX_ANSWERS}
            className="bg-accent text-accent-foreground hover:bg-accent flex size-7 items-center justify-center rounded-lg disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {answers.map((_, i) => {
          const isSelected = currentQuestion.solutions?.includes(i) ?? false
          const visual = getVisualForAnswer(i)

          return (
            <Controller
              key={i}
              control={control}
              name={questionPath(`answers.${i}`)}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1">
                  <div
                    className={clsx(
                      "flex flex-col gap-2.5 rounded-2xl px-4 py-4",
                      ANSWERS_COLORS[i],
                      fieldState.invalid && "ring-2 ring-red-500",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-black/20 text-sm font-bold text-white md:size-8 md:text-base">
                        {ANSWERS_LABELS[i]}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 drop-shadow-md">
                        <input
                          {...field}
                          aria-invalid={fieldState.invalid}
                          aria-describedby={
                            fieldState.invalid
                              ? `${field.name}-error`
                              : undefined
                          }
                          className="min-w-0 flex-1 bg-transparent font-semibold text-white placeholder-white/70 outline-none"
                          placeholder={t("quizz:addAnswerPlaceholder")}
                        />
                        {resolveQuestionPlayMode(currentQuestion, gameMode) !==
                          "survey" &&
                          SolutionPicker && (
                            <SolutionPicker index={i} isSelected={isSelected} />
                          )}
                      </div>
                    </div>

                    <AnswerVisualControls
                      i={i}
                      visual={visual}
                      handleDisplayModeChange={handleDisplayModeChange}
                      setPickingAnswerIdx={setPickingAnswerIdx}
                      handleRemoveAnswerImage={handleRemoveAnswerImage}
                      handleAltChange={handleAltChange}
                    />
                  </div>
                  <FieldError
                    id={`${field.name}-error`}
                    errors={[fieldState.error]}
                    pill
                  />
                </div>
              )}
            />
          )
        })}
      </div>

      <MediaLibrary
        open={pickingAnswerIdx !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPickingAnswerIdx(null)
          }
        }}
        onSelect={handleSelectAnswerMedia}
        acceptType="image"
      />
    </div>
  )
}

export default QuestionEditorAnswers
