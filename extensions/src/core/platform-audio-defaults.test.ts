import { describe, expect, it } from "vitest"
import { CUE_IDS } from "./constants"
import {
  audioExtrasSchema,
  createDefaultAudioExtras,
  type AudioExtras,
} from "./quiz-extras"
import {
  createPlatformAudioExtras,
  normalizePlatformAudioSettings,
  PLATFORM_AUDIO_URLS,
  PLATFORM_CUE_URLS,
  PLATFORM_SOUNDTRACK_DEFAULTS,
  resolvePlatformAudioDefaults,
} from "./platform-audio-defaults"
import { PLATFORM_AUDIO_ASSETS } from "./platform-audio-assets"
import { createDefaultShowTheme } from "./show-themes/selection"
import { resolveShowTheme } from "./show-themes/resolve"
import {
  applyThemeAudioDefaults,
  resolveThemeEffect,
  themeAllowsAudioUrl,
} from "./show-themes/audio"

describe("shared Creating Worlds audio defaults", () => {
  it("persists inheritance and resolves the approved public mix for new games", () => {
    const stored = createDefaultAudioExtras()
    expect(audioExtrasSchema.safeParse(stored).success).toBe(true)
    expect(stored.cues.answersMusic.source).toBe("default")
    expect(
      Object.values(stored.soundtrack ?? {}).every(
        (track) => track.mode === "inherit",
      ),
    ).toBe(true)
    const resolved = resolvePlatformAudioDefaults(stored)
    expect(resolved.cues.answersMusic).toMatchObject({
      url: PLATFORM_AUDIO_URLS.voting,
      volume: 0.38,
      loop: true,
      enabled: true,
    })
    expect(resolved.soundtrack?.openingIntro).toMatchObject({
      url: PLATFORM_AUDIO_URLS.openingIntro,
      volume: 0.65,
      loop: false,
      maxDurationMs: 12000,
    })
    expect(resolved.soundtrack?.results).toMatchObject({
      url: "/tadazz-show/music/cutie-patootie.mp3",
      volume: 0.3,
      loop: true,
      fadeMs: 400,
    })
    expect(resolved.soundtrack?.voting).toBeUndefined()
    expect(JSON.stringify(resolved)).not.toContain("/media/")
    expect(Object.keys(PLATFORM_SOUNDTRACK_DEFAULTS)).toHaveLength(8)
  })

  it("upgrades only the untouched former factory and never mutates saved data", () => {
    const legacy = {
      cues: Object.fromEntries(
        CUE_IDS.map((id) => [
          id,
          {
            source: "default",
            volume: 0.8,
            enabled: true,
            loop: id === "answersMusic",
          },
        ]),
      ),
    } as AudioExtras
    const before = JSON.stringify(legacy)
    expect(
      normalizePlatformAudioSettings(legacy).cues.answersMusic.volume,
    ).toBe(0.38)
    expect(resolvePlatformAudioDefaults(legacy).soundtrack?.lobby?.url).toBe(
      PLATFORM_AUDIO_URLS.lobby,
    )
    expect(JSON.stringify(legacy)).toBe(before)
    legacy.cues.answersMusic.volume = 0.23
    expect(normalizePlatformAudioSettings(legacy)).toBe(legacy)
    expect(resolvePlatformAudioDefaults(legacy).cues.answersMusic.volume).toBe(
      0.23,
    )
  })

  it("keeps explicit game media, disabled cues, muted stages and stage-specific mix settings", () => {
    const saved = createPlatformAudioExtras()
    saved.cues.answersMusic = {
      source: "media",
      url: "/media/my-event.mp3",
      volume: 0.22,
      enabled: false,
      loop: false,
    }
    saved.soundtrack!.results = {
      mode: "mute",
      volume: 0.3,
      loop: false,
      fadeMs: 0,
      startOffsetSeconds: 0,
    }
    saved.soundtrack!.recap = {
      mode: "media",
      url: "/media/private-story-voiceover.mp3",
      volume: 0.41,
      loop: false,
      fadeMs: 0,
      startOffsetSeconds: 3,
    }
    const resolved = resolvePlatformAudioDefaults(saved)
    expect(resolved.cues.answersMusic).toEqual(saved.cues.answersMusic)
    expect(resolved.soundtrack?.results?.mode).toBe("mute")
    expect(resolved.soundtrack?.recap).toEqual(saved.soundtrack!.recap)
    expect(resolvePlatformAudioDefaults().soundtrack?.recap?.url).toBe(
      PLATFORM_AUDIO_URLS.recap,
    )
  })

  it("lets explicit theme media and mute replace inherited defaults, while retaining game overrides", () => {
    const selection = createDefaultShowTheme()
    const theme = resolveShowTheme({ selection, role: "manager" })
    const defaults = applyThemeAudioDefaults(theme, createDefaultAudioExtras())
    expect(defaults.cues.answersMusic.url).toBe(PLATFORM_AUDIO_URLS.voting)
    expect(defaults.soundtrack?.lobby?.url).toBe(PLATFORM_AUDIO_URLS.lobby)
    expect(defaults.soundtrack?.results?.mode).toBe("media")
    const custom = createDefaultAudioExtras()
    custom.cues.answersMusic = {
      source: "media",
      url: "/media/my-game-vote.mp3",
      volume: 0.19,
      enabled: true,
      loop: true,
    }
    expect(applyThemeAudioDefaults(theme, custom).cues.answersMusic).toEqual(
      custom.cues.answersMusic,
    )
    selection.overrides = {
      audio: {
        answersMusic: { mediaUrl: "/media/theme-vote.mp3", volume: 0.14 },
        revealResults: { muted: true },
      },
    }
    const override = applyThemeAudioDefaults(
      resolveShowTheme({ selection, role: "manager" }),
      createDefaultAudioExtras(),
    )
    expect(override.cues.answersMusic.url).toBe("/media/theme-vote.mp3")
    expect(override.cues.answersMusic.volume).toBe(0.14)
    expect(override.soundtrack?.results?.mode).toBe("mute")
    expect(
      themeAllowsAudioUrl(theme, "answersMusic", PLATFORM_AUDIO_URLS.voting),
    ).toBe(true)
    expect(
      themeAllowsAudioUrl(
        theme,
        "answersMusic",
        "/tadazz-show/music/platform/unreviewed.mp3",
      ),
    ).toBe(false)
  })

  it.each(["tadazz-classic", "razzia-original"])(
    "uses platform recordings in %s unless a recording variant is explicitly selected",
    (id) => {
      const selection = { ...createDefaultShowTheme(), id }
      const manager = resolveShowTheme({ selection, role: "manager" })
      const player = resolveShowTheme({ selection, role: "player" })
      const audio = applyThemeAudioDefaults(manager)
      expect(audio.cues.showQuestion.url).toBe(PLATFORM_CUE_URLS.showQuestion)
      expect(audio.cues.revealResults.url).toBe(PLATFORM_CUE_URLS.revealResults)
      expect(resolveThemeEffect(manager, "phase-showQuestion")?.url).toBe(
        PLATFORM_CUE_URLS.showQuestion,
      )
      expect(resolveThemeEffect(player, "answer-submitted")?.url).toBe(
        PLATFORM_CUE_URLS.answerPressed,
      )
      expect(resolveThemeEffect(player, "answer-selected")?.url).toBeUndefined()
      expect(
        resolveThemeEffect(manager, "answer-submitted")?.url,
      ).toBeUndefined()

      selection.overrides = { audio: { answersMusic: { volume: 0.12 } } }
      const gainOnly = applyThemeAudioDefaults(
        resolveShowTheme({ selection, role: "manager" }),
      )
      expect(gainOnly.cues.answersMusic).toMatchObject({
        url: PLATFORM_AUDIO_URLS.voting,
        volume: 0.12,
      })
      selection.overrides = { audio: { showQuestion: { volume: 0.13 } } }
      const questionGain = applyThemeAudioDefaults(
        resolveShowTheme({ selection, role: "manager" }),
      )
      expect(questionGain.soundtrack?.question).toMatchObject({
        url: PLATFORM_AUDIO_URLS.question,
        volume: 0.13,
      })

      const variant = manager.definition.audioEvents.answersMusic
      selection.overrides = {
        audio: { answersMusic: { variantId: variant.defaultVariantId } },
      }
      const deliberate = applyThemeAudioDefaults(
        resolveShowTheme({ selection, role: "manager" }),
      )
      expect(deliberate.cues.answersMusic.url).toBe(
        manager.audio.answersMusic.url,
      )
    },
  )

  it("keeps one exact public asset per recording with no customer voiceover or broad URL allowance", () => {
    expect(PLATFORM_AUDIO_ASSETS).toHaveLength(8)
    expect(
      new Set(PLATFORM_AUDIO_ASSETS.map((asset) => asset.sha256)).size,
    ).toBe(8)
    expect(new Set(PLATFORM_AUDIO_ASSETS.map((asset) => asset.url)).size).toBe(
      8,
    )
    for (const asset of PLATFORM_AUDIO_ASSETS) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(asset.bytes).toBeGreaterThan(0)
      expect(asset.url).toMatch(/^\/tadazz-show\/music\/platform\//u)
    }
  })
})
