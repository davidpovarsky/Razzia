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
  if (!selectedTimelineItem) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <QuizzEditorSidebar />
        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm font-medium" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <QuizzEditorSidebar />
      {selectedTimelineItem.kind === "question" ? (
        <QuestionEditor />
      ) : (
        <StudioSceneEditor />
      )}
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
