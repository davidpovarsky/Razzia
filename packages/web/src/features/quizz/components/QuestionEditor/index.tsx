import {
  EditorStageFitNotice,
  EditorCardBackgroundPreview,
} from "./extension-adornments"
import GameBackground from "@razzia/web/components/GameBackground"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorNote from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorNote"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"

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

        <QuestionEditorTitle />
        <QuestionEditorMedia />
        <QuestionEditorNote />
        <AnswersEditor key={currentQuestionId} />

        <GameBackground />
        <EditorCardBackgroundPreview />
      </main>
      <QuestionEditorConfig />
    </div>
  )
}

export default QuestionEditor
