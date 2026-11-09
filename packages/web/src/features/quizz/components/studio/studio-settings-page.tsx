import {
  isLegacyShowRollback,
  QUESTION_DECORATION_PRESETS,
  QUESTION_ENTRANCE_PRESETS,
  resolveCardStageAnimations,
  resolveQuestionDecoration,
  resolveTadazzStageBackground,
  tadazzShowBackgroundSchema,
  type TadazzShowBackground,
  type CardStageAnimations,
  type QuestionDecorationPreset,
  type QuestionEntrancePreset,
  type StageAnimationTiming,
} from "@razzia/extensions/core"
import { ShowThemeSettings } from "./show-theme-settings"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import {
  TADAZZ_IMAGE_URL,
  TadazzAnimatedBackdrop,
} from "@razzia/extensions/presentation"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import {
  PlaySquare,
  Settings as SettingsIcon,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { useStudioEditor } from "./studio-editor-context"
import { StudioSelect } from "./studio-select"

export const StudioSettingsPage = () => {
  const { t } = useTranslation()
  const { defaults, updateDefaults, bulkApplyQuestionMode } = useStudioEditor()
  const [tadazzMediaPickerOpen, setTadazzMediaPickerOpen] = useState(false)
  const tadazzBackground =
    defaults.tadazzBackground ?? tadazzShowBackgroundSchema.parse({})
  const updateTadazzBackground = (updates: Partial<TadazzShowBackground>) => {
    updateDefaults({
      tadazzBackground: tadazzShowBackgroundSchema.parse({
        ...tadazzBackground,
        ...updates,
      }),
    })
  }

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
      label: t(
        "extensions:studio.settings.policyCardOnly",
        "Timeline cards only",
      ),
    },
    {
      value: "upstream",
      label: t(
        "extensions:studio.settings.policyUpstream",
        "Standard Razzia rule",
      ),
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
      label: t(
        "extensions:studio.settings.autoAdvance",
        "Automatic (timer completion)",
      ),
    },
    {
      value: "manual",
      label: t(
        "extensions:studio.settings.manualAdvance",
        "Manual (host advances)",
      ),
    },
  ]

  const stagePresetItems = QUESTION_ENTRANCE_PRESETS.map((p) => ({
    value: p,
    label: (() => {
      if (p === "none") {
        return t("extensions:entrance.none", "Regular / None")
      }

      if (p === "fade") {
        return t("extensions:entrance.fade", "Fade In")
      }

      if (p === "slide-up") {
        return t("extensions:entrance.slideUp", "Slide Up")
      }

      if (p === "slide-side") {
        return t("extensions:entrance.slideSide", "Slide Side")
      }

      if (p === "zoom-soft") {
        return t("extensions:entrance.zoomSoft", "Soft Zoom")
      }

      if (p === "spotlight") {
        return t("extensions:entrance.spotlight", "Spotlight")
      }

      if (p === "curtain") {
        return t("extensions:entrance.curtain", "Curtain")
      }

      if (p === "pop-bounce") {
        return t("extensions:entrance.popBounce", "Pop Bounce")
      }

      if (p === "wobble-settle") {
        return t("extensions:entrance.wobbleSettle", "Wobble Settle")
      }

      if (p === "cascade") {
        return t("extensions:entrance.cascade", "Cascade")
      }

      if (p === "fan-flip") {
        return t("extensions:entrance.fanFlip", "Fan Flip")
      }

      return t("extensions:entrance.wipeRipple", "Wipe Ripple")
    })(),
  }))

  const decorationPresetItems = QUESTION_DECORATION_PRESETS.map((dp) => ({
    value: dp,
    label: (() => {
      if (dp === "none") {
        return t("extensions:stageMotion.decorationNone", "None")
      }

      if (dp === "pulse-bar") {
        return t("extensions:stageMotion.decorationPulseBar", "Pulse Bar")
      }

      if (dp === "shimmer-line") {
        return t("extensions:stageMotion.decorationShimmerLine", "Shimmer Line")
      }

      if (dp === "wave-dots") {
        return t("extensions:stageMotion.decorationWaveDots", "Wave Dots")
      }

      if (dp === "glow-sweep") {
        return t("extensions:stageMotion.decorationGlowSweep", "Glow Sweep")
      }

      return t("extensions:stageMotion.decorationLottie", "Custom Lottie")
    })(),
  }))

  const resolvedGlobalStage = resolveCardStageAnimations({
    stageAnimations: defaults.stageAnimations,
  })
  const resolvedGlobalDecoration = resolveQuestionDecoration({
    globalDecoration: defaults.questionDecoration,
  })

  const updateGlobalStageSlot = (
    slotKey: keyof CardStageAnimations,
    preset: QuestionEntrancePreset,
    timing?: StageAnimationTiming,
  ) => {
    const currentSlot = resolvedGlobalStage[slotKey]
    const nextStageAnimations: CardStageAnimations = {
      ...(defaults.stageAnimations ?? {}),
      [slotKey]: {
        ...currentSlot,
        preset,
        timing: timing ?? currentSlot.timing,
      },
    }
    updateDefaults({ stageAnimations: nextStageAnimations })
  }

  return (
    <div className="bg-muted/40 flex flex-1 flex-col overflow-y-auto p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="border-accent flex items-center gap-3 border-b pb-4">
          <div className="bg-primary/10 text-primary rounded-lg p-2">
            <SettingsIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {t(
                "extensions:studio.settings.globalTitle",
                "Studio Settings & Defaults",
              )}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t(
                "extensions:studio.settings.subtitle",
                "Configure timeline show defaults, card creation behaviors, and global presentation policies.",
              )}
            </p>
          </div>
        </div>

        <ShowThemeSettings />
        <Card className="flex w-full max-w-none flex-col gap-6 p-6 md:p-8">
          {/* Default Question Mode */}
          <ConfigField>
            <ConfigField.Label
              icon={<PlaySquare className="text-primary size-4" />}
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
          <div className="border-accent bg-accent/20 flex flex-col items-start justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-foreground text-sm font-bold">
                {t(
                  "extensions:studio.settings.applyAllQuestions",
                  "Apply to All Existing Question Cards",
                )}
              </p>
              <p className="text-muted-foreground text-xs">
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
              confirmLabel={t(
                "extensions:studio.settings.convertAll",
                "Convert All",
              )}
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
              icon={<Trophy className="text-primary size-4" />}
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
                    "upstream" | "everyN" | "cardOnly" | "disabled",
                })
              }
              items={leaderboardPolicyItems}
            />
          </ConfigField>

          <hr className="border-accent" />

          {/* Advance Mode */}
          <ConfigField>
            <ConfigField.Label
              icon={<Timer className="text-primary size-4" />}
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

          <hr className="border-accent" />

          {isLegacyShowRollback(defaults) && (
            <>
              {/* Archived compatibility controls. */}
              <ConfigField>
                <ConfigField.Label
                  icon={<Sparkles className="text-primary size-4" />}
                  label={t(
                    "extensions:studio.settings.tadazzBackground",
                    "Tadazz Show Background",
                  )}
                />
                <ConfigField.Description>
                  {t(
                    "extensions:studio.settings.tadazzBackgroundDesc",
                    "The show-wide background is automatically overridden by a card-specific image or full-screen video.",
                  )}
                </ConfigField.Description>
                <StudioSelect
                  value={tadazzBackground.mode}
                  onChange={(mode: string) => {
                    if (mode === "static" && !tadazzBackground.staticUrl) {
                      setTadazzMediaPickerOpen(true)

                      return
                    }

                    updateTadazzBackground({
                      mode: mode as TadazzShowBackground["mode"],
                    })
                  }}
                  items={[
                    {
                      value: "original",
                      label: t(
                        "extensions:studio.settings.originalBg",
                        "Original Razzia",
                      ),
                    },
                    {
                      value: "animated",
                      label: t(
                        "extensions:studio.settings.tadazzAnimated",
                        "Tadazz Animated",
                      ),
                    },
                    {
                      value: "static",
                      label: t(
                        "extensions:studio.settings.staticBg",
                        "Custom Still Image",
                      ),
                    },
                  ]}
                />
                {tadazzBackground.mode === "animated" && (
                  <div
                    className="flex flex-wrap items-center gap-4"
                    data-testid="tadazz-background-motion-controls"
                  >
                    <label className="text-foreground flex flex-1 flex-col gap-1 text-sm font-medium">
                      {t(
                        "extensions:studio.settings.motionIntensity",
                        "Motion Intensity",
                      )}
                      : {tadazzBackground.intensity.toFixed(2)}
                      <input
                        aria-label={t(
                          "extensions:studio.settings.motionIntensity",
                          "Motion Intensity",
                        )}
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={tadazzBackground.intensity}
                        onChange={(event) =>
                          updateTadazzBackground({
                            intensity: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                    <label className="text-foreground flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tadazzBackground.paused}
                        onChange={(event) =>
                          updateTadazzBackground({
                            paused: event.currentTarget.checked,
                          })
                        }
                      />
                      {t(
                        "extensions:studio.settings.pauseMotion",
                        "Pause Animation",
                      )}
                    </label>
                  </div>
                )}
                {tadazzBackground.mode === "static" && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setTadazzMediaPickerOpen(true)}
                  >
                    {t(
                      "extensions:studio.settings.changeBackground",
                      "Choose Image From Library",
                    )}
                  </Button>
                )}
                {tadazzBackground.mode !== "original" && (
                  <>
                    <StudioSelect
                      value={tadazzBackground.fit}
                      onChange={(value: string) =>
                        updateTadazzBackground({
                          fit: value as "cover" | "contain",
                        })
                      }
                      items={[
                        {
                          value: "cover",
                          label: t(
                            "extensions:studio.settings.coverBg",
                            "Fill Screen (Crop Edges)",
                          ),
                        },
                        {
                          value: "contain",
                          label: t(
                            "extensions:studio.settings.containBg",
                            "Fit Entire Image",
                          ),
                        },
                      ]}
                    />
                    <div
                      className="border-accent relative aspect-video w-full max-w-lg overflow-hidden rounded-xl border bg-[#090119]"
                      data-testid="tadazz-settings-preview"
                    >
                      <TadazzAnimatedBackdrop
                        state={resolveTadazzStageBackground({
                          settings: tadazzBackground,
                          tadazzImageUrl: TADAZZ_IMAGE_URL,
                        })}
                      />
                    </div>
                  </>
                )}
              </ConfigField>

              <hr className="border-accent" />

              {/* Global Stage Animation Defaults */}
              <ConfigField>
                <ConfigField.Label
                  icon={<Sparkles className="text-primary size-4" />}
                  label={t(
                    "extensions:stageMotion.globalDefaultsTitle",
                    "Global Stage Animation Defaults",
                  )}
                />
                <ConfigField.Description>
                  {t(
                    "extensions:stageMotion.globalDefaultsDesc",
                    "Default stage animations inherited by question and scene cards unless overridden per card.",
                  )}
                </ConfigField.Description>

                <div
                  data-testid="global-stage-animations-grid"
                  className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {(
                    [
                      [
                        "questionEntrance",
                        t(
                          "extensions:stageMotion.slotQuestion",
                          "Question Title & Media",
                        ),
                      ],
                      [
                        "answerEntrance",
                        t("extensions:stageMotion.slotAnswers", "Answer Cards"),
                      ],
                      [
                        "answerBadgeEntrance",
                        t(
                          "extensions:stageMotion.slotBadges",
                          "Key Badges (1-5)",
                        ),
                      ],
                      [
                        "resultsRevealEntrance",
                        t(
                          "extensions:stageMotion.slotResults",
                          "Results Reveal",
                        ),
                      ],
                    ] as const
                  ).map(([slotKey, slotLabel]) => (
                    <div
                      key={slotKey}
                      data-testid={`global-stage-slot-${slotKey}`}
                      className="border-accent bg-muted/20 flex flex-col gap-1.5 rounded-lg border p-3"
                    >
                      <span className="text-foreground text-xs font-semibold">
                        {slotLabel}
                      </span>
                      <StudioSelect
                        value={resolvedGlobalStage[slotKey].preset}
                        onChange={(val: string) =>
                          updateGlobalStageSlot(
                            slotKey,
                            val as QuestionEntrancePreset,
                          )
                        }
                        items={stagePresetItems}
                      />
                    </div>
                  ))}
                </div>
              </ConfigField>

              <hr className="border-accent" />

              {/* Global Question Decorative Underline */}
              <ConfigField>
                <ConfigField.Label
                  icon={<Sparkles className="text-primary size-4" />}
                  label={t(
                    "extensions:stageMotion.decorationTitle",
                    "Question Underline Effect",
                  )}
                />
                <ConfigField.Description>
                  {t(
                    "extensions:stageMotion.decorationDesc",
                    "Optional decorative visual accent under the question title (never replaces the authoritative round timer).",
                  )}
                </ConfigField.Description>
                <StudioSelect
                  value={
                    resolvedGlobalDecoration.enabled
                      ? resolvedGlobalDecoration.preset
                      : "none"
                  }
                  onChange={(val: string) =>
                    updateDefaults({
                      questionDecoration: {
                        enabled: val !== "none",
                        preset: val as QuestionDecorationPreset,
                      },
                    })
                  }
                  items={decorationPresetItems}
                />
              </ConfigField>
            </>
          )}
        </Card>
        {isLegacyShowRollback(defaults) && (
          <MediaLibrary
            open={tadazzMediaPickerOpen}
            onOpenChange={setTadazzMediaPickerOpen}
            acceptType="image"
            onSelect={(item) => {
              if (item.type === "image") {
                updateTadazzBackground({ mode: "static", staticUrl: item.url })
                setTadazzMediaPickerOpen(false)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
