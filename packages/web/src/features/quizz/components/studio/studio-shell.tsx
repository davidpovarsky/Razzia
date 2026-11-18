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
import { EditorWorkspace } from "@razzia/extensions/presentation"
import { List } from "lucide-react"
import { EditorGameBackdrop } from "./EditorGameBackdrop"
import "./editor-workspace-native.css"

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

  if (!selectedTimelineItem) {
    return (
      <EditorWorkspace
        ariaLabel={t("extensions:studio.tabs.questions", "Questions")}
        closeLabel={t("common:close", "Close")}
        panels={[
          {
            id: "timeline",
            label: t("extensions:studio.tabs.questions", "Questions"),
            icon: <List size={19} />,
            side: "left",
            dock: true,
            content: <QuizzEditorSidebar />,
          },
        ]}
      >
        <div />
      </EditorWorkspace>
    )
  }
  return selectedTimelineItem.kind === "question" ? (
    <QuestionEditor />
  ) : (
    <StudioSceneEditor />
  )
}

export const StudioShell = () => (
  <InstalledThemeCatalogProvider>
    <StudioEditorProvider>
      <div className="native-editor-shell bg-muted relative flex max-w-full flex-col">
        <EditorGameBackdrop />
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
