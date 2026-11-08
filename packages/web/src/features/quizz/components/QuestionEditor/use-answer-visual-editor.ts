// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { UploadedMedia } from "@razzia/common/types/game"
import type { AnswerDisplay, AnswerVisual } from "@razzia/extensions/core"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useState } from "react"

export function useAnswerVisualEditor() {
  const {
    currentQuestion,
    currentQuestionId,
    currentIndex,
    updateQuestion,
    extras,
    setExtras,
  } = useQuizzEditor()
  const { answers } = currentQuestion
  const [pickingAnswerIdx, setPickingAnswerIdx] = useState<number | null>(null)
  const currentPerQ =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const answerVisuals: AnswerVisual[] = currentPerQ?.answerVisuals ?? []

  const getVisualForAnswer = (idx: number): AnswerVisual | undefined =>
    answerVisuals.find((v) => v.answerIndex === idx)

  const upsertAnswerVisual = (
    idx: number,
    updater: (prev: AnswerVisual) => AnswerVisual | null,
  ) => {
    if (!currentQuestionId) {
      return
    }

    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = existingPerQ[currentQuestionId] ?? {}
      const currentList = [...(existingItem.answerVisuals ?? [])]
      const foundIdx = currentList.findIndex((v) => v.answerIndex === idx)
      const baseVisual: AnswerVisual =
        foundIdx >= 0
          ? currentList[foundIdx]
          : {
              answerIndex: idx,
              display: "text",
              alt: answers[idx]?.trim() || `Option ${idx + 1}`,
            }

      const nextVisual = updater(baseVisual)
      let nextList: AnswerVisual[] = []

      if (!nextVisual || (nextVisual.display === "text" && !nextVisual.url)) {
        nextList = currentList.filter((v) => v.answerIndex !== idx)
      } else if (foundIdx >= 0) {
        nextList = currentList.map((v, i) => (i === foundIdx ? nextVisual : v))
      } else {
        nextList = [...currentList, nextVisual].sort(
          (a, b) => a.answerIndex - b.answerIndex,
        )
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: {
            ...existingItem,
            answerVisuals: nextList,
          },
        },
      }
    })
  }

  const handleSelectAnswerMedia = (item: UploadedMedia) => {
    if (pickingAnswerIdx === null) {
      return
    }

    const idx = pickingAnswerIdx
    const existingText = (answers[idx] ?? "").trim()
    const fallbackLabel =
      existingText || item.name.replace(/\.[^.]+$/u, "") || `Option ${idx + 1}`

    if (!existingText) {
      const nextAnswers = [...answers]
      nextAnswers[idx] = fallbackLabel
      updateQuestion(currentIndex, { answers: nextAnswers })
    }

    upsertAnswerVisual(idx, (prev) => ({
      answerIndex: idx,
      display: prev.display === "text" ? "both" : prev.display,
      url: item.url,
      alt: prev.alt?.trim() ? prev.alt : fallbackLabel,
    }))
    setPickingAnswerIdx(null)
  }

  const handleDisplayModeChange = (idx: number, mode: AnswerDisplay) => {
    if (mode === "image" && !(answers[idx] ?? "").trim()) {
      const visual = getVisualForAnswer(idx)
      // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- Blank alt text must fall back to the option label.
      const fallback = visual?.alt?.trim() || `Option ${idx + 1}`
      const nextAnswers = [...answers]
      nextAnswers[idx] = fallback
      updateQuestion(currentIndex, { answers: nextAnswers })
    }

    upsertAnswerVisual(idx, (prev) => ({
      ...prev,
      display: mode,
      // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- Blank labels intentionally use the next nonempty candidate.
      alt: prev.alt?.trim() || answers[idx]?.trim() || `Option ${idx + 1}`,
    }))
  }

  const handleRemoveAnswerImage = (idx: number) => {
    upsertAnswerVisual(idx, () => null)
  }

  const handleAltChange = (idx: number, nextAlt: string) => {
    upsertAnswerVisual(idx, (prev) => ({
      ...prev,
      alt: nextAlt,
    }))
  }

  const trimAnswerVisuals = (maxIndex: number) => {
    if (currentQuestionId && extras?.perQuestion?.[currentQuestionId]) {
      setExtras((prev) => {
        if (!prev?.perQuestion?.[currentQuestionId]) {
          return prev
        }

        const existingItem = prev.perQuestion[currentQuestionId]

        return {
          ...prev,
          perQuestion: {
            ...prev.perQuestion,
            [currentQuestionId]: {
              ...existingItem,
              answerVisuals: (existingItem.answerVisuals ?? []).filter(
                (v) => v.answerIndex <= maxIndex,
              ),
            },
          },
        }
      })
    }
  }

  return {
    pickingAnswerIdx,
    setPickingAnswerIdx,
    getVisualForAnswer,
    handleSelectAnswerMedia,
    handleDisplayModeChange,
    handleRemoveAnswerImage,
    handleAltChange,
    trimAnswerVisuals,
  }
}
