import { MAX_ANSWERS, MIN_ANSWERS } from "@razzia/common/constants"
import {
  resolveQuestionPlayMode,
  type UploadedMedia,
} from "@razzia/common/types/game"
import type { AnswerDisplay, AnswerVisual } from "@razzia/extensions/core"
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
import { Image as ImageIcon, Minus, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Controller, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"

const QuestionEditorAnswers = () => {
  const {
    currentQuestion,
    currentQuestionId,
    currentIndex,
    gameMode,
    updateQuestion,
    questionPath,
    extras,
    setExtras,
  } = useQuizzEditor()
  const { control } = useFormContext<QuizzFormValues>()
  const { t } = useTranslation()
  const [pickingAnswerIdx, setPickingAnswerIdx] = useState<number | null>(null)

  const questionType = currentQuestion.type
  const { SolutionPicker } = QUESTION_REGISTRY[questionType]
  const { answers } = currentQuestion

  const currentPerQ =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const answerVisuals: AnswerVisual[] = currentPerQ?.answerVisuals ?? []

  const getVisualForAnswer = (idx: number): AnswerVisual | undefined =>
    answerVisuals.find((v) => v.answerIndex === idx)

  const upsertAnswerVisual = (
    idx: number,
    updater: (prev: AnswerVisual) => AnswerVisual | null,
  ) => {
    if (!currentQuestionId) {
      return
    }

    setExtras((prev) => {
      if (!prev) {
        return prev
      }
      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = existingPerQ[currentQuestionId] ?? {}
      const currentList = [...(existingItem.answerVisuals ?? [])]
      const foundIdx = currentList.findIndex((v) => v.answerIndex === idx)
      const baseVisual: AnswerVisual =
        foundIdx >= 0
          ? currentList[foundIdx]
          : {
              answerIndex: idx,
              display: "text",
              alt: answers[idx]?.trim() || `Option ${idx + 1}`,
            }

      const nextVisual = updater(baseVisual)
      let nextList: AnswerVisual[]
      if (
        !nextVisual ||
        (nextVisual.display === "text" && !nextVisual.url)
      ) {
        nextList = currentList.filter((v) => v.answerIndex !== idx)
      } else if (foundIdx >= 0) {
        nextList = currentList.map((v, i) => (i === foundIdx ? nextVisual : v))
      } else {
        nextList = [...currentList, nextVisual].sort(
          (a, b) => a.answerIndex - b.answerIndex,
        )
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: {
            ...existingItem,
            answerVisuals: nextList,
          },
        },
      }
    })
  }

  const handleSelectAnswerMedia = (item: UploadedMedia) => {
    if (pickingAnswerIdx === null) {
      return
    }
    const idx = pickingAnswerIdx
    const existingText = (answers[idx] ?? "").trim()
    const fallbackLabel =
      existingText ||
      item.name.replace(/\.[^.]+$/u, "") ||
      `Option ${idx + 1}`

    if (!existingText) {
      const nextAnswers = [...answers]
      nextAnswers[idx] = fallbackLabel
      updateQuestion(currentIndex, { answers: nextAnswers })
    }

    upsertAnswerVisual(idx, (prev) => ({
      answerIndex: idx,
      display: prev.display === "text" ? "both" : prev.display,
      url: item.url,
      alt: prev.alt?.trim() ? prev.alt : fallbackLabel,
    }))
    setPickingAnswerIdx(null)
  }

  const handleDisplayModeChange = (idx: number, mode: AnswerDisplay) => {
    if (mode === "image" && !(answers[idx] ?? "").trim()) {
      const visual = getVisualForAnswer(idx)
      const fallback = visual?.alt?.trim() || `Option ${idx + 1}`
      const nextAnswers = [...answers]
      nextAnswers[idx] = fallback
      updateQuestion(currentIndex, { answers: nextAnswers })
    }

    upsertAnswerVisual(idx, (prev) => ({
      ...prev,
      display: mode,
      alt: prev.alt?.trim() || answers[idx]?.trim() || `Option ${idx + 1}`,
    }))
  }

  const handleRemoveAnswerImage = (idx: number) => {
    upsertAnswerVisual(idx, () => null)
  }

  const handleAltChange = (idx: number, nextAlt: string) => {
    upsertAnswerVisual(idx, (prev) => ({
      ...prev,
      alt: nextAlt,
    }))
  }

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

    if (currentQuestionId && extras?.perQuestion?.[currentQuestionId]) {
      setExtras((prev) => {
        if (!prev || !prev.perQuestion?.[currentQuestionId]) {
          return prev
        }
        const existingItem = prev.perQuestion[currentQuestionId]
        return {
          ...prev,
          perQuestion: {
            ...prev.perQuestion,
            [currentQuestionId]: {
              ...existingItem,
              answerVisuals: (existingItem.answerVisuals ?? []).filter(
                (v) => v.answerIndex <= maxIndex,
              ),
            },
          },
        }
      })
    }
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
          const displayMode: AnswerDisplay = visual?.display ?? "text"
          const hasImage = Boolean(visual?.url)

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

                    {/* Inline Per-Answer Image & Display Mode Controls */}
                    <div
                      data-testid={`answer-visual-controls-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-2 text-xs text-white"
                    >
                      <div
                        data-testid={`answer-display-mode-${i}`}
                        className="flex items-center gap-1 rounded-lg bg-black/20 p-0.5"
                      >
                        {(["text", "image", "both"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            data-testid={`answer-mode-${i}-${mode}`}
                            onClick={() => handleDisplayModeChange(i, mode)}
                            className={clsx(
                              "rounded-md px-2 py-0.5 text-[11px] font-semibold transition",
                              displayMode === mode
                                ? "bg-white text-black shadow-xs"
                                : "text-white/80 hover:text-white",
                            )}
                          >
                            {mode === "text" &&
                              t("extensions:visuals.displayText", "Text")}
                            {mode === "image" &&
                              t("extensions:visuals.displayImage", "Image")}
                            {mode === "both" &&
                              t("extensions:visuals.displayBoth", "Both")}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`answer-pick-image-${i}`}
                          onClick={() => setPickingAnswerIdx(i)}
                          className="flex items-center gap-1 rounded-lg bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-black/40"
                        >
                          <ImageIcon className="size-3.5" />
                          <span>
                            {hasImage
                              ? t("extensions:editor.browse", "Change")
                              : t("extensions:visuals.chooseMedia", "Image")}
                          </span>
                        </button>
                        {hasImage && (
                          <button
                            type="button"
                            data-testid={`answer-remove-image-${i}`}
                            onClick={() => handleRemoveAnswerImage(i)}
                            title={t(
                              "extensions:visuals.removeMedia",
                              "Remove Image",
                            )}
                            className="flex size-6 items-center justify-center rounded-lg bg-black/25 text-white transition hover:bg-red-500/80"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {hasImage && visual?.url && (
                      <div className="flex items-center gap-2.5 rounded-xl bg-black/20 p-2">
                        <img
                          src={visual.url}
                          alt={visual.alt || `Option ${i + 1}`}
                          data-testid={`answer-image-preview-${i}`}
                          className="size-12 shrink-0 rounded-lg bg-black/30 object-cover"
                        />
                        <input
                          type="text"
                          data-testid={`answer-alt-input-${i}`}
                          value={visual.alt ?? ""}
                          onChange={(e) => handleAltChange(i, e.target.value)}
                          placeholder={t(
                            "extensions:visuals.altPlaceholder",
                            "Accessible alt text...",
                          )}
                          className="min-w-0 flex-1 rounded-md bg-black/20 px-2 py-1 text-xs font-medium text-white placeholder-white/60 outline-none"
                        />
                      </div>
                    )}
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
