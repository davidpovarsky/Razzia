import { describe, expect, it } from "vitest"
import {
  tadazzShowBackgroundSchema,
  resolveTadazzStageBackground,
} from "./tadazz-appearance"

const image = "/media/tadazz-background.png"
const original = "/branding/legacy.png"
const animated = tadazzShowBackgroundSchema.parse({ mode: "animated" })

describe("Tadazz opt-in stage background", () => {
  it("keeps all legacy shows unchanged", () => {
    expect(
      resolveTadazzStageBackground({
        originalUrl: original,
        tadazzImageUrl: image,
      }),
    ).toMatchObject({
      source: "original",
      url: original,
      animate: false,
    })
  })
  it("allows animation only by explicit show selection", () => {
    expect(
      resolveTadazzStageBackground({
        settings: animated,
        originalUrl: original,
        tadazzImageUrl: image,
      }),
    ).toMatchObject({
      source: "tadazz",
      url: image,
      animate: true,
      intensity: 1,
    })
  })
  it("prioritizes cinema video and pauses effects", () => {
    expect(
      resolveTadazzStageBackground({
        settings: animated,
        originalUrl: original,
        tadazzImageUrl: image,
        fullScreenVideo: true,
      }),
    ).toMatchObject({ source: "cinema", animate: false, url: undefined })
  })
  it("prioritizes a specific card's image", () => {
    expect(
      resolveTadazzStageBackground({
        settings: animated,
        originalUrl: original,
        tadazzImageUrl: image,
        cardBackground: {
          url: "/media/card.png",
          fit: "contain",
          position: "center",
          overlayOpacity: 0.3,
        },
      }),
    ).toMatchObject({
      source: "card",
      url: "/media/card.png",
      animate: false,
      fit: "contain",
    })
  })
  it("shows the still Tadazz art for reduced motion", () => {
    expect(
      resolveTadazzStageBackground({
        settings: animated,
        tadazzImageUrl: image,
        reducedMotion: true,
      }),
    ).toMatchObject({ source: "tadazz", animate: false })
  })
  it("falls back when Tadazz image cannot load", () => {
    expect(
      resolveTadazzStageBackground({
        settings: animated,
        tadazzImageUrl: image,
        imageReady: false,
        originalUrl: original,
      }),
    ).toMatchObject({ source: "original", url: original })
  })
  it("preserves explicit pause and zero intensity", () => {
    expect(
      resolveTadazzStageBackground({
        settings: tadazzShowBackgroundSchema.parse({
          mode: "animated",
          paused: true,
        }),
        tadazzImageUrl: image,
      }).animate,
    ).toBe(false)
    expect(
      resolveTadazzStageBackground({
        settings: tadazzShowBackgroundSchema.parse({
          mode: "animated",
          intensity: 0,
        }),
        tadazzImageUrl: image,
      }).animate,
    ).toBe(false)
  })
  it("supports a safe static custom background", () => {
    expect(
      resolveTadazzStageBackground({
        settings: tadazzShowBackgroundSchema.parse({
          mode: "static",
          staticUrl: "/media/custom.png",
        }),
        tadazzImageUrl: image,
      }),
    ).toMatchObject({
      source: "static",
      url: "/media/custom.png",
      animate: false,
    })
  })
  it("rejects unsafe settings and out of range intensity", () => {
    expect(
      tadazzShowBackgroundSchema.safeParse({ mode: "static" }).success,
    ).toBe(false)
    expect(
      tadazzShowBackgroundSchema.safeParse({ mode: "animated", intensity: 4 })
        .success,
    ).toBe(false)
    expect(
      tadazzShowBackgroundSchema.safeParse({
        mode: "static",
        staticUrl: ["java", "script:alert(1)"].join(""),
      }).success,
    ).toBe(false)
  })
})
