// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { QuizzWithId } from "@razzia/common/types/game"
import {
  generateQuestionId,
  isQuizExtrasV2,
  type AnyQuizExtras,
} from "@razzia/extensions/core"
import {
  CompositeApiClient,
  duplicateQuestionInExtras,
  removeQuestionFromExtras,
  reorderQuestionsInExtras,
} from "@razzia/extensions/editor"
import { useEffect, useState } from "react"

/** Stable identities and sidecar metadata; react-hook-form remains the form authority. */
export function useQuizzExtras(initialData?: QuizzWithId) {
  const [extras, setExtras] = useState<AnyQuizExtras | null>(null)
  const [conflict, setConflict] = useState<{
    serverRevision?: number
    expectedRevision?: number | null
  } | null>(null)

  const [questionIds, setQuestionIds] = useState<string[]>(() => {
    const count = initialData?.questions.length ?? 1

    return Array.from({ length: count }, () => generateQuestionId())
  })

  useEffect(() => {
    if (!initialData?.id) {
      return
    }

    let isSubscribed = true
    const client = new CompositeApiClient({
      getAuthToken: () => localStorage.getItem("token"),
    })
    client
      .getQuizComposite(initialData.id)
      .then((res) => {
        if (!isSubscribed) {
          return
        }

        if (res.exists && res.extras) {
          setExtras((prev) => {
            // Guard: do not overwrite if user has already modified extras locally
            if (prev) {
              return prev
            }

            return res.extras
          })

          if (
            Array.isArray(res.extras.questionIds) &&
            res.extras.questionIds.length > 0
          ) {
            setQuestionIds(res.extras.questionIds)
          }
        }
      })
      .catch(() => undefined)

    return () => {
      isSubscribed = false
    }
  }, [initialData?.id])

  const appendQuestionIdentity = () => {
    const newUuid = generateQuestionId()
    setQuestionIds((prev) => [...prev, newUuid])

    if (extras) {
      setExtras({ ...extras, questionIds: [...extras.questionIds, newUuid] })
    }
  }
  const removeQuestionIdentity = (
    index: number,
    effectiveQuestionIds: string[],
  ) => {
    setQuestionIds((prev) => prev.filter((_, i) => i !== index))

    if (extras) {
      if (isQuizExtrasV2(extras)) {
        const removedQId = effectiveQuestionIds[index]
        let nextPerQuestion = extras.perQuestion
          ? { ...extras.perQuestion }
          : {}

        if (removedQId && removedQId in nextPerQuestion) {
          const { [removedQId]: _removed, ...remaining } = nextPerQuestion
          nextPerQuestion = remaining
        }

        setExtras({
          ...extras,
          questionIds: effectiveQuestionIds.filter((_, i) => i !== index),
          perQuestion: nextPerQuestion,
        })
      } else {
        setExtras(removeQuestionFromExtras(extras, index))
      }
    }
  }
  const reorderQuestionIdentity = (
    from: number,
    to: number,
    effectiveQuestionIds: string[],
  ) => {
    setQuestionIds((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)

      if (moved) {
        next.splice(to, 0, moved)
      }

      return next
    })

    if (extras) {
      if (isQuizExtrasV2(extras)) {
        const nextQIds = [...effectiveQuestionIds]
        const [moved] = nextQIds.splice(from, 1)

        if (moved) {
          nextQIds.splice(to, 0, moved)
        }

        setExtras({
          ...extras,
          questionIds: nextQIds,
        })
      } else {
        setExtras(reorderQuestionsInExtras(extras, from, to))
      }
    }
  }
  const duplicateQuestionIdentity = (
    index: number,
    effectiveQuestionIds: string[],
  ) => {
    if (extras) {
      if (isQuizExtrasV2(extras)) {
        const sourceQId = effectiveQuestionIds[index]
        const newUuid = generateQuestionId()
        const nextPerQuestion = extras.perQuestion
          ? { ...extras.perQuestion }
          : {}

        if (sourceQId && sourceQId in nextPerQuestion) {
          nextPerQuestion[newUuid] = structuredClone(nextPerQuestion[sourceQId])
        }

        setExtras({
          ...extras,
          questionIds: [
            ...effectiveQuestionIds.slice(0, index + 1),
            newUuid,
            ...effectiveQuestionIds.slice(index + 1),
          ],
          perQuestion: nextPerQuestion,
        })
        setQuestionIds((prev) => {
          const next = [...prev]
          next.splice(index + 1, 0, newUuid)

          return next
        })
      } else {
        const { extras: newExtras, newQuestionId } = duplicateQuestionInExtras(
          extras,
          index,
        )
        setExtras(newExtras)
        setQuestionIds((prev) => {
          const next = [...prev]
          next.splice(index + 1, 0, newQuestionId)

          return next
        })
      }
    } else {
      const newUuid = generateQuestionId()
      setQuestionIds((prev) => {
        const next = [...prev]
        next.splice(index + 1, 0, newUuid)

        return next
      })
    }
  }

  return {
    extras,
    setExtras,
    conflict,
    setConflict,
    questionIds,
    setQuestionIds,
    appendQuestionIdentity,
    removeQuestionIdentity,
    reorderQuestionIdentity,
    duplicateQuestionIdentity,
  }
}
