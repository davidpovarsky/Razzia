import type { UploadedMedia } from "@razzia/common/types/game"
import {
  createDefaultQuizExtras,
  generateQuestionId,
  type QuizExtrasV1,
} from "@razzia/extensions/core"
import {
  EditorEnhancementPanel,
  type MediaPickerRequestOptions,
} from "@razzia/extensions/editor"
import Button from "@razzia/web/components/Button"
import GameBackground from "@razzia/web/components/GameBackground"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import QuestionEditorNote from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorNote"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Sparkles } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface MediaPickerTarget {
  questionId: string
  kind: "answer" | "interlude"
  answerIndex?: number
  expectedType: "image" | "video"
}

const QuestionEditor = () => {
  const { t } = useTranslation()
  const {
    questions,
    currentQuestion,
    currentQuestionId,
    currentIndex,
    questionIds,
    quizzId,
    extras,
    setExtras,
    isRemoving,
  } = useQuizzEditor()
  const [showEnhancements, setShowEnhancements] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [mediaPickerTarget, setMediaPickerTarget] =
    useState<MediaPickerTarget | null>(null)

  const AnswersEditor =
    QUESTION_REGISTRY[currentQuestion.type].AnswersEditor ??
    QuestionEditorAnswers

  if (isRemoving) {
    return null
  }

  const activeExtras =
    extras ??
    createDefaultQuizExtras(
      quizzId ?? "temp-quiz",
      questionIds.length > 0 ? questionIds : [generateQuestionId()],
      "0".repeat(64),
    )

  const handleOpenMediaPicker = (options?: MediaPickerRequestOptions) => {
    if (options?.target) {
      setMediaPickerTarget({
        questionId: options.target.questionId,
        kind: options.target.kind,
        answerIndex: options.target.answerIndex,
        expectedType: options.expectedType ?? "image",
      })
    } else {
      setMediaPickerTarget({
        questionId: currentQuestionId,
        kind: "answer",
        expectedType: "image",
      })
    }

    setMediaPickerOpen(true)
  }

  const handleMediaSelect = (item: UploadedMedia) => {
    if (!mediaPickerTarget) {
      return
    }

    const { questionId, kind, answerIndex, expectedType } = mediaPickerTarget

    if (item.type !== expectedType) {
      toast.error(
        t("extensions:errors.invalidMediaType", {
          expected: expectedType,
          defaultValue: `Only ${expectedType} files are allowed here`,
        }),
      )

      return
    }

    // Locate captured target question by stable questionId
    const targetIdx = questionIds.indexOf(questionId)
    if (targetIdx < 0 || !questions[targetIdx]) {
      // Target question was deleted while picker was open; fail safely
      setMediaPickerOpen(false)
      setMediaPickerTarget(null)

      return
    }

    const targetQuestion = questions[targetIdx]

    const baseExtras =
      extras ??
      createDefaultQuizExtras(
        quizzId ?? "temp-quiz",
        questionIds.length > 0 ? questionIds : [questionId],
        "0".repeat(64),
      )

    const currentItem = { ...(baseExtras.perQuestion[questionId] ?? {}) }

    if (kind === "answer" && typeof answerIndex === "number") {
      const list = [...(currentItem.answerVisuals ?? [])]
      const existingIdx = list.findIndex((v) => v.answerIndex === answerIndex)

      if (existingIdx >= 0) {
        list[existingIdx] = {
          ...list[existingIdx],
          url: item.url,
        }
      } else {
        list.push({
          answerIndex,
          display: "image",
          url: item.url,
          alt:
            targetQuestion.answers[answerIndex] || `Answer ${answerIndex + 1}`,
        })
      }

      currentItem.answerVisuals = list
    } else if (kind === "interlude") {
      currentItem.interlude = {
        ...(currentItem.interlude ?? {
          enabled: true,
          kind: expectedType === "video" ? "video" : "image",
          title: "",
          durationMs: 5000,
          advance: "auto",
        }),
        url: item.url,
      }
    }

    const updatedExtras: QuizExtrasV1 = {
      ...baseExtras,
      perQuestion: {
        ...baseExtras.perQuestion,
        [questionId]: currentItem,
      },
    }

    setExtras(updatedExtras)
    setMediaPickerOpen(false)
    setMediaPickerTarget(null)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="mx-auto flex max-w-7xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <QuestionEditorTitle />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setShowEnhancements((prev) => !prev)
            }}
            className="hover:bg-accent border-primary/30 bg-primary/10 text-primary flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm transition-all"
            data-testid="toggle-enhancements-button"
          >
            <Sparkles className="size-4" />
            {showEnhancements
              ? t("extensions:editor.toggleClose", "Close Enhancements")
              : t("extensions:editor.toggle", "Quiz Enhancements")}
          </Button>
        </div>

        {showEnhancements && (
          <div className="my-2" data-testid="editor-enhancement-container">
            <EditorEnhancementPanel
              extras={activeExtras}
              currentQuestionId={currentQuestionId}
              currentQuestionIndex={currentIndex}
              currentQuestionTitle={currentQuestion.question}
              currentQuestionAnswers={currentQuestion.answers}
              onChange={(updated) => setExtras(updated)}
              onOpenMediaPicker={handleOpenMediaPicker}
              t={(key: string, fallback?: string) =>
                t(key, { defaultValue: fallback })
              }
            />
          </div>
        )}

        <QuestionEditorMedia />
        <QuestionEditorNote />
        <AnswersEditor key={currentQuestionId} />

        <GameBackground />
      </main>
      <QuestionEditorConfig />

      {/* Media Library dialog for selecting assets */}
      <MediaLibrary
        open={mediaPickerOpen}
        onOpenChange={(open) => {
          setMediaPickerOpen(open)

          if (!open) {
            setMediaPickerTarget(null)
          }
        }}
        onSelect={handleMediaSelect}
        acceptType={mediaPickerTarget?.expectedType ?? "all"}
      />
    </div>
  )
}

export default QuestionEditor
