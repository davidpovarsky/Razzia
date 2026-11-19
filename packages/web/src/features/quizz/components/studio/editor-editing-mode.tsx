import { MAX_POINTS } from "@razzia/common/constants"
import { isMultiOptions } from "@razzia/common/questions/options"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Settings2 } from "lucide-react"
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"
import { useTranslation } from "react-i18next"

interface EditorEditingMode {
  advanced: boolean
  setAdvanced: (advanced: boolean) => void
}

// Keep older consumers outside Studio fully functional.
const EditorEditingModeContext = createContext<EditorEditingMode>({
  advanced: true,
  setAdvanced: () => undefined,
})

/** Presentation state only: switching modes never changes the saved game. */
export function EditorEditingModeProvider({ children }: PropsWithChildren) {
  const [advanced, setAdvanced] = useState(false)
  const value = useMemo(() => ({ advanced, setAdvanced }), [advanced])

  return (
    <EditorEditingModeContext.Provider value={value}>
      {children}
    </EditorEditingModeContext.Provider>
  )
}

export function useEditorEditingMode() {
  return useContext(EditorEditingModeContext)
}

function hasConfiguredValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false
  }

  if (typeof value === "object") {
    return Object.values(value).some(hasConfiguredValue)
  }

  return value !== ""
}

function useHasQuestionCustomSettings() {
  const { currentQuestion, currentQuestionId, extras } = useQuizzEditor()
  const perQuestion = currentQuestionId
    ? extras?.perQuestion[currentQuestionId]
    : undefined
  const defaults = QUESTION_REGISTRY[currentQuestion.type].defaultOptions
  const customScoring =
    isMultiOptions(currentQuestion.options) &&
    isMultiOptions(defaults) &&
    currentQuestion.options.scoringMode !== defaults.scoringMode

  return (
    (currentQuestion.maxPoints ?? MAX_POINTS) !== MAX_POINTS ||
    (currentQuestion.penalty ?? 0) > 0 ||
    currentQuestion.cooldown !== 5 ||
    customScoring ||
    Object.entries(perQuestion ?? {}).some(
      ([key, value]) => key !== "answerVisuals" && hasConfiguredValue(value),
    )
  )
}

export function QuestionCustomSettingsNotice() {
  const { t } = useTranslation()
  const hasCustomSettings = useHasQuestionCustomSettings()

  if (!hasCustomSettings) {
    return null
  }

  return (
    <div
      data-testid="editor-custom-settings-notice"
      className="border-primary/20 bg-primary/5 rounded-lg border px-3 py-2 text-xs"
    >
      <p className="text-foreground flex items-center gap-1.5 font-semibold">
        <Settings2 aria-hidden="true" className="size-3.5 shrink-0" />
        {t("extensions:studio.editing.customSettings")}
      </p>
      <p className="text-muted-foreground mt-1 leading-relaxed">
        {t("extensions:studio.editing.customSettingsHint")}
      </p>
    </div>
  )
}

/** Available for every selected card, including an opening or existing scene. */
export function EditorEditingModeControl() {
  const { advanced, setAdvanced } = useEditorEditingMode()
  const { t, i18n } = useTranslation()

  return (
    <div
      data-testid="editor-editing-mode"
      data-mode={advanced ? "advanced" : "simple"}
      className="order-4 w-full min-w-0 sm:order-none sm:w-auto"
    >
      <ToggleGroup
        aria-label={t("extensions:studio.editing.modeLabel")}
        dir={i18n.dir()}
        value={advanced ? "advanced" : "simple"}
        onChange={(next) => setAdvanced(next === "advanced")}
        items={[
          { value: "simple", label: t("extensions:studio.editing.simple") },
          { value: "advanced", label: t("extensions:studio.editing.advanced") },
        ]}
        itemMetadata={(value) => ({ "data-testid": `editor-mode-${value}` })}
        className="h-auto w-full [&>button]:min-h-8 [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2.5 [&>button]:text-xs [&>button]:whitespace-normal"
      />
    </div>
  )
}

export function QuestionEditingGuide() {
  const { advanced } = useEditorEditingMode()
  const { t } = useTranslation()

  return (
    <section
      data-testid="editor-question-guide"
      className="border-border/60 flex flex-col gap-2 rounded-lg border p-3"
    >
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t(
          advanced
            ? "extensions:studio.editing.advancedHint"
            : "extensions:studio.editing.simpleHint",
        )}
      </p>
      {!advanced && <QuestionCustomSettingsNotice />}
    </section>
  )
}
