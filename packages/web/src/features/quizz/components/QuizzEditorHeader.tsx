import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  type TimelineItemKind,
} from "@razzia/extensions/core"
import {
  CompositeApiClient,
  RevisionConflictError,
} from "@razzia/extensions/editor"
import { useStudioEditor } from "@razzia/web/features/quizz/components/studio"
import AlertDialog from "@razzia/web/components/AlertDialog"
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
import {
  BarChart2,
  DoorOpen,
  Flag,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Play,
  Rocket,
  Settings,
  Sparkles,
  Timer,
  Trophy,
  Users,
} from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

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

  const {
    activeTab,
    setActiveTab,
    selectedKind,
    changeSelectedCardKind,
    pendingConversion,
    confirmPendingConversion,
    cancelPendingConversion,
  } = useStudioEditor()
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

  const timelineKinds = [
    { value: "quiz", label: t("extensions:timeline.quiz", "Quiz"), icon: Play },
    { value: "survey", label: t("extensions:timeline.survey", "Survey"), icon: HelpCircle },
    { value: "transition", label: t("extensions:timeline.transition", "Transition"), icon: Layers },
    { value: "animation", label: t("extensions:timeline.animation", "Animation"), icon: Sparkles },
    { value: "media", label: t("extensions:timeline.media", "Media"), icon: ImageIcon },
    { value: "leaderboard", label: t("extensions:timeline.leaderboard", "Leaderboard"), icon: Trophy },
    { value: "interimResults", label: t("extensions:timeline.interimResults", "Interim Results"), icon: BarChart2 },
    { value: "countdown", label: t("extensions:timeline.countdown", "Countdown"), icon: Timer },
    { value: "opening", label: t("extensions:timeline.opening", "Opening"), icon: DoorOpen },
    { value: "closing", label: t("extensions:timeline.closing", "Closing"), icon: Flag },
  ]

  return (
    <header className="bg-background z-20 flex w-full max-w-full flex-col overflow-x-hidden border-b border-border shadow-sm">
      {/* Row 1 / Top: Quiz Title + Studio Navigation Tabs + Exit / Save */}
      <div className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-3 py-1.5 sm:gap-4 sm:px-4">
        {/* Title input */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-4">
          <Controller
            control={control}
            name="subject"
            render={({ field, fieldState }) => (
              <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                <Input
                  {...field}
                  variant="sm"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? `${field.name}-error` : undefined
                  }
                  className={clsx(
                    "w-32 sm:w-48 md:w-56 shrink-0",
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
        </div>

        {/* Center: Studio Screen Navigation Tabs */}
        <div className="bg-accent/80 scrollbar-none flex h-8 max-w-full shrink-0 items-center overflow-x-auto rounded-lg p-0.5">
          <button
            type="button"
            data-testid="studio-tab-questions"
            onClick={() => setActiveTab("questions")}
            className={clsx(
              "flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
              activeTab === "questions"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("extensions:studio.tabs.questions", "Questions")}
          </button>
          <button
            type="button"
            data-testid="studio-tab-participants"
            onClick={() => setActiveTab("participants")}
            className={clsx(
              "flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
              activeTab === "participants"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="size-3.5" />
            {t("extensions:studio.tabs.participants", "Participants")}
          </button>
          <button
            type="button"
            data-testid="studio-tab-settings"
            onClick={() => setActiveTab("settings")}
            className={clsx(
              "flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
              activeTab === "settings"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings className="size-3.5" />
            {t("extensions:studio.tabs.settings", "Settings")}
          </button>
          <button
            type="button"
            data-testid="studio-tab-launch"
            onClick={() => setActiveTab("launch")}
            className={clsx(
              "flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
              activeTab === "launch"
                ? "bg-primary text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Rocket className="size-3.5" />
            {t("extensions:studio.tabs.launch", "Launch")}
          </button>
        </div>

        {/* Right: Exit and Save Buttons */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            className="bg-accent text-accent-foreground px-2.5 py-1.5 text-sm font-semibold sm:px-4 sm:py-2 sm:text-md"
            onClick={handleExit}
            data-testid="editor-exit-btn"
          >
            {t("common:exit")}
          </Button>
          <Button
            type="button"
            className="bg-primary px-2.5 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-md"
            onClick={handleSave}
            data-testid="editor-save-btn"
          >
            {t("common:save")}
          </Button>
        </div>
      </div>

      {/* Row 2 / Directly below: contextual card-type ToggleGroup (Questions screen only) */}
      {activeTab === "questions" && (
        <div
          data-testid="studio-card-type-bar"
          className="bg-muted/30 flex h-11 w-full items-center justify-between border-t border-border/40 px-4"
        >
          <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto py-1">
            <ToggleGroup
              value={selectedKind}
              onChange={(next) =>
                changeSelectedCardKind(next as TimelineItemKind)
              }
              items={timelineKinds}
            />
          </div>

          <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5 shrink-0 pl-3">
            <span className="font-medium">
              {t("extensions:studio.cardKindLabel", "Card Type")}:
            </span>
            <span className="capitalize text-foreground font-semibold">
              {selectedKind}
            </span>
          </div>
        </div>
      )}

      <ConflictDialog
        open={Boolean(conflict)}
        serverRevision={conflict?.serverRevision}
        expectedRevision={conflict?.expectedRevision}
        onReload={handleReloadConflict}
        onOverwrite={handleForceOverwriteConflict}
        onCancel={() => setConflict(null)}
      />

      <AlertDialog
        open={Boolean(pendingConversion)}
        onOpenChange={(open: boolean) => {
          if (!open) {cancelPendingConversion()}
        }}
        title={t(
          "extensions:timeline.deleteConfirmTitle",
          "Convert Question to Scene?",
        )}
        description={t(
          "extensions:timeline.deleteConfirmDesc",
          "Converting this question will replace its question content with the selected scene. This cannot be undone automatically.",
        )}
        confirmLabel={t(
          "extensions:studio.convert.confirm",
          "Convert to Scene",
        )}
        onConfirm={confirmPendingConversion}
      />
    </header>
  )
}

export default QuizzEditorHeader
