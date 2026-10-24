import {
  createDefaultQuizExtras,
  generateQuestionId,
} from "@razzia/extensions/core"
import { EditorEnhancementPanel } from "@razzia/extensions/editor"
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

const QuestionEditor = () => {
  const {
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="mx-auto flex max-w-7xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <QuestionEditorTitle />
          <button
            type="button"
            onClick={() => {
              if (!extras) {
                setExtras(activeExtras)
              }

              setShowEnhancements((prev) => !prev)
            }}
            className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
            data-testid="toggle-enhancements-button"
          >
            <Sparkles className="size-4" />
            {showEnhancements ? "Close Enhancements" : "Quiz Enhancements"}
          </button>
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
              onOpenMediaPicker={() => {
                setMediaPickerOpen(true)
              }}
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
        }}
      />
    </div>
  )
}

export default QuestionEditor
