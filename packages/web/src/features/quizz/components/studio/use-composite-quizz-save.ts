import { useStudioEditor } from "./studio-editor-context"
import type { QuizzValidated } from "@razzia/common/validators/quizz"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import {
  CompositeApiClient,
  RevisionConflictError,
} from "@razzia/extensions/editor"
import {
  createQuizz,
  quizzKeys,
  updateQuizz,
} from "@razzia/web/features/manager/queries"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { ApiError, api, unwrap } from "@razzia/web/lib/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useFormContext } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

/** Composite persistence and conflict handling belong to the downstream editor. */
export function useCompositeQuizzSave() {
  const {
    quizzId,
    questionIds,
    setCurrentIndex,
    extras,
    setExtras,
    conflict,
    setConflict,
  } = useQuizzEditor()
  const { handleSubmit, control, getValues, reset } = useFormContext<
    QuizzFormValues,
    unknown,
    QuizzValidated
  >()
  const { timeline, selectTimelineItem, setActiveTab } = useStudioEditor()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const handleExit = () => {
    navigate({ to: "/manager/config" })
  }

  const onError = (error: Error) => {
    toast.error(
      t(error instanceof ApiError ? error.key : "errors:quizz.failedToSave"),
    )
  }

  const onSaved = (messageKey: string) => {
    queryClient.invalidateQueries({ queryKey: quizzKeys.all })
    toast.success(t(messageKey))
    handleExit()
  }

  const { mutate: create } = useMutation({
    mutationFn: createQuizz,
    onSuccess: () => onSaved("quizz:quizzSaved"),
    onError,
  })

  const { mutate: update } = useMutation({
    mutationFn: updateQuizz,
    onSuccess: () => onSaved("quizz:quizzUpdated"),
    onError,
  })

  const handleSave = handleSubmit(
    async (values) => {
      if (extras && quizzId) {
        try {
          const baseDigest = computeCanonicalBaseDigest(values)
          const client = new CompositeApiClient({
            getAuthToken: () => localStorage.getItem("token"),
          })
          const res = await client.saveQuizComposite(quizzId, {
            expectedRevision: extras.revision,
            quizz: values,
            extras: {
              ...extras,
              baseDigest,
              questionIds,
            },
          })
          setExtras((prev) =>
            prev
              ? {
                  ...prev,
                  revision: res.revision,
                  baseDigest: res.baseDigest,
                }
              : null,
          )
          onSaved("quizz:quizzUpdated")

          return
        } catch (err: unknown) {
          if (err instanceof RevisionConflictError) {
            setConflict({
              serverRevision: err.currentRevision,
              expectedRevision: err.expectedRevision,
            })

            return
          }

          onError(err as Error)

          return
        }
      }

      if (extras && !quizzId) {
        try {
          const baseDigest = computeCanonicalBaseDigest(values)
          const client = new CompositeApiClient({
            getAuthToken: () => localStorage.getItem("token"),
          })
          const res = await client.createQuizComposite({
            quizz: values,
            extras: {
              ...extras,
              quizId: extras.quizId || "temp-new",
              baseDigest,
              questionIds,
            },
          })
          setExtras((prev) =>
            prev
              ? {
                  ...prev,
                  quizId: res.quizId,
                  revision: res.revision,
                  baseDigest: res.baseDigest,
                }
              : null,
          )
          onSaved("quizz:quizzSaved")

          return
        } catch (err: unknown) {
          onError(err as Error)

          return
        }
      }

      if (quizzId) {
        update({ id: quizzId, json: values })

        return
      }

      create(values)
    },
    (invalid) => {
      if (!Array.isArray(invalid.questions)) {
        return
      }

      const index = invalid.questions.findIndex(Boolean)

      if (index >= 0) {
        setActiveTab("questions")

        const item = timeline.find(
          (entry) =>
            entry.kind === "question" &&
            entry.questionId === questionIds[index],
        )

        if (item) {
          selectTimelineItem(item.id)
        } else {
          setCurrentIndex(index)
        }
      }
    },
  )

  const handleReloadConflict = async () => {
    if (!quizzId) {
      return
    }

    try {
      const client = new CompositeApiClient()
      const res = await client.getQuizComposite(quizzId)
      const latestQuizz = await unwrap(
        api.quizz[":id"].$get({ param: { id: quizzId } }),
      )

      queryClient.setQueryData(quizzKeys.detail(quizzId), latestQuizz)

      reset({
        gameMode: latestQuizz.gameMode,
        subject: latestQuizz.subject,
        questions: latestQuizz.questions,
      })

      if (res.exists && res.extras) {
        setExtras(res.extras)
      }

      setConflict(null)
      toast.success(
        t(
          "extensions:errors.loadQuizSuccess",
          "Loaded latest quiz from server",
        ),
      )
    } catch {
      toast.error(
        t("extensions:errors.loadQuizFailed", "Failed to reload quiz"),
      )
    }
  }

  const handleForceOverwriteConflict = async () => {
    if (!quizzId || !extras) {
      return
    }

    try {
      const currentValues = getValues()
      const baseDigest = computeCanonicalBaseDigest(currentValues)
      const client = new CompositeApiClient({
        getAuthToken: () => localStorage.getItem("token"),
      })
      // Force overwrite with expectedRevision: null and fresh baseDigest matching current form values
      const res = await client.saveQuizComposite(quizzId, {
        expectedRevision: null,
        quizz: currentValues,
        extras: {
          ...extras,
          baseDigest,
          questionIds,
        },
      })
      setExtras((prev) =>
        prev
          ? {
              ...prev,
              revision: res.revision,
              baseDigest: res.baseDigest,
            }
          : null,
      )
      setConflict(null)
      onSaved("quizz:quizzUpdated")
    } catch (err: unknown) {
      onError(err as Error)
    }
  }

  return {
    control,
    conflict,
    setConflict,
    handleExit,
    handleSave,
    handleReloadConflict,
    handleForceOverwriteConflict,
  }
}
