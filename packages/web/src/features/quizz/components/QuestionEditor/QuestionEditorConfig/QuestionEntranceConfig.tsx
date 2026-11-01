import {
  QUESTION_ENTRANCE_PRESETS,
  resolveCardStageAnimations,
  type CardStageAnimations,
  type QuestionEntrancePreset,
  type StageAnimationSlot,
  type StageAnimationTiming,
} from "@razzia/extensions/core"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import ConfigSection from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Play, RotateCcw, Sparkles } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const DEFAULT_DURATION_MS = 800
const MIN_DURATION_MS = 250
const MAX_DURATION_MS = 2500

type SlotKey = keyof CardStageAnimations

interface QuestionEntranceConfigProps {
  kind?: "question" | "scene"
  sceneStageAnimations?: CardStageAnimations
  onSceneStageAnimationsChange?: (next: CardStageAnimations | undefined) => void
}

const QuestionEntranceConfig = ({
  kind = "question",
  sceneStageAnimations,
  onSceneStageAnimationsChange,
}: QuestionEntranceConfigProps = {}) => {
  const { currentQuestionId, extras, setExtras } = useQuizzEditor()
  const { t } = useTranslation()
  const [previewEpoch, setPreviewEpoch] = useState(0)

  const currentItem =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined

  const resolved = resolveCardStageAnimations(
    kind === "scene"
      ? { stageAnimations: sceneStageAnimations }
      : {
          questionEntrance: currentItem?.questionEntrance,
          stageAnimations: currentItem?.stageAnimations,
        },
  )

  const preset: QuestionEntrancePreset = resolved.questionEntrance.preset
  const durationMs: number =
    resolved.questionEntrance.durationMs ?? DEFAULT_DURATION_MS

  const updateSlot = (slotKey: SlotKey, nextSlot: StageAnimationSlot) => {
    if (kind === "scene") {
      const nextMap: CardStageAnimations = {
        ...(sceneStageAnimations ?? {}),
        [slotKey]: nextSlot,
      }
      onSceneStageAnimationsChange?.(nextMap)
      setPreviewEpoch((p) => p + 1)
      return
    }

    if (!currentQuestionId) {
      return
    }

    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = existingPerQ[currentQuestionId] ?? {}
      const nextStageAnimations: CardStageAnimations = {
        ...(existingItem.stageAnimations ?? {}),
        [slotKey]: nextSlot,
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: {
            ...existingItem,
            ...(slotKey === "questionEntrance"
              ? {
                  questionEntrance: {
                    preset: nextSlot.preset,
                    ...(nextSlot.preset !== "none"
                      ? { durationMs: nextSlot.durationMs }
                      : {}),
                  },
                }
              : {}),
            stageAnimations: nextStageAnimations,
          },
        },
      }
    })

    setPreviewEpoch((p) => p + 1)
  }

  const handlePresetChange = (newPreset: QuestionEntrancePreset) => {
    updateSlot("questionEntrance", {
      ...resolved.questionEntrance,
      preset: newPreset,
      durationMs,
    })
  }

  const handleDurationChange = (raw: string) => {
    const num = Number(raw)
    if (Number.isNaN(num)) {
      return
    }
    const clamped = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, num))
    updateSlot("questionEntrance", {
      ...resolved.questionEntrance,
      preset,
      durationMs: clamped,
    })
  }

  const handleTriggerPreview = () => {
    setPreviewEpoch((p) => p + 1)
  }

  const renderPresetItems = () =>
    QUESTION_ENTRANCE_PRESETS.map((p) => (
      <SelectItem key={p} value={p}>
        {p === "none" && t("extensions:entrance.none", "Regular / None")}
        {p === "fade" && t("extensions:entrance.fade", "Fade In")}
        {p === "slide-up" && t("extensions:entrance.slideUp", "Slide Up")}
        {p === "slide-side" && t("extensions:entrance.slideSide", "Slide Side")}
        {p === "zoom-soft" && t("extensions:entrance.zoomSoft", "Soft Zoom")}
        {p === "spotlight" && t("extensions:entrance.spotlight", "Spotlight")}
        {p === "curtain" && t("extensions:entrance.curtain", "Curtain")}
      </SelectItem>
    ))

  const renderAdditionalSlot = (
    slotKey: "answerEntrance" | "answerBadgeEntrance" | "resultsRevealEntrance",
    label: string,
  ) => {
    const slotCfg = resolved[slotKey]
    return (
      <div
        key={slotKey}
        data-testid={`stage-anim-slot-${slotKey}`}
        className="border-accent/60 bg-muted/30 flex flex-col gap-2 rounded-xl border p-2.5"
      >
        <span className="text-foreground text-xs font-bold">{label}</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            value={slotCfg.preset}
            onValueChange={(val) =>
              updateSlot(slotKey, {
                ...slotCfg,
                preset: val as QuestionEntrancePreset,
              })
            }
          >
            <SelectTrigger
              data-testid={`stage-anim-preset-${slotKey}`}
              aria-label={label}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{renderPresetItems()}</SelectContent>
          </Select>

          {slotCfg.preset !== "none" && (
            <div
              data-testid={`stage-anim-timing-${slotKey}`}
              className="flex items-center gap-1 rounded-lg bg-muted p-0.5"
            >
              {(["simultaneous", "sequential"] as const).map((tm) => (
                <button
                  key={tm}
                  type="button"
                  data-testid={`stage-anim-timing-${slotKey}-${tm}`}
                  onClick={() =>
                    updateSlot(slotKey, {
                      ...slotCfg,
                      timing: tm as StageAnimationTiming,
                    })
                  }
                  className={clsx(
                    "flex-1 rounded-md px-1.5 py-1 text-[10px] font-semibold transition",
                    slotCfg.timing === tm
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tm === "simultaneous"
                    ? t("extensions:stageMotion.simultaneous", "All Together")
                    : t("extensions:stageMotion.sequential", "One by One")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const anyPresetActive =
    preset !== "none" ||
    resolved.answerEntrance.preset !== "none" ||
    resolved.answerBadgeEntrance.preset !== "none" ||
    resolved.resultsRevealEntrance.preset !== "none"

  return (
    <ConfigSection
      title={t("extensions:entrance.title", "Entrance Animation")}
    >
      <div
        data-testid="staged-animation-section"
        className="flex flex-col gap-3"
      >
        <ConfigField>
          <ConfigField.Label
            icon={<Sparkles className="size-4" />}
            label={t(
              "extensions:stageMotion.slotQuestion",
              "Question Title & Media",
            )}
          />
          <Select
            value={preset}
            onValueChange={(val) =>
              handlePresetChange(val as QuestionEntrancePreset)
            }
          >
            <SelectTrigger
              data-testid="stage-anim-preset-questionEntrance"
              aria-label={t("extensions:entrance.preset", "Animation Preset")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{renderPresetItems()}</SelectContent>
          </Select>
          <ConfigField.Description>
            {t(
              "extensions:entrance.description",
              "Play an entrance transition when this question appears.",
            )}
          </ConfigField.Description>
        </ConfigField>

        {preset !== "none" && (
          <ConfigField>
            <ConfigField.Label
              label={t("extensions:entrance.duration", "Duration (ms)")}
              unit="ms"
            />
            <Input
              type="number"
              variant="sm"
              min={MIN_DURATION_MS}
              max={MAX_DURATION_MS}
              step={50}
              data-testid="stage-anim-duration-questionEntrance"
              value={durationMs}
              onChange={(e) => handleDurationChange(e.target.value)}
              aria-label={t("extensions:entrance.duration", "Duration (ms)")}
            />
          </ConfigField>
        )}

        {kind === "question" && (
          <div className="flex flex-col gap-2">
            {renderAdditionalSlot(
              "answerEntrance",
              t("extensions:stageMotion.slotAnswers", "Answer Cards"),
            )}
            {renderAdditionalSlot(
              "answerBadgeEntrance",
              t("extensions:stageMotion.slotBadges", "Key Badges (1-5)"),
            )}
            {renderAdditionalSlot(
              "resultsRevealEntrance",
              t("extensions:stageMotion.slotResults", "Results Reveal"),
            )}
          </div>
        )}

        {anyPresetActive && (
          <div
            data-testid="stage-anim-preview-box"
            className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("extensions:entrance.preview", "Preview")}
              </span>
              <Button
                size="sm"
                variant="sm"
                type="button"
                className="h-7 px-2.5 text-xs"
                onClick={handleTriggerPreview}
                aria-label={t("extensions:entrance.replay", "Replay")}
              >
                <RotateCcw className="size-3 mr-1" />
                {t("extensions:entrance.replay", "Replay")}
              </Button>
            </div>

            <div
              key={previewEpoch}
              className={clsx(
                "relative overflow-hidden rounded-md border border-primary/30 bg-background/80 p-3 shadow-sm",
                preset !== "none" && `tada-entrance-${preset}`,
              )}
              style={{
                animationDuration: `${durationMs}ms`,
                animationFillMode: "both",
              }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Play className="size-3 text-primary shrink-0" />
                <span className="truncate">
                  {t("extensions:entrance.previewQuestion", "Question Preview")}
                </span>
              </div>
              {kind === "question" && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {[
                    t("extensions:entrance.previewOptionA", "Option A"),
                    t("extensions:entrance.previewOptionB", "Option B"),
                  ].map((optLabel, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "flex items-center gap-1.5 rounded bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary",
                        resolved.answerEntrance.preset !== "none" &&
                          `tada-entrance-${resolved.answerEntrance.preset}`,
                      )}
                      style={{
                        animationDuration: `${resolved.answerEntrance.durationMs}ms`,
                        animationDelay:
                          resolved.answerEntrance.timing === "sequential"
                            ? `${idx * resolved.answerEntrance.staggerMs}ms`
                            : "0ms",
                        animationFillMode: "both",
                      }}
                    >
                      <span
                        className={clsx(
                          "inline-flex size-4 items-center justify-center rounded bg-primary text-[9px] font-bold text-white",
                          resolved.answerBadgeEntrance.preset !== "none" &&
                            `tada-entrance-${resolved.answerBadgeEntrance.preset}`,
                        )}
                        style={{
                          animationDuration: `${resolved.answerBadgeEntrance.durationMs}ms`,
                          animationDelay:
                            resolved.answerBadgeEntrance.timing === "sequential"
                              ? `${idx * resolved.answerBadgeEntrance.staggerMs}ms`
                              : "0ms",
                          animationFillMode: "both",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate">{optLabel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ConfigSection>
  )
}

export default QuestionEntranceConfig
