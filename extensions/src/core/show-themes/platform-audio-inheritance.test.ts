import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { AudioCuePlayer } from "../../presentation/audio-cue-player"
import { ShowThemeScope } from "../../presentation/show-themes/context"
import { describe, expect, it } from "vitest"
import classicManifest from "./classic.manifest.json" with { type: "json" }
import { showThemeDefinitionSchema } from "./definition"
import { createShowThemeRegistry } from "./registry"
import { resolveShowTheme } from "./resolve"
import { createDefaultShowTheme, type ShowThemeRole } from "./selection"
import {
  applyThemeAudioDefaults,
  defaultThemeAudioUrl,
  resolveThemeEffect,
  themeAllowsAudioUrl,
} from "./audio"
import {
  createPlatformAudioExtras,
  PLATFORM_AUDIO_URLS,
  PLATFORM_CUE_URLS,
  PLATFORM_SOUNDTRACK_DEFAULTS,
} from "../platform-audio-defaults"
import { PLATFORM_SFX_BY_CUE } from "./platform-audio"

function inheritedTheme() {
  const input = structuredClone(
    showThemeDefinitionSchema.parse(classicManifest),
  )
  input.id = "inherited-audio"
  const rename = (id: string) =>
    id.replace("tadazz-classic.", "inherited-audio.")
  for (const spec of Object.values(input.slots)) {
    spec.defaultVariantId = rename(spec.defaultVariantId)
    spec.variants = spec.variants.map((variant) => ({
      ...variant,
      id: rename(variant.id),
    }))
  }
  input.choreographyCues = {}
  input.assets = input.assets.filter((asset) => asset.kind !== "audio")
  for (const [event, value] of Object.entries(input.audioEvents)) {
    const spec = value
    spec.defaultVariantId = rename(spec.defaultVariantId)
    spec.variants = [
      {
        id: spec.defaultVariantId,
        labelKey: "extensions:themes.default",
        inheritPlatform: true,
        silent: false,
        volume: 0,
        loop: false,
        priority: 40,
        fadeMs: 600,
        restart: "epoch",
        roles:
          event === "answerSelected" || event === "answerSubmitted"
            ? ["player"]
            : ["manager", "spectator"],
      },
    ]
    // Platform inheritance must not require permission to upload arbitrary media.
    spec.customMedia = false
  }

  return showThemeDefinitionSchema.parse(input)
}

function resolved(role: ShowThemeRole = "manager", overrides = {}) {
  const definition = inheritedTheme()

  return resolveShowTheme({
    role,
    registry: createShowThemeRegistry([definition]),
    selection: { ...createDefaultShowTheme(), id: definition.id, overrides },
  })
}

