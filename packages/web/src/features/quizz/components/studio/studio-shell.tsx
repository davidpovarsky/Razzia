import QuestionEditor from "@razzia/web/features/quizz/components/QuestionEditor"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import QuizzEditorSidebar from "@razzia/web/features/quizz/components/QuizzEditorSidebar"
import { StudioEditorProvider, useStudioEditor } from "./studio-editor-context"
import { StudioLaunchPage } from "./studio-launch-page"
import { StudioParticipantsPage } from "./studio-participants-page"
import { StudioSceneEditor } from "./studio-scene-editor"
import { StudioSettingsPage } from "./studio-settings-page"

const StudioContent = () => {
  const { activeTab, selectedTimelineItem } = useStudioEditor()

  if (activeTab === "participants") {
    return <StudioParticipantsPage />
  }

  if (activeTab === "settings") {
    return <StudioSettingsPage />
  }

  if (activeTab === "launch") {
    return <StudioLaunchPage />
  }

  // ActiveTab === "questions"
  const isQuestion = !selectedTimelineItem || selectedTimelineItem.kind === "question"

  return (
    <div className="flex flex-1 overflow-hidden">
      <QuizzEditorSidebar />
      {isQuestion ? <QuestionEditor /> : <StudioSceneEditor />}
    </div>
  )
}

export const StudioShell = () => (
  <StudioEditorProvider>
    <div className="bg-muted relative flex h-svh flex-col">
      <QuizzEditorHeader />
      <StudioContent />
    </div>
  </StudioEditorProvider>
)
