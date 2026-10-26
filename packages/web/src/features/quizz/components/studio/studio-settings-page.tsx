import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import {
  PlaySquare,
  Settings as SettingsIcon,
  Timer,
  Trophy,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"
import { StudioSelect } from "./studio-select"

export const StudioSettingsPage = () => {
  const { t } = useTranslation()
  const { defaults, updateDefaults, bulkApplyQuestionMode } = useStudioEditor()

  const newQuestionModeItems = [
    {
      value: "quiz",
      label: `${t("extensions:timeline.quiz", "Quiz")} — ${t("extensions:studio.settings.scoredRequired", "Scored, solution required")}`,
    },
    {
      value: "survey",
      label: `${t("extensions:timeline.survey", "Survey")} — ${t("extensions:studio.settings.unscoredOpinion", "Unscored, opinion distribution")}`,
    },
  ]

  const leaderboardPolicyItems = [
    {
      value: "cardOnly",
      label: t("extensions:studio.settings.policyCardOnly", "Timeline cards only"),
    },
    {
      value: "upstream",
      label: t("extensions:studio.settings.policyUpstream", "Standard Razzia rule"),
    },
    {
      value: "everyN",
      label: t("extensions:studio.settings.policyEveryN", "Every N questions"),
    },
    {
      value: "disabled",
      label: t("extensions:studio.settings.policyDisabled", "Disabled"),
    },
  ]

  const advanceModeItems = [
    {
      value: "auto",
      label: t("extensions:studio.settings.autoAdvance", "Automatic (timer completion)"),
    },
    {
      value: "manual",
      label: t("extensions:studio.settings.manualAdvance", "Manual (host advances)"),
    },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-muted/40 p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center gap-3 border-b border-accent pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <SettingsIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("extensions:studio.settings.globalTitle", "Studio Settings & Defaults")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "extensions:studio.settings.subtitle",
                "Configure timeline show defaults, card creation behaviors, and global presentation policies.",
              )}
            </p>
          </div>
        </div>

        <Card className="w-full max-w-none flex flex-col gap-6 p-6 md:p-8">
          {/* Default Question Mode */}
          <ConfigField>
            <ConfigField.Label
              icon={<PlaySquare className="size-4 text-primary" />}
              label={t(
                "extensions:studio.settings.newQuestionMode",
                "Default Mode for New Cards",
              )}
            />
            <ConfigField.Description>
              {t(
                "extensions:studio.settings.newCardsDescription",
                "New question cards added to the timeline will automatically use this mode.",
              )}
            </ConfigField.Description>
            <StudioSelect
              value={defaults.newQuestionMode}
              onChange={(val: string) =>
                updateDefaults({ newQuestionMode: val as "quiz" | "survey" })
              }
              items={newQuestionModeItems}
            />
          </ConfigField>

          {/* Bulk Action */}
          <div className="rounded-lg border border-accent bg-accent/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">
                {t(
                  "extensions:studio.settings.applyAllQuestions",
                  "Apply to All Existing Question Cards",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("extensions:studio.settings.bulkDescription", {
                  mode: defaults.newQuestionMode,
                  defaultValue: `Bulk converts all questions in this show to ${defaults.newQuestionMode}.`,
                })}
              </p>
            </div>
            <AlertDialog
              title={t(
                "extensions:studio.settings.applyAllConfirm",
                "Convert all existing question cards to this mode?",
              )}
              description={t("extensions:studio.settings.bulkConfirmDesc", {
                mode: defaults.newQuestionMode,
                defaultValue: `This will set all existing questions to ${defaults.newQuestionMode} mode.`,
              })}
              confirmLabel={t("extensions:studio.settings.convertAll", "Convert All")}
              onConfirm={() => {
                bulkApplyQuestionMode(defaults.newQuestionMode)
              }}
              trigger={
                <Button
                  type="button"
                  size="sm"
                  className="bg-accent text-accent-foreground font-semibold"
                >
                  {t("extensions:studio.settings.convertAll", "Convert All")}
                </Button>
              }
            />
          </div>

          <hr className="border-accent" />

          {/* Leaderboard Policy */}
          <ConfigField>
            <ConfigField.Label
              icon={<Trophy className="size-4 text-primary" />}
              label={t(
                "extensions:studio.settings.leaderboardPolicy",
                "Leaderboard Policy",
              )}
            />
            <ConfigField.Description>
              {t(
                "extensions:studio.settings.leaderboardPolicyDesc",
                "Control when ranking leaderboards are displayed during live gameplay.",
              )}
            </ConfigField.Description>
            <StudioSelect
              value={defaults.leaderboardPolicy}
              onChange={(val: string) =>
                updateDefaults({
                  leaderboardPolicy: val as
                    | "upstream"
                    | "everyN"
                    | "cardOnly"
                    | "disabled",
                })
              }
              items={leaderboardPolicyItems}
            />
          </ConfigField>

          <hr className="border-accent" />

          {/* Advance Mode */}
          <ConfigField>
            <ConfigField.Label
              icon={<Timer className="size-4 text-primary" />}
              label={t(
                "extensions:studio.settings.advanceMode",
                "Advance Mode",
              )}
            />
            <ConfigField.Description>
              {t(
                "extensions:studio.settings.advanceModeDesc",
                "Default advance trigger when transitioning across timeline scenes.",
              )}
            </ConfigField.Description>
            <StudioSelect
              value={defaults.advanceMode}
              onChange={(val: string) =>
                updateDefaults({ advanceMode: val as "auto" | "manual" })
              }
              items={advanceModeItems}
            />
          </ConfigField>
        </Card>
      </div>
    </div>
  )
}
