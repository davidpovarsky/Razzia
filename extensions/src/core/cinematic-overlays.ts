import { z } from "zod"
import { safeMediaUrlSchema } from "./media"

export const MAX_CINEMATIC_OVERLAY_ANIMATIONS = 8
export const SOFT_WARNING_OVERLAY_ANIMATIONS = 4

export const OVERLAY_ANCHORS = ["center", "topLeft"] as const
export type OverlayAnchor = (typeof OVERLAY_ANCHORS)[number]

export const OVERLAY_FITS = ["contain", "cover"] as const
export type OverlayFit = (typeof OVERLAY_FITS)[number]

export const OVERLAY_LAYERS = ["behindTitle", "aboveTitle"] as const
export type OverlayLayer = (typeof OVERLAY_LAYERS)[number]

export const OVERLAY_TIME_BASES = ["video", "scene"] as const
export type OverlayTimeBase = (typeof OVERLAY_TIME_BASES)[number]

export const OVERLAY_FINISH_MODES = ["hide", "holdLastFrame"] as const
export type OverlayFinishMode = (typeof OVERLAY_FINISH_MODES)[number]

export const overlayPositionSchema = z.strictObject({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
})

export type OverlayPosition = z.infer<typeof overlayPositionSchema>

export const cinematicOverlayAnimationSchema = z
  .strictObject({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/u, "errors:extensions.invalidOverlayId"),
    enabled: z.boolean().default(true),
    assetUrl: safeMediaUrlSchema,
    label: z.string().trim().max(80).optional(),

    position: overlayPositionSchema.default({ x: 0.5, y: 0.5 }),
    anchor: z.enum(OVERLAY_ANCHORS).default("center"),
    widthPct: z.number().finite().min(1).max(100).default(28),
    rotationDeg: z.number().finite().min(-180).max(180).default(0),
    opacity: z.number().finite().min(0).max(1).default(1),
    fit: z.enum(OVERLAY_FITS).default("contain"),
    layer: z.enum(OVERLAY_LAYERS).default("aboveTitle"),
    order: z.number().int().min(0).max(63).default(0),

    timeBase: z.enum(OVERLAY_TIME_BASES).default("video"),
    startMs: z.number().int().min(0).max(300000).default(0),
    durationMs: z.number().int().min(100).max(300000).optional(),
    speed: z.number().finite().min(0.25).max(3).default(1),
    loop: z.boolean().default(false),
    finish: z.enum(OVERLAY_FINISH_MODES).default("hide"),
    fadeInMs: z.number().int().min(0).max(10000).optional(),
    fadeOutMs: z.number().int().min(0).max(10000).optional(),
  })
  .superRefine((overlay, ctx) => {
    if (
      overlay.fadeInMs !== undefined &&
      overlay.fadeOutMs !== undefined &&
      overlay.durationMs !== undefined &&
      overlay.fadeInMs + overlay.fadeOutMs > overlay.durationMs
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["fadeOutMs"],
        message: "errors:extensions.overlayFadeExceedsDuration",
      })
    }
  })

export type CinematicOverlayAnimation = z.infer<
  typeof cinematicOverlayAnimationSchema
>
export type CinematicOverlayAnimationInput = z.input<
  typeof cinematicOverlayAnimationSchema
>

export const cinematicOverlayAnimationsArraySchema = z
  .array(cinematicOverlayAnimationSchema)
  .max(
    MAX_CINEMATIC_OVERLAY_ANIMATIONS,
    "errors:extensions.tooManyOverlayAnimations",
  )
  .superRefine((items, ctx) => {
    const seenIds = new Set<string>()
    for (let i = 0; i < items.length; i += 1) {
      const id = items[i].id
      if (seenIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "id"],
          message: "errors:extensions.duplicateOverlayId",
        })
      }
      seenIds.add(id)
    }
  })

/**
 * Normalizes the `order` field of an overlay animation array so that the
 * array position is canonical and `order` is deterministically `0..N-1`.
 */
