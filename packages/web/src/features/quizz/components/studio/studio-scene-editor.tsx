import type { UploadedMedia } from "@razzia/common/types/game"
import {
  evaluateCardStageFitWarnings,
  type SceneConfig,
} from "@razzia/extensions/core"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
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
  Flag,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"
import { StudioSelect } from "./studio-select"

export const StudioSceneEditor = () => {
  const { t } = useTranslation()
  const { selectedTimelineItem, scenes, updateSceneConfig } = useStudioEditor()
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

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
    const isVideo = item.type === "video"
    const mediaType: "image" | "video" = isVideo ? "video" : "image"
    updateSceneConfig(sceneId, {
      mediaUrl: item.url,
      mediaType,
    })
    setMediaPickerOpen(false)
  }

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
              <div className="flex flex-col items-center gap-4">
                <div className="animate-bounce rounded-full bg-primary/20 p-5 text-primary">
                  <Sparkles className="size-16" />
                </div>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {scene.title ?? `Animation: ${scene.preset}`}
                </h2>
                <span className="rounded-full bg-white/20 px-4 py-1 text-sm font-semibold uppercase tracking-wider text-primary">
                  Preset: {scene.preset}
                </span>
              </div>
            )}

            {scene.kind === "media" && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                {Boolean(scene.mediaUrl) && scene.mediaType === "video" && (
                  <video
                    src={scene.mediaUrl}
                    className="max-h-56 rounded-lg object-contain shadow-md sm:max-h-72"
                    controls
                  />
                )}
                {Boolean(scene.mediaUrl) && scene.mediaType !== "video" && (
                  <img
                    src={scene.mediaUrl}
                    alt={scene.title ?? "Scene Media"}
                    className="max-h-56 rounded-lg object-contain shadow-md sm:max-h-72"
                  />
                )}
                {!scene.mediaUrl && (
                  <div className="flex flex-col items-center gap-2 text-white/60">
                    <ImageIcon className="size-16" />
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

            {scene.kind === "opening" && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/20 p-4 text-primary">
                  <DoorOpen className="size-14" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
                  {scene.title}
                </h1>
                {scene.subtitle && (
                  <p className="text-base text-white/80 sm:text-xl">
                    {scene.subtitle}
                  </p>
                )}
              </div>
            )}

            {scene.kind === "closing" && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/20 p-4 text-primary">
                  <Flag className="size-14" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
                  {scene.title}
                </h1>
                {scene.subtitle && (
                  <p className="text-base text-white/80 sm:text-xl">
                    {scene.subtitle}
                  </p>
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

        {/* Media Selection for Media & Opening/Closing (Foreground Content Media) */}
        {"mediaUrl" in scene && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              {t("extensions:studio.scene.mediaAsset", "Media Asset")}
            </label>
            <div className="flex gap-2">
              <Input
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
                advance: val as "auto" | "manual",
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
        acceptType="all"
      />
    </div>
  )
}
