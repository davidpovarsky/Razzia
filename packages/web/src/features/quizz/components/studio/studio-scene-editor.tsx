import type { UploadedMedia } from "@razzia/common/types/game"
import {
  evaluateCardStageFitWarnings,
  validateLottieJson,
  type SceneConfig,
} from "@razzia/extensions/core"
import { LottiePlayer } from "@razzia/extensions/presentation"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import CardAudioConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/CardAudioConfig"
import CardBackgroundConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/CardBackgroundConfig"
import QuestionEntranceConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/QuestionEntranceConfig"
import clsx from "clsx"
import {
  AlertTriangle,
  BarChart2,
  Clock,
  DoorOpen,
  Film,
  Flag,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Music,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react"
import { useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"
import { StudioSelect } from "./studio-select"

export const StudioSceneEditor = () => {
  const { t } = useTranslation()
  const {
    selectedTimelineItem,
    selectedTimelineIndex,
    timeline,
    scenes,
    updateSceneConfig,
  } = useStudioEditor()
  const { questionIds } = useQuizzEditor()
  const { control } = useFormContext<QuizzFormValues>()
  const questions = useWatch({ control, name: "questions" }) ?? []
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const lottieInputRef = useRef<HTMLInputElement>(null)

  const presetItems = [
    {
      value: "spotlight",
      label: t("extensions:studio.scene.presetSpotlight", "Spotlight"),
    },
    {
      value: "confetti",
      label: t("extensions:studio.scene.presetConfetti", "Confetti"),
    },
    {
      value: "bounce",
      label: t("extensions:studio.scene.presetBounce", "Bounce"),
    },
    {
      value: "pulse",
      label: t("extensions:studio.scene.presetPulse", "Pulse"),
    },
  ]

  if (!selectedTimelineItem || selectedTimelineItem.kind === "question") {
    return null
  }

  const { sceneId } = selectedTimelineItem
  const scene = scenes[sceneId] as SceneConfig | undefined

  if (!scene) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
        {t("extensions:studio.scene.loading", "Loading scene editor...")}
      </div>
    )
  }

  const supportsOnMediaEnd =
    scene.kind === "media" ||
    scene.kind === "opening" ||
    scene.kind === "closing" ||
    scene.kind === "animation"

  const advanceItems = [
    {
      value: "auto",
      label: t(
        "extensions:studio.scene.advanceAuto",
        "Automatic (on timer end)",
      ),
    },
    {
      value: "manual",
      label: t(
        "extensions:studio.scene.advanceManual",
        "Manual (wait for host click)",
      ),
    },
    ...(supportsOnMediaEnd
      ? [
          {
            value: "onMediaEnd",
            label: t(
              "extensions:studio.scene.advanceOnMediaEnd",
              "When media finishes",
            ),
          },
        ]
      : []),
  ]

  const mediaTypeItems = [
    {
      value: "image",
      label: t("extensions:studio.scene.mediaTypeImage", "Image"),
    },
    {
      value: "video",
      label: t("extensions:studio.scene.mediaTypeVideo", "Video"),
    },
    {
      value: "audio",
      label: t("extensions:studio.scene.mediaTypeAudio", "Audio"),
    },
  ]

  const stageLayoutItems = [
    {
      value: "cinema",
      label: t("extensions:studio.scene.layoutCinema", "Full-Stage Cinema"),
    },
    {
      value: "card",
      label: t("extensions:studio.scene.layoutCard", "Centered Card"),
    },
  ]

  const mediaFitItems = [
    {
      value: "cover",
      label: t("extensions:studio.scene.mediaFitCover", "Cover (Full-bleed)"),
    },
    {
      value: "contain",
      label: t("extensions:studio.scene.mediaFitContain", "Contain (Fit all)"),
    },
  ]

  const logoPositionItems = [
    {
      value: "top",
      label: t("extensions:studio.scene.logoPositionTop", "Top"),
    },
    {
      value: "center",
      label: t("extensions:studio.scene.logoPositionCenter", "Center"),
    },
    {
      value: "bottom",
      label: t("extensions:studio.scene.logoPositionBottom", "Bottom"),
    },
    {
      value: "hidden",
      label: t("extensions:studio.scene.logoPositionHidden", "Hidden"),
    },
  ]

  const endBehaviorItems = [
    {
      value: "holdFrame",
      label: t(
        "extensions:studio.scene.endBehaviorHoldFrame",
        "Hold final frame",
      ),
    },
    {
      value: "advanceNext",
      label: t(
        "extensions:studio.scene.endBehaviorAdvanceNext",
        "Advance to next card",
      ),
    },
    {
      value: "fadeToTitle",
      label: t(
        "extensions:studio.scene.endBehaviorFadeToTitle",
        "Fade to title overlay",
      ),
    },
  ]

  let subtitleOrDesc = ""

  if ("subtitle" in scene && typeof scene.subtitle === "string") {
    subtitleOrDesc = scene.subtitle
  } else if ("description" in scene && typeof scene.description === "string") {
    subtitleOrDesc = scene.description
  }

  const animationPreset =
    scene.kind === "animation" ? scene.preset : "spotlight"
  const durationMs = "durationMs" in scene ? scene.durationMs : 5000
  const advanceMode = "advance" in scene ? scene.advance : "auto"
  const mediaUrl = "mediaUrl" in scene ? (scene.mediaUrl ?? "") : ""
  const isCountdown = scene.kind === "countdown"

  const stageFitWarnings = evaluateCardStageFitWarnings({
    sceneTitle: scene.title,
    sceneSubtitle: subtitleOrDesc,
  })

  const handleMediaSelect = (item: UploadedMedia) => {
    const detectedType: "image" | "video" | "audio" =
      item.type === "video"
        ? "video"
        : item.type === "audio"
          ? "audio"
          : "image"
    updateSceneConfig(sceneId, {
      mediaUrl: item.url,
      mediaType: detectedType,
    })
    setMediaPickerOpen(false)
  }

  const handleLottieUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    try {
      const rawText = await file.text()
      const validation = validateLottieJson(rawText)
      if (!validation.valid) {
        toast.error(validation.error)
        return
      }

      const response = await fetch("/api/extensions/lottie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          content: rawText,
        }),
      })

      if (response.ok) {
        const uploaded = (await response.json()) as { url?: string }
        if (uploaded.url) {
          updateSceneConfig(sceneId, { lottieUrl: uploaded.url })
          return
        }
      }

      const dataUrl = `data:application/json;base64,${btoa(
        unescape(encodeURIComponent(rawText)),
      )}`
      updateSceneConfig(sceneId, { lottieUrl: dataUrl })
    } catch {
      toast.error(
        t(
          "extensions:studio.scene.lottieInvalidError",
          "Invalid Lottie JSON file",
        ),
      )
    }
  }

  // Preceding questions for answerRecap
  const precedingQuestions: Array<{
    questionId: string
    questionNumber: number
    title: string
  }> = []

  if (scene.kind === "answerRecap") {
    let qCounter = 0
    for (let i = 0; i < timeline.length; i += 1) {
      if (i >= selectedTimelineIndex && selectedTimelineIndex >= 0) break
      const item = timeline[i]
      if (item.kind === "question") {
        qCounter += 1
        const qIdx = questionIds.indexOf(item.questionId)
        const qObj = qIdx >= 0 ? questions[qIdx] : undefined
        precedingQuestions.push({
          questionId: item.questionId,
          questionNumber: qCounter,
          title:
            qObj?.question?.trim() ||
            t("extensions:studio.scene.questionLabel", {
              num: qCounter,
              defaultValue: `Question ${qCounter}`,
            }),
        })
      }
    }
  }

  const selectedStartQuestionIndex =
    scene.kind === "answerRecap"
      ? precedingQuestions.findIndex(
          (q) => q.questionId === scene.startQuestionId,
        )
      : -1
  const recapQuestionRange =
    scene.kind === "answerRecap"
      ? selectedStartQuestionIndex >= 0
        ? precedingQuestions.slice(selectedStartQuestionIndex)
        : precedingQuestions
      : []

  const pickerAcceptType =
    "mediaType" in scene
      ? scene.mediaType === "audio"
        ? "audio"
        : scene.mediaType === "video"
          ? "video"
          : scene.mediaType === "image"
            ? "image"
            : "all"
      : "all"

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      {/* Center 16:9 Stage Preview Area */}
      <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col items-center justify-center gap-4 p-3 sm:p-8 lg:overflow-y-auto">
        {stageFitWarnings.length > 0 && (
          <div
            data-testid="stage-fit-warning-banner"
            className="flex w-full max-w-3xl items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-900 shadow-xs dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">
                {t("extensions:stageFit.warningTitle", "Stage Fit Notice")}
              </span>
              {stageFitWarnings.map((w, idx) => (
                <span key={idx}>
                  {t(w.messageKey, {
                    current: w.currentLength,
                    max: w.recommendedMax,
                    defaultValue: `Length (${w.currentLength}/${w.recommendedMax}) exceeds recommended stage length.`,
                  })}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="border-accent bg-secondary/90 relative flex aspect-video w-full max-w-3xl flex-col items-center justify-center overflow-hidden rounded-2xl border-2 p-4 text-center text-white shadow-xl sm:p-8">
          {/* Scene Custom Background Preview (Distinct from foreground mediaUrl) */}
          {scene.background?.url && (
            <div
              data-testid="scene-preview-background"
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
              <img
                src={scene.background.url}
                alt=""
                className={clsx(
                  "h-full w-full",
                  scene.background.fit === "contain"
                    ? "object-contain"
                    : "object-cover",
                )}
              />
              <div
                className="absolute inset-0 bg-black"
                style={{ opacity: scene.background.overlayOpacity ?? 0.35 }}
              />
            </div>
          )}

          {/* Cinema full-stage backdrop for opening/closing */}
          {(scene.kind === "opening" || scene.kind === "closing") &&
            (scene.stageLayout ?? "cinema") === "cinema" &&
            scene.mediaUrl &&
            scene.mediaType !== "audio" && (
              <div
                data-testid="scene-preview-cinema-backdrop"
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
              >
                {scene.mediaType === "video" ? (
                  <video
                    src={scene.mediaUrl}
                    className={clsx(
                      "h-full w-full",
                      scene.mediaFit === "contain"
                        ? "object-contain"
                        : "object-cover",
                    )}
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={scene.mediaUrl}
                    alt=""
                    className={clsx(
                      "h-full w-full",
                      scene.mediaFit === "contain"
                        ? "object-contain"
                        : "object-cover",
                    )}
                  />
                )}
                <div className="absolute inset-0 bg-black/40" />
              </div>
            )}

          <div className="relative z-10 flex h-full w-full flex-col items-center justify-center">
            {scene.kind === "transition" && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/20 p-4 text-primary">
                  <Layers className="size-12" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {scene.title ?? t("extensions:timeline.transition")}
                </h2>
                {scene.description && (
                  <p className="max-w-md text-base text-white/80 sm:text-lg">
                    {scene.description}
                  </p>
                )}
              </div>
            )}

            {scene.kind === "animation" && (
              <div
                data-testid={`scene-preview-animation-${scene.preset}`}
                className="flex flex-col items-center gap-4"
              >
                {scene.lottieUrl ? (
                  <LottiePlayer
                    src={scene.lottieUrl}
                    loop={scene.lottieLoop ?? true}
                    speed={scene.lottieSpeed ?? 1}
                    fit={scene.lottieFit ?? "contain"}
                    className="h-36 w-52"
                    dataTestId="scene-preview-lottie"
                  />
                ) : (
                  <div
                    className={clsx(
                      "rounded-full p-5 text-primary transition-all",
                      scene.preset === "spotlight" &&
                        "bg-amber-400/25 ring-4 ring-amber-300/40 shadow-[0_0_40px_rgba(251,191,36,0.45)]",
                      scene.preset === "confetti" &&
                        "bg-pink-500/25 ring-4 ring-pink-400/40 animate-bounce",
                      scene.preset === "bounce" &&
                        "bg-primary/20 animate-bounce",
                      scene.preset === "pulse" &&
                        "bg-emerald-500/25 ring-4 ring-emerald-400/40 animate-pulse",
                    )}
                  >
                    <Sparkles className="size-16" />
                  </div>
                )}
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {scene.title ?? `Animation: ${scene.preset}`}
                </h2>
                <span className="rounded-full bg-white/20 px-4 py-1 text-sm font-semibold uppercase tracking-wider text-primary">
                  {scene.preset}
                </span>
              </div>
            )}

            {scene.kind === "media" && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                {Boolean(scene.mediaUrl) && scene.mediaType === "video" && (
                  <video
                    data-testid="scene-preview-video"
                    src={scene.mediaUrl}
                    className={clsx(
                      "max-h-56 rounded-lg shadow-md sm:max-h-72",
                      scene.mediaFit === "cover"
                        ? "object-cover"
                        : "object-contain",
                    )}
                    controls={scene.showControls ?? true}
                    loop={scene.loop ?? false}
                    muted={scene.muted ?? false}
                  />
                )}
                {Boolean(scene.mediaUrl) && scene.mediaType === "audio" && (
                  <div
                    data-testid="scene-preview-audio"
                    className="flex flex-col items-center gap-3 rounded-2xl bg-black/35 px-6 py-5"
                  >
                    <div className="rounded-full bg-primary/25 p-4 text-primary">
                      <Music className="size-12" />
                    </div>
                    <audio
                      src={scene.mediaUrl}
                      controls={scene.showControls ?? true}
                      loop={scene.loop ?? false}
                      muted={scene.muted ?? false}
                      className="w-64 max-w-full"
                    />
                  </div>
                )}
                {Boolean(scene.mediaUrl) &&
                  scene.mediaType !== "video" &&
                  scene.mediaType !== "audio" && (
                    <img
                      data-testid="scene-preview-image"
                      src={scene.mediaUrl}
                      alt={scene.title ?? "Scene Media"}
                      className={clsx(
                        "max-h-56 rounded-lg shadow-md sm:max-h-72",
                        scene.mediaFit === "cover"
                          ? "object-cover"
                          : "object-contain",
                      )}
                    />
                  )}
                {!scene.mediaUrl && (
                  <div className="flex flex-col items-center gap-2 text-white/60">
                    {scene.mediaType === "audio" ? (
                      <Music className="size-16" />
                    ) : scene.mediaType === "video" ? (
                      <Film className="size-16" />
                    ) : (
                      <ImageIcon className="size-16" />
                    )}
                    <p className="text-sm">
                      {t(
                        "extensions:studio.scene.noMedia",
                        "No media selected yet",
                      )}
                    </p>
                  </div>
                )}
                {scene.title && (
                  <p className="text-lg font-bold">{scene.title}</p>
                )}
              </div>
            )}

            {scene.kind === "leaderboard" && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/20 p-4 text-primary">
                  <Trophy className="size-14" />
                </div>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {scene.title ?? t("extensions:timeline.leaderboard")}
                </h2>
                <div className="w-64 max-w-full rounded-lg bg-black/40 p-4 text-left text-sm font-semibold">
                  <div className="mb-2 text-center text-xs font-normal text-white/50">
                    [
                    {t(
                      "extensions:studio.scene.previewSampleBadge",
                      "Editor Preview Sample Data",
                    )}
                    ]
                  </div>
                  <div className="flex justify-between border-b border-white/20 py-1">
                    <span>
                      1. {t("extensions:studio.scene.samplePlayer1", "Player 1")}
                    </span>
                    <span className="font-bold text-primary">1200 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-white/20 py-1">
                    <span>
                      2. {t("extensions:studio.scene.samplePlayer2", "Player 2")}
                    </span>
                    <span className="font-bold text-primary">950 pts</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>
                      3. {t("extensions:studio.scene.samplePlayer3", "Player 3")}
                    </span>
                    <span className="font-bold text-primary">800 pts</span>
                  </div>
                </div>
              </div>
            )}

            {scene.kind === "interimResults" && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/20 p-4 text-primary">
                  <BarChart2 className="size-14" />
                </div>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {scene.title ?? t("extensions:timeline.interimResults")}
                </h2>
                <p className="text-sm text-white/70">
                  {t(
                    "extensions:studio.scene.interimResultsDesc",
                    "Displays live response distribution of the most recent completed question",
                  )}
                </p>
                <div className="text-xs font-normal text-white/50">
                  [
                  {t(
                    "extensions:studio.scene.previewSampleBadge",
                    "Editor Preview Sample Data",
                  )}
                  ]
                </div>
              </div>
            )}

            {scene.kind === "answerRecap" && (
              <div
                data-testid="scene-preview-answer-recap"
                className="flex h-full w-full flex-col items-center justify-center gap-3 px-2"
              >
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/20 p-2.5 text-primary">
                    <ListChecks className="size-6" />
                  </div>
                  <h2 className="text-xl font-bold sm:text-2xl">
                    {scene.title ??
                      t(
                        "extensions:timeline.answerRecap",
                        "Cumulative Answer Recap",
                      )}
                  </h2>
                </div>
                {scene.subtitle && (
                  <p className="text-xs text-white/75 sm:text-sm">
                    {scene.subtitle}
                  </p>
                )}
                {recapQuestionRange.length === 0 ? (
                  <p
                    data-testid="recap-no-preceding-questions-warning"
                    className="rounded-lg bg-amber-500/20 px-4 py-2 text-xs text-amber-200"
                  >
                    {t(
                      "extensions:studio.scene.recapNoPrecedingQuestions",
                      "Place at least one question before this recap card in the timeline.",
                    )}
                  </p>
                ) : (
                  <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                    {recapQuestionRange
                      .slice(0, scene.maxItemsPerPage ?? 4)
                      .map((q) => (
                        <div
                          key={q.questionId}
                          className="flex flex-col gap-1 rounded-xl border border-white/15 bg-black/40 p-2.5 text-left"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-white/70">
                            <span>Q{q.questionNumber}</span>
                            <span className="rounded bg-primary/30 px-1.5 py-0.5 text-[10px] text-primary">
                              {scene.mode === "correctAnswer"
                                ? t(
                                    "extensions:studio.scene.recapBadgeCorrectAnswer",
                                    "Correct Answer",
                                  )
                                : t(
                                    "extensions:studio.scene.recapBadgeMostSelected",
                                    "Most Selected",
                                  )}
                            </span>
                          </div>
                          <p className="truncate text-xs font-bold text-white">
                            {q.title}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {scene.kind === "countdown" && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex size-24 items-center justify-center rounded-full border-4 border-primary text-4xl font-black text-primary sm:size-28 sm:text-5xl">
                  {scene.durationSeconds}
                </div>
                <h2 className="text-xl font-bold sm:text-2xl">
                  {scene.title ?? t("extensions:timeline.countdown")}
                </h2>
              </div>
            )}

            {(scene.kind === "opening" || scene.kind === "closing") && (
              <div
                data-testid={`scene-preview-${scene.kind}`}
                className={clsx(
                  "flex flex-col items-center gap-3",
                  scene.logoPosition === "top" && "justify-start pt-2",
                  scene.logoPosition === "bottom" && "justify-end pb-6",
                )}
              >
                {scene.lottieUrl ? (
                  <LottiePlayer
                    src={scene.lottieUrl}
                    loop={scene.lottieLoop ?? true}
                    speed={scene.lottieSpeed ?? 1}
                    fit={scene.lottieFit ?? "contain"}
                    className="h-28 w-44"
                    dataTestId="scene-preview-lottie"
                  />
                ) : (
                  scene.logoPosition !== "hidden" && (
                    <div className="rounded-full bg-primary/20 p-4 text-primary">
                      {scene.kind === "opening" ? (
                        <DoorOpen className="size-12" />
                      ) : (
                        <Flag className="size-12" />
                      )}
                    </div>
                  )
                )}

                {scene.mediaUrl && scene.mediaType === "audio" && (
                  <audio
                    data-testid="scene-preview-audio"
                    src={scene.mediaUrl}
                    controls={scene.showControls ?? true}
                    className="w-60 max-w-full"
                  />
                )}

                {scene.mediaUrl &&
                  (scene.stageLayout ?? "cinema") === "card" &&
                  scene.mediaType !== "audio" &&
                  (scene.mediaType === "video" ? (
                    <video
                      src={scene.mediaUrl}
                      className="max-h-36 rounded-lg object-contain shadow-md"
                      controls={scene.showControls ?? false}
                    />
                  ) : (
                    <img
                      src={scene.mediaUrl}
                      alt={scene.title ?? ""}
                      className="max-h-36 rounded-lg object-contain shadow-md"
                    />
                  ))}

                {(scene.textOverlay ?? true) && (
                  <>
                    <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
                      {scene.title}
                    </h1>
                    {scene.subtitle && (
                      <p className="text-base text-white/80 sm:text-xl">
                        {scene.subtitle}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-4 z-10 flex items-center gap-2 text-xs font-semibold text-white/50">
            <Clock className="size-3.5" />
            <span>
              {"durationSeconds" in scene
                ? `${scene.durationSeconds}s`
                : `${Math.round(scene.durationMs / 1000)}s`}
            </span>
            <span>•</span>
            <span className="capitalize">{scene.advance}</span>
          </div>
        </div>
      </main>

      {/* Right Config Aside */}
      <aside className="bg-background z-10 m-2 flex w-[calc(100%-1rem)] shrink-0 flex-col gap-4 rounded-xl p-3 shadow-sm lg:m-3 lg:w-72 xl:w-80 lg:overflow-y-auto lg:p-4">
        <div className="flex items-center gap-2 border-b border-accent pb-3">
          <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {t("extensions:studio.scene.kindSettings", {
              kind: scene.kind,
              defaultValue: `${scene.kind} Settings`,
            })}
          </span>
        </div>

        {/* Title Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-foreground">
            {t("extensions:studio.scene.titleLabel", "Title")}
          </label>
          <Input
            value={scene.title ?? ""}
            onChange={(e) =>
              updateSceneConfig(sceneId, { title: e.target.value })
            }
            placeholder={t(
              "extensions:studio.scene.titlePlaceholder",
              "Card title...",
            )}
            variant="sm"
          />
        </div>

        {/* Subtitle / Description */}
        {("subtitle" in scene || "description" in scene) && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              {"subtitle" in scene
                ? t("extensions:studio.scene.subtitleLabel", "Subtitle")
                : t("extensions:studio.scene.descriptionLabel", "Description")}
            </label>
            <Input
              value={subtitleOrDesc}
              onChange={(e) => {
                if ("subtitle" in scene) {
                  updateSceneConfig(sceneId, { subtitle: e.target.value })
                } else if ("description" in scene) {
                  updateSceneConfig(sceneId, { description: e.target.value })
                }
              }}
              placeholder={t(
                "extensions:studio.scene.subtitlePlaceholder",
                "Card description or subtitle...",
              )}
              variant="sm"
            />
          </div>
        )}

        {/* Answer Recap Settings */}
        {scene.kind === "answerRecap" && (
          <div
            data-testid="answer-recap-settings"
            className="flex flex-col gap-3 rounded-lg border border-accent p-2.5"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground">
                {t(
                  "extensions:studio.scene.recapStartQuestion",
                  "Start From Question",
                )}
              </label>
              <select
                data-testid="recap-start-question-select"
                value={
                  scene.startQuestionId ??
                  precedingQuestions[0]?.questionId ??
                  ""
                }
                onChange={(e) =>
                  updateSceneConfig(sceneId, {
                    startQuestionId: e.target.value || undefined,
                  })
                }
                disabled={precedingQuestions.length === 0}
                className="bg-background border-input text-foreground rounded-md border px-2 py-1.5 text-xs font-medium"
              >
                {precedingQuestions.length === 0 ? (
                  <option value="">
                    {t(
                      "extensions:studio.scene.recapNoPrecedingQuestions",
                      "Place at least one question before this recap card in the timeline.",
                    )}
                  </option>
                ) : (
                  precedingQuestions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      Q{q.questionNumber}: {q.title}
                    </option>
                  ))
                )}
              </select>
              {recapQuestionRange.length > 0 && (
                <p
                  data-testid="recap-range-helper"
                  className="text-[11px] text-muted-foreground"
                >
                  {t("extensions:studio.scene.recapRangeHelper", {
                    startNum: recapQuestionRange[0].questionNumber,
                    count: recapQuestionRange.length,
                    defaultValue: `Recaps from Question ${recapQuestionRange[0].questionNumber} up to this recap card (${recapQuestionRange.length} questions)`,
                  })}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground">
                {t("extensions:studio.scene.recapMode", "Highlight Mode")}
              </label>
              <StudioSelect
                value={scene.mode ?? "mostSelected"}
                onChange={(val: string) =>
                  updateSceneConfig(sceneId, {
                    mode: val as "mostSelected" | "correctAnswer",
                  })
                }
                items={[
                  {
                    value: "mostSelected",
                    label: t(
                      "extensions:studio.scene.recapModeMostSelected",
                      "Most Selected Answer",
                    ),
                  },
                  {
                    value: "correctAnswer",
                    label: t(
                      "extensions:studio.scene.recapModeCorrectAnswer",
                      "Correct Answer (for Quiz cards)",
                    ),
                  },
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground">
                {t(
                  "extensions:studio.scene.recapMaxItemsPerPage",
                  "Questions Per Page (1–8)",
                )}
              </label>
              <Input
                data-testid="recap-max-items-input"
                type="number"
                min={1}
                max={8}
                value={scene.maxItemsPerPage ?? 4}
                onChange={(e) =>
                  updateSceneConfig(sceneId, {
                    maxItemsPerPage: Math.max(
                      1,
                      Math.min(8, Number(e.target.value) || 4),
                    ),
                  })
                }
                variant="sm"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={scene.showCounts ?? true}
                  onChange={(e) =>
                    updateSceneConfig(sceneId, { showCounts: e.target.checked })
                  }
                />
                {t(
                  "extensions:studio.scene.recapShowCounts",
                  "Show Vote Counts",
                )}
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={scene.showPercentages ?? true}
                  onChange={(e) =>
                    updateSceneConfig(sceneId, {
                      showPercentages: e.target.checked,
                    })
                  }
                />
                {t(
                  "extensions:studio.scene.recapShowPercentages",
                  "Show Percentages",
                )}
              </label>
            </div>
          </div>
        )}

        {/* Media Type & Asset Selection for Media & Opening/Closing */}
        {"mediaUrl" in scene && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-accent p-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-foreground">
                {t("extensions:studio.scene.mediaType", "Media Type")}
              </label>
              <StudioSelect
                value={scene.mediaType ?? "image"}
                onChange={(val: string) =>
                  updateSceneConfig(sceneId, {
                    mediaType: val as "image" | "video" | "audio",
                  })
                }
                items={mediaTypeItems}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-foreground">
                {t("extensions:studio.scene.mediaAsset", "Media Asset")}
              </label>
              <div className="flex gap-2">
                <Input
                  data-testid="scene-media-url-input"
                  value={mediaUrl}
                  onChange={(e) =>
                    updateSceneConfig(sceneId, { mediaUrl: e.target.value })
                  }
                  placeholder={t(
                    "extensions:studio.scene.mediaPlaceholder",
                    "/media/image.png or https://...",
                  )}
                  variant="sm"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setMediaPickerOpen(true)}
                  className="bg-accent text-accent-foreground shrink-0 px-2"
                  title={t(
                    "extensions:studio.scene.mediaLibraryTitle",
                    "Select from Media Library",
                  )}
                >
                  <Upload className="size-4" />
                </Button>
              </div>
            </div>

            {scene.mediaType !== "audio" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-foreground">
                  {t("extensions:studio.scene.mediaFit", "Media Fit")}
                </label>
                <StudioSelect
                  value={scene.mediaFit ?? "contain"}
                  onChange={(val: string) =>
                    updateSceneConfig(sceneId, {
                      mediaFit: val as "cover" | "contain",
                    })
                  }
                  items={mediaFitItems}
                />
              </div>
            )}

            {(scene.mediaType === "video" || scene.mediaType === "audio") && (
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    {t("extensions:studio.scene.volume", "Volume")}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round((scene.volume ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={scene.volume ?? 1}
                  onChange={(e) =>
                    updateSceneConfig(sceneId, {
                      volume: Number(e.target.value),
                    })
                  }
                  className="w-full"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={scene.loop ?? false}
                      onChange={(e) =>
                        updateSceneConfig(sceneId, { loop: e.target.checked })
                      }
                    />
                    {t("extensions:studio.scene.loop", "Loop playback")}
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={scene.muted ?? false}
                      onChange={(e) =>
                        updateSceneConfig(sceneId, { muted: e.target.checked })
                      }
                    />
                    {t("extensions:studio.scene.muted", "Mute audio")}
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={scene.showControls ?? true}
                      onChange={(e) =>
                        updateSceneConfig(sceneId, {
                          showControls: e.target.checked,
                        })
                      }
                    />
                    {t(
                      "extensions:studio.scene.showControls",
                      "Show player controls",
                    )}
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cinematic Stage Controls for Opening & Closing */}
        {(scene.kind === "opening" || scene.kind === "closing") && (
          <div
            data-testid="cinema-scene-controls"
            className="flex flex-col gap-2.5 rounded-lg border border-accent p-2.5"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-foreground">
                {t("extensions:studio.scene.stageLayout", "Stage Layout")}
              </label>
              <StudioSelect
                value={scene.stageLayout ?? "cinema"}
                onChange={(val: string) =>
                  updateSceneConfig(sceneId, {
                    stageLayout: val as "cinema" | "card",
                  })
                }
                items={stageLayoutItems}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-foreground">
                {t("extensions:studio.scene.logoPosition", "Logo Position")}
              </label>
              <StudioSelect
                value={scene.logoPosition ?? "center"}
                onChange={(val: string) =>
                  updateSceneConfig(sceneId, {
                    logoPosition: val as "top" | "center" | "bottom" | "hidden",
                  })
                }
                items={logoPositionItems}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-foreground">
                {t("extensions:studio.scene.endBehavior", "End Behavior")}
              </label>
              <StudioSelect
                value={scene.endBehavior ?? "holdFrame"}
                onChange={(val: string) =>
                  updateSceneConfig(sceneId, {
                    endBehavior: val as
                      | "holdFrame"
                      | "advanceNext"
                      | "fadeToTitle",
                  })
                }
                items={endBehaviorItems}
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={scene.textOverlay ?? true}
                onChange={(e) =>
                  updateSceneConfig(sceneId, { textOverlay: e.target.checked })
                }
              />
              {t(
                "extensions:studio.scene.textOverlay",
                "Show Title & Subtitle Overlay",
              )}
            </label>
          </div>
        )}

        {/* Animation Preset */}
        {scene.kind === "animation" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              {t(
                "extensions:studio.scene.animationPreset",
                "Animation Preset",
              )}
            </label>
            <StudioSelect
              value={animationPreset}
              onChange={(val: string) =>
                updateSceneConfig(sceneId, { preset: val })
              }
              items={presetItems}
            />
          </div>
        )}

        {/* User-supplied Lottie Animation (for animation, opening, closing) */}
        {(scene.kind === "animation" ||
          scene.kind === "opening" ||
          scene.kind === "closing") && (
          <div
            data-testid="scene-lottie-config"
            className="flex flex-col gap-2 rounded-lg border border-accent p-2.5"
          >
            <label className="text-xs font-bold text-foreground">
              {t(
                "extensions:studio.scene.lottieAnimation",
                "Custom Lottie Animation (.json)",
              )}
            </label>
            <div className="flex gap-2">
              <Input
                data-testid="scene-lottie-url-input"
                value={scene.lottieUrl ?? ""}
                onChange={(e) =>
                  updateSceneConfig(sceneId, {
                    lottieUrl: e.target.value || undefined,
                  })
                }
                placeholder="/media/animation.json"
                variant="sm"
                className="min-w-0 flex-1"
              />
              <input
                ref={lottieInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleLottieUpload}
              />
              <Button
                type="button"
                size="sm"
                data-testid="scene-lottie-upload-btn"
                onClick={() => lottieInputRef.current?.click()}
                className="bg-accent text-accent-foreground shrink-0 px-2"
                title={t(
                  "extensions:studio.scene.lottieUpload",
                  "Upload Lottie JSON",
                )}
              >
                <Upload className="size-4" />
              </Button>
            </div>
            {!scene.lottieUrl ? (
              <p
                data-testid="scene-lottie-empty-state"
                className="text-[11px] text-muted-foreground"
              >
                {t(
                  "extensions:studio.scene.lottieEmptyState",
                  "No custom Lottie animation selected. Upload a user-supplied .json file to preview.",
                )}
              </p>
            ) : (
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={scene.lottieLoop ?? true}
                    onChange={(e) =>
                      updateSceneConfig(sceneId, {
                        lottieLoop: e.target.checked,
                      })
                    }
                  />
                  {t("extensions:studio.scene.loop", "Loop playback")}
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    updateSceneConfig(sceneId, { lottieUrl: undefined })
                  }
                  className="bg-accent text-accent-foreground px-2 py-0.5 text-[11px]"
                >
                  {t("extensions:studio.scene.clearLottie", "Clear")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Duration */}
        {isCountdown ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              {t(
                "extensions:studio.scene.countdownSeconds",
                "Countdown Seconds (3–120)",
              )}
            </label>
            <Input
              type="number"
              min={3}
              max={120}
              value={scene.durationSeconds}
              onChange={(e) =>
                updateSceneConfig(sceneId, {
                  durationSeconds: Math.max(
                    3,
                    Math.min(120, Number(e.target.value) || 10),
                  ),
                })
              }
              variant="sm"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              {t(
                "extensions:studio.scene.durationSeconds",
                "Duration Seconds (1–60)",
              )}
            </label>
            <Input
              type="number"
              min={1}
              max={60}
              value={Math.round(durationMs / 1000)}
              onChange={(e) =>
                updateSceneConfig(sceneId, {
                  durationMs: Math.max(
                    500,
                    Math.min(60000, (Number(e.target.value) || 5) * 1000),
                  ),
                })
              }
              variant="sm"
            />
          </div>
        )}

        {/* Advance Mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-foreground">
            {t("extensions:studio.scene.advance", "Advance")}
          </label>
          <StudioSelect
            value={advanceMode}
            onChange={(val: string) =>
              updateSceneConfig(sceneId, {
                advance: val as "auto" | "manual" | "onMediaEnd",
              })
            }
            items={advanceItems}
          />
        </div>

        {/* Scene Card Background Override (Distinct from foreground mediaUrl) */}
        <CardBackgroundConfig
          backgroundOverride={scene.background}
          onBackgroundChange={(next) =>
            updateSceneConfig(sceneId, { background: next })
          }
        />

        {/* Scene Card Audio Override */}
        <CardAudioConfig
          kind="scene"
          sceneAudio={scene.audio}
          onSceneAudioChange={(next) =>
            updateSceneConfig(sceneId, { audio: next })
          }
        />

        {/* Scene Entrance Animation */}
        <QuestionEntranceConfig
          kind="scene"
          sceneStageAnimations={scene.stageAnimations}
          onSceneStageAnimationsChange={(next) =>
            updateSceneConfig(sceneId, { stageAnimations: next })
          }
        />
      </aside>

      <MediaLibrary
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelect={handleMediaSelect}
        acceptType={pickerAcceptType}
      />
    </div>
  )
}
