import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  TadazzV4Stage,
  showThemeStyle,
  type TadazzV4Scene,
} from "@razzia/extensions/presentation"
import { resolveShowTheme } from "@razzia/extensions/core"
import { useReducedMotion } from "motion/react"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useStudioEditor } from "./studio-editor-context"
import Button from "@razzia/web/components/Button"

/** Native stage preview only: no socket, live game, timers or audio owner. */
export function ShowThemePreview() {
  const { t } = useTranslation()
  const { questions, currentIndex, questionIds, extras } = useQuizzEditor()
  const { defaults } = useStudioEditor()
  const [scene, setScene] = useState<TadazzV4Scene>("question")
  const reducedMotion = useReducedMotion() ?? false
  const theme = resolveShowTheme({
    selection: defaults.showTheme,
    scope: extras?.perQuestion[questionIds[currentIndex]]?.themeOverrides,
    role: "manager",
  })
  const question = questions.at(currentIndex) ?? questions.at(0)
  const visuals =
    extras?.perQuestion[questionIds[currentIndex]]?.answerVisuals ?? []

  if (!question?.question.trim()) {
    return null
  }

  return (
    <div className="flex flex-col gap-3" data-testid="show-theme-preview">
      <p className="text-muted-foreground text-xs">
        {t("extensions:themes.previewDescription")}
      </p>
      <div className="flex flex-wrap gap-2">
        {(["question", "survey-results", "z-wipe"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            onClick={() => setScene(value)}
          >
            {t(`extensions:themes.previewScenes.${value}`)}
          </Button>
        ))}
      </div>
      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg"
        style={showThemeStyle(theme)}
        data-show-theme={theme.definition.id}
        aria-label={t("extensions:themes.preview")}
      >
        <TadazzV4Stage
          key={scene}
          reducedMotion={reducedMotion}
          initialScene={scene}
          initialData={{
            backgroundUrl: theme.slots.question.mediaUrl,
            backgroundFit: theme.slots.question.fit,
            question: question.question,
            answers: question.answers.map((title, index) => ({
              title,
              imageUrl: visuals.find((value) => value.answerIndex === index)
                ?.url,
            })),
            counts: question.answers.map(() => 0),
            mode: question.playMode ?? "quiz",
            number: currentIndex + 1,
            totalQuestions: questions.length,
          }}
        />
      </div>
    </div>
  )
}
