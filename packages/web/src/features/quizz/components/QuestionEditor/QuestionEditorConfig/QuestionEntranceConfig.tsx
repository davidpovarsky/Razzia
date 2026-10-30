import {
  QUESTION_ENTRANCE_PRESETS,
  type QuestionEntrancePreset,
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
import { Sparkles, Play, RotateCcw } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const DEFAULT_DURATION_MS = 800
const MIN_DURATION_MS = 250
const MAX_DURATION_MS = 2500

const QuestionEntranceConfig = () => {
  const { currentQuestionId, extras, setExtras } = useQuizzEditor()
  const { t } = useTranslation()

  const currentItem = currentQuestionId && extras?.perQuestion
    ? extras.perQuestion[currentQuestionId]
    : undefined
  const currentEntrance = currentItem?.questionEntrance

  const preset: QuestionEntrancePreset = currentEntrance?.preset ?? "none"
  const durationMs: number = currentEntrance?.durationMs ?? DEFAULT_DURATION_MS

  const [previewEpoch, setPreviewEpoch] = useState(0)

  const handlePresetChange = (newPreset: QuestionEntrancePreset) => {
    if (!currentQuestionId) {
      return
    }

    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = existingPerQ[currentQuestionId] ?? {}

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: {
            ...existingItem,
            questionEntrance: {
              preset: newPreset,
              ...(newPreset !== "none" ? { durationMs } : {}),
            },
          },
        },
      }
    })

    setPreviewEpoch((p) => p + 1)
  }

  const handleDurationChange = (raw: string) => {
    if (!currentQuestionId) {
      return
    }

    const num = Number(raw)
    if (isNaN(num)) {
      return
    }

    const clamped = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, num))

    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = existingPerQ[currentQuestionId] ?? {}

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: {
            ...existingItem,
            questionEntrance: {
              preset,
              durationMs: clamped,
            },
          },
        },
      }
    })
  }

  const handleTriggerPreview = () => {
    setPreviewEpoch((p) => p + 1)
  }

  return (
    <ConfigSection title={t("extensions:entrance.title", "Entrance Animation")}>
      <ConfigField>
        <ConfigField.Label
          icon={<Sparkles className="size-4" />}
          label={t("extensions:entrance.preset", "Animation Preset")}
        />
        <Select
          value={preset}
          onValueChange={(val) => handlePresetChange(val as QuestionEntrancePreset)}
        >
          <SelectTrigger aria-label={t("extensions:entrance.preset", "Animation Preset")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_ENTRANCE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "none" && t("extensions:entrance.none", "Regular / None")}
                {p === "fade" && t("extensions:entrance.fade", "Fade In")}
                {p === "slide-up" && t("extensions:entrance.slideUp", "Slide Up")}
                {p === "slide-side" && t("extensions:entrance.slideSide", "Slide Side")}
                {p === "zoom-soft" && t("extensions:entrance.zoomSoft", "Soft Zoom")}
                {p === "spotlight" && t("extensions:entrance.spotlight", "Spotlight")}
                {p === "curtain" && t("extensions:entrance.curtain", "Curtain")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ConfigField.Description>
          {t("extensions:entrance.description", "Play an entrance transition when this question appears.")}
        </ConfigField.Description>
      </ConfigField>

      {preset !== "none" && (
        <>
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
              value={durationMs}
              onChange={(e) => handleDurationChange(e.target.value)}
              aria-label={t("extensions:entrance.duration", "Duration (ms)")}
            />
          </ConfigField>

          <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5">
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
                `tada-entrance-${preset}`,
              )}
              style={{
                animationDuration: `${durationMs}ms`,
                animationFillMode: "both",
              }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Play className="size-3 text-primary shrink-0" />
                <span className="truncate">{t("extensions:entrance.previewQuestion", "Question Preview")}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <div className="rounded bg-primary/10 px-2 py-1 text-center text-[10px] font-medium text-primary">
                  {t("extensions:entrance.previewOptionA", "Option A")}
                </div>
                <div className="rounded bg-accent/40 px-2 py-1 text-center text-[10px] font-medium text-foreground">
                  {t("extensions:entrance.previewOptionB", "Option B")}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </ConfigSection>
  )
}

export default QuestionEntranceConfig
