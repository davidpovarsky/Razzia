import { describe, expect, it } from "vitest"
import { createPlatformAudioExtras } from "../platform-audio-defaults"
import { applyThemeAudioDefaults } from "./audio"
import { preserveCompatibleThemeAudio } from "./change"
import { ShowThemeRegistry, showThemeRegistry } from "./registry"
import { resolveShowTheme } from "./resolve"
import type { ShowThemeSelection } from "./selection"

function fixture() {
  const previousDefinition = structuredClone(showThemeRegistry.classic())
  const nextDefinition = structuredClone(previousDefinition)
  nextDefinition.id = "test-compatible-theme"
  nextDefinition.kind = "declarative"
  const rename = (value: string) =>
    value.replace("tadazz-classic.", `${nextDefinition.id}.`)

  for (const spec of [
    ...Object.values(nextDefinition.slots),
    ...Object.values(nextDefinition.audioEvents),
  ]) {
    spec.defaultVariantId = rename(spec.defaultVariantId)

    for (const variant of spec.variants) {
      variant.id = rename(variant.id)
    }
  }

  for (const cue of Object.values(nextDefinition.choreographyCues)) {
    cue.variantId = rename(cue.variantId)
  }

  const current: ShowThemeSelection = {
    id: previousDefinition.id,
    version: previousDefinition.version,
    overrides: {},
  }
  const next: ShowThemeSelection = {
    id: nextDefinition.id,
    version: nextDefinition.version,
    overrides: {},
  }

  return { current, next, previousDefinition, nextDefinition }
}

