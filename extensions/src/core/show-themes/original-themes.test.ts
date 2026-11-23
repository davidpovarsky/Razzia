import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { applyThemeAudioDefaults, resolveThemeEffect } from "./audio"
import { preserveCompatibleThemeAudio } from "./change"
import { SHOW_THEME_LOCALES, showThemeDefinitionSchema } from "./definition"
import { showThemeRegistry } from "./registry"
import { resolveShowTheme } from "./resolve"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_ROLES,
  SHOW_THEME_SLOTS,
  savedThemeScope,
  updateScopedTheme,
  type ScopedThemeOverrides,
  type ShowThemeSelection,
  type ThemeOverrides,
} from "./selection"

// This acceptance list is deliberately independent of the registry generator.
const families = [
  "royal-quiz",
  "neon-arcade",
  "retro-tv",
  "magic-storybook",
  "crystal-future",
  "carnival-pop",
  "sports-arena",
  "mystery-noir",
] as const
const selection = (id: string): ShowThemeSelection => ({
  id,
  version: "1.0.0",
  overrides: {},
})
const definition = (id: string) => {
  const value = showThemeRegistry.get(id, "1.0.0")

  if (!value) {
    throw new Error(`Missing first-party family ${id}@1.0.0`)
  }

  return value
}

describe("eight original first-party show families", () => {
  it.each(families)(
    "%s is complete, localized and pinned to actual shipped assets",
    (id) => {
      const theme = definition(id)
      expect(showThemeDefinitionSchema.safeParse(theme).success).toBe(true)
      expect(theme.kind).toBe("code-backed")
      expect(theme.rendererId).toBe("tadazz-original-stage")
      expect(theme.rendererApiVersion).toBe(1)
      expect(theme.tokens.effects).toBe("original-theme-v1")
      expect(theme.capabilities.reducedMotion).toBe("same-theme-static")
      expect(theme.capabilities.roles).toEqual(
        expect.arrayContaining([...SHOW_THEME_ROLES]),
      )
      expect(theme.capabilities.minAnswers).toBe(2)
      expect(theme.capabilities.maxAnswers).toBeGreaterThanOrEqual(5)
      expect(Object.keys(theme.slots).sort()).toEqual(
        [...SHOW_THEME_SLOTS].sort(),
      )
      expect(Object.keys(theme.audioEvents).sort()).toEqual(
        [...SHOW_THEME_AUDIO_EVENTS].sort(),
      )
      expect(Object.isFrozen(theme)).toBe(true)
      expect(Object.isFrozen(theme.slots.question.variants[0])).toBe(true)

      const labelKeys = [theme.nameKey, theme.descriptionKey]
      for (const slot of SHOW_THEME_SLOTS) {
        const spec = theme.slots[slot]
        expect(
          spec.variants.some((item) => item.id === spec.defaultVariantId),
          slot,
        ).toBe(true)
        for (const variant of spec.variants) {
          expect(variant.id.startsWith(`${id}.`), slot).toBe(true)
          expect(variant.rendererId, slot).toMatch(/^original-/u)
          labelKeys.push(variant.labelKey)
        }
      }
      for (const event of SHOW_THEME_AUDIO_EVENTS) {
        const spec = theme.audioEvents[event]
        expect(
          spec.variants.some((item) => item.id === spec.defaultVariantId),
          event,
        ).toBe(true)
        for (const variant of spec.variants) {
          labelKeys.push(variant.labelKey)
          expect(
            variant.silent ||
              variant.inheritPlatform ||
              Boolean(variant.assetId),
            event,
          ).toBe(true)
          expect(new Set(variant.roles).size, event).toBe(variant.roles.length)
        }
      }
      for (const locale of SHOW_THEME_LOCALES) {
        const labels = theme.localizations?.[locale]
        expect(labels, locale).toBeDefined()
        for (const key of labelKeys) {
          expect(labels?.[key]?.trim(), `${locale}/${key}`).toBeTruthy()
        }
      }

      const poster = theme.assets.find(
        (asset) => asset.id === theme.posterAssetId,
      )
      expect(poster?.url).toBe(`/tadazz-show/originals/${id}/poster.png`)
      for (const asset of theme.assets) {
        expect(asset.url.startsWith("/"), asset.url).toBe(true)
        const bytes = readFileSync(
          join(
            import.meta.dirname,
            "../../../../packages/web/public",
            asset.url,
          ),
        )
        expect(bytes.byteLength, asset.url).toBe(asset.bytes)
        expect(
          createHash("sha256").update(bytes).digest("hex"),
          asset.url,
        ).toBe(asset.sha256)
        expect(asset.provenance.trim(), asset.url).toBeTruthy()
      }
    },
  )

  it("keeps eight distinct original posters and rejects executable renderer impersonation", () => {
    const posters = families.map((id) => {
      const theme = definition(id)

      return theme.assets.find((asset) => asset.id === theme.posterAssetId)
        ?.sha256
    })
    expect(new Set(posters).size).toBe(8)
    for (const mutation of [
      { kind: "declarative" },
      { version: "2.0.0" },
      { id: "foreign-original" },
    ]) {
      const candidate = {
        ...structuredClone(definition(families[0])),
        ...mutation,
      }
      expect(showThemeDefinitionSchema.safeParse(candidate).success).toBe(false)
    }
  })

  it.each(families)(
    "%s resolves all roles, owns its recordings, and retains deliberate silence",
    (id) => {
      const theme = definition(id)
      for (const role of SHOW_THEME_ROLES) {
        const resolved = resolveShowTheme({ selection: selection(id), role })
        expect(resolved.definition.id).toBe(id)
        expect(resolved.diagnostics).toEqual([])
        for (const event of SHOW_THEME_AUDIO_EVENTS) {
          const cue = resolved.audio[event]

          if (!cue.roles.includes(role)) {
            expect(cue.silent, `${role}/${event}`).toBe(true)
            expect(cue.url, `${role}/${event}`).toBeUndefined()
          } else if (!cue.silent) {
            expect(cue.url, `${role}/${event}`).toBeTruthy()

            if (!cue.inheritPlatform) {
              expect(cue.url, `${role}/${event}`).toContain(`/originals/${id}/`)
            }
          }
        }
        expect(resolved.audio.zzTransition.silent).toBe(true)
        expect(resolved.audio.zzTransition.url).toBeUndefined()

        if (role === "player") {
          expect(
            resolveThemeEffect(resolved, "timer-start")?.url,
          ).toBeUndefined()
          expect(
            resolveThemeEffect(resolved, "timer-ended")?.url,
          ).toBeUndefined()
        }
      }
      const { opening } = theme.audioEvents
      expect(
        opening.variants.find((value) => value.id === opening.defaultVariantId)
          ?.inheritPlatform,
      ).toBe(true)
      const muted = resolveShowTheme({
        selection: {
          ...selection(id),
          overrides: { audio: { answersMusic: { muted: true } } },
        },
        role: "manager",
      })
      expect(muted.audio.answersMusic.silent).toBe(true)
      expect(applyThemeAudioDefaults(muted).cues.answersMusic.enabled).toBe(
        false,
      )
      for (const event of SHOW_THEME_AUDIO_EVENTS) {
        for (const variant of theme.audioEvents[event].variants.filter(
          (value) => value.silent,
        )) {
          const explicitSilence = resolveShowTheme({
            selection: {
              ...selection(id),
              overrides: {
                audio: { [event]: { variantId: variant.id, muted: false } },
              },
            },
            role: "manager",
          })
          expect(explicitSilence.audio[event].silent, event).toBe(true)
          expect(explicitSilence.audio[event].url, event).toBeUndefined()
        }
      }
    },
  )

  it("archives each original family's local edits and restores them after a complete round trip", () => {
    let scoped: ScopedThemeOverrides | undefined = undefined
    const archived = new Map<string, ThemeOverrides>()
    for (const [index, id] of families.entries()) {
      const overrides: ThemeOverrides = {
        slots: {
          question: {
            variantId: definition(id).slots.question.defaultVariantId,
          },
        },
        audio: {
          answersMusic: { muted: index % 2 === 0, volume: (index + 1) / 10 },
        },
        roles: { spectator: { audio: { lobby: { muted: true } } } },
      }
      archived.set(id, structuredClone(overrides))
      const previous = structuredClone(scoped)
      const next = updateScopedTheme(scoped, selection(id), overrides)
      expect(scoped).toEqual(previous)
      scoped = next
    }
    const persisted = JSON.parse(JSON.stringify(scoped)) as ScopedThemeOverrides
    for (const id of families) {
      expect(savedThemeScope(persisted, selection(id))).toEqual(
        archived.get(id),
      )
      const restored = resolveShowTheme({
        selection: selection(id),
        scope: persisted,
        role: "manager",
      })
      expect(restored.scopeOverrides).toEqual(archived.get(id))
      expect(restored.diagnostics).toEqual([])
    }
  })

  it("preserves owner audio, per-role mute and unknown saved versions without reinterpreting foreign visuals", () => {
    const mediaUrl = "/media/owner-authored-voting.mp3"
    for (let index = 0; index < families.length; index += 1) {
      const previousId = families[index]
      const nextId = families[(index + 1) % families.length]
      const current: ShowThemeSelection = {
        ...selection(previousId),
        overrides: {
          slots: {
            question: {
              variantId: definition(previousId).slots.question.defaultVariantId,
            },
          },
          audio: { answersMusic: { mediaUrl, volume: 0.35 } },
          roles: {
            spectator: { audio: { lobby: { muted: true, volume: 0.2 } } },
          },
        },
      }
      const before = structuredClone(current)
      const next = preserveCompatibleThemeAudio({
        current,
        next: selection(nextId),
        previousDefinition: definition(previousId),
        nextDefinition: definition(nextId),
      })
      expect(current).toEqual(before)
      expect(next.overrides.slots).toBeUndefined()
      expect(next.overrides.audio?.answersMusic).toEqual({
        mediaUrl,
        volume: 0.35,
      })
      expect(next.overrides.roles?.spectator?.audio?.lobby).toEqual({
        muted: true,
        volume: 0.2,
      })
      expect(
        resolveShowTheme({ selection: next, role: "manager" }).audio
          .answersMusic.url,
      ).toBe(mediaUrl)
      const unknown = { ...current, version: "9.9.9" }
      const fallback = resolveShowTheme({ selection: unknown, role: "manager" })
      expect(fallback.requested).toEqual(unknown)
      expect(fallback.definition.id).toBe("tadazz-classic")
      expect(fallback.diagnostics).toContainEqual({ code: "unknown-theme" })
    }
  })
})
