// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import {
  isLegacyShowRollback,
  QUESTION_DECORATION_PRESETS,
  QUESTION_ENTRANCE_PRESETS,
  resolveCardStageAnimations,
  resolveQuestionDecoration,
  validateLottieJson,
  type CardStageAnimations,
  type QuestionDecoration,
  type QuestionDecorationPreset,
  type QuestionEntrancePreset,
  type StageAnimationSlot,
} from "@razzia/extensions/core"
import { useStudioEditor } from "@razzia/web/features/quizz/components/studio/studio-editor-context"
import { ThemeScopeControls } from "@razzia/web/features/quizz/components/studio/theme-scope-controls"
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
import { Play, RotateCcw, Sparkles, Upload } from "lucide-react"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
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
const LegacyQuestionEntranceConfig = ({
  kind = "question",
  sceneStageAnimations,
  onSceneStageAnimationsChange,
}: QuestionEntranceConfigProps = {}) => {
  const { currentQuestionId, extras, setExtras } = useQuizzEditor()
  const { t } = useTranslation()
  const [previewEpoch, setPreviewEpoch] = useState(0)
  const lottieInputRef = useRef<HTMLInputElement | null>(null)
  const v2Defaults =
    extras && "defaults" in extras ? extras.defaults : undefined
  const globalStageAnimations = v2Defaults?.stageAnimations
  const globalQuestionDecoration = v2Defaults?.questionDecoration
  const currentItem =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const cardStageAnimations =
    kind === "scene" ? sceneStageAnimations : currentItem?.stageAnimations
  const resolved = resolveCardStageAnimations(
    kind === "scene"
      ? {
          stageAnimations: sceneStageAnimations,
          globalStageAnimations,
        }
      : {
          questionEntrance: currentItem?.questionEntrance,
          stageAnimations: currentItem?.stageAnimations,
          globalStageAnimations,
        },
  )
  const resolvedDecoration = resolveQuestionDecoration({
    cardDecoration: currentItem?.questionDecoration,
    globalDecoration: globalQuestionDecoration,
  })
  const preset: QuestionEntrancePreset = resolved.questionEntrance.preset
  const durationMs: number =
    resolved.questionEntrance.durationMs ?? DEFAULT_DURATION_MS
  const getSlotSelectValue = (slotKey: SlotKey): string => {
    const explicitSlot = cardStageAnimations?.[slotKey]

    if (explicitSlot) {
      return explicitSlot.preset
    }

    if (
      slotKey === "questionEntrance" &&
      kind === "question" &&
      currentItem?.questionEntrance?.preset
    ) {
      return currentItem.questionEntrance.preset
    }

    if (
      globalStageAnimations?.[slotKey]?.preset &&
      globalStageAnimations[slotKey].preset !== "none"
    ) {
      return "__inherit__"
    }

    return resolved[slotKey].preset
  }
  const updateSlot = (
    slotKey: SlotKey,
    nextSlot: StageAnimationSlot | undefined,
  ) => {
    if (kind === "scene") {
      const nextMap: CardStageAnimations = {
        ...(sceneStageAnimations ?? {}),
      }

      if (nextSlot === undefined) {
        /* oxlint-disable typescript/no-dynamic-delete -- Remove a keyed optional override from its mutable dictionary without replacing object identity. */
        delete nextMap[slotKey]
        /* oxlint-enable typescript/no-dynamic-delete */
      } else {
        nextMap[slotKey] = nextSlot
      }

      onSceneStageAnimationsChange?.(
        Object.keys(nextMap).length > 0 ? nextMap : undefined,
      )
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
      }

      if (nextSlot === undefined) {
        /* oxlint-disable typescript/no-dynamic-delete -- Remove a keyed optional override from its mutable dictionary without replacing object identity. */
        delete nextStageAnimations[slotKey]
        /* oxlint-enable typescript/no-dynamic-delete */
      } else {
        nextStageAnimations[slotKey] = nextSlot
      }

      const nextPerQItem = {
        ...existingItem,
        stageAnimations:
          Object.keys(nextStageAnimations).length > 0
            ? nextStageAnimations
            : undefined,
      }

      if (slotKey === "questionEntrance") {
        if (nextSlot === undefined) {
          delete nextPerQItem.questionEntrance
        } else {
          nextPerQItem.questionEntrance = {
            preset: nextSlot.preset,
            durationMs: nextSlot.durationMs,
          }
        }
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: nextPerQItem,
        },
      }
    })
    setPreviewEpoch((p) => p + 1)
  }
  const handlePresetChange = (val: string) => {
    if (val === "__inherit__") {
      updateSlot("questionEntrance", undefined)

      return
    }

    const newPreset = val as QuestionEntrancePreset
    updateSlot("questionEntrance", {
      ...resolved.questionEntrance,
      preset: newPreset,
      durationMs,
    })
  }
  const updateQuestionDecoration = (
    nextDec: QuestionDecoration | undefined,
  ) => {
    if (!currentQuestionId) {
      return
    }

    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = existingPerQ[currentQuestionId] ?? {}
      const updatedItem = {
        ...existingItem,
      }

      if (nextDec === undefined) {
        delete updatedItem.questionDecoration
      } else {
        updatedItem.questionDecoration = nextDec
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: updatedItem,
        },
      }
    })
    setPreviewEpoch((p) => p + 1)
  }
  const handleLottieDecorationUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ""

    if (!file) {
      return
    }

    try {
      const rawText = await file.text()
      const validation = validateLottieJson(rawText)

      if (!validation.ok) {
        toast.error(validation.error ?? "Invalid Lottie JSON file")

        return
      }

      const token = localStorage.getItem("token")
      const res = await fetch("/api/extensions/lottie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          name: file.name,
          content: rawText,
          role: "questionUnderline",
        }),
      })

      if (!res.ok) {
        toast.error("Failed to upload Lottie file")

        return
      }

      const data = (await res.json()) as {
        url: string
      }
      updateQuestionDecoration({
        enabled: true,
        preset: "lottie",
        lottieUrl: data.url,
        color: currentItem?.questionDecoration?.color,
      })
      toast.success("Lottie animation uploaded")
    } catch {
      toast.error("Failed to upload Lottie file")
    }
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
  const getPresetLabel = (p: QuestionEntrancePreset) => {
    switch (p) {
      case "none":
        return t("extensions:entrance.none", "Regular / None")

      case "fade":
        return t("extensions:entrance.fade", "Fade In")

      case "slide-up":
        return t("extensions:entrance.slideUp", "Slide Up")

      case "slide-side":
        return t("extensions:entrance.slideSide", "Slide Side")

      case "zoom-soft":
        return t("extensions:entrance.zoomSoft", "Soft Zoom")

      case "spotlight":
        return t("extensions:entrance.spotlight", "Spotlight")

      case "curtain":
        return t("extensions:entrance.curtain", "Curtain")

      case "pop-bounce":
        return t("extensions:entrance.popBounce", "Pop Bounce")

      case "wobble-settle":
        return t("extensions:entrance.wobbleSettle", "Wobble Settle")

      case "cascade":
        return t("extensions:entrance.cascade", "Cascade")

      case "fan-flip":
        return t("extensions:entrance.fanFlip", "Fan Flip")

      case "wipe-ripple":
        return t("extensions:entrance.wipeRipple", "Wipe Ripple")

      default:
        return p
    }
  }
  const renderPresetItems = (slotKey: SlotKey) => {
    const globalSlotPreset = globalStageAnimations?.[slotKey]?.preset
    const hasGlobalSlot = Boolean(
      globalSlotPreset && globalSlotPreset !== "none",
    )

    return (
      <>
        {hasGlobalSlot && (
          <SelectItem value="__inherit__">
            {t("extensions:entrance.inheritGlobal", "Inherit Global Default")} (
            {getPresetLabel(globalSlotPreset ?? "none")})
          </SelectItem>
        )}
        {QUESTION_ENTRANCE_PRESETS.map((p) => (
          <SelectItem key={p} value={p}>
            {getPresetLabel(p)}
          </SelectItem>
        ))}
      </>
    )
  }
  const renderAdditionalSlot = (
    slotKey: "answerEntrance" | "answerBadgeEntrance" | "resultsRevealEntrance",
    label: string,
  ) => {
    const slotCfg = resolved[slotKey]
    const selectVal = getSlotSelectValue(slotKey)

    return (
      <div
        key={slotKey}
        data-testid={`stage-anim-slot-${slotKey}`}
        className="border-accent/60 bg-muted/30 flex flex-col gap-2 rounded-xl border p-2.5"
      >
        <span className="text-foreground text-xs font-bold">{label}</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            value={selectVal}
            onValueChange={(val) => {
              if (val === "__inherit__") {
                updateSlot(slotKey, undefined)

                return
              }

              updateSlot(slotKey, {
                ...slotCfg,
                preset: val as QuestionEntrancePreset,
              })
            }}
          >
            <SelectTrigger
              data-testid={`stage-anim-preset-${slotKey}`}
              aria-label={label}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{renderPresetItems(slotKey)}</SelectContent>
          </Select>

          {slotCfg.preset !== "none" && (
            <div
              data-testid={`stage-anim-timing-${slotKey}`}
              className="bg-muted flex items-center gap-1 rounded-lg p-0.5"
            >
              {(["simultaneous", "sequential"] as const).map((tm) => (
                <Button
                  size="sm"
                  key={tm}
                  type="button"
                  data-testid={`stage-anim-timing-${slotKey}-${tm}`}
                  onClick={() =>
                    updateSlot(slotKey, {
                      ...slotCfg,
                      timing: tm,
                    })
                  }
                  className={clsx(
                    "flex-1 rounded-md bg-transparent px-1.5 py-1 text-[10px] font-semibold transition",
                    slotCfg.timing === tm
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tm === "simultaneous"
                    ? t("extensions:stageMotion.simultaneous", "All Together")
                    : t("extensions:stageMotion.sequential", "One by One")}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  const decorationSelectValue = (() => {
    if (currentItem?.questionDecoration) {
      return !currentItem.questionDecoration.enabled
        ? "none"
        : currentItem.questionDecoration.preset
    }

    if (
      globalQuestionDecoration?.enabled &&
      globalQuestionDecoration.preset !== "none"
    ) {
      return "__inherit__"
    }

    return "none"
  })()
  const anyPresetActive =
    preset !== "none" ||
    resolved.answerEntrance.preset !== "none" ||
    resolved.answerBadgeEntrance.preset !== "none" ||
    resolved.resultsRevealEntrance.preset !== "none" ||
    resolvedDecoration.enabled

  return (
    <ConfigSection title={t("extensions:entrance.title", "Entrance Animation")}>
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
            value={getSlotSelectValue("questionEntrance")}
            onValueChange={handlePresetChange}
          >
            <SelectTrigger
              data-testid="stage-anim-preset-questionEntrance"
              aria-label={t("extensions:entrance.preset", "Animation Preset")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {renderPresetItems("questionEntrance")}
            </SelectContent>
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
          <>
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

            {/* Decorative Question Underline */}
            <div
              data-testid="question-decoration-section"
              className="border-accent/60 bg-muted/30 flex flex-col gap-2 rounded-xl border p-2.5"
            >
              <span className="text-foreground text-xs font-bold">
                {t(
                  "extensions:stageMotion.decorationTitle",
                  "Question Underline Effect",
                )}
              </span>
              <Select
                value={decorationSelectValue}
                onValueChange={(val) => {
                  if (val === "__inherit__") {
                    updateQuestionDecoration(undefined)

                    return
                  }

                  if (val === "none") {
                    updateQuestionDecoration({
                      enabled: false,
                      preset: "none",
                    })

                    return
                  }

                  updateQuestionDecoration({
                    enabled: true,
                    preset: val as QuestionDecorationPreset,
                    color: currentItem?.questionDecoration?.color,
                    lottieUrl: currentItem?.questionDecoration?.lottieUrl,
                  })
                }}
              >
                <SelectTrigger
                  data-testid="question-decoration-preset"
                  aria-label={t(
                    "extensions:stageMotion.decorationTitle",
                    "Question Underline Effect",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {globalQuestionDecoration?.enabled &&
                    globalQuestionDecoration.preset !== "none" && (
                      <SelectItem value="__inherit__">
                        {t(
                          "extensions:stageMotion.decorationInherit",
                          "Inherit Global Default",
                        )}
                      </SelectItem>
                    )}
                  {QUESTION_DECORATION_PRESETS.map((dp) => (
                    <SelectItem key={dp} value={dp}>
                      {dp === "none" &&
                        t("extensions:stageMotion.decorationNone", "None")}
                      {dp === "pulse-bar" &&
                        t(
                          "extensions:stageMotion.decorationPulseBar",
                          "Pulse Bar",
                        )}
                      {dp === "shimmer-line" &&
                        t(
                          "extensions:stageMotion.decorationShimmerLine",
                          "Shimmer Line",
                        )}
                      {dp === "wave-dots" &&
                        t(
                          "extensions:stageMotion.decorationWaveDots",
                          "Wave Dots",
                        )}
                      {dp === "glow-sweep" &&
                        t(
                          "extensions:stageMotion.decorationGlowSweep",
                          "Glow Sweep",
                        )}
                      {dp === "lottie" &&
                        t(
                          "extensions:stageMotion.decorationLottie",
                          "Custom Lottie",
                        )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {resolvedDecoration.enabled &&
                resolvedDecoration.preset === "lottie" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        data-testid="question-decoration-lottie-url"
                        value={resolvedDecoration.lottieUrl ?? ""}
                        onChange={(e) =>
                          updateQuestionDecoration({
                            enabled: true,
                            preset: "lottie",
                            lottieUrl: e.target.value,
                            color: resolvedDecoration.color,
                          })
                        }
                        placeholder="/media/underline.json"
                        className="flex-1 text-xs"
                      />
                      <input
                        ref={lottieInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleLottieDecorationUpload}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 shrink-0 px-2.5 text-xs"
                        onClick={() => lottieInputRef.current?.click()}
                      >
                        <Upload className="mr-1 size-3.5" />
                        {t(
                          "extensions:studio.scene.lottieUploadButton",
                          "Upload Lottie (.json)",
                        )}
                      </Button>
                    </div>
                  </div>
                )}

              <p className="text-muted-foreground text-[11px]">
                {t(
                  "extensions:stageMotion.decorationDesc",
                  "Optional decorative visual accent under the question title (never replaces the authoritative round timer).",
                )}
              </p>
            </div>
          </>
        )}

        {anyPresetActive && (
          <div
            data-testid="stage-anim-preview-box"
            className="border-border/40 bg-muted/20 flex flex-col gap-2 rounded-lg border p-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {t("extensions:entrance.preview", "Preview")}
              </span>
              <Button
                size="sm"
                type="button"
                className="h-7 px-2.5 text-xs"
                onClick={handleTriggerPreview}
                aria-label={t("extensions:entrance.replay", "Replay")}
              >
                <RotateCcw className="mr-1 size-3" />
                {t("extensions:entrance.replay", "Replay")}
              </Button>
            </div>

            <div
              key={previewEpoch}
              className={clsx(
                "border-primary/30 bg-background/80 relative overflow-hidden rounded-md border p-3 shadow-sm",
                preset !== "none" && `tada-entrance-${preset}`,
              )}
              style={{
                animationDuration: `${durationMs}ms`,
                animationFillMode: "both",
              }}
            >
              <div className="flex flex-col gap-1.5">
                <div className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                  <Play className="text-primary size-3 shrink-0" />
                  <span className="truncate">
                    {t(
                      "extensions:entrance.previewQuestion",
                      "Question Preview",
                    )}
                  </span>
                </div>
                {kind === "question" &&
                  resolvedDecoration.enabled &&
                  resolvedDecoration.preset !== "none" && (
                    <div
                      data-testid="question-decoration-preview"
                      className={clsx(
                        "h-1.5 w-full rounded-full",
                        `tada-underline-${resolvedDecoration.preset}`,
                      )}
                      style={
                        resolvedDecoration.color
                          ? {
                              backgroundColor: resolvedDecoration.color,
                            }
                          : undefined
                      }
                    />
                  )}
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
                        "bg-primary/10 text-primary flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium",
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
                          "bg-primary inline-flex size-4 items-center justify-center rounded text-[9px] font-bold text-white",
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
const QuestionEntranceConfig = (props: QuestionEntranceConfigProps = {}) => {
  const { defaults } = useStudioEditor()

  return isLegacyShowRollback(defaults) ? (
    <LegacyQuestionEntranceConfig {...props} />
  ) : (
    <ThemeScopeControls section="motion" kind={props.kind} />
  )
}

export default QuestionEntranceConfig
