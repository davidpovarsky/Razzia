import type { StudioSnapshot } from "./studio-snapshot"
import { useStudioEditor } from "./studio-editor-context"
import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  generateQuestionId,
  isQuizExtrasV2,
} from "@razzia/extensions/core"
import {
  CompositeApiClient,
  RevisionConflictError,
  type SaveCompositeResult,
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
import { useBlocker, useNavigate } from "@tanstack/react-router"
import { useRef, type BaseSyntheticEvent } from "react"
import { useFormContext } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

/** Composite persistence and conflict handling belong to the downstream editor. */
export function useCompositeQuizzSave() {
  const {
    quizzId,
    questionIds,
    setCurrentIndex,
    setQuestionIds,
    extras,
    setExtras,
    acceptExtrasBaseline,
    isExtrasDirty,
    extrasStatus,
    conflict,
    setConflict,
  } = useQuizzEditor()
  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, isDirty },
  } = useFormContext<QuizzFormValues, unknown, QuizzValidated>()
  const {
    timeline,
    selectTimelineItem,
    setActiveTab,
    pendingDraft,
    draftConflict,
    captureStudioSnapshot,
    acceptSavedDraft,
    acceptReloadedDraft,
    discardCurrentDraft,
    clearStudioHistory,
  } = useStudioEditor()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const allowNavigation = useRef(false)
  const hasUnsavedChanges = isDirty || isExtrasDirty
  const targetQuizId =
    quizzId ??
    (extras && !["temp-quiz", "temp-new"].includes(extras.quizId)
      ? extras.quizId
      : null)
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges && !allowNavigation.current,
    enableBeforeUnload: () => hasUnsavedChanges && !allowNavigation.current,
    withResolver: true,
  })

  const handleExit = () => {
    navigate({ to: "/manager/config" })
  }

  const onError = (error: Error) => {
    toast.error(
      t(error instanceof ApiError ? error.key : "errors:quizz.failedToSave"),
    )
  }

  const onSaved = (
    messageKey: string,
    submitted: StudioSnapshot | null,
    receipt?: SaveCompositeResult,
  ) => {
    clearStudioHistory()

    if (submitted) {
      const saved = receipt
        ? {
            ...submitted,
            extras: {
              ...submitted.extras,
              quizId: receipt.quizId,
              revision: receipt.revision,
              baseDigest: receipt.baseDigest,
            },
          }
        : submitted
      acceptExtrasBaseline(saved.extras)

      if (!acceptSavedDraft(saved)) {
        reset(saved.values, { keepValues: true, keepDirty: true })
        queryClient.invalidateQueries({ queryKey: quizzKeys.all })
        toast.success(t("extensions:editor.savedWithNewerEdits"))

        return
      }
    }

    queryClient.invalidateQueries({ queryKey: quizzKeys.all })
    toast.success(t(messageKey))
    allowNavigation.current = true
    handleExit()
  }

  const { mutateAsync: create, isPending: isCreating } = useMutation({
    mutationFn: createQuizz,
    onError,
  })

  const { mutateAsync: update, isPending: isUpdating } = useMutation({
    mutationFn: updateQuizz,
    onError,
  })

  const handleSave = (event?: BaseSyntheticEvent) =>
    handleSubmit(
      async (values) => {
        if (extrasStatus !== "ready" || pendingDraft) {
          toast.error(
            t(
              extrasStatus === "loading"
                ? "common:loading"
                : "extensions:errors.loadQuizFailed",
            ),
          )

          return
        }

        if (draftConflict) {
          setConflict(draftConflict)

          return
        }

        const submitted = captureStudioSnapshot()
        // A newly created quiz can still have newer in-flight local edits.
        // Reuse the returned identity on retry rather than creating a duplicate.

        if (extras && targetQuizId) {
          try {
            const baseDigest = computeCanonicalBaseDigest(values)
            const client = new CompositeApiClient({
              getAuthToken: () => localStorage.getItem("token"),
            })
            const res = await client.saveQuizComposite(targetQuizId, {
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
            onSaved("quizz:quizzUpdated", submitted, res)

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
            onSaved("quizz:quizzSaved", submitted, res)

            return
          } catch (err: unknown) {
            onError(err as Error)

            return
          }
        }

        try {
          if (quizzId) {
            await update({ id: quizzId, json: values })
            onSaved("quizz:quizzUpdated", submitted)
          } else {
            await create(values)
            onSaved("quizz:quizzSaved", submitted)
          }
        } catch {
          // The mutation's onError handler reports the failure. Keep the form editable.
        }
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
    )(event)

  const handleReloadConflict = async () => {
    if (!targetQuizId) {
      return
    }

    try {
      const client = new CompositeApiClient()
      const res = await client.getQuizComposite(targetQuizId)
      const latestQuizz = await unwrap(
        api.quizz[":id"].$get({ param: { id: targetQuizId } }),
      )

      queryClient.setQueryData(quizzKeys.detail(targetQuizId), latestQuizz)

      reset({
        gameMode: latestQuizz.gameMode,
        subject: latestQuizz.subject,
        questions: latestQuizz.questions,
      })

      const loadedExtras =
        res.exists && res.extras
          ? res.extras
          : createDefaultQuizExtrasV2(
              targetQuizId,
              latestQuizz.questions.map(() => generateQuestionId()),
              computeCanonicalBaseDigest(latestQuizz),
            )
      setExtras(loadedExtras)
      setQuestionIds?.(loadedExtras.questionIds)
      acceptExtrasBaseline(loadedExtras)
      clearStudioHistory()
      acceptReloadedDraft({
        values: {
          gameMode: latestQuizz.gameMode,
          subject: latestQuizz.subject,
          questions: latestQuizz.questions,
        },
        questionIds: loadedExtras.questionIds,
        extras: loadedExtras,
        selectedTimelineId: isQuizExtrasV2(loadedExtras)
          ? (loadedExtras.timeline[0]?.id ?? null)
          : null,
        currentIndex: 0,
      })

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

  const handleForceOverwriteConflict = () =>
    handleSubmit(async (currentValues) => {
      if (!targetQuizId || !extras) {
        return
      }

      const submitted = captureStudioSnapshot()

      try {
        const baseDigest = computeCanonicalBaseDigest(currentValues)
        const client = new CompositeApiClient({
          getAuthToken: () => localStorage.getItem("token"),
        })
        // Force overwrite with expectedRevision: null and fresh baseDigest matching current form values
        const res = await client.saveQuizComposite(targetQuizId, {
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
        onSaved("quizz:quizzUpdated", submitted, res)
      } catch (err: unknown) {
        onError(err as Error)
      }
    })()

  return {
    control,
    isSaving: isSubmitting || isCreating || isUpdating,
    canSave: extrasStatus === "ready" && !pendingDraft,
    navigationBlocked: navigationBlocker.status === "blocked",
    cancelNavigation: () => navigationBlocker.reset?.(),
    confirmNavigation: () => {
      discardCurrentDraft()
      clearStudioHistory()
      allowNavigation.current = true
      navigationBlocker.proceed?.()
    },
    conflict,
    setConflict,
    handleExit,
    handleSave,
    handleReloadConflict,
    handleForceOverwriteConflict,
  }
}
