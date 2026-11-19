import { EditorStageFitNotice } from "./extension-adornments"
import { lazy, Suspense } from "react"
import { EditorWorkspace } from "@razzia/extensions/presentation"
import { Image, List, Palette, Pencil, Settings2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import QuizzEditorSidebar from "../QuizzEditorSidebar"
import { ShowThemeSettings } from "../studio/show-theme-settings"
import { StudioCardKindBar } from "../studio/header-controls"
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
  const { t } = useTranslation()

  if (isRemoving || !hasCurrentQuestion) {
    return null
  }

  const AnswersEditor =
    QUESTION_REGISTRY[currentQuestion.type].AnswersEditor ??
    QuestionEditorAnswers

  return (
    <EditorWorkspace
      className="native-editor-workspace"
      ariaLabel={t("extensions:studio.tabs.questions", "Questions")}
      closeLabel={t("common:close", "Close")}
      defaultPanel={window.location.hash === "#themes" ? "themes" : undefined}
      panels={[
        {
          id: "timeline",
          label: t("extensions:studio.tabs.questions", "Questions"),
          icon: <List size={19} />,
          side: "left",
          dock: true,
          content: <QuizzEditorSidebar />,
        },
        {
          id: "edit",
          label: t("common:edit", "Edit"),
          icon: <Pencil size={19} />,
          side: "right",
          dock: true,
          content: (
            <div className="native-editor-fields">
              <StudioCardKindBar embedded />
              <EditorStageFitNotice question={currentQuestion} />
              <QuestionEditorTitle />
              <QuestionEditorNote />
              <AnswersEditor key={currentQuestionId} />
            </div>
          ),
        },
        {
          id: "media",
          label: t("quizz:media.library", "Media"),
          icon: <Image size={19} />,
          content: <QuestionEditorMedia />,
        },
        {
          id: "themes",
          label: t("extensions:themes.title"),
          icon: <Palette size={19} />,
          content: <ShowThemeSettings compact />,
        },
        {
          id: "settings",
          label: t("extensions:studio.tabs.settings", "Settings"),
          icon: <Settings2 size={19} />,
          content: <QuestionEditorConfig />,
        },
      ]}
    >
      <Suspense fallback={null}>
        <QuestionLivePreview key={currentQuestionId} workspace />
      </Suspense>
    </EditorWorkspace>
  )
}

export default QuestionEditor
