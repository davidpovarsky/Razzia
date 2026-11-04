import { describe, expect, it } from "vitest"
import {
  cinematicOverlayAnimationSchema,
  cinematicOverlayAnimationsArraySchema,
  createDefaultOverlayAnimation,
  deriveLegacyOverlayId,
  evaluateOverlaySafeArea,
  getCinematicSceneWarnings,
  MAX_CINEMATIC_OVERLAY_ANIMATIONS,
  normalizeOverlayAnimationsOrder,
  resolveSceneOverlayAnimations,
} from "./cinematic-overlays"

describe("cinematic-overlays contract & migration", () => {
  const validId1 = "11111111-1111-4111-8111-111111111111"
  const validId2 = "22222222-2222-4222-8222-222222222222"

  it("validates a complete CinematicOverlayAnimation with defaults", () => {
    const parsed = cinematicOverlayAnimationSchema.parse({
      id: validId1,
      assetUrl: "/media/sparkle.json",
    })

    expect(parsed).toEqual({
      id: validId1,
      enabled: true,
      assetUrl: "/media/sparkle.json",
      position: { x: 0.5, y: 0.5 },
      anchor: "center",
      widthPct: 28,
      rotationDeg: 0,
      opacity: 1,
      fit: "contain",
      layer: "aboveTitle",
      order: 0,
      timeBase: "video",
      startMs: 0,
      speed: 1,
      loop: false,
      finish: "hide",
    })
  })

  it("rejects out-of-bounds geometry, negative timing, and unsafe URLs", () => {
    expect(
      cinematicOverlayAnimationSchema.safeParse({
        id: validId1,
        assetUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false)

    expect(
      cinematicOverlayAnimationSchema.safeParse({
        id: validId1,
        assetUrl: "/media/ok.json",
        position: { x: 1.2, y: 0.5 },
      }).success,
    ).toBe(false)

    expect(
      cinematicOverlayAnimationSchema.safeParse({
        id: validId1,
        assetUrl: "/media/ok.json",
        widthPct: 0,
      }).success,
    ).toBe(false)

    expect(
      cinematicOverlayAnimationSchema.safeParse({
        id: validId1,
        assetUrl: "/media/ok.json",
        startMs: -10,
      }).success,
    ).toBe(false)

    expect(
      cinematicOverlayAnimationSchema.safeParse({
        id: validId1,
        assetUrl: "/media/ok.json",
        durationMs: 1000,
        fadeInMs: 600,
        fadeOutMs: 600,
      }).success,
    ).toBe(false)
  })

  it("enforces UUID uniqueness and maximum of 8 overlays per scene", () => {
    const dupResult = cinematicOverlayAnimationsArraySchema.safeParse([
      createDefaultOverlayAnimation({
        id: validId1,
        assetUrl: "/media/a.json",
      }),
      createDefaultOverlayAnimation({
        id: validId1,
        assetUrl: "/media/b.json",
      }),
    ])
    expect(dupResult.success).toBe(false)

    const nineItems = Array.from(
      { length: MAX_CINEMATIC_OVERLAY_ANIMATIONS + 1 },
      (_, idx) =>
        createDefaultOverlayAnimation({
          id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
          assetUrl: `/media/layer-${idx}.lottie`,
        }),
    )
    expect(
      cinematicOverlayAnimationsArraySchema.safeParse(nineItems).success,
    ).toBe(false)
  })

  it("normalizes order deterministically from array position", () => {
    const raw = [
      createDefaultOverlayAnimation({
        id: validId1,
        assetUrl: "/media/a.json",
        order: 9,
      }),
      createDefaultOverlayAnimation({
        id: validId2,
        assetUrl: "/media/b.json",
        order: 3,
      }),
    ]
    const normalized = normalizeOverlayAnimationsOrder(raw)
    expect(normalized[0].order).toBe(0)
    expect(normalized[1].order).toBe(1)
  })

  it("migrates legacy single lottieUrl into one deterministic implicit overlay when overlayAnimations is absent", () => {
    const sceneId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const resolved = resolveSceneOverlayAnimations({
      id: sceneId,
      mediaType: "video",
      mediaUrl: "/media/intro.mp4",
      lottieUrl: "/media/legacy-logo.json",
      lottieFit: "cover",
      lottieLoop: false,
      lottieSpeed: 1.5,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      id: deriveLegacyOverlayId(sceneId),
      enabled: true,
      assetUrl: "/media/legacy-logo.json",
      position: { x: 0.5, y: 0.5 },
      anchor: "center",
      fit: "cover",
      loop: false,
      speed: 1.5,
      timeBase: "video",
      finish: "holdLastFrame",
    })
  })

  it("treats overlayAnimations as authoritative and never duplicates legacy lottieUrl when overlayAnimations is present", () => {
    const resolvedWithArray = resolveSceneOverlayAnimations({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lottieUrl: "/media/legacy-logo.json",
      overlayAnimations: [
        createDefaultOverlayAnimation({
          id: validId1,
          assetUrl: "/media/new-layer.json",
        }),
      ],
    })
    expect(resolvedWithArray).toHaveLength(1)
    expect(resolvedWithArray[0].assetUrl).toBe("/media/new-layer.json")

    const resolvedWithEmptyArray = resolveSceneOverlayAnimations({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lottieUrl: "/media/legacy-logo.json",
      overlayAnimations: [],
    })
    expect(resolvedWithEmptyArray).toEqual([])
  })

  it("detects safe-area cropping and loop + onMediaEnd conflicts", () => {
    const crop = evaluateOverlaySafeArea({
      id: validId1,
      position: { x: 0.95, y: 0.5 },
      anchor: "center",
      widthPct: 30,
    })
    expect(crop.clipsStageEdge).toBe(true)
    expect(crop.outsideSafeArea4x3).toBe(true)

    const warnings = getCinematicSceneWarnings({
      mediaType: "video",
      mediaUrl: "/media/intro.mp4",
      loop: true,
      muted: true,
      advance: "onMediaEnd",
      overlayAnimations: [
        createDefaultOverlayAnimation({
          id: validId1,
          assetUrl: "/media/a.json",
          position: { x: 0.95, y: 0.5 },
          widthPct: 30,
        }),
      ],
    })
    expect(warnings.loopAndOnMediaEndConflict).toBe(true)
    expect(warnings.mutedVideoAudio).toBe(true)
    expect(warnings.cropNotices).toHaveLength(1)
  })
})
