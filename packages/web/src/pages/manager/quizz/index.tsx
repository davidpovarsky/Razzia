import { StudioShell } from "@razzia/web/features/quizz/components/studio"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { createFileRoute } from "@tanstack/react-router"

const QuizzEditorPage = () => (
  <QuizzEditorProvider>
    <StudioShell />
  </QuizzEditorProvider>
)

export const Route = createFileRoute("/manager/quizz/")({
  component: QuizzEditorPage,
})