export function normalizeOverlayAnimationsOrder(
  items: readonly CinematicOverlayAnimation[],
): CinematicOverlayAnimation[] {
  return items.map((item, index) => ({
    ...item,
    order: index,
  }))
}

/**
 * Derives a deterministic valid UUID v4 from a scene ID for legacy single-Lottie
 * migration so that re-renders never generate unstable keys.
 */
export function deriveLegacyOverlayId(sceneId?: string): string {
  const cleanHex = (sceneId ?? "").replaceAll(/[^0-9a-fA-F]/g, "").toLowerCase()
  const padded = (cleanHex + "00000000000000000000000000000001").slice(0, 32)
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-4${padded.slice(13, 16)}-8${padded.slice(17, 20)}-${padded.slice(20, 32)}`
}

export interface LegacyLottieBearingScene {
  id?: string
  mediaType?: "image" | "video" | "audio"
  mediaUrl?: string
  lottieUrl?: string
  lottieFit?: "contain" | "cover"
  lottieLoop?: boolean
  lottieSpeed?: number
  overlayAnimations?: CinematicOverlayAnimation[]
}

/**
 * Resolves the authoritative list of `CinematicOverlayAnimation` layers for a scene.
 * - If `scene.overlayAnimations` is present (even if empty), it is authoritative
 *   and legacy `lottieUrl` is NOT drawn a second time.
 * - If `scene.overlayAnimations` is undefined and `scene.lottieUrl` is present,
 *   synthesizes one implicit centered overlay preserving legacy fit/loop/speed.
 */
export function resolveSceneOverlayAnimations(
  scene: LegacyLottieBearingScene | null | undefined,
): CinematicOverlayAnimation[] {
  if (!scene) {
    return []
  }

  if (Array.isArray(scene.overlayAnimations)) {
    return normalizeOverlayAnimationsOrder(scene.overlayAnimations)
  }

  if (
    typeof scene.lottieUrl === "string" &&
    scene.lottieUrl.trim().length > 0
  ) {
    const hasVideoBackdrop =
      scene.mediaType === "video" &&
      typeof scene.mediaUrl === "string" &&
      scene.mediaUrl.trim().length > 0

    return [
      {
        id: deriveLegacyOverlayId(scene.id),
        enabled: true,
        assetUrl: scene.lottieUrl.trim(),
        label: undefined,
        position: { x: 0.5, y: 0.5 },
        anchor: "center",
        widthPct: 28,
        rotationDeg: 0,
        opacity: 1,
        fit: scene.lottieFit ?? "contain",
        layer: "aboveTitle",
        order: 0,
        timeBase: hasVideoBackdrop ? "video" : "scene",
        startMs: 0,
        durationMs: undefined,
        speed: scene.lottieSpeed ?? 1,
        loop: scene.lottieLoop ?? true,
        finish: "holdLastFrame",
      },
    ]
  }

  return []
}

/**
 * Creates a new `CinematicOverlayAnimation` with sensible stage defaults.
 */
export function createDefaultOverlayAnimation(
  partial: Partial<CinematicOverlayAnimation> & { assetUrl: string },
): CinematicOverlayAnimation {
  return cinematicOverlayAnimationSchema.parse({
    id: partial.id ?? crypto.randomUUID(),
    enabled: partial.enabled ?? true,
    assetUrl: partial.assetUrl,
    ...(partial.label ? { label: partial.label } : {}),
    position: partial.position ?? { x: 0.5, y: 0.5 },
    anchor: partial.anchor ?? "center",
    widthPct: partial.widthPct ?? 28,
    rotationDeg: partial.rotationDeg ?? 0,
    opacity: partial.opacity ?? 1,
    fit: partial.fit ?? "contain",
    layer: partial.layer ?? "aboveTitle",
    order: partial.order ?? 0,
    timeBase: partial.timeBase ?? "video",
    startMs: partial.startMs ?? 0,
    ...(partial.durationMs !== undefined
      ? { durationMs: partial.durationMs }
      : {}),
    speed: partial.speed ?? 1,
    loop: partial.loop ?? false,
    finish: partial.finish ?? "hide",
    ...(partial.fadeInMs !== undefined ? { fadeInMs: partial.fadeInMs } : {}),
    ...(partial.fadeOutMs !== undefined
      ? { fadeOutMs: partial.fadeOutMs }
      : {}),
  })
}

export interface OverlayCropNotice {
  overlayId: string
  clipsStageEdge: boolean
  outsideSafeArea4x3: boolean
}

/**
 * Checks whether an overlay's normalized geometry extends past the 16:9 stage
 * edge (`0..1`) or the 4:3 projector safe area (`0.08..0.92` horizontal, `0.06..0.94` vertical).
 */
export function evaluateOverlaySafeArea(
  overlay: Pick<
    CinematicOverlayAnimation,
    "id" | "position" | "anchor" | "widthPct"
  >,
): OverlayCropNotice {
  const halfSpan = overlay.widthPct / 100 / 2
  const left =
    overlay.anchor === "center"
      ? overlay.position.x - halfSpan
      : overlay.position.x
  const right =
    overlay.anchor === "center"
      ? overlay.position.x + halfSpan
      : overlay.position.x + overlay.widthPct / 100
  const top =
    overlay.anchor === "center"
      ? overlay.position.y - halfSpan
      : overlay.position.y
  const bottom =
    overlay.anchor === "center"
      ? overlay.position.y + halfSpan
      : overlay.position.y + overlay.widthPct / 100

  const clipsStageEdge = left < 0 || right > 1 || top < 0 || bottom > 1
  const outsideSafeArea4x3 =
    left < 0.06 || right > 0.94 || top < 0.05 || bottom > 0.95

  return {
    overlayId: overlay.id,
    clipsStageEdge,
    outsideSafeArea4x3,
  }
}

export interface CinematicSceneValidationWarnings {
  loopAndOnMediaEndConflict: boolean
  heavyOverlayCount: boolean
  mutedVideoAudio: boolean
  missingAssets: string[]
  cropNotices: OverlayCropNotice[]
}

/**
 * Evaluates non-blocking authoring warnings for a cinematic scene.
 */
export function getCinematicSceneWarnings(scene: {
  mediaType?: "image" | "video" | "audio"
  mediaUrl?: string
  loop?: boolean
  muted?: boolean
  advance?: "auto" | "manual" | "onMediaEnd"
  endBehavior?: "holdFrame" | "advanceNext" | "fadeToTitle"
  lottieUrl?: string
  overlayAnimations?: CinematicOverlayAnimation[]
}): CinematicSceneValidationWarnings {
  const resolvedOverlays = resolveSceneOverlayAnimations(scene)
  const enabledOverlays = resolvedOverlays.filter((o) => o.enabled)

  const isEffectiveOnMediaEnd =
    scene.advance === "onMediaEnd" ||
    (scene.advance !== "manual" && scene.endBehavior === "advanceNext")

  const loopAndOnMediaEndConflict =
    (scene.mediaType === "video" || scene.mediaType === "audio") &&
    Boolean(scene.loop) &&
    isEffectiveOnMediaEnd

  const heavyOverlayCount =
    enabledOverlays.length > SOFT_WARNING_OVERLAY_ANIMATIONS

  const mutedVideoAudio =
    scene.mediaType === "video" &&
    Boolean(scene.mediaUrl?.trim()) &&
    Boolean(scene.muted)

  const missingAssets = enabledOverlays
    .filter((o) => !o.assetUrl || o.assetUrl.trim().length === 0)
    .map((o) => o.id)

  const cropNotices = enabledOverlays
    .map((o) => evaluateOverlaySafeArea(o))
    .filter((n) => n.clipsStageEdge || n.outsideSafeArea4x3)

  return {
    loopAndOnMediaEndConflict,
    heavyOverlayCount,
    mutedVideoAudio,
    missingAssets,
    cropNotices,
  }
}
