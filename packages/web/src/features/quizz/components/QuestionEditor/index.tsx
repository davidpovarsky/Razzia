import { EditorStageFitNotice } from "./extension-adornments"
import { lazy, Suspense } from "react"
import GameBackground from "@razzia/web/components/GameBackground"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorNote from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorNote"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"

const QuestionLivePreview = lazy(async () => ({
  default: (await import("./QuestionLivePreview")).QuestionLivePreview,
}))

const QuestionEditor = () => {
  const { currentQuestion, currentQuestionId, isRemoving, hasCurrentQuestion } =
    useQuizzEditor()

  if (isRemoving || !hasCurrentQuestion) {
    return null
  }

  const AnswersEditor =
    QUESTION_REGISTRY[currentQuestion.type].AnswersEditor ??
    QuestionEditorAnswers

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <main className="relative mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-4 p-3 sm:p-6 lg:overflow-y-auto">
        <EditorStageFitNotice question={currentQuestion} />

        <div className="relative z-10 grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <QuestionEditorTitle />
            <QuestionEditorMedia />
            <QuestionEditorNote />
            <AnswersEditor key={currentQuestionId} />
          </div>
          <Suspense fallback={null}>
            <QuestionLivePreview key={currentQuestionId} />
          </Suspense>
        </div>

        <GameBackground />
      </main>
      <QuestionEditorConfig />
    </div>
  )
}

export default QuestionEditor
