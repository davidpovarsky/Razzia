import { QUIZZ_MODES } from "@razzia/common/constants"
import type { QuizzValidated } from "@razzia/common/validators/quizz"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import {
  CompositeApiClient,
  RevisionConflictError,
} from "@razzia/extensions/editor"
import Button from "@razzia/web/components/Button"
import FieldError from "@razzia/web/components/forms/FieldError"
import Input from "@razzia/web/components/Input"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import {
  createQuizz,
  quizzKeys,
  updateQuizz,
} from "@razzia/web/features/manager/queries"
import { ConflictDialog } from "@razzia/web/features/quizz/components/ConflictDialog"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { ApiError, api, unwrap } from "@razzia/web/lib/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import clsx from "clsx"
import { Controller, useFormContext } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QUIZZ_MODE_LIST = Object.values(QUIZZ_MODES)

const QuizzEditorHeader = () => {
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
        setCurrentIndex(index)
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

  return (
    <header className="bg-background z-20 flex h-14 items-center justify-between gap-4 px-4 shadow-sm">
      <div className="flex items-center gap-4">
        <Controller
          control={control}
          name="subject"
          render={({ field, fieldState }) => (
            <div className="flex items-center gap-6">
              <Input
                {...field}
                variant="sm"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? `${field.name}-error` : undefined
                }
                className={clsx(
                  "w-64",
                  fieldState.invalid && "ring-2 ring-red-500",
                )}
                placeholder={t("quizz:titleQuizzPlaceholder")}
              />
              <FieldError
                id={`${field.name}-error`}
                errors={[fieldState.error]}
              />
            </div>
          )}
        />

        <Controller
          control={control}
          name="gameMode"
          render={({ field }) => (
            <ToggleGroup
              value={field.value}
              onChange={field.onChange}
              items={QUIZZ_MODE_LIST.map((gameMode) => ({
                value: gameMode,
                label: t(`quizz:gameMode.${gameMode}`),
              }))}
            />
          )}
        />
      </div>

      <div className="flex gap-2">
        <Button
          className="text-md bg-accent text-accent-foreground px-4 py-2 font-semibold"
          onClick={handleExit}
        >
          {t("common:exit")}
        </Button>
        <Button className="bg-primary text-md px-4 py-2" onClick={handleSave}>
          {t("common:save")}
        </Button>
      </div>

      <ConflictDialog
        open={Boolean(conflict)}
        serverRevision={conflict?.serverRevision}
        expectedRevision={conflict?.expectedRevision}
        onReload={handleReloadConflict}
        onOverwrite={handleForceOverwriteConflict}
        onCancel={() => setConflict(null)}
      />
    </header>
  )
}

export default QuizzEditorHeader