describe("imported theme platform audio inheritance", () => {
  it("uses the existing full mix without copying recordings into a theme or accepting arbitrary URLs", () => {
    const theme = resolved()
    expect(theme.diagnostics).toEqual([])
    expect(
      theme.definition.assets.every((asset) => asset.kind !== "audio"),
    ).toBe(true)
    const audio = applyThemeAudioDefaults(theme, createPlatformAudioExtras())
    expect(audio.cues.answersMusic).toMatchObject({
      url: PLATFORM_AUDIO_URLS.voting,
      enabled: true,
      volume: 0.38,
      loop: true,
    })
    expect(audio.cues.showQuestion).toMatchObject({
      url: PLATFORM_CUE_URLS.showQuestion,
      enabled: true,
      volume: 0.8,
      loop: false,
    })
    expect(audio.cues.revealResults).toMatchObject({
      url: PLATFORM_CUE_URLS.revealResults,
      enabled: true,
    })
    expect(audio.soundtrack).toEqual(PLATFORM_SOUNDTRACK_DEFAULTS)
    expect(audio.soundtrack?.voting).toBeUndefined()
    expect(
      themeAllowsAudioUrl(
        theme,
        "timerExpired",
        PLATFORM_SFX_BY_CUE["timer-ended"],
      ),
    ).toBe(true)
    expect(
      themeAllowsAudioUrl(theme, "timerExpired", "/sounds/unreviewed.mp3"),
    ).toBe(false)
    expect(
      themeAllowsAudioUrl(theme, "showQuestion", "/media/unselected.mp3"),
    ).toBe(false)
    expect(defaultThemeAudioUrl(theme, "showQuestion")).toBe(
      PLATFORM_CUE_URLS.showQuestion,
    )
  })

  it.each(["manager", "spectator"] as const)(
    "resolves every timer and reveal milestone in %s without theme choreography",
    (role) => {
      const theme = resolved(role)
      for (const name of [
        "timer-tick",
        "timer-urgent",
        "timer-final",
        "timer-ended",
        "vote-locked",
        "survey-reveal",
        "top-pick-reveal",
        "phone-ready",
        "round-launch",
      ]) {
        expect(resolveThemeEffect(theme, name)?.url).toBe(
          PLATFORM_SFX_BY_CUE[name],
        )
      }
      expect(resolveThemeEffect(theme, "phase-podium1")?.url).toBe(
        PLATFORM_CUE_URLS.podium1,
      )
      expect(resolveThemeEffect(theme, "phase-podium2")?.url).toBe(
        PLATFORM_CUE_URLS.podium2,
      )
      expect(resolveThemeEffect(theme, "phase-podium3")?.url).toBe(
        PLATFORM_CUE_URLS.podium3,
      )
      expect(resolveThemeEffect(theme, "answer-submitted")?.url).toBeUndefined()
    },
  )

  it("keeps player action ownership and avoids duplicating host timer sounds on phones", () => {
    const theme = resolved("player")
    expect(resolveThemeEffect(theme, "answer-submitted")?.url).toBe(
      PLATFORM_CUE_URLS.answerPressed,
    )
    expect(resolveThemeEffect(theme, "answer-selected")?.url).toBeUndefined()
    expect(resolveThemeEffect(theme, "timer-ended")?.url).toBeUndefined()
    expect(resolveThemeEffect(theme, "survey-reveal")?.url).toBeUndefined()
  })

  it("preserves deliberate mute, volume and explicit media choices", () => {
    const muted = resolved("manager", {
      audio: { timerExpired: { muted: true }, showQuestion: { volume: 0.19 } },
    })
    expect(resolveThemeEffect(muted, "timer-ended")?.url).toBeUndefined()
    expect(resolveThemeEffect(muted, "phase-showQuestion")?.volume).toBe(0.19)
    const saved = createPlatformAudioExtras()
    saved.cues.revealResults.enabled = false
    saved.soundtrack!.lobby = {
      ...PLATFORM_SOUNDTRACK_DEFAULTS.lobby!,
      mode: "mute",
    }
    const audio = applyThemeAudioDefaults(muted, saved)
    expect(audio.cues.revealResults.enabled).toBe(false)
    expect(audio.soundtrack?.lobby?.mode).toBe("mute")

    const definition = inheritedTheme()
    definition.audioEvents.timerExpired.customMedia = true
    const custom = resolveShowTheme({
      role: "manager",
      registry: createShowThemeRegistry([definition]),
      selection: {
        ...createDefaultShowTheme(),
        id: definition.id,
        overrides: {
          audio: {
            timerExpired: { mediaUrl: "/media/owner-end.mp3", volume: 0.4 },
          },
        },
      },
    })
    expect(resolveThemeEffect(custom, "timer-ended")).toMatchObject({
      url: "/media/owner-end.mp3",
      volume: 0.4,
    })
  })

  it("selecting the platform variant keeps the music bed distinct from the question/reveal effect", () => {
    const definition = inheritedTheme()
    const audio = applyThemeAudioDefaults(
      resolved("manager", {
        audio: {
          showQuestion: {
            variantId: definition.audioEvents.showQuestion.defaultVariantId,
          },
          revealResults: {
            variantId: definition.audioEvents.revealResults.defaultVariantId,
          },
        },
      }),
    )
    expect(audio.cues.showQuestion.url).toBe(PLATFORM_CUE_URLS.showQuestion)
    expect(audio.soundtrack?.question?.url).toBe(PLATFORM_AUDIO_URLS.question)
    expect(audio.soundtrack?.results?.url).toBe(
      PLATFORM_SOUNDTRACK_DEFAULTS.results?.url,
    )
    expect(audio.soundtrack?.recap?.url).toBe(PLATFORM_AUDIO_URLS.recap)
  })

  it("keeps results music playing when inherited reveal volume or its default variant is selected", () => {
    const definition = inheritedTheme()
    for (const selection of [
      { volume: 0.25 },
      { variantId: definition.audioEvents.revealResults.defaultVariantId },
    ]) {
      const theme = resolved("manager", { audio: { revealResults: selection } })
      const output = renderToString(
        createElement(ShowThemeScope, {
          theme,
          children: createElement(AudioCuePlayer, {
            soundtrackSlot: "results",
            cueId: "revealResults",
            stageOwnsReveal: true,
            autoPlay: false,
          }),
        }),
      )
      expect(output).toContain(
        `data-audio-url="${PLATFORM_SOUNDTRACK_DEFAULTS.results?.url ?? ""}"`,
      )
      expect(output).not.toContain(
        `data-audio-url="${PLATFORM_CUE_URLS.revealResults}"`,
      )
    }
  })

  it("rejects contradictory inheritance and retains intentional legacy silent variants", () => {
    const definition = inheritedTheme()
    for (const patch of [
      { silent: true },
      { assetId: definition.assets[0].id },
    ]) {
      const invalid = structuredClone(definition)
      Object.assign(invalid.audioEvents.timerExpired.variants[0], patch)
      expect(showThemeDefinitionSchema.safeParse(invalid).success).toBe(false)
    }
    const silent = structuredClone(definition)
    delete silent.audioEvents.timerExpired.variants[0].inheritPlatform
    silent.audioEvents.timerExpired.variants[0].silent = true
    const theme = resolveShowTheme({
      role: "manager",
      registry: createShowThemeRegistry([silent]),
      selection: { ...createDefaultShowTheme(), id: definition.id },
    })
    expect(resolveThemeEffect(theme, "timer-ended")?.url).toBeUndefined()
    expect(defaultThemeAudioUrl(theme, "timerExpired")).toBeUndefined()
    const missing = structuredClone(definition)
    delete missing.audioEvents.timerExpired.variants[0].inheritPlatform
    expect(showThemeDefinitionSchema.safeParse(missing).success).toBe(false)
  })
})
