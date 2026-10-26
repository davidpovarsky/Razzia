import {
  createDefaultRosterExtras,
  isQuizExtrasV2,
  projectLegacyCompat,
  type AnyQuizExtras,
  type QuizExtrasV1,
} from "@razzia/extensions/core"
import { RosterSection } from "@razzia/extensions/editor"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"

export const StudioParticipantsPage = () => {
  const { t } = useTranslation()
  const { extras, setExtras } = useQuizzEditor()

  const safeExtras: QuizExtrasV1 = (() => {
    if (!extras) {
      return {
        schemaVersion: 1,
        revision: 1,
        quizId: "temp-quiz",
        baseDigest: "0".repeat(64),
        questionIds: [],
        leaderboard: { mode: "upstream" },
        teams: { enabled: false, teams: [], autoAssign: "roundRobin" },
        audio: { cues: {} as never },
        perQuestion: {},
        roster: createDefaultRosterExtras(),
      }
    }

    if (isQuizExtrasV2(extras)) {
      return projectLegacyCompat(extras)
    }

    return extras
  })()

  const handleRosterChange = (updated: QuizExtrasV1) => {
    setExtras((prev: AnyQuizExtras | null) => {
      if (!prev) {
        return updated
      }

      if (isQuizExtrasV2(prev)) {
        return {
          ...prev,
          roster: updated.roster ?? createDefaultRosterExtras(),
        }
      }

      return {
        ...prev,
        roster: updated.roster,
      }
    })
  }

  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-muted/40 p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1 border-b border-accent pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Users className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("extensions:studio.tabs.participants", "Participants & Phone Roster")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "extensions:studio.participants.subtitle",
                  "Manage registered attendees, telephone numbers, spreadsheet imports, and admission policies.",
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-accent bg-background p-6 shadow-sm">
          <RosterSection
            extras={safeExtras}
            onChange={handleRosterChange}
            tr={tr}
          />
        </div>
      </div>
    </div>
  )
}
