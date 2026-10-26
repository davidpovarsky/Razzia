import { STATUS } from "@razzia/common/types/game/status"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { createStatus } from "@razzia/web/features/game/utils/createStatus"
import { createGame } from "@razzia/web/features/manager/queries"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { ApiError } from "@razzia/web/lib/api"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertTriangle,
  CheckCircle2,
  ListOrdered,
  Play,
  Rocket,
  Users,
} from "lucide-react"
import { useFormContext } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"

export const StudioLaunchPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { updateManager } = useManagerStore()
  const { quizzId, extras } = useQuizzEditor()
  const { timeline, scenes } = useStudioEditor()
  const { formState: { isDirty } } = useFormContext()

  const questionItems = timeline.filter((tlItem) => tlItem.kind === "question")
  const nonQuestionItems = timeline.filter((tlItem) => tlItem.kind !== "question")

  const mediaItems = nonQuestionItems.filter((tlItem) => tlItem.kind === "media")
  const missingMedia = mediaItems.some((m) => {
    const s = scenes[m.sceneId]

    return "mediaUrl" in s && !s.mediaUrl
  })

  const hasQuestions = questionItems.length > 0
  const participantCount =
    extras?.roster ? extras.roster.participants.length : 0

  const isNew = !quizzId
  const isReadyToLaunch = !isNew && hasQuestions && !isDirty && !missingMedia

  const { mutate: launch, isPending } = useMutation({
    mutationFn: createGame,
    onSuccess: ({ gameId, inviteCode }) => {
      updateManager({
        gameId,
        inviteCode,
        status: createStatus(STATUS.SHOW_ROOM, {
          text: "game:waitingForPlayers",
          inviteCode,
        }),
      })
      toast.success(t("extensions:studio.launch.success", "Game created successfully!"))
      navigate({ to: "/party/manager/$gameId", params: { gameId } })
    },
    onError: (error) => {
      toast.error(
        t(error instanceof ApiError ? error.key : "errors:quizz.notFound"),
      )
    },
  })

  const handleLaunch = () => {
    if (!quizzId) {
      toast.error(t("extensions:studio.launch.saveFirst", "Please save the quiz before launching a live session."))

      return
    }

    if (isDirty) {
      toast.error(t("extensions:studio.launch.unsavedWarning", "Unsaved changes detected. Please save the quiz before launching."))

      return
    }

    if (missingMedia) {
      toast.error(t("extensions:studio.launch.missingMediaWarning", "Some media cards have empty URLs"))

      return
    }

    if (!hasQuestions) {
      toast.error(t("extensions:studio.launch.noQuestionsWarning"))

      return
    }

    launch(quizzId)
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-muted/40 p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center gap-3 border-b border-accent pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Rocket className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("extensions:studio.launch.readyTitle", "Launch Live Show")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "extensions:studio.launch.subtitle",
                "Review timeline readiness, participant counts, and initiate the live presenter session.",
              )}
            </p>
          </div>
        </div>

        {/* Readiness Warnings */}
        {isNew && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm font-semibold text-yellow-700 flex items-center gap-3">
            <AlertTriangle className="size-5 shrink-0" />
            <span>{t("extensions:studio.launch.saveFirst", "Please save the quiz before launching a live session.")}</span>
          </div>
        )}

        {isDirty && !isNew && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm font-semibold text-yellow-700 flex items-center gap-3">
            <AlertTriangle className="size-5 shrink-0" />
            <span>{t("extensions:studio.launch.unsavedWarning", "Unsaved changes detected. Please save the quiz before launching.")}</span>
          </div>
        )}

        {!hasQuestions && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-600 flex items-center gap-3">
            <AlertTriangle className="size-5 shrink-0" />
            <span>{t("extensions:studio.launch.noQuestionsWarning")}</span>
          </div>
        )}

        {missingMedia && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm font-semibold text-yellow-700 flex items-center gap-3">
            <AlertTriangle className="size-5 shrink-0" />
            <span>{t("extensions:studio.launch.missingMediaWarning")}</span>
          </div>
        )}

        {/* Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="flex items-center gap-4 p-5">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <ListOrdered className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">{timeline.length}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                {t("extensions:studio.launch.totalCards", "Timeline Cards")}
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 p-5">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Play className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">{questionItems.length}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                {t("extensions:studio.launch.totalQuestions", "Questions & Surveys")}
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 p-5">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Users className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">{participantCount}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                {t("extensions:studio.launch.totalParticipants", "Registered Participants")}
              </p>
            </div>
          </Card>
        </div>

        {/* Launch Action Card */}
        <Card className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div
            className={
              isReadyToLaunch
                ? "rounded-full bg-green-500/10 p-4 text-green-600"
                : "rounded-full bg-yellow-500/10 p-4 text-yellow-600"
            }
          >
            {isReadyToLaunch ? (
              <CheckCircle2 className="size-12" />
            ) : (
              <AlertTriangle className="size-12" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {isReadyToLaunch
                ? t("extensions:studio.launch.summary", "Ready to Start")
                : t("extensions:studio.launch.unsavedTitle", "Unsaved Changes or Requirements Missing")}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {isReadyToLaunch
                ? t(
                    "extensions:studio.launch.launchNotice",
                    "Launching creates an active game session with an invite code and opens the host presenter interface.",
                  )
                : t(
                    "extensions:studio.launch.unsavedDesc",
                    "Please save your quiz to ensure the live show reflects your latest timeline and question content.",
                  )}
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!isReadyToLaunch || isPending}
            onClick={handleLaunch}
            className="bg-primary text-white font-bold text-lg px-8 py-6 rounded-xl shadow-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
          >
            <Rocket className="size-5" />
            {isPending
              ? t("extensions:studio.launch.launching", "Launching...")
              : t("extensions:studio.launch.launchButton", "Launch Live Show")}
          </Button>
        </Card>
      </div>
    </div>
  )
}
