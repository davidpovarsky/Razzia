// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import {
  isLegacyShowRollback,
  resolveShowTheme,
  type LottieMeta,
  MAX_CINEMATIC_OVERLAY_ANIMATIONS,
  CREATING_WORLDS_PRESETS,
  createDefaultOverlayAnimation,
  evaluateCardStageFitWarnings,
  getCinematicSceneWarnings,
  resolveSceneOverlayAnimations,
  validateLottieJson,
  type CinematicOverlayAnimation,
  type SceneConfig,
} from "@razzia/extensions/core"
import type { UploadedMedia } from "@razzia/common/types/game"
import { useInstalledThemeCatalog } from "./installed-theme-catalog"
import {
  CinematicLayerStack,
  LottiePlayer,
} from "@razzia/extensions/presentation"
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
  ArrowDown,
  ArrowUp,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  DoorOpen,
  Film,
  Flag,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { useStudioEditor } from "./studio-editor-context"
import { StudioSelect } from "./studio-select"
interface CatalogLottieAsset {
  name: string
  url: string
  type: "lottie"
  size?: number
  addedAt?: number
  usedInCurrentShow?: boolean
  referenceCount?: number
  lottieMeta?: LottieMeta
}
interface PendingLottieDeleteConflict {
  name: string
  url: string
  error: string
  references: Array<{
    quizId: string
    subject?: string
    location: string
  }>
}
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...slice)
  }

  return btoa(binary)
}
function formatMsReadout(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const totalSec = clamped / 1000
  const mins = Math.floor(totalSec / 60)
  const secs = (totalSec % 60).toFixed(1).padStart(4, "0")

  return `${String(mins).padStart(2, "0")}:${secs}`
}
function getManagerAuthHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("token") : null

  return {
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...extra,
  }
}

