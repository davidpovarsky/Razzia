import { z } from "zod"

export const SHOW_THEME_SLOTS = [
  "firstPaint",
  "opening",
  "lobby",
  "question",
  "answerCards",
  "voting",
  "timer",
  "voteLock",
  "resultsReveal",
  "leaderboard",
  "rankUpdate",
  "zzTransition",
  "interlude",
  "closing",
  "personalResult",
] as const

export const SHOW_THEME_AUDIO_EVENTS = [
  "opening",
  "lobby",
  "showQuestion",
  "answersMusic",
  "answerSelected",
  "answerSubmitted",
  "timerWarning",
  "timerExpired",
  "voteLocked",
  "revealResults",
  "leaderboard",
  "zzTransition",
  "podium1",
  "podium2",
  "podium3",
  "closing",
] as const

export const SHOW_THEME_ROLES = ["manager", "player", "spectator"] as const

export type ShowThemeSlotId = (typeof SHOW_THEME_SLOTS)[number]

export type ShowThemeAudioEvent = (typeof SHOW_THEME_AUDIO_EVENTS)[number]

export type ShowThemeRole = (typeof SHOW_THEME_ROLES)[number]

export const themeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/u)

export const themeVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u)

const identifier = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9._-]+$/u)

/** A bundled path is trusted only inside explicit asset roots, with no encoded traversal. */
export function isSafeThemeAssetUrl(value: string): boolean {
  // oxlint-disable-next-line no-control-regex -- Control characters are explicitly rejected in persisted URLs.
  if (value.length > 2048 || /[\\\s\u0000-\u001f]/u.test(value)) {
    return false
  }

  if (/^\/(media|sounds|tadazz-show)\/[A-Za-z0-9_@./-]+$/u.test(value)) {
    return value
      .split("/")
      .slice(1)
      .every((part) => part !== "" && part !== "." && part !== "..")
  }

  try {
    const parsed = new URL(value)

    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash
    )
  } catch {
    return false
  }
}

export const themeAssetUrlSchema = z
  .string()
  .refine(isSafeThemeAssetUrl, "Invalid theme asset URL")

const visualSelection = z.strictObject({
  variantId: identifier.optional(),
  mediaUrl: themeAssetUrlSchema.optional(),
  fit: z.enum(["cover", "contain"]).optional(),
})
const audioSelection = z.strictObject({
  variantId: identifier.optional(),
  mediaUrl: themeAssetUrlSchema.optional(),
  muted: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
})
const slotSelections = z.partialRecord(
  z.enum(SHOW_THEME_SLOTS),
  visualSelection,
)
const audioSelections = z.partialRecord(
  z.enum(SHOW_THEME_AUDIO_EVENTS),
  audioSelection,
)
const roleSelection = z.strictObject({
  slots: slotSelections.optional(),
  audio: audioSelections.optional(),
})

export const themeOverridesSchema = z.strictObject({
  slots: slotSelections.optional(),
  audio: audioSelections.optional(),
  roles: z.partialRecord(z.enum(SHOW_THEME_ROLES), roleSelection).optional(),
})

export type ThemeOverrides = z.infer<typeof themeOverridesSchema>

export function resetThemeSection(
  overrides: ThemeOverrides,
  {
    section,
    slots,
    events,
  }: {
    section: "audio" | "background" | "motion"
    slots: readonly ShowThemeSlotId[]
    events: readonly ShowThemeAudioEvent[]
  },
): ThemeOverrides {
  const next = structuredClone(overrides)
  for (const group of [next, ...Object.values(next.roles ?? {})]) {
    if (section === "audio") {
      group.audio = Object.fromEntries(
        Object.entries(group.audio ?? {}).filter(
          ([event]) => !events.includes(event as ShowThemeAudioEvent),
        ),
      )
    } else {
      for (const slot of slots) {
        const value = group.slots?.[slot]

        if (!value) {
          continue
        }

        if (section === "motion") {
          delete value.variantId
        } else {
          delete value.mediaUrl
          delete value.fit
        }
      }
    }
  }

  return next
}

const scopeSnapshot = z.strictObject({
  themeId: themeIdSchema,
  themeVersion: themeVersionSchema,
  overrides: themeOverridesSchema,
})

export const scopedThemeOverridesSchema = scopeSnapshot.extend({
  history: z.array(scopeSnapshot).max(32).optional(),
})

export type ScopedThemeOverrides = z.infer<typeof scopedThemeOverridesSchema>

/** Archive incompatible local edits; never reinterpret a foreign variant or evict edits silently. */
export function updateScopedTheme(
  previous: ScopedThemeOverrides | undefined,
  selection: { id: string; version: string },
  overrides: ThemeOverrides,
): ScopedThemeOverrides {
  const matches = (item: { themeId: string; themeVersion: string }) =>
    item.themeId === selection.id && item.themeVersion === selection.version
  const history = (previous?.history ?? []).filter((item) => !matches(item))

  if (previous && !matches(previous)) {
    const { history: _history, ...snapshot } = previous
    const index = history.findIndex(
      (item) =>
        item.themeId === snapshot.themeId &&
        item.themeVersion === snapshot.themeVersion,
    )

    if (index >= 0) {
      history[index] = snapshot
    } else {
      if (history.length >= 32) {
        throw new Error("Theme scope archive is full")
      }

      history.push(snapshot)
    }
  }

  return {
    themeId: selection.id,
    themeVersion: selection.version,
    overrides,
    ...(history.length ? { history } : {}),
  }
}

export function savedThemeScope(
  previous: ScopedThemeOverrides | undefined,
  selection: { id: string; version: string },
): ThemeOverrides {
  if (
    previous?.themeId === selection.id &&
    previous.themeVersion === selection.version
  ) {
    return previous.overrides
  }

  return (
    previous?.history?.find(
      (item) =>
        item.themeId === selection.id &&
        item.themeVersion === selection.version,
    )?.overrides ?? {}
  )
}

export const showThemeSelectionSchema = z.strictObject({
  id: themeIdSchema,
  version: themeVersionSchema,
  overrides: themeOverridesSchema.default({}),
  legacyPolicy: z.enum(["preserve-saved", "theme-defaults"]).optional(),
})

export type ShowThemeSelection = z.infer<typeof showThemeSelectionSchema>

export const CLASSIC_THEME_ID = "tadazz-classic"

export const CLASSIC_THEME_VERSION = "1.0.0"

export const createDefaultShowTheme = (): ShowThemeSelection => ({
  id: CLASSIC_THEME_ID,
  version: CLASSIC_THEME_VERSION,
  overrides: {},
})

/** Explicit archived rollback is honored only if no modern theme was selected. */
export function isLegacyShowRollback(defaults: unknown): boolean {
  if (!defaults || typeof defaults !== "object") {
    return false
  }

  const value = defaults as { motionKit?: unknown; showTheme?: unknown }

  return value.motionKit === "legacy" && value.showTheme === undefined
}
