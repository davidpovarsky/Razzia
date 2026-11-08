import { expect, it } from "vitest"
import {
  createDefaultShowTheme,
  savedThemeScope,
  updateScopedTheme,
  resetThemeSection,
  type ScopedThemeOverrides,
} from "./selection"
import { resolveShowTheme } from "./resolve"
import { collectThemeExtrasMedia, detachThemeExtrasMedia } from "./media"
import {
  applyThemeAudioDefaults,
  resolveThemeEffect,
  themeAllowsAudioUrl,
} from "./audio"

it("resets only the selected section including role choices and preserves card media during a motion reset", () => {
  const source = {
    slots: {
      question: {
        mediaUrl: "/media/background.png",
        fit: "cover" as const,
        variantId: "tadazz-classic.question.default",
      },
    },
    audio: { answersMusic: { muted: true }, revealResults: { volume: 0.2 } },
    roles: { spectator: { audio: { answersMusic: { muted: true } } } },
  }
  const motion = resetThemeSection(source, {
    section: "motion",
    slots: ["question"],
    events: [],
  })
  expect(motion.slots?.question).toEqual({
    mediaUrl: "/media/background.png",
    fit: "cover",
  })
  const audio = resetThemeSection(source, {
    section: "audio",
    slots: [],
    events: ["answersMusic"],
  })
  expect(audio.audio).toEqual({ revealResults: { volume: 0.2 } })
  expect(audio.roles?.spectator?.audio).toEqual({})
  expect(audio.slots).toEqual(source.slots)
})

it("archives local foreign edits and restores the matching version without data loss", () => {
  const classic = createDefaultShowTheme()
  const original: ScopedThemeOverrides = {
    themeId: "uninstalled-theme",
    themeVersion: "2.0.0",
    overrides: { slots: { question: { mediaUrl: "/media/original.png" } } },
  }
  const changed = updateScopedTheme(original, classic, {
    audio: { answersMusic: { muted: true } },
  })
  expect(changed.history).toEqual([original])
  expect(
    savedThemeScope(changed, {
      id: original.themeId,
      version: original.themeVersion,
    }),
  ).toEqual(original.overrides)
  expect(original.history).toBeUndefined()
  const restored = updateScopedTheme(
    changed,
    { id: original.themeId, version: original.themeVersion },
    original.overrides,
  )
  expect(
    resolveShowTheme({ selection: classic, scope: restored, role: "manager" })
      .audio.answersMusic.silent,
  ).toBe(true)
})

it("tracks and detaches media in archived global and local choices", () => {
  const classic = createDefaultShowTheme()
  const extras = {
    defaults: {
      showTheme: classic,
      themeHistory: [
        {
          ...classic,
          id: "older-theme",
          overrides: { slots: { question: { mediaUrl: "/media/old.png" } } },
        },
      ],
    },
    perQuestion: {
      q: {
        themeOverrides: {
          themeId: classic.id,
          themeVersion: classic.version,
          overrides: {},
          history: [
            {
              themeId: "older-theme",
              themeVersion: "1.0.0",
              overrides: {
                slots: { question: { mediaUrl: "/media/local.png" } },
              },
            },
          ],
        },
      },
    },
  }
  expect(collectThemeExtrasMedia(extras).sort()).toEqual([
    "/media/local.png",
    "/media/old.png",
  ])
  expect(
    collectThemeExtrasMedia(detachThemeExtrasMedia(extras, "/media/old.png")),
  ).toEqual(["/media/local.png"])
  expect(collectThemeExtrasMedia(extras)).toHaveLength(2)
})

it("local default replaces global custom media and host effects never reach player", () => {
  const selection = createDefaultShowTheme()
  selection.overrides = {
    audio: { answersMusic: { mediaUrl: "/media/custom.mp3", volume: 0.2 } },
  }
  const scope = {
    themeId: selection.id,
    themeVersion: selection.version,
    overrides: {
      audio: {
        answersMusic: {
          variantId: "tadazz-classic.audio.answersMusic.default",
        },
      },
    },
  }
  const theme = resolveShowTheme({ selection, scope, role: "manager" })
  expect(applyThemeAudioDefaults(theme).cues.answersMusic.url).toBe(
    "/sounds/answersMusic.mp3",
  )
  expect(
    resolveThemeEffect(
      resolveShowTheme({ selection, role: "player" }),
      "timer-ended",
    )?.url,
  ).toBeUndefined()
  expect(resolveThemeEffect(theme, "timer-ended")?.url).toContain(
    "tadazz-timer-end-",
  )
  expect(resolveThemeEffect(theme, "vote-locked")?.url).not.toContain("tadazz-timer-end-")
  expect(
    themeAllowsAudioUrl(
      theme,
      "answersMusic",
      "https://user:secret@example.com/sound.mp3",
    ),
  ).toBe(false)
  expect(themeAllowsAudioUrl(theme, "answersMusic", "/sounds/boump.mp3")).toBe(
    false,
  )
})
