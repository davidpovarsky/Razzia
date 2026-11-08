import type { ResolvedShowTheme } from "./resolve"
import { isSafeThemeAssetUrl, type ShowThemeAudioEvent } from "./selection"
import type { CueId, SoundtrackSlotId } from "../constants"
import type { AudioExtras } from "../quiz-extras"

export const CUE_THEME_EVENTS: Record<CueId, ShowThemeAudioEvent> = {
  start: "opening",
  showQuestion: "showQuestion",
  answersMusic: "answersMusic",
  answerPressed: "answerSubmitted",
  revealResults: "revealResults",
  leaderboard: "leaderboard",
  podium1: "podium1",
  podium2: "podium2",
  podium3: "podium3",
}

export const SOUNDTRACK_THEME_EVENTS: Record<
  SoundtrackSlotId,
  ShowThemeAudioEvent
> = {
  openingIntro: "opening",
  lobby: "lobby",
  roundStart: "zzTransition",
  question: "showQuestion",
  voting: "answersMusic",
  results: "revealResults",
  leaderboard: "leaderboard",
  recap: "revealResults",
  finale: "closing",
}

const EFFECT_EVENTS: Readonly<Partial<Record<string, ShowThemeAudioEvent>>> = {
  "answer-selected": "answerSelected",
  "answer-submitted": "answerSubmitted",
  "timer-ended": "timerExpired",
  "vote-locked": "voteLocked",
  "countdown-ended": "voteLocked",
  "survey-reveal": "revealResults",
  "top-pick-reveal": "answerSubmitted",
  "timer-tick": "timerWarning",
  "timer-urgent": "timerWarning",
  "timer-final": "timerWarning",
  "story-begin": "zzTransition",
  "wipe-covered": "zzTransition",
  "company-ident": "zzTransition",
  "tadazz-welcome": "zzTransition",
  "opening-portal": "zzTransition",
  "opening-logo": "zzTransition",
  "directory-loaded": "answerSubmitted",
  "phone-ready": "answerSubmitted",
  "readiness-grid": "answerSubmitted",
  "round-launch": "zzTransition",
  "story-progress-update": "answerSubmitted",
  "story-assembled": "revealResults",
  "story-live-hold": "zzTransition",
  "finale-impact": "closing",
  "curtains-closed": "zzTransition",
}

export function themeAllowsAudioUrl(
  theme: ResolvedShowTheme,
  event: ShowThemeAudioEvent,
  url: string,
): boolean {
  if (!isSafeThemeAssetUrl(url)) {
    return false
  }

  const spec = theme.definition.audioEvents[event]

  if (
    spec.variants.some((variant) =>
      theme.definition.assets.some(
        (asset) => asset.id === variant.assetId && asset.url === url,
      ),
    )
  ) {
    return true
  }

  return (
    spec.customMedia &&
    (url.startsWith("/media/") || url.startsWith("https://"))
  )
}

export function defaultThemeAudioUrl(
  theme: ResolvedShowTheme,
  event: ShowThemeAudioEvent,
): string | undefined {
  const spec = theme.definition.audioEvents[event]
  const variant = spec.variants.find(
    (value) => value.id === spec.defaultVariantId,
  )

  return variant && !variant.silent && variant.roles.includes(theme.role)
    ? theme.definition.assets.find((asset) => asset.id === variant.assetId)?.url
    : undefined
}

/** Existing saved custom/mute choices survive only where this theme permits them. */
export function applyThemeAudioDefaults(
  theme: ResolvedShowTheme,
  audio?: AudioExtras,
): AudioExtras {
  const cues = Object.fromEntries(
    Object.entries(CUE_THEME_EVENTS).map(([cueId, event]) => {
      const effective = theme.audio[event]
      const saved =
        theme.requested.legacyPolicy === "theme-defaults"
          ? undefined
          : audio?.cues[cueId as CueId]
      const custom =
        saved?.source === "media" &&
        saved.url &&
        themeAllowsAudioUrl(theme, event, saved.url)
      const explicitTheme =
        Object.keys(theme.audioSelections[event] ?? {}).length > 0

      if (custom && !explicitTheme && effective.roles.includes(theme.role)) {
        return [cueId, saved]
      }

      return [
        cueId,
        {
          source: "media",
          url: effective.url,
          volume: explicitTheme
            ? effective.volume
            : (saved?.volume ?? effective.volume),
          enabled:
            !effective.silent &&
            (explicitTheme ? true : saved?.enabled !== false),
          loop: effective.loop,
        },
      ]
    }),
  ) as AudioExtras["cues"]
  const soundtrack =
    theme.requested.legacyPolicy === "theme-defaults"
      ? ({} as NonNullable<AudioExtras["soundtrack"]>)
      : { ...audio?.soundtrack }
  for (const [slot, event] of Object.entries(SOUNDTRACK_THEME_EVENTS) as Array<
    [SoundtrackSlotId, ShowThemeAudioEvent]
  >) {
    const configured = soundtrack[slot]
    const selected = theme.audio[event]
    const explicit = Object.keys(theme.audioSelections[event] ?? {}).length > 0

    if (explicit) {
      soundtrack[slot] = {
        mode: selected.silent ? "mute" : "media",
        url: selected.url,
        volume: selected.volume,
        loop: selected.loop,
        fadeMs: selected.fadeMs,
        startOffsetSeconds: 0,
      }
    } else if (
      configured?.url &&
      !themeAllowsAudioUrl(theme, event, configured.url)
    ) {
      soundtrack[slot] = { ...configured, mode: "mute", url: undefined }
    }
  }

  return { ...audio, cues, soundtrack }
}

/** Resolve native choreography milestones through the same theme-owned audio map. */
export function resolveThemeEffect(theme: ResolvedShowTheme, name: string) {
  const phaseCue =
    name.startsWith("phase-") && Object.hasOwn(CUE_THEME_EVENTS, name.slice(6))
      ? CUE_THEME_EVENTS[name.slice(6) as CueId]
      : undefined
  const choreography = Object.hasOwn(theme.definition.choreographyCues, name)
    ? theme.definition.choreographyCues[name]
    : undefined
  const event = phaseCue ?? choreography?.event ?? EFFECT_EVENTS[name]

  if (!event) {
    return undefined
  }

  const resolved = theme.audio[event]
  const explicit = Object.keys(theme.audioSelections[event] ?? {}).length > 0
  const variant =
    !explicit && choreography
      ? (theme.definition.audioEvents[event].variants.find(
          (value) => value.id === choreography.variantId,
        ) ?? resolved)
      : resolved
  const url =
    "url" in variant && typeof variant.url === "string"
      ? variant.url
      : theme.definition.assets.find((asset) => asset.id === variant.assetId)
          ?.url

  return {
    event,
    url:
      variant.silent || !variant.roles.includes(theme.role) ? undefined : url,
    volume: variant.volume,
  }
}