describe("shared game theme changes", () => {
  it("keeps compatible imported soundtracks, timer excerpts and cue settings effective", () => {
    const input = fixture()
    const registry = new ShowThemeRegistry()
    registry.register(input.previousDefinition)
    registry.register(input.nextDefinition)
    const audio = createPlatformAudioExtras()
    const saved = {
      lobby: "/media/age_of_wonder.mp3",
      voting: "/media/legacy.mp3",
      results: "/media/thinking_music.mp3",
      leaderboard: "/media/terminus.mp3",
    } as const

    for (const [slot, url] of Object.entries(saved)) {
      audio.soundtrack ??= {}
      audio.soundtrack[slot as keyof typeof saved] = {
        mode: "media",
        url,
        volume: 0.65,
        loop: slot !== "leaderboard",
        fadeMs: 750,
        startOffsetSeconds: slot === "voting" ? 32 : 0,
      }
    }

    audio.cues.showQuestion = {
      source: "media",
      url: "/media/thinking_music.mp3",
      volume: 0.4,
      enabled: false,
      loop: true,
    }
    const before = structuredClone(audio)
    const selection = preserveCompatibleThemeAudio(input)
    const resolved = resolveShowTheme({ selection, registry, role: "manager" })
    const effective = applyThemeAudioDefaults(resolved, audio)

    expect(selection.legacyPolicy).toBe("preserve-saved")

    for (const slot of Object.keys(saved) as Array<keyof typeof saved>) {
      expect(effective.soundtrack?.[slot]).toEqual(before.soundtrack?.[slot])
    }

    expect(effective.cues.showQuestion).toEqual(before.cues.showQuestion)
    expect(audio).toEqual(before)
  })

  it("moves only compatible explicit audio and retains role-specific mute and volume", () => {
    const input = fixture()
    input.current.overrides = {
      slots: { question: { mediaUrl: "/media/old-background.png" } },
      audio: {
        answersMusic: { mediaUrl: "/media/timer.mp3", volume: 0.35 },
      },
      roles: { spectator: { audio: { lobby: { muted: true, volume: 0.2 } } } },
    }
    const before = structuredClone(input)
    const selection = preserveCompatibleThemeAudio(input)

    expect(selection.overrides.audio?.answersMusic).toEqual({
      mediaUrl: "/media/timer.mp3",
      volume: 0.35,
    })
    expect(selection.overrides.roles?.spectator?.audio?.lobby).toEqual({
      muted: true,
      volume: 0.2,
    })
    expect(selection.overrides.slots).toBeUndefined()
    expect(input).toEqual(before)
  })

  it("matches shared recordings by URL instead of copying foreign variant IDs", () => {
    const input = fixture()
    const source =
      input.previousDefinition.audioEvents.showQuestion.variants.find(
        (variant) => !variant.silent && variant.assetId,
      )

    if (!source) {
      throw new Error("Shared fixture requires a question recording")
    }

    input.current.overrides.audio = {
      showQuestion: { variantId: source.id, volume: 0.7 },
    }
    const selection = preserveCompatibleThemeAudio(input)

    expect(selection.overrides.audio?.showQuestion).toEqual({
      variantId: source.id.replace("tadazz-classic.", `${input.next.id}.`),
      volume: 0.7,
    })
    expect(selection.overrides.audio?.showQuestion?.variantId).not.toBe(
      source.id,
    )
  })

  it("leaves incompatible media archived in the unchanged previous theme", () => {
    const input = fixture()
    input.current.overrides.audio = {
      answersMusic: { mediaUrl: "/media/private-timer.mp3" },
    }
    input.nextDefinition.audioEvents.answersMusic.customMedia = false
    const before = structuredClone(input.current)
    const selection = preserveCompatibleThemeAudio(input)

    expect(selection.overrides.audio?.answersMusic).toBeUndefined()
    expect(input.current).toEqual(before)
  })

  it("honors the destination theme's explicitly saved audio and reset policy", () => {
    const input = fixture()
    input.current.overrides.audio = {
      answersMusic: { mediaUrl: "/media/source-timer.mp3" },
    }
    input.next.legacyPolicy = "theme-defaults"
    input.next.overrides.audio = {
      answersMusic: { mediaUrl: "/media/target-timer.mp3", muted: true },
    }
    const before = structuredClone(input.next)

    expect(preserveCompatibleThemeAudio(input)).toEqual(before)
  })

  it.each([true, false])(
    "preserves silence with muted:false when the destination has a silent variant: %s",
    (hasSilentVariant) => {
      const input = fixture()
      const source =
        input.previousDefinition.audioEvents.answersMusic.variants.find(
          (variant) => variant.silent,
        )

      if (!source) {
        throw new Error("Shared fixture requires a silent timer option")
      }

      input.current.overrides.audio = {
        answersMusic: { variantId: source.id, muted: false },
      }

      if (!hasSilentVariant) {
        const spec = input.nextDefinition.audioEvents.answersMusic
        spec.variants = spec.variants.filter((variant) => !variant.silent)
      }

      const registry = new ShowThemeRegistry()
      registry.register(input.previousDefinition)
      registry.register(input.nextDefinition)
      const selection = preserveCompatibleThemeAudio(input)
      const resolved = resolveShowTheme({
        selection,
        registry,
        role: "manager",
      })

      expect(resolved.audio.answersMusic.silent).toBe(true)
      expect(resolved.audio.answersMusic.url).toBeUndefined()
    },
  )

  it("retains an installed BMS package recording through the shared safe media resolver", () => {
    const input = fixture()
    // Real installer shape: /media/pkg_<archive SHA prefix>_<asset SHA>.mp3.
    // These are the verified BMS archive and Legacy excerpt hashes; no game
    // content, account identifier or media-access credential is in this fixture.
    const url =
      "/media/pkg_041e64a214f6121b3492b736_e433bb921f9416ef05a38bb122aef69c8e779ac4d3c92b8db72fa45adf01058b.mp3"
    input.current.overrides.audio = { answersMusic: { mediaUrl: url } }
    const registry = new ShowThemeRegistry()
    registry.register(input.previousDefinition)
    registry.register(input.nextDefinition)
    const selection = preserveCompatibleThemeAudio(input)
    const resolved = resolveShowTheme({ selection, registry, role: "manager" })
    const effective = applyThemeAudioDefaults(
      resolved,
      createPlatformAudioExtras(),
    )

    expect(selection.overrides.audio?.answersMusic?.mediaUrl).toBe(url)
    expect(resolved.audio.answersMusic.url).toBe(url)
    expect(effective.soundtrack?.voting?.url).toBe(url)
    expect(resolved.diagnostics).toEqual([])
  })
})
