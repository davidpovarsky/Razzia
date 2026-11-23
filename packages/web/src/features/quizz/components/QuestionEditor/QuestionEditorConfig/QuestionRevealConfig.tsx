import type { PerQuestionItem } from "@razzia/extensions/core"
import { RevealSection } from "@razzia/extensions/editor"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useTranslation } from "react-i18next"

const QuestionRevealConfig = () => {
  const { currentQuestionId, extras, setExtras } = useQuizzEditor()
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) =>
    t(`extensions:${key}`, { defaultValue: fallback })

  const updateCurrentQuestionItem = (
    update: (item: PerQuestionItem) => void,
  ) => {
    if (!currentQuestionId) {
      return
    }

    setExtras((previous) => {
      if (!previous || !previous.questionIds.includes(currentQuestionId)) {
        return previous
      }

      const item = structuredClone(
        previous.perQuestion[currentQuestionId] ?? {},
      )
      update(item)

      return {
        ...previous,
        perQuestion: { ...previous.perQuestion, [currentQuestionId]: item },
      }
    })
  }

  return (
    <RevealSection
      currentPerQuestion={extras?.perQuestion[currentQuestionId]}
      updateCurrentQuestionItem={updateCurrentQuestionItem}
      tr={tr}
    />
  )
}

export default QuestionRevealConfig
