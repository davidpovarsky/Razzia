import Button from "@razzia/web/components/Button"
import Loader from "@razzia/web/components/Loader"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useTranslation } from "react-i18next"
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
  const { extrasStatus, retryExtras } = useQuizzEditor()
  const { t } = useTranslation()

  if (extrasStatus !== "ready") {
    return (
      <div
        data-testid="studio-load-state"
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
      >
        {extrasStatus === "loading" ? (
          <Loader className="text-primary size-10" />
        ) : null}
        <p>
          {t(
            extrasStatus === "loading"
              ? "common:loading"
              : "extensions:errors.loadQuizFailed",
          )}
        </p>
        {extrasStatus === "error" && (
          <Button type="button" onClick={retryExtras}>
            {t("extensions:conflict.reload")}
          </Button>
        )}
      </div>
    )
  }

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
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto lg:flex-row lg:overflow-hidden">
        <QuizzEditorSidebar />
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm font-medium" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto lg:flex-row lg:overflow-hidden">
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
        <div
          id="studio-content"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <StudioContent />
        </div>
      </div>
    </StudioEditorProvider>
  </InstalledThemeCatalogProvider>
)
