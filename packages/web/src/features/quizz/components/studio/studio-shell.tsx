import QuestionEditor from "@razzia/web/features/quizz/components/QuestionEditor"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import QuizzEditorSidebar from "@razzia/web/features/quizz/components/QuizzEditorSidebar"
import { StudioEditorProvider, useStudioEditor } from "./studio-editor-context"
import { StudioLaunchPage } from "./studio-launch-page"
import { StudioParticipantsPage } from "./studio-participants-page"
import { StudioSceneEditor } from "./studio-scene-editor"
import { StudioSettingsPage } from "./studio-settings-page"
import { InstalledThemeCatalogProvider } from "./installed-theme-catalog"

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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden lg:flex-row lg:overflow-hidden">
        <QuizzEditorSidebar />
        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm font-medium" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden lg:flex-row lg:overflow-hidden">
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
  <InstalledThemeCatalogProvider>
    <StudioEditorProvider>
      <div className="bg-muted relative flex h-svh max-w-full flex-col overflow-x-hidden">
        <QuizzEditorHeader />
        <StudioContent />
      </div>
    </StudioEditorProvider>
  </InstalledThemeCatalogProvider>
)
