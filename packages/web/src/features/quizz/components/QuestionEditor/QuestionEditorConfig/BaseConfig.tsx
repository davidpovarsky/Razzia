import { resolveQuestionPlayMode } from "@razzia/extensions/core"
import {
  MAX_POINTS,
  NO_TIME_LIMIT,
  QUESTION_LEAD_IN_SECONDS,
} from "@razzia/common/constants"
import { type ScoringMode } from "@razzia/common/types/game"
import { isMultiOptions } from "@razzia/common/questions/options"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import Button from "@razzia/web/components/Button"
import Switch from "@razzia/web/components/Switch"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import ConfigNumberInput from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigNumberInput"
import ConfigSection from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import CardAudioConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/CardAudioConfig"
import CardBackgroundConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/CardBackgroundConfig"
import QuestionEntranceConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/QuestionEntranceConfig"
import QuestionRevealConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/QuestionRevealConfig"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import {
  ArrowBigDownDash,
  ChevronDown,
  Clock,
  ListChecks,
  Star,
  Timer,
} from "lucide-react"
import { useId } from "react"
import {
  QuestionCustomSettingsNotice,
  useEditorEditingMode,
} from "@razzia/web/features/quizz/components/studio/editor-editing-mode"
import { useTranslation } from "react-i18next"

const DEFAULT_TIME = 20
const DEFAULT_PENALTY = 100

const BaseConfig = () => {
  const { currentQuestion, currentIndex, gameMode, updateQuestion } =
    useQuizzEditor()
  const { t } = useTranslation()
  const { advanced, setAdvanced } = useEditorEditingMode()
  const advancedId = useId()
  const isTimeLimitEnabled = currentQuestion.time !== NO_TIME_LIMIT
  const isPenaltyEnabled = (currentQuestion.penalty ?? 0) > 0
  const { scoringModes } = QUESTION_REGISTRY[currentQuestion.type]
  const { options } = currentQuestion
  const scoringMode = isMultiOptions(options) ? options.scoringMode : undefined

  const handleScoringModeChange = (nextMode: ScoringMode) => {
    updateQuestion(currentIndex, { options: { scoringMode: nextMode } })
  }

  const handleToggleTimeLimit = (checked: boolean) => {
    updateQuestion(currentIndex, {
      time: checked ? DEFAULT_TIME : NO_TIME_LIMIT,
    })
  }

  const handleTogglePenalty = (checked: boolean) => {
    updateQuestion(currentIndex, {
      penalty: checked ? DEFAULT_PENALTY : undefined,
    })
  }

  const scoringOptions = scoringModes?.map((value) => ({
    value,
    label: t(`quizz:question.config.scoringMode.${value}`),
  }))

  return (
    <>
      <ConfigSection title={t("quizz:question.config.timings")}>
        <ConfigField>
          <ConfigField.Label
            icon={<Timer className="size-4" />}
            label={t("quizz:question.config.answerTime")}
            unit={isTimeLimitEnabled ? t("common:seconds") : undefined}
            action={
              <Switch
                aria-label={t("quizz:question.config.answerTime")}
                checked={isTimeLimitEnabled}
                onCheckedChange={handleToggleTimeLimit}
              />
            }
          />
          {isTimeLimitEnabled && (
            <ConfigNumberInput
              name="time"
              label={t("quizz:question.config.answerTime")}
              min={5}
            />
          )}
          <ConfigField.Description>
            {isTimeLimitEnabled
              ? t("quizz:question.config.answerTimeHint")
              : t("quizz:question.config.noTimeLimitHint")}
          </ConfigField.Description>
        </ConfigField>
      </ConfigSection>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="question-advanced-settings-toggle"
          aria-expanded={advanced}
          aria-controls={advancedId}
          onClick={() => setAdvanced(!advanced)}
          className="bg-accent text-accent-foreground w-full justify-between"
        >
          {t("extensions:studio.editing.advancedSettings")}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${advanced ? "rotate-180" : ""}`}
          />
        </Button>
        {!advanced && (
          <>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("extensions:studio.editing.advancedControls")}
            </p>
            <QuestionCustomSettingsNotice />
          </>
        )}
      </div>

      <div
        id={advancedId}
        data-testid="question-advanced-settings"
        hidden={!advanced}
      >
        {advanced && (
          <div className="flex flex-col gap-4">
            {resolveQuestionPlayMode(currentQuestion, gameMode) !==
              "survey" && (
              <ConfigSection title={t("quizz:question.config.scoring")}>
                <ConfigField>
                  <ConfigField.Label
                    icon={<Star className="size-4" />}
                    label={t("quizz:question.config.maxPoints")}
                    unit={t("extensions:tadazzShow.v4.points")}
                  />
                  <ConfigNumberInput
                    name="maxPoints"
                    label={t("quizz:question.config.maxPoints")}
                    fallback={MAX_POINTS}
                    min={0}
                  />
                  <ConfigField.Description>
                    {t("quizz:question.config.maxPointsHint")}
                  </ConfigField.Description>
                </ConfigField>

                <ConfigField>
                  <ConfigField.Label
                    icon={<ArrowBigDownDash className="size-4" />}
                    label={t("quizz:question.config.penalty")}
                    unit={
                      isPenaltyEnabled
                        ? t("extensions:tadazzShow.v4.points")
                        : undefined
                    }
                    action={
                      <Switch
                        aria-label={t("quizz:question.config.penalty")}
                        checked={isPenaltyEnabled}
                        onCheckedChange={handleTogglePenalty}
                      />
                    }
                  />
                  {isPenaltyEnabled && (
                    <ConfigNumberInput
                      name="penalty"
                      label={t("quizz:question.config.penalty")}
                      fallback={DEFAULT_PENALTY}
                      min={1}
                    />
                  )}
                  <ConfigField.Description>
                    {t("quizz:question.config.penaltyHint")}
                  </ConfigField.Description>
                </ConfigField>

                {scoringModes && scoringMode && (
                  <ConfigField>
                    <ConfigField.Label
                      icon={<ListChecks className="size-4" />}
                      label={t("quizz:question.config.scoringMode")}
                    />
                    <ToggleGroup
                      aria-label={t("quizz:question.config.scoringMode")}
                      value={scoringMode}
                      onChange={handleScoringModeChange}
                      items={scoringOptions ?? []}
                      className="h-auto flex-wrap [&>button]:min-h-9 [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2 [&>button]:text-xs"
                    />
                    <ConfigField.Description>
                      {t(
                        `quizz:question.config.scoringModeHint.${scoringMode}`,
                      )}
                    </ConfigField.Description>
                  </ConfigField>
                )}
              </ConfigSection>
            )}

            <ConfigSection title={t("quizz:question.config.timings")}>
              <ConfigField>
                <ConfigField.Label
                  icon={<Clock className="size-4" />}
                  label={t("quizz:question.config.questionDisplay")}
                  unit={t("common:seconds")}
                />
                <output
                  data-testid="system-question-lead-in"
                  aria-label={t("quizz:question.config.questionDisplay")}
                  className="text-sm font-semibold"
                >
                  {QUESTION_LEAD_IN_SECONDS}
                </output>
                <ConfigField.Description>
                  {t("extensions:studio.editing.fixedQuestionLeadIn")}
                </ConfigField.Description>
              </ConfigField>
            </ConfigSection>

            <CardBackgroundConfig />
            <CardAudioConfig kind="question" />
            <QuestionEntranceConfig kind="question" />
            <QuestionRevealConfig />
          </div>
        )}
      </div>
    </>
  )
}

export default BaseConfig
