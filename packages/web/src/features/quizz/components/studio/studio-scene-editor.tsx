import type { UploadedMedia } from "@razzia/common/types/game"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import {
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
import type { SceneConfig } from "@razzia/extensions/core"

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

  const animationPreset = scene.kind === "animation" ? scene.preset : "spotlight"
  const durationMs = "durationMs" in scene ? scene.durationMs : 5000
  const advanceMode = "advance" in scene ? scene.advance : "auto"
  const mediaUrl = "mediaUrl" in scene ? (scene.mediaUrl ?? "") : ""
  const isCountdown = scene.kind === "countdown"

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
    <div className="flex flex-1 overflow-hidden">
      {/* Center 16:9 Stage Preview Area */}
      <main className="mx-auto flex max-w-5xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-8">
        <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border-2 border-accent bg-secondary/90 p-8 text-white shadow-xl flex flex-col items-center justify-center text-center">
          {scene.kind === "transition" && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-primary/20 p-4 text-primary">
                <Layers className="size-12" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">
                {scene.title ?? t("extensions:timeline.transition")}
              </h2>
              {scene.description && (
                <p className="max-w-md text-lg text-white/80">{scene.description}</p>
              )}
            </div>
          )}

          {scene.kind === "animation" && (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-bounce rounded-full bg-primary/20 p-5 text-primary">
                <Sparkles className="size-16" />
              </div>
              <h2 className="text-3xl font-bold">
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
                  className="max-h-72 rounded-lg object-contain shadow-md"
                  controls
                />
              )}
              {Boolean(scene.mediaUrl) && scene.mediaType !== "video" && (
                <img
                  src={scene.mediaUrl}
                  alt={scene.title ?? "Scene Media"}
                  className="max-h-72 rounded-lg object-contain shadow-md"
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
              {scene.title && <p className="text-lg font-bold">{scene.title}</p>}
            </div>
          )}

          {scene.kind === "leaderboard" && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-primary/20 p-4 text-primary">
                <Trophy className="size-14" />
              </div>
              <h2 className="text-3xl font-bold">
                {scene.title ?? t("extensions:timeline.leaderboard")}
              </h2>
              <div className="w-64 rounded-lg bg-black/40 p-4 text-left text-sm font-semibold">
                <div className="mb-2 text-center text-xs font-normal text-white/50">
                  [{t(
                    "extensions:studio.scene.previewSampleBadge",
                    "Editor Preview Sample Data",
                  )}]
                </div>
                <div className="flex justify-between py-1 border-b border-white/20">
                  <span>1. {t("extensions:studio.scene.samplePlayer1", "Player 1")}</span>
                  <span className="text-primary font-bold">1200 pts</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/20">
                  <span>2. {t("extensions:studio.scene.samplePlayer2", "Player 2")}</span>
                  <span className="text-primary font-bold">950 pts</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>3. {t("extensions:studio.scene.samplePlayer3", "Player 3")}</span>
                  <span className="text-primary font-bold">800 pts</span>
                </div>
              </div>
            </div>
          )}

          {scene.kind === "interimResults" && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-primary/20 p-4 text-primary">
                <BarChart2 className="size-14" />
              </div>
              <h2 className="text-3xl font-bold">
                {scene.title ?? t("extensions:timeline.interimResults")}
              </h2>
              <p className="text-sm text-white/70">
                {t(
                  "extensions:studio.scene.interimResultsDesc",
                  "Displays live response distribution of the most recent completed question",
                )}
              </p>
              <div className="text-xs font-normal text-white/50">
                [{t(
                  "extensions:studio.scene.previewSampleBadge",
                  "Editor Preview Sample Data",
                )}]
              </div>
            </div>
          )}

          {scene.kind === "countdown" && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative flex size-28 items-center justify-center rounded-full border-4 border-primary text-5xl font-black text-primary">
                {scene.durationSeconds}
              </div>
              <h2 className="text-2xl font-bold">
                {scene.title ?? t("extensions:timeline.countdown")}
              </h2>
            </div>
          )}

          {scene.kind === "opening" && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-primary/20 p-4 text-primary">
                <DoorOpen className="size-14" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight">
                {scene.title}
              </h1>
              {scene.subtitle && (
                <p className="text-xl text-white/80">{scene.subtitle}</p>
              )}
            </div>
          )}

          {scene.kind === "closing" && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-primary/20 p-4 text-primary">
                <Flag className="size-14" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight">
                {scene.title}
              </h1>
              {scene.subtitle && (
                <p className="text-xl text-white/80">{scene.subtitle}</p>
              )}
            </div>
          )}

          <div className="absolute bottom-3 left-4 flex items-center gap-2 text-xs font-semibold text-white/50">
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
      <aside className="bg-background z-10 m-3 flex w-80 shrink-0 flex-col gap-4 overflow-auto rounded-xl p-4 shadow-sm">
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

        {/* Media Selection for Media & Opening/Closing */}
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
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => setMediaPickerOpen(true)}
                className="bg-accent text-accent-foreground px-2"
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