export const StudioSceneEditor = () => {
  const { t } = useTranslation()
  const registry = useInstalledThemeCatalog()
  const {
    selectedTimelineItem,
    selectedTimelineIndex,
    timeline,
    scenes,
    updateSceneConfig,
    defaults,
  } = useStudioEditor()
  const { quizzId, questionIds } = useQuizzEditor()
  const { control } = useFormContext<QuizzFormValues>()
  const questions =
    useWatch({
      control,
      name: "questions",
    }) ?? []
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const lottieInputRef = useRef<HTMLInputElement>(null)
  const overlayFileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetOverlayIdRef = useRef<string | null>(null)

  // Preview aspect & playback controls
  const [previewAspect, setPreviewAspect] = useState<"16:9" | "4:3">("16:9")
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [previewTimeMs, setPreviewTimeMs] = useState(0)
  const [detectedVideoDurationMs, setDetectedVideoDurationMs] = useState<
    number | null
  >(null)

  // Overlay Animations section state
  const [overlaysSectionOpen, setOverlaysSectionOpen] = useState(true)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null,
  )
  const [expandedOverlayId, setExpandedOverlayId] = useState<string | null>(
    null,
  )
  const [lottieCatalogOpen, setLottieCatalogOpen] = useState(false)
  const [catalogTargetOverlayId, setCatalogTargetOverlayId] = useState<
    string | null
  >(null)
  const [lottieCatalog, setLottieCatalog] = useState<CatalogLottieAsset[]>([])
  const [lottieUploadError, setLottieUploadError] = useState<string | null>(
    null,
  )
  const [pendingDeleteConflict, setPendingDeleteConflict] =
    useState<PendingLottieDeleteConflict | null>(null)
  const refreshLottieCatalog = useCallback(async () => {
    try {
      const query = quizzId ? `?quizId=${encodeURIComponent(quizzId)}` : ""
      const res = await fetch(`/api/extensions/media/catalog${query}`, {
        headers: getManagerAuthHeaders(),
      })

      if (!res.ok) {
        return
      }

      const data = (await res.json()) as {
        lottieAssets?: CatalogLottieAsset[]
      }

      if (Array.isArray(data.lottieAssets)) {
        setLottieCatalog(data.lottieAssets)
      }
    } catch {
      // Ignore network error in offline/unit environment
    }
  }, [quizzId])
  /* oxlint-disable react/set-state-in-effect -- Synchronize external server/media/editor state without remounting this surface. */
  useEffect(() => {
    refreshLottieCatalog()
  }, [refreshLottieCatalog, selectedTimelineItem?.id])

  // Reset preview playback when switching timeline cards
  useEffect(() => {
    setIsPreviewPlaying(false)
    setPreviewTimeMs(0)
    setDetectedVideoDurationMs(null)
    setSelectedOverlayId(null)
    setExpandedOverlayId(null)
    setLottieUploadError(null)
  }, [selectedTimelineItem?.id])
  /* oxlint-enable react/set-state-in-effect */
  const sceneId =
    selectedTimelineItem && selectedTimelineItem.kind !== "question"
      ? selectedTimelineItem.sceneId
      : ""
  const scene = sceneId
    ? (scenes[sceneId] as SceneConfig | undefined)
    : undefined
  const isCinemaCapableScene =
    scene?.kind === "opening" ||
    scene?.kind === "closing" ||
    scene?.kind === "media"
  const isCinemaMode =
    scene?.kind === "opening" ||
    scene?.kind === "closing" ||
    (scene?.kind === "media" && scene.stageLayout === "cinema")
  const hasForegroundVideo = Boolean(
    scene &&
    "mediaUrl" in scene &&
    scene.mediaUrl &&
    (scene.mediaType === "video" ||
      /\.(mp4|webm|mov|m4v)$/iu.test(scene.mediaUrl)),
  )
  const configuredDurationMs =
    scene && "durationMs" in scene ? scene.durationMs : 5000
  const effectivePreviewDurationMs = useMemo(() => {
    if (
      hasForegroundVideo &&
      detectedVideoDurationMs &&
      detectedVideoDurationMs > 0
    ) {
      return detectedVideoDurationMs
    }

    return Math.max(1000, configuredDurationMs)
  }, [hasForegroundVideo, detectedVideoDurationMs, configuredDurationMs])

  // Drive non-video preview playback via requestAnimationFrame when Play is active
  useEffect(() => {
    if (!isPreviewPlaying || hasForegroundVideo) {
      return undefined
    }

    let rafId = 0
    let lastTs = performance.now()
    const step = (now: number) => {
      const dt = Math.max(0, now - lastTs)
      lastTs = now
      setPreviewTimeMs((prev) => {
        const next = prev + dt

        if (next >= effectivePreviewDurationMs) {
          setIsPreviewPlaying(false)

          return effectivePreviewDurationMs
        }

        return next
      })
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [isPreviewPlaying, hasForegroundVideo, effectivePreviewDurationMs])
  const resolvedOverlays = useMemo(() => {
    if (!scene || !isCinemaCapableScene) {
      return []
    }

    return resolveSceneOverlayAnimations(scene)
  }, [scene, isCinemaCapableScene])
  const cinematicWarnings = useMemo(() => {
    if (!scene || !isCinemaMode) {
      return []
    }

    const flags = getCinematicSceneWarnings(scene)
    const warnings: Array<{
      code: string
      message: string
    }> = []

    if (flags.loopAndOnMediaEndConflict) {
      warnings.push({
        code: "loopAndOnMediaEndConflict",
        message: t(
          "extensions:studio.scene.overlays.warnLoopMediaEnd",
          "Loop Video is enabled alongside Advance on Media End — the show will fall back to Duration Timer.",
        ),
      })
    }

    if (flags.heavyOverlayCount) {
      warnings.push({
        code: "heavyOverlayCount",
        message: t(
          "extensions:studio.scene.overlays.warnHeavyCount",
          "More than 4 active overlay animations may reduce frame rate on slower displays.",
        ),
      })
    }

    if (flags.mutedVideoAudio) {
      warnings.push({
        code: "mutedVideoAudio",
        message: t(
          "extensions:studio.scene.overlays.warnMutedVideo",
          "Foreground video is muted — enable sound or configure card audio if music is expected.",
        ),
      })
    }

    if (flags.cropNotices.length > 0) {
      warnings.push({
        code: "cropNotice",
        message: t(
          "extensions:studio.scene.overlays.warnSafeArea",
          "One or more overlays extend near the 4:3 safe area edge — check the 4:3 preview.",
        ),
      })
    }

    return warnings
  }, [scene, isCinemaMode, t])
  const commitOverlays = useCallback(
    (nextOverlays: CinematicOverlayAnimation[]) => {
      if (!sceneId) {
        return
      }

      const normalized = nextOverlays.map((ov, idx) => ({
        ...ov,
        order: idx,
      }))
      updateSceneConfig(sceneId, {
        overlayAnimations: normalized,
      })
    },
    [sceneId, updateSceneConfig],
  )
  const handleUpdateOverlayPosition = useCallback(
    (
      overlayId: string,
      pos: {
        x: number
        y: number
      },
    ) => {
      const next = resolvedOverlays.map((ov) =>
        ov.id === overlayId
          ? {
              ...ov,
              position: {
                x: Number(pos.x.toFixed(4)),
                y: Number(pos.y.toFixed(4)),
              },
            }
          : ov,
      )
      commitOverlays(next)
    },
    [resolvedOverlays, commitOverlays],
  )

  if (!selectedTimelineItem || selectedTimelineItem.kind === "question") {
    return null
  }

  if (!scene) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-8">
        {t("extensions:studio.scene.loading", "Loading scene editor...")}
      </div>
    )
  }

  const presetItems = isLegacyShowRollback(defaults)
    ? [
        ...CREATING_WORLDS_PRESETS.map((value) => ({
          value,
          label: `TADAZZ · ${value.replaceAll("-", " ")}`,
        })),
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
    : resolveShowTheme({
        selection: defaults.showTheme,
        role: "manager",
        registry,
      }).definition.capabilities.animationPresets.map((value) => ({
        value,
        label: t(`extensions:themes.presets.${value}`),
      }))
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
      label: t(
        "extensions:studio.scene.stageLayoutCinema",
        "Full-Stage Cinema",
      ),
    },
    {
      value: "card",
      label: t("extensions:studio.scene.stageLayoutCard", "Framed Card"),
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
      label: t("extensions:studio.scene.logoTop", "Top"),
    },
    {
      value: "center",
      label: t("extensions:studio.scene.logoCenter", "Center"),
    },
    {
      value: "bottom",
      label: t("extensions:studio.scene.logoBottom", "Bottom"),
    },
    {
      value: "hidden",
      label: t("extensions:studio.scene.logoHidden", "Hidden"),
    },
  ]
  const endBehaviorItems = [
    {
      value: "holdFrame",
      label: t("extensions:studio.scene.endHoldFrame", "Hold final frame"),
    },
    {
      value: "advanceNext",
      label: t(
        "extensions:studio.scene.endAdvanceNext",
        "Advance to next card",
      ),
    },
    {
      value: "fadeToTitle",
      label: t(
        "extensions:studio.scene.endFadeToTitle",
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
    const detectedType: "image" | "video" | "audio" = (() => {
      if (item.type === "video") {
        return "video"
      }

      if (item.type === "audio") {
        return "audio"
      }

      return "image"
    })()
    updateSceneConfig(sceneId, {
      mediaUrl: item.url,
      mediaType: detectedType,
    })
    setMediaPickerOpen(false)
  }
  const uploadLottieFileToServer = async (
    file: File,
  ): Promise<{
    url: string
    name: string
  } | null> => {
    setLottieUploadError(null)

    try {
      const lowerName = file.name.toLowerCase()
      const buffer = await file.arrayBuffer()
      const header = new Uint8Array(buffer.slice(0, 4))
      const isZipMagic =
        header.length >= 4 &&
        header[0] === 0x50 &&
        header[1] === 0x4b &&
        header[2] === 0x03 &&
        header[3] === 0x04

      if (
        lowerName.endsWith(".lottie") ||
        lowerName.endsWith(".zip") ||
        isZipMagic
      ) {
        const format = lowerName.endsWith(".zip") ? "zip" : "dotlottie"
        const contentBase64 = arrayBufferToBase64(buffer)
        const response = await fetch("/api/extensions/lottie", {
          method: "POST",
          headers: getManagerAuthHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            name: file.name,
            format,
            contentBase64,
            ...(quizzId
              ? {
                  quizId: quizzId,
                }
              : {}),
          }),
        })

        if (!response.ok) {
          const errPayload = (await response.json().catch(() => ({}))) as {
            error?: string
            reason?: string
          }
          const msg =
            errPayload.reason ||
            errPayload.error ||
            t(
              "extensions:studio.scene.lottieInvalidError",
              "Invalid .lottie or ZIP archive",
            )
          setLottieUploadError(msg)
          toast.error(msg)

          return null
        }

        const uploaded = (await response.json()) as {
          url?: string
          name?: string
        }
        await refreshLottieCatalog()

        if (uploaded.url) {
          return {
            url: uploaded.url,
            name: uploaded.name ?? file.name,
          }
        }

        return null
      }

      const rawText = new TextDecoder("utf-8").decode(buffer)
      const validation = validateLottieJson(rawText)

      if (!validation.valid) {
        const msg = validation.reason || validation.error
        setLottieUploadError(msg)
        toast.error(msg)

        return null
      }

      const response = await fetch("/api/extensions/lottie", {
        method: "POST",
        headers: getManagerAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          name: file.name,
          format: "json",
          content: rawText,
          ...(quizzId
            ? {
                quizId: quizzId,
              }
            : {}),
        }),
      })

      if (!response.ok) {
        const errPayload = (await response.json().catch(() => ({}))) as {
          error?: string
          reason?: string
        }
        const msg =
          errPayload.reason ||
          errPayload.error ||
          t(
            "extensions:studio.scene.lottieInvalidError",
            "Invalid Lottie JSON file",
          )
        setLottieUploadError(msg)
        toast.error(msg)

        return null
      }

      const uploaded = (await response.json()) as {
        url?: string
        name?: string
      }
      await refreshLottieCatalog()

      if (uploaded.url) {
        return {
          url: uploaded.url,
          name: uploaded.name ?? file.name,
        }
      }

      return null
    } catch {
      const msg = t(
        "extensions:studio.scene.lottieInvalidError",
        "Invalid Lottie file",
      )
      setLottieUploadError(msg)
      toast.error(msg)

      return null
    }
  }
  const handleLottieUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    const uploaded = await uploadLottieFileToServer(file)

    if (uploaded?.url) {
      updateSceneConfig(sceneId, {
        lottieUrl: uploaded.url,
      })
    }
  }
  const handleAddOverlayLayer = (assetUrl?: string, customLabel?: string) => {
    if (resolvedOverlays.length >= MAX_CINEMATIC_OVERLAY_ANIMATIONS) {
      toast.error(
        `Maximum of ${MAX_CINEMATIC_OVERLAY_ANIMATIONS} overlay animations reached.`,
      )

      return
    }

    const targetUrl =
      assetUrl ?? lottieCatalog[0]?.url ?? "/media/overlay-animation.json"
    const nextIndex = resolvedOverlays.length
    const defaultLabel =
      customLabel ??
      t("extensions:studio.scene.overlays.layerDefaultLabel", {
        num: nextIndex + 1,
        defaultValue: `Overlay ${nextIndex + 1}`,
      })
    const created = createDefaultOverlayAnimation({
      assetUrl: targetUrl,
      order: nextIndex,
      label: defaultLabel,
      timeBase: hasForegroundVideo ? "video" : "scene",
    })
    const next = [...resolvedOverlays, created]
    commitOverlays(next)
    setSelectedOverlayId(created.id)
    setExpandedOverlayId(created.id)
    setOverlaysSectionOpen(true)
  }
  const handleOverlayFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    const targetOverlayId = uploadTargetOverlayIdRef.current
    uploadTargetOverlayIdRef.current = null

    if (!file) {
      return
    }

    const uploaded = await uploadLottieFileToServer(file)

    if (!uploaded) {
      return
    }

    if (targetOverlayId) {
      const next = resolvedOverlays.map((ov) =>
        ov.id === targetOverlayId
          ? {
              ...ov,
              assetUrl: uploaded.url,
            }
          : ov,
      )
      commitOverlays(next)
      setSelectedOverlayId(targetOverlayId)
      setExpandedOverlayId(targetOverlayId)
    } else {
      const cleanLabel = file.name.replace(/\.(json|lottie|zip)$/iu, "")
      handleAddOverlayLayer(uploaded.url, cleanLabel)
    }
  }
  const handleUpdateOverlay = (
    overlayId: string,
    patch: Partial<CinematicOverlayAnimation>,
  ) => {
    const next = resolvedOverlays.map((ov) =>
      ov.id === overlayId
        ? {
            ...ov,
            ...patch,
          }
        : ov,
    )
    commitOverlays(next)
  }
  const handleMoveOverlay = (overlayId: string, delta: -1 | 1) => {
    const idx = resolvedOverlays.findIndex((ov) => ov.id === overlayId)

    if (idx < 0) {
      return
    }

    const targetIdx = idx + delta

    if (targetIdx < 0 || targetIdx >= resolvedOverlays.length) {
      return
    }

    const copy = [...resolvedOverlays]
    const [moved] = copy.splice(idx, 1)
    copy.splice(targetIdx, 0, moved)
    commitOverlays(copy)
  }
  const handleDuplicateOverlay = (overlayId: string) => {
    if (resolvedOverlays.length >= MAX_CINEMATIC_OVERLAY_ANIMATIONS) {
      toast.error(
        `Maximum of ${MAX_CINEMATIC_OVERLAY_ANIMATIONS} overlay animations reached.`,
      )

      return
    }

    const idx = resolvedOverlays.findIndex((ov) => ov.id === overlayId)

    if (idx < 0) {
      return
    }

    const source = resolvedOverlays[idx]
    const cloned: CinematicOverlayAnimation = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      label: `${source.label || `Overlay ${idx + 1}`} (Copy)`.slice(0, 80),
      order: idx + 1,
    }
    const next = [
      ...resolvedOverlays.slice(0, idx + 1),
      cloned,
      ...resolvedOverlays.slice(idx + 1),
    ]
    commitOverlays(next)
    setSelectedOverlayId(cloned.id)
    setExpandedOverlayId(cloned.id)
  }
  const handleRemoveOverlay = (overlayId: string) => {
    const next = resolvedOverlays.filter((ov) => ov.id !== overlayId)
    commitOverlays(next)

    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null)
    }

    if (expandedOverlayId === overlayId) {
      setExpandedOverlayId(null)
    }
  }
  const handleDeleteLottieFromCatalog = async (
    asset: CatalogLottieAsset,
    detach = false,
  ) => {
    try {
      const res = await fetch(
        `/api/extensions/lottie/${encodeURIComponent(asset.name)}${detach ? "?detach=true" : ""}`,
        {
          method: "DELETE",
          headers: getManagerAuthHeaders(),
        },
      )

      if (res.status === 409) {
        const conflictBody = (await res.json()) as {
          error?: string
          references?: Array<{
            quizId: string
            subject?: string
            location: string
          }>
        }
        setPendingDeleteConflict({
          name: asset.name,
          url: asset.url,
          error:
            conflictBody.error ??
            t(
              "extensions:mediaLibrary.inUseWarning",
              "This Lottie animation is currently used by one or more cards.",
            ),
          references: conflictBody.references ?? [],
        })

        return
      }

      if (res.ok || res.status === 204) {
        setPendingDeleteConflict(null)

        if (detach) {
          const remaining = resolvedOverlays.filter(
            (ov) => ov.assetUrl !== asset.url,
          )

          if (remaining.length !== resolvedOverlays.length) {
            commitOverlays(remaining)
          }
        }

        await refreshLottieCatalog()
      }
    } catch {
      toast.error("Failed to delete Lottie asset")
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
      if (i >= selectedTimelineIndex && selectedTimelineIndex >= 0) {
        break
      }

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
  const recapQuestionRange = (() => {
    if (scene.kind === "answerRecap") {
      if (selectedStartQuestionIndex >= 0) {
        return precedingQuestions.slice(selectedStartQuestionIndex)
      }

      return precedingQuestions
    }

    return []
  })()
  const pickerAcceptType = (() => {
    if ("mediaType" in scene) {
      if (scene.mediaType === "audio") {
        return "audio"
      }

      if (scene.mediaType === "video") {
        return "video"
      }

      if (scene.mediaType === "image") {
        return "image"
      }

      return "all"
    }

    return "all"
  })()
  const overlayTrackColors = [
    "bg-amber-400/80 border-amber-300",
    "bg-sky-400/80 border-sky-300",
    "bg-emerald-400/80 border-emerald-300",
    "bg-pink-400/80 border-pink-300",
    "bg-purple-400/80 border-purple-300",
    "bg-orange-400/80 border-orange-300",
    "bg-teal-400/80 border-teal-300",
    "bg-indigo-400/80 border-indigo-300",
  ]

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      {/* Center Stage Preview Area */}
      <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col items-center justify-center gap-3 p-3 sm:p-6 lg:overflow-y-auto">
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

        {/* Top Preview Bar: 16:9 / 4:3 Aspect Ratio Switch & Transport Controls */}
        {isCinemaCapableScene && (
          <div
            data-testid="studio-preview-toolbar"
            className="border-accent bg-background/90 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                type="button"
                data-testid="studio-preview-aspect-16-9"
                onClick={() => setPreviewAspect("16:9")}
                className={clsx(
                  "rounded-md px-2.5 py-1 font-bold transition",
                  previewAspect === "16:9"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-accent/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {t("extensions:studio.scene.overlays.aspect16x9", "16:9 Wide")}
              </Button>
              <Button
                size="sm"
                type="button"
                data-testid="studio-preview-aspect-4-3"
                onClick={() => setPreviewAspect("4:3")}
                className={clsx(
                  "rounded-md px-2.5 py-1 font-bold transition",
                  previewAspect === "4:3"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-accent/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {t(
                  "extensions:studio.scene.overlays.aspect4x3",
                  "4:3 Standard",
                )}
              </Button>
            </div>

            {isCinemaMode && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  data-testid="studio-preview-play-pause"
                  onClick={() => {
                    if (
                      !isPreviewPlaying &&
                      previewTimeMs >= effectivePreviewDurationMs
                    ) {
                      setPreviewTimeMs(0)
                    }

                    setIsPreviewPlaying((prev) => !prev)
                  }}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-bold shadow-xs transition hover:opacity-90"
                >
                  {isPreviewPlaying ? (
                    <>
                      <Pause className="size-3.5" />
                      <span>
                        {t("extensions:studio.scene.overlays.pause", "Pause")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" />
                      <span>
                        {t("extensions:studio.scene.overlays.play", "Play")}
                      </span>
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  data-testid="studio-preview-replay"
                  onClick={() => {
                    setIsPreviewPlaying(false)
                    setPreviewTimeMs(0)
                  }}
                  title={t(
                    "extensions:studio.scene.overlays.replay",
                    "Replay from 0:00",
                  )}
                  className="bg-accent text-accent-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition hover:opacity-85"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
                <span
                  data-testid="studio-preview-time-readout"
                  className="text-muted-foreground font-mono text-[11px] font-bold"
                >
                  {formatMsReadout(previewTimeMs)} /{" "}
                  {formatMsReadout(effectivePreviewDurationMs)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Stage Preview Container */}
        <div
          data-testid="studio-scene-preview-stage"
          data-preview-aspect={previewAspect}
          className={clsx(
            "border-accent bg-secondary/90 relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 text-center text-white shadow-xl",
            previewAspect === "4:3"
              ? "aspect-[4/3] max-w-2xl"
              : "aspect-video max-w-3xl",
            !isCinemaMode && "p-4 sm:p-8",
          )}
        >
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
                style={{
                  opacity: scene.background.overlayOpacity ?? 0.35,
                }}
              />
            </div>
          )}

          {/* Unified CinematicLayerStack for Opening, Closing, and Media Cinema Mode */}
          {isCinemaMode ? (
            <div
              data-testid={`scene-preview-${scene.kind}`}
              className="relative flex h-full w-full flex-1"
            >
              <CinematicLayerStack
                sceneId={scene.id}
                sceneKind={scene.kind}
                mediaUrl={"mediaUrl" in scene ? scene.mediaUrl : undefined}
                mediaType={"mediaType" in scene ? scene.mediaType : undefined}
                mediaFit={
                  "mediaFit" in scene
                    ? (scene.mediaFit ??
                      (scene.kind === "media" ? "contain" : "cover"))
                    : "cover"
                }
                volume={"volume" in scene ? (scene.volume ?? 0.8) : 0.8}
                loop={"loop" in scene ? (scene.loop ?? false) : false}
                muted={"muted" in scene ? (scene.muted ?? false) : false}
                showControls={false}
                endBehavior={
                  "endBehavior" in scene
                    ? (scene.endBehavior ?? "holdFrame")
                    : "holdFrame"
                }
                lottieUrl={"lottieUrl" in scene ? scene.lottieUrl : undefined}
                lottieFit={
                  "lottieFit" in scene
                    ? (scene.lottieFit ?? "contain")
                    : "contain"
                }
                lottieLoop={
                  "lottieLoop" in scene ? (scene.lottieLoop ?? true) : true
                }
                lottieSpeed={
                  "lottieSpeed" in scene ? (scene.lottieSpeed ?? 1) : 1
                }
                overlayAnimations={
                  "overlayAnimations" in scene
                    ? scene.overlayAnimations
                    : undefined
                }
                interactiveEditorMode={true}
                controlledPaused={!isPreviewPlaying}
                controlledTimeMs={
                  isPreviewPlaying && hasForegroundVideo
                    ? undefined
                    : previewTimeMs
                }
                selectedOverlayId={selectedOverlayId}
                onSelectOverlay={(id) => {
                  setSelectedOverlayId(id)

                  if (id) {
                    setExpandedOverlayId(id)
                    setOverlaysSectionOpen(true)
                  }
                }}
                onUpdateOverlayPosition={handleUpdateOverlayPosition}
                onVideoDurationDetected={(ms) => setDetectedVideoDurationMs(ms)}
                onClockTick={(ms) => setPreviewTimeMs(ms)}
                onEditorMediaEnded={() => setIsPreviewPlaying(false)}
                titleSlot={
                  <div
                    className={clsx(
                      "flex h-full w-full flex-col items-center justify-center gap-3 p-4",
                      "logoPosition" in scene &&
                        scene.logoPosition === "top" &&
                        "justify-start pt-4",
                      "logoPosition" in scene &&
                        scene.logoPosition === "bottom" &&
                        "justify-end pb-8",
                    )}
                  >
                    {(scene.kind === "opening" || scene.kind === "closing") &&
                      (scene.logoPosition ?? "center") !== "hidden" && (
                        <div className="bg-primary/20 text-primary rounded-full p-4">
                          {scene.kind === "opening" ? (
                            <DoorOpen className="size-10 sm:size-12" />
                          ) : (
                            <Flag className="size-10 sm:size-12" />
                          )}
                        </div>
                      )}

                    {"mediaUrl" in scene &&
                      scene.mediaUrl &&
                      scene.mediaType === "audio" && (
                        <audio
                          data-testid="scene-preview-audio"
                          src={scene.mediaUrl}
                          controls={scene.showControls ?? true}
                          className="pointer-events-auto w-60 max-w-full"
                        />
                      )}

                    {(("textOverlay" in scene ? scene.textOverlay : true) ??
                      true) && (
                      <>
                        {scene.title && (
                          <h1 className="text-2xl font-extrabold tracking-tight drop-shadow-md sm:text-4xl">
                            {scene.title}
                          </h1>
                        )}
                        {"subtitle" in scene && scene.subtitle && (
                          <p className="text-base text-white/85 drop-shadow-xs sm:text-xl">
                            {scene.subtitle}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                }
              />
            </div>
          ) : (
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center">
              {scene.kind === "transition" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-primary/20 text-primary rounded-full p-4">
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
                        "text-primary rounded-full p-5 transition-all",
                        scene.preset === "spotlight" &&
                          "bg-amber-400/25 shadow-[0_0_40px_rgba(251,191,36,0.45)] ring-4 ring-amber-300/40",
                        scene.preset === "confetti" &&
                          "animate-bounce bg-pink-500/25 ring-4 ring-pink-400/40",
                        scene.preset === "bounce" &&
                          "bg-primary/20 animate-bounce",
                        scene.preset === "pulse" &&
                          "animate-pulse bg-emerald-500/25 ring-4 ring-emerald-400/40",
                      )}
                    >
                      <Sparkles className="size-16" />
                    </div>
                  )}
                  <h2 className="text-2xl font-bold sm:text-3xl">
                    {scene.title ?? `Animation: ${scene.preset}`}
                  </h2>
                  <span className="text-primary rounded-full bg-white/20 px-4 py-1 text-sm font-semibold tracking-wider uppercase">
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
                      <div className="bg-primary/25 text-primary rounded-full p-4">
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
                      {(() => {
                        if (scene.mediaType === "audio") {
                          return <Music className="size-16" />
                        }

                        if (scene.mediaType === "video") {
                          return <Film className="size-16" />
                        }

                        return <ImageIcon className="size-16" />
                      })()}
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
                  <div className="bg-primary/20 text-primary rounded-full p-4">
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
                        1.{" "}
                        {t("extensions:studio.scene.samplePlayer1", "Player 1")}
                      </span>
                      <span className="text-primary font-bold">1200 pts</span>
                    </div>
                    <div className="flex justify-between border-b border-white/20 py-1">
                      <span>
                        2.{" "}
                        {t("extensions:studio.scene.samplePlayer2", "Player 2")}
                      </span>
                      <span className="text-primary font-bold">950 pts</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>
                        3.{" "}
                        {t("extensions:studio.scene.samplePlayer3", "Player 3")}
                      </span>
                      <span className="text-primary font-bold">800 pts</span>
                    </div>
                  </div>
                </div>
              )}

              {scene.kind === "interimResults" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-primary/20 text-primary rounded-full p-4">
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
                    <div className="bg-primary/20 text-primary rounded-full p-2.5">
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
                              <span className="bg-primary/30 text-primary rounded px-1.5 py-0.5 text-[10px]">
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
                  <div className="border-primary text-primary relative flex size-24 items-center justify-center rounded-full border-4 text-4xl font-black sm:size-28 sm:text-5xl">
                    {scene.durationSeconds}
                  </div>
                  <h2 className="text-xl font-bold sm:text-2xl">
                    {scene.title ?? t("extensions:timeline.countdown")}
                  </h2>
                </div>
              )}
            </div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-2 text-xs font-semibold text-white/50">
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

        {/* Unified Timeline Scrub Bar & Colored Overlay Tracks */}
        {isCinemaMode && (
          <div
            data-testid="studio-preview-scrub-bar"
            className="border-accent bg-background/90 flex w-full max-w-3xl flex-col gap-1.5 rounded-xl border px-3 py-2 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px] font-bold">
                {t(
                  "extensions:studio.scene.overlays.scrubTimeline",
                  "Timeline Scrub",
                )}
              </span>
              <input
                type="range"
                data-testid="studio-preview-scrub-slider"
                min={0}
                max={effectivePreviewDurationMs}
                step={50}
                value={Math.min(previewTimeMs, effectivePreviewDurationMs)}
                onChange={(e) => {
                  setIsPreviewPlaying(false)
                  setPreviewTimeMs(Number(e.target.value))
                }}
                className="flex-1 cursor-pointer"
              />
            </div>

            {resolvedOverlays.length > 0 && (
              <div className="flex flex-col gap-1 pt-0.5">
                {resolvedOverlays.map((ov, idx) => {
                  const startPct = Math.max(
                    0,
                    Math.min(
                      100,
                      (ov.startMs / effectivePreviewDurationMs) * 100,
                    ),
                  )
                  const endMs =
                    ov.durationMs !== undefined
                      ? ov.startMs + ov.durationMs
                      : effectivePreviewDurationMs
                  const widthPct = Math.max(
                    3,
                    Math.min(
                      100 - startPct,
                      ((endMs - ov.startMs) / effectivePreviewDurationMs) * 100,
                    ),
                  )
                  const colorCls =
                    overlayTrackColors[idx % overlayTrackColors.length]

                  return (
                    <Button
                      type="button"
                      size="sm"
                      classNameContent="contents"
                      key={ov.id}
                      data-testid={`studio-preview-track-${ov.id}`}
                      onClick={() => {
                        setSelectedOverlayId(ov.id)
                        setExpandedOverlayId(ov.id)
                        setOverlaysSectionOpen(true)
                      }}
                      className={`bg-accent/50 relative h-4 w-full cursor-pointer overflow-hidden rounded border-0 bg-transparent p-0 disabled:opacity-100`}
                      title={`${ov.label || `Overlay ${idx + 1}`}: ${(ov.startMs / 1000).toFixed(1)}s – ${(endMs / 1000).toFixed(1)}s`}
                    >
                      <div
                        className={clsx(
                          "absolute top-0 bottom-0 flex items-center truncate rounded border px-1.5 text-[10px] font-bold text-slate-950 transition",
                          colorCls,
                          !ov.enabled && "opacity-35",
                          selectedOverlayId === ov.id &&
                            "ring-primary ring-2 ring-offset-1",
                        )}
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                        }}
                      >
                        <span className="truncate">
                          {ov.label || `Overlay ${idx + 1}`}
                        </span>
                      </div>
                    </Button>
                  )
                })}
                <p className="text-muted-foreground text-[10px]">
                  {t(
                    "extensions:studio.scene.overlays.dragHint",
                    "Tip: Click or drag any overlay directly on the stage preview (Arrow keys nudge 1%, Shift+Arrow 5%).",
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Right Config Aside */}
      <aside className="bg-background z-10 m-2 flex w-[calc(100%-1rem)] shrink-0 flex-col gap-4 rounded-xl p-3 shadow-sm lg:m-3 lg:w-80 lg:overflow-y-auto lg:p-4 xl:w-96">
        <div className="border-accent flex items-center gap-2 border-b pb-3">
          <span className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
            {t("extensions:studio.scene.kindSettings", {
              kind: scene.kind,
              defaultValue: `${scene.kind} Settings`,
            })}
          </span>
        </div>

        {/* Title Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-foreground text-xs font-bold">
            {t("extensions:studio.scene.titleLabel", "Title")}
          </label>
          <Input
            value={scene.title ?? ""}
            onChange={(e) =>
              updateSceneConfig(sceneId, {
                title: e.target.value,
              })
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
            <label className="text-foreground text-xs font-bold">
              {"subtitle" in scene
                ? t("extensions:studio.scene.subtitleLabel", "Subtitle")
                : t("extensions:studio.scene.descriptionLabel", "Description")}
            </label>
            <Input
              value={subtitleOrDesc}
              onChange={(e) => {
                if ("subtitle" in scene) {
                  updateSceneConfig(sceneId, {
                    subtitle: e.target.value,
                  })
                } else if ("description" in scene) {
                  updateSceneConfig(sceneId, {
                    description: e.target.value,
                  })
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
            className="border-accent flex flex-col gap-3 rounded-lg border p-2.5"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-bold">
                {t(
                  "extensions:studio.scene.recapStartQuestionLabel",
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
                      "extensions:studio.scene.recapNoPrecedingWarning",
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
                  className="text-muted-foreground text-[11px]"
                >
                  {t("extensions:studio.scene.recapRangeSummary", {
                    start: recapQuestionRange[0].questionNumber,
                    count: recapQuestionRange.length,
                    defaultValue: `Recaps from Question ${recapQuestionRange[0].questionNumber} up to this recap card (${recapQuestionRange.length} questions)`,
                  })}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-bold">
                {t("extensions:studio.scene.recapModeLabel", "Highlight Mode")}
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
              <label className="text-foreground text-xs font-bold">
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
              <label className="text-foreground flex items-center gap-1.5 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={scene.showCounts ?? true}
                  onChange={(e) =>
                    updateSceneConfig(sceneId, {
                      showCounts: e.target.checked,
                    })
                  }
                />
                {t(
                  "extensions:studio.scene.recapShowCounts",
                  "Show Vote Counts",
                )}
              </label>
              <label className="text-foreground flex items-center gap-1.5 text-xs font-medium">
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
          <div className="border-accent flex flex-col gap-2.5 rounded-lg border p-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-foreground text-xs font-bold">
                {t("extensions:studio.scene.mediaTypeLabel", "Media Type")}
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
              <label className="text-foreground text-xs font-bold">
                {t("extensions:studio.scene.mediaAsset", "Media Asset")}
              </label>
              <div className="flex gap-2">
                <Input
                  data-testid="scene-media-url-input"
                  value={mediaUrl}
                  onChange={(e) =>
                    updateSceneConfig(sceneId, {
                      mediaUrl: e.target.value,
                    })
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
                <label className="text-foreground text-xs font-bold">
                  {t("extensions:studio.scene.mediaFitLabel", "Media Fit")}
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

            {scene.kind === "media" && (
              <div className="flex flex-col gap-1">
                <label className="text-foreground text-xs font-bold">
                  {t(
                    "extensions:studio.scene.stageLayoutLabel",
                    "Stage Layout",
                  )}
                </label>
                <StudioSelect
                  value={scene.stageLayout ?? "card"}
                  onChange={(val: string) =>
                    updateSceneConfig(sceneId, {
                      stageLayout: val as "cinema" | "card",
                    })
                  }
                  items={stageLayoutItems}
                />
              </div>
            )}

            {(scene.mediaType === "video" || scene.mediaType === "audio") && (
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground font-semibold">
                    {t("extensions:audio.volume", "Volume")}
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
                        updateSceneConfig(sceneId, {
                          loop: e.target.checked,
                        })
                      }
                    />
                    {t(
                      "extensions:studio.scene.lottieLoopLabel",
                      "Loop playback",
                    )}
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={scene.muted ?? false}
                      onChange={(e) =>
                        updateSceneConfig(sceneId, {
                          muted: e.target.checked,
                        })
                      }
                    />
                    {t("extensions:studio.scene.mutedLabel", "Start Muted")}
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
                      "extensions:studio.scene.showControlsLabel",
                      "Show Player Controls",
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
            className="border-accent flex flex-col gap-2.5 rounded-lg border p-2.5"
          >
            <div className="flex flex-col gap-1">
              <label className="text-foreground text-xs font-bold">
                {t("extensions:studio.scene.stageLayoutLabel", "Stage Layout")}
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
              <label className="text-foreground text-xs font-bold">
                {t(
                  "extensions:studio.scene.logoPositionLabel",
                  "Brand Logo Position",
                )}
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
              <label className="text-foreground text-xs font-bold">
                {t(
                  "extensions:studio.scene.endBehaviorLabel",
                  "When Media Ends",
                )}
              </label>
              <StudioSelect
                value={scene.endBehavior ?? "holdFrame"}
                onChange={(val: string) =>
                  updateSceneConfig(sceneId, {
                    endBehavior: val as
                      "holdFrame" | "advanceNext" | "fadeToTitle",
                  })
                }
                items={endBehaviorItems}
              />
            </div>

            <label className="text-foreground flex items-center gap-1.5 text-xs font-medium">
              <input
                type="checkbox"
                checked={scene.textOverlay ?? true}
                onChange={(e) =>
                  updateSceneConfig(sceneId, {
                    textOverlay: e.target.checked,
                  })
                }
              />
              {t(
                "extensions:studio.scene.textOverlayLabel",
                "Show Title & Subtitle Overlay",
              )}
            </label>
          </div>
        )}

        {/* Collapsible OVERLAY ANIMATIONS Section for Opening, Closing, and Media Cinema */}
        {isCinemaMode && (
          <div
            data-testid="studio-overlay-animations-section"
            className="border-accent flex flex-col gap-2.5 rounded-lg border p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                type="button"
                data-testid="studio-overlay-section-toggle"
                onClick={() => setOverlaysSectionOpen((prev) => !prev)}
                className="text-foreground flex items-center gap-1.5 text-left text-xs font-bold"
              >
                {overlaysSectionOpen ? (
                  <ChevronDown className="text-muted-foreground size-4" />
                ) : (
                  <ChevronRight className="text-muted-foreground size-4" />
                )}
                <Sparkles className="text-primary size-3.5" />
                <span>
                  {t(
                    "extensions:studio.scene.overlays.sectionTitle",
                    "Overlay Animations",
                  )}
                </span>
                <span className="bg-accent text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {resolvedOverlays.length}/{MAX_CINEMATIC_OVERLAY_ANIMATIONS}
                </span>
              </Button>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  data-testid="studio-overlay-open-catalog-btn"
                  onClick={() => {
                    setCatalogTargetOverlayId(null)
                    setLottieCatalogOpen((prev) => !prev)
                    refreshLottieCatalog()
                  }}
                  className="bg-accent text-accent-foreground px-2 py-1 text-[11px]"
                  title={t(
                    "extensions:studio.scene.overlays.chooseCatalog",
                    "Choose from Library",
                  )}
                >
                  <FolderOpen className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  data-testid="studio-overlay-add-btn"
                  disabled={
                    resolvedOverlays.length >= MAX_CINEMATIC_OVERLAY_ANIMATIONS
                  }
                  onClick={() => handleAddOverlayLayer()}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold"
                >
                  <Plus className="size-3.5" />
                  <span>
                    {t(
                      "extensions:studio.scene.overlays.addButton",
                      "Add animation",
                    )}
                  </span>
                </Button>
              </div>
            </div>

            <input
              ref={overlayFileInputRef}
              data-testid="studio-overlay-file-input"
              type="file"
              accept=".json,.lottie,.zip,application/json,application/zip"
              className="hidden"
              onChange={handleOverlayFileSelected}
            />

            {lottieUploadError && (
              <div
                data-testid="studio-overlay-upload-error"
                className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-300"
              >
                {lottieUploadError}
              </div>
            )}

            {cinematicWarnings.length > 0 && (
              <div
                data-testid="studio-cinematic-warnings"
                className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200"
              >
                {cinematicWarnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Shared Lottie Catalog Picker & Reference-Safe Delete Panel */}
            {lottieCatalogOpen && (
              <div
                data-testid="studio-lottie-catalog-panel"
                className="border-accent bg-accent/30 flex flex-col gap-2 rounded-md border p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-[11px] font-bold">
                    {t(
                      "extensions:studio.scene.overlays.chooseCatalog",
                      "Choose from Library",
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    data-testid="studio-overlay-upload-new-btn"
                    onClick={() => {
                      uploadTargetOverlayIdRef.current = catalogTargetOverlayId
                      overlayFileInputRef.current?.click()
                    }}
                    className="bg-accent text-accent-foreground inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
                  >
                    <Upload className="size-3" />
                    <span>
                      {t(
                        "extensions:studio.scene.overlays.uploadNew",
                        "Upload (.json / .lottie / .zip)",
                      )}
                    </span>
                  </Button>
                </div>

                {lottieCatalog.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">
                    No Lottie animations in library yet. Upload a .json or
                    .lottie file.
                  </p>
                ) : (
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {lottieCatalog.map((item) => (
                      <div
                        key={item.name}
                        data-testid={`studio-lottie-catalog-item-${item.name}`}
                        className="bg-background flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px]"
                      >
                        <Button
                          size="sm"
                          type="button"
                          data-testid={`studio-lottie-catalog-select-${item.name}`}
                          onClick={() => {
                            if (catalogTargetOverlayId) {
                              handleUpdateOverlay(catalogTargetOverlayId, {
                                assetUrl: item.url,
                              })
                            } else {
                              const cleanLabel = item.name.replace(
                                /\.(json|lottie)$/iu,
                                "",
                              )
                              handleAddOverlayLayer(item.url, cleanLabel)
                            }

                            setLottieCatalogOpen(false)
                            setCatalogTargetOverlayId(null)
                          }}
                          className="text-foreground hover:text-primary min-w-0 flex-1 truncate text-left font-semibold"
                        >
                          {item.name}
                          {typeof item.referenceCount === "number" &&
                            item.referenceCount > 0 && (
                              <span className="text-muted-foreground ml-1.5 text-[10px] font-normal">
                                ({item.referenceCount} in use)
                              </span>
                            )}
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          data-testid={`studio-lottie-catalog-delete-${item.name}`}
                          onClick={() => handleDeleteLottieFromCatalog(item)}
                          title={t(
                            "extensions:studio.scene.overlays.deleteFile",
                            "Delete File from Library",
                          )}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {pendingDeleteConflict && (
                  <div
                    data-testid="studio-lottie-delete-conflict-modal"
                    className="flex flex-col gap-1.5 rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px]"
                  >
                    <p className="font-bold text-red-600 dark:text-red-300">
                      {t("extensions:mediaLibrary.inUseWarning", {
                        name: pendingDeleteConflict.name,
                        defaultValue: `"${pendingDeleteConflict.name}" is currently referenced by ${pendingDeleteConflict.references.length} scene(s).`,
                      })}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setPendingDeleteConflict(null)}
                        className="bg-accent text-accent-foreground px-2 py-0.5 text-[10px]"
                      >
                        {t("extensions:conflict.cancel", "Cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        data-testid="studio-lottie-confirm-detach-delete"
                        onClick={() =>
                          handleDeleteLottieFromCatalog(
                            {
                              name: pendingDeleteConflict.name,
                              url: pendingDeleteConflict.url,
                              type: "lottie",
                            },
                            true,
                          )
                        }
                        className="bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"
                      >
                        {t(
                          "extensions:mediaLibrary.detachAndDelete",
                          "Detach & Delete",
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {overlaysSectionOpen && (
              <div className="flex flex-col gap-2">
                {resolvedOverlays.length === 0 ? (
                  <p
                    data-testid="studio-overlay-empty-state"
                    className="text-muted-foreground text-[11px]"
                  >
                    {t(
                      "extensions:studio.scene.overlays.emptyState",
                      'No overlay animations yet. Click "+ Add animation" to place a transparent Lottie layer on stage.',
                    )}
                  </p>
                ) : (
                  resolvedOverlays.map((ov, idx) => {
                    const isExpanded = expandedOverlayId === ov.id
                    const isSelected = selectedOverlayId === ov.id

                    return (
                      <div
                        key={ov.id}
                        data-testid={`studio-overlay-row-${ov.id}`}
                        className={clsx(
                          "flex flex-col gap-2 rounded-lg border p-2 transition",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-accent bg-background",
                        )}
                      >
                        {/* Compact Layer Row Header */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <input
                              type="checkbox"
                              data-testid={`studio-overlay-enabled-${ov.id}`}
                              checked={ov.enabled}
                              onChange={(e) =>
                                handleUpdateOverlay(ov.id, {
                                  enabled: e.target.checked,
                                })
                              }
                              title={t(
                                "extensions:studio.scene.overlays.enabled",
                                "Enabled",
                              )}
                            />
                            <Button
                              size="sm"
                              type="button"
                              data-testid={`studio-overlay-expand-${ov.id}`}
                              onClick={() => {
                                setSelectedOverlayId(ov.id)
                                setExpandedOverlayId(isExpanded ? null : ov.id)
                              }}
                              className="text-foreground flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-bold"
                            >
                              {isExpanded ? (
                                <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                              )}
                              <span className="truncate">
                                {ov.label ||
                                  t(
                                    "extensions:studio.scene.overlays.layerDefaultLabel",
                                    {
                                      num: idx + 1,
                                      defaultValue: `Overlay ${idx + 1}`,
                                    },
                                  )}
                              </span>
                            </Button>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <span className="bg-accent text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold">
                              {(ov.startMs / 1000).toFixed(1)}s
                            </span>
                            <Button
                              size="sm"
                              type="button"
                              data-testid={`studio-overlay-up-${ov.id}`}
                              disabled={idx === 0}
                              onClick={() => handleMoveOverlay(ov.id, -1)}
                              title={t(
                                "extensions:studio.scene.overlays.moveUp",
                                "Move Up",
                              )}
                              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 disabled:opacity-30"
                            >
                              <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              data-testid={`studio-overlay-down-${ov.id}`}
                              disabled={idx === resolvedOverlays.length - 1}
                              onClick={() => handleMoveOverlay(ov.id, 1)}
                              title={t(
                                "extensions:studio.scene.overlays.moveDown",
                                "Move Down",
                              )}
                              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 disabled:opacity-30"
                            >
                              <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              data-testid={`studio-overlay-duplicate-${ov.id}`}
                              onClick={() => handleDuplicateOverlay(ov.id)}
                              title={t(
                                "extensions:studio.scene.overlays.duplicate",
                                "Duplicate Layer",
                              )}
                              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1"
                            >
                              <Copy className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              data-testid={`studio-overlay-remove-${ov.id}`}
                              onClick={() => handleRemoveOverlay(ov.id)}
                              title={t(
                                "extensions:studio.scene.overlays.removeLayer",
                                "Remove from Scene",
                              )}
                              className="text-muted-foreground rounded p-1 hover:bg-red-500/15 hover:text-red-500"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded Layer Inspector */}
                        {isExpanded && (
                          <div
                            data-testid={`studio-overlay-inspector-${ov.id}`}
                            className="border-accent flex flex-col gap-2.5 border-t pt-2 text-xs"
                          >
                            {/* Layer Label */}
                            <div className="flex flex-col gap-1">
                              <label className="text-foreground text-[11px] font-bold">
                                {t(
                                  "extensions:studio.scene.overlays.label",
                                  "Layer Label",
                                )}
                              </label>
                              <Input
                                data-testid={`studio-overlay-label-${ov.id}`}
                                value={ov.label ?? ""}
                                onChange={(e) =>
                                  handleUpdateOverlay(ov.id, {
                                    label: e.target.value || undefined,
                                  })
                                }
                                placeholder={t(
                                  "extensions:studio.scene.overlays.labelPlaceholder",
                                  "e.g. Opening Emblem...",
                                )}
                                variant="sm"
                              />
                            </div>

                            {/* Lottie Asset URL + Upload / Library */}
                            <div className="flex flex-col gap-1">
                              <label className="text-foreground text-[11px] font-bold">
                                {t(
                                  "extensions:studio.scene.overlays.asset",
                                  "Lottie Asset",
                                )}
                              </label>
                              <div className="flex gap-1.5">
                                <Input
                                  data-testid={`studio-overlay-asset-${ov.id}`}
                                  value={ov.assetUrl}
                                  onChange={(e) =>
                                    handleUpdateOverlay(ov.id, {
                                      assetUrl: e.target.value,
                                    })
                                  }
                                  placeholder="/media/animation.json"
                                  variant="sm"
                                  className="min-w-0 flex-1"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  data-testid={`studio-overlay-catalog-btn-${ov.id}`}
                                  onClick={() => {
                                    setCatalogTargetOverlayId(ov.id)
                                    setLottieCatalogOpen(true)
                                    refreshLottieCatalog()
                                  }}
                                  className="bg-accent text-accent-foreground shrink-0 px-2"
                                  title={t(
                                    "extensions:studio.scene.overlays.chooseCatalog",
                                    "Choose from Library",
                                  )}
                                >
                                  <FolderOpen className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  data-testid={`studio-overlay-upload-btn-${ov.id}`}
                                  onClick={() => {
                                    uploadTargetOverlayIdRef.current = ov.id
                                    overlayFileInputRef.current?.click()
                                  }}
                                  className="bg-accent text-accent-foreground shrink-0 px-2"
                                  title={t(
                                    "extensions:studio.scene.overlays.uploadNew",
                                    "Upload (.json / .lottie / .zip)",
                                  )}
                                >
                                  <Upload className="size-3.5" />
                                </Button>
                              </div>
                            </div>

                            {/* Stage Z-Order (behindTitle vs aboveTitle) */}
                            <div className="flex flex-col gap-1">
                              <label className="text-foreground text-[11px] font-bold">
                                {t(
                                  "extensions:studio.scene.overlays.layerOrder",
                                  "Stage Z-Order",
                                )}
                              </label>
                              <select
                                data-testid={`studio-overlay-layer-${ov.id}`}
                                value={ov.layer}
                                onChange={(e) =>
                                  handleUpdateOverlay(ov.id, {
                                    layer: e.target.value as
                                      "behindTitle" | "aboveTitle",
                                  })
                                }
                                className="bg-background border-input text-foreground rounded-md border px-2 py-1 text-xs font-medium"
                              >
                                <option value="aboveTitle">
                                  {t(
                                    "extensions:studio.scene.overlays.aboveTitle",
                                    "Above Title & Logo",
                                  )}
                                </option>
                                <option value="behindTitle">
                                  {t(
                                    "extensions:studio.scene.overlays.behindTitle",
                                    "Behind Title & Logo",
                                  )}
                                </option>
                              </select>
                            </div>

                            {/* Position X/Y (%) & Width (%) */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.positionX",
                                    "X (%)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-x-${ov.id}`}
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={Math.round(ov.position.x * 100)}
                                  onChange={(e) => {
                                    const pct = Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        Number(e.target.value) || 0,
                                      ),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      position: {
                                        ...ov.position,
                                        x: Number((pct / 100).toFixed(4)),
                                      },
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.positionY",
                                    "Y (%)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-y-${ov.id}`}
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={Math.round(ov.position.y * 100)}
                                  onChange={(e) => {
                                    const pct = Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        Number(e.target.value) || 0,
                                      ),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      position: {
                                        ...ov.position,
                                        y: Number((pct / 100).toFixed(4)),
                                      },
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.widthPct",
                                    "Width (%)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-width-${ov.id}`}
                                  min={1}
                                  max={100}
                                  step={1}
                                  value={Math.round(ov.widthPct)}
                                  onChange={(e) => {
                                    const w = Math.max(
                                      1,
                                      Math.min(
                                        100,
                                        Number(e.target.value) || 28,
                                      ),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      widthPct: w,
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                            </div>

                            {/* Size Presets & Reset to Center */}
                            <div className="flex flex-wrap items-center gap-1">
                              <Button
                                size="sm"
                                type="button"
                                data-testid={`studio-overlay-preset-sm-${ov.id}`}
                                onClick={() =>
                                  handleUpdateOverlay(ov.id, {
                                    widthPct: 20,
                                  })
                                }
                                className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-[10px] font-semibold hover:opacity-85"
                              >
                                {t(
                                  "extensions:studio.scene.overlays.sizeSmall",
                                  "Small (20%)",
                                )}
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                data-testid={`studio-overlay-preset-md-${ov.id}`}
                                onClick={() =>
                                  handleUpdateOverlay(ov.id, {
                                    widthPct: 35,
                                  })
                                }
                                className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-[10px] font-semibold hover:opacity-85"
                              >
                                {t(
                                  "extensions:studio.scene.overlays.sizeMedium",
                                  "Medium (35%)",
                                )}
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                data-testid={`studio-overlay-preset-lg-${ov.id}`}
                                onClick={() =>
                                  handleUpdateOverlay(ov.id, {
                                    widthPct: 55,
                                  })
                                }
                                className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-[10px] font-semibold hover:opacity-85"
                              >
                                {t(
                                  "extensions:studio.scene.overlays.sizeLarge",
                                  "Large (55%)",
                                )}
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                data-testid={`studio-overlay-reset-center-${ov.id}`}
                                onClick={() =>
                                  handleUpdateOverlay(ov.id, {
                                    position: {
                                      x: 0.5,
                                      y: 0.5,
                                    },
                                    rotationDeg: 0,
                                  })
                                }
                                className="bg-accent text-accent-foreground ml-auto rounded px-2 py-0.5 text-[10px] font-semibold hover:opacity-85"
                              >
                                {t(
                                  "extensions:studio.scene.overlays.resetCenter",
                                  "Reset to Center",
                                )}
                              </Button>
                            </div>

                            {/* Fit, Opacity, Rotation */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.fit",
                                    "Fit",
                                  )}
                                </label>
                                <select
                                  data-testid={`studio-overlay-fit-${ov.id}`}
                                  value={ov.fit}
                                  onChange={(e) =>
                                    handleUpdateOverlay(ov.id, {
                                      fit: e.target.value as
                                        "contain" | "cover",
                                    })
                                  }
                                  className="bg-background border-input text-foreground rounded-md border px-1.5 py-1 text-xs"
                                >
                                  <option value="contain">
                                    {t(
                                      "extensions:studio.scene.overlays.fitContain",
                                      "Contain",
                                    )}
                                  </option>
                                  <option value="cover">
                                    {t(
                                      "extensions:studio.scene.overlays.fitCover",
                                      "Cover",
                                    )}
                                  </option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.opacity",
                                    "Opacity (%)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-opacity-${ov.id}`}
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={Math.round(ov.opacity * 100)}
                                  onChange={(e) => {
                                    const pct = Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        Number(e.target.value) || 100,
                                      ),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      opacity: Number((pct / 100).toFixed(2)),
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.rotation",
                                    "Rotation (°)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-rotation-${ov.id}`}
                                  min={-180}
                                  max={180}
                                  step={5}
                                  value={ov.rotationDeg}
                                  onChange={(e) => {
                                    const deg = Math.max(
                                      -180,
                                      Math.min(
                                        180,
                                        Number(e.target.value) || 0,
                                      ),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      rotationDeg: deg,
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                            </div>

                            {/* Timing Controls: TimeBase, Start (s), Duration (s) */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.timeBase",
                                    "Timing Clock",
                                  )}
                                </label>
                                <select
                                  data-testid={`studio-overlay-timebase-${ov.id}`}
                                  value={ov.timeBase}
                                  onChange={(e) =>
                                    handleUpdateOverlay(ov.id, {
                                      timeBase: e.target.value as
                                        "video" | "scene",
                                    })
                                  }
                                  className="bg-background border-input text-foreground rounded-md border px-1.5 py-1 text-xs"
                                >
                                  <option value="video">
                                    {t(
                                      "extensions:studio.scene.overlays.timeBaseVideo",
                                      "Video Time",
                                    )}
                                  </option>
                                  <option value="scene">
                                    {t(
                                      "extensions:studio.scene.overlays.timeBaseScene",
                                      "Scene Time",
                                    )}
                                  </option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.startSec",
                                    "Start (s)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-start-${ov.id}`}
                                  min={0}
                                  max={300}
                                  step={0.1}
                                  value={Number((ov.startMs / 1000).toFixed(2))}
                                  onChange={(e) => {
                                    const sec = Math.max(
                                      0,
                                      Math.min(
                                        300,
                                        Number(e.target.value) || 0,
                                      ),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      startMs: Math.round(sec * 1000),
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.durationSec",
                                    "Duration (s)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-duration-${ov.id}`}
                                  min={0.1}
                                  max={300}
                                  step={0.1}
                                  value={
                                    ov.durationMs !== undefined
                                      ? Number(
                                          (ov.durationMs / 1000).toFixed(2),
                                        )
                                      : ""
                                  }
                                  placeholder="Auto"
                                  onChange={(e) => {
                                    const raw = e.target.value.trim()

                                    if (!raw) {
                                      handleUpdateOverlay(ov.id, {
                                        durationMs: undefined,
                                      })

                                      return
                                    }

                                    const sec = Math.max(
                                      0.1,
                                      Math.min(300, Number(raw) || 1),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      durationMs: Math.round(sec * 1000),
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                            </div>

                            {/* Speed, Finish Mode, Loop */}
                            <div className="grid grid-cols-3 items-end gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.speed",
                                    "Speed",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  data-testid={`studio-overlay-speed-${ov.id}`}
                                  min={0.25}
                                  max={3}
                                  step={0.25}
                                  value={ov.speed}
                                  onChange={(e) => {
                                    const sp = Math.max(
                                      0.25,
                                      Math.min(3, Number(e.target.value) || 1),
                                    )
                                    handleUpdateOverlay(ov.id, {
                                      speed: sp,
                                    })
                                  }}
                                  variant="sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-[10px] font-bold">
                                  {t(
                                    "extensions:studio.scene.overlays.finishMode",
                                    "When Done",
                                  )}
                                </label>
                                <select
                                  data-testid={`studio-overlay-finish-${ov.id}`}
                                  value={ov.finish}
                                  onChange={(e) =>
                                    handleUpdateOverlay(ov.id, {
                                      finish: e.target.value as
                                        "hide" | "holdLastFrame",
                                    })
                                  }
                                  className="bg-background border-input text-foreground rounded-md border px-1.5 py-1 text-xs"
                                >
                                  <option value="hide">
                                    {t(
                                      "extensions:studio.scene.overlays.finishHide",
                                      "Hide Layer",
                                    )}
                                  </option>
                                  <option value="holdLastFrame">
                                    {t(
                                      "extensions:studio.scene.overlays.finishHoldLastFrame",
                                      "Hold Last Frame",
                                    )}
                                  </option>
                                </select>
                              </div>
                              <label className="text-foreground flex items-center gap-1.5 pb-1.5 text-xs font-medium">
                                <input
                                  type="checkbox"
                                  data-testid={`studio-overlay-loop-${ov.id}`}
                                  checked={ov.loop}
                                  onChange={(e) =>
                                    handleUpdateOverlay(ov.id, {
                                      loop: e.target.checked,
                                    })
                                  }
                                />
                                {t(
                                  "extensions:studio.scene.overlays.loop",
                                  "Loop",
                                )}
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Animation Preset (for standalone Animation scene) */}
        {scene.kind === "animation" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-foreground text-xs font-bold">
              {t("extensions:studio.scene.animationPreset", "Animation Preset")}
            </label>
            <StudioSelect
              value={animationPreset}
              onChange={(val: string) =>
                updateSceneConfig(sceneId, {
                  preset: val,
                })
              }
              items={presetItems}
            />
          </div>
        )}

        {/* Single Lottie Animation Config for standalone Animation scene */}
        {scene.kind === "animation" && (
          <div
            data-testid="scene-lottie-config"
            className="border-accent flex flex-col gap-2 rounded-lg border p-2.5"
          >
            <label className="text-foreground text-xs font-bold">
              {t(
                "extensions:studio.scene.lottieTitle",
                "Custom Lottie Animation (Optional)",
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
                accept=".json,.lottie,.zip,application/json,application/zip"
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
                  "extensions:studio.scene.lottieUploadButton",
                  "Upload Lottie (.json)",
                )}
              >
                <Upload className="size-4" />
              </Button>
            </div>
            {!scene.lottieUrl ? (
              <p
                data-testid="scene-lottie-empty-state"
                className="text-muted-foreground text-[11px]"
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
                  {t(
                    "extensions:studio.scene.lottieLoopLabel",
                    "Loop Animation",
                  )}
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    updateSceneConfig(sceneId, {
                      lottieUrl: undefined,
                    })
                  }
                  className="bg-accent text-accent-foreground px-2 py-0.5 text-[11px]"
                >
                  {t(
                    "extensions:studio.scene.lottieClearButton",
                    "Remove Lottie",
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Duration */}
        {isCountdown ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-foreground text-xs font-bold">
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
            <label className="text-foreground text-xs font-bold">
              {t(
                "extensions:studio.scene.durationSeconds",
                "Duration Seconds (1–60)",
              )}
            </label>
            <Input
              data-testid="scene-duration-seconds-input"
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
          <label className="text-foreground text-xs font-bold">
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

        {/* Media End Safety Fallback Timeout (when advance === "onMediaEnd") */}
        {advanceMode === "onMediaEnd" && isCinemaCapableScene && (
          <div className="flex flex-col gap-1.5">
            <label className="text-foreground text-xs font-bold">
              {t(
                "extensions:studio.scene.mediaEndFallbackSeconds",
                "Media End Safety Timeout (5–300s)",
              )}
            </label>
            <Input
              data-testid="scene-media-end-fallback-input"
              type="number"
              min={5}
              max={300}
              value={
                "mediaEndFallbackMs" in scene &&
                typeof scene.mediaEndFallbackMs === "number"
                  ? Math.round(scene.mediaEndFallbackMs / 1000)
                  : ""
              }
              placeholder="30"
              onChange={(e) => {
                const raw = e.target.value.trim()

                if (!raw) {
                  updateSceneConfig(sceneId, {
                    mediaEndFallbackMs: undefined,
                  })

                  return
                }

                const sec = Math.max(5, Math.min(300, Number(raw) || 30))
                updateSceneConfig(sceneId, {
                  mediaEndFallbackMs: Math.round(sec * 1000),
                })
              }}
              variant="sm"
            />
          </div>
        )}

        {/* Scene Card Background Override (Distinct from foreground mediaUrl) */}
        <CardBackgroundConfig
          backgroundOverride={scene.background}
          onBackgroundChange={(next) =>
            updateSceneConfig(sceneId, {
              background: next,
            })
          }
        />

        {/* Scene Card Audio Override */}
        <CardAudioConfig
          kind="scene"
          sceneAudio={scene.audio}
          onSceneAudioChange={(next) =>
            updateSceneConfig(sceneId, {
              audio: next,
            })
          }
        />

        {/* Scene Entrance Animation */}
        <QuestionEntranceConfig
          kind="scene"
          sceneStageAnimations={scene.stageAnimations}
          onSceneStageAnimationsChange={(next) =>
            updateSceneConfig(sceneId, {
              stageAnimations: next,
            })
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
