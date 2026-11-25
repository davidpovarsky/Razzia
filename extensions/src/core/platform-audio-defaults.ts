import { CUE_IDS, type CueId, type SoundtrackSlotId } from "./constants"
import { PLATFORM_AUDIO_ASSETS } from "./platform-audio-assets"
import type {
  AudioExtras,
  AudioCueSetting,
  SoundtrackSetting,
} from "./quiz-extras"

/** One public copy per verified recording; no tenant media or narrative voiceover. */
export const PLATFORM_AUDIO_URLS = Object.fromEntries(
  PLATFORM_AUDIO_ASSETS.map((asset) => [asset.key, asset.url]),
) as Record<(typeof PLATFORM_AUDIO_ASSETS)[number]["key"], string>

export const PLATFORM_CUE_URLS: Record<CueId, string> = {
  start: "/sounds/boump.mp3",
  showQuestion: "/sounds/tadazz-silky-transition-20261108.mp3",
  answersMusic: PLATFORM_AUDIO_URLS.voting,
  answerPressed: "/sounds/tadazz-confirm-20261108.mp3",
  revealResults: "/sounds/tadazz-reveal-bright-20261108.mp3",
  leaderboard: "/sounds/snearRoll.mp3",
  podium1: "/sounds/first.mp3",
  podium2: "/sounds/second.mp3",
  podium3: "/sounds/three.mp3",
}

/** These historical built-in URLs expressed inheritance, until explicitly selected. */
const LEGACY_PLATFORM_CUE_URLS: Record<CueId, string> = {
  start: "/sounds/boump.mp3",
  showQuestion: "/sounds/show.mp3",
  answersMusic: "/sounds/answersMusic.mp3",
  answerPressed: "/sounds/answersSound.mp3",
  revealResults: "/sounds/results.mp3",
  leaderboard: "/sounds/snearRoll.mp3",
  podium1: "/sounds/first.mp3",
  podium2: "/sounds/second.mp3",
  podium3: "/sounds/three.mp3",
}

export function isInheritedPlatformCueUrl(cueId: CueId, url?: string): boolean {
  return (
    url !== undefined &&
    (url === LEGACY_PLATFORM_CUE_URLS[cueId] ||
      url === PLATFORM_CUE_URLS[cueId])
  )
}

const bed = (url: string, volume: number, fadeMs = 650): SoundtrackSetting => ({
  mode: "media",
  url,
  volume,
  loop: true,
  fadeMs,
  startOffsetSeconds: 0,
})

/** Approved Creating Worlds global mix; voting has one owner, the answersMusic cue. */
export const PLATFORM_SOUNDTRACK_DEFAULTS: Partial<
  Record<SoundtrackSlotId, SoundtrackSetting>
> = {
  openingIntro: {
    ...bed(PLATFORM_AUDIO_URLS.openingIntro, 0.65, 0),
    loop: false,
    maxDurationMs: 12000,
  },
  lobby: bed(PLATFORM_AUDIO_URLS.lobby, 0.2),
  roundStart: bed(PLATFORM_AUDIO_URLS.roundStart, 0.46),
  question: bed(PLATFORM_AUDIO_URLS.question, 0.26),
  results: bed("/tadazz-show/music/cutie-patootie.mp3", 0.3, 400),
  leaderboard: bed(PLATFORM_AUDIO_URLS.leaderboard, 0.35),
  recap: bed(PLATFORM_AUDIO_URLS.recap, 0.3),
  finale: bed(PLATFORM_AUDIO_URLS.finale, 0.5),
}

export function isPlatformSoundtrackUrl(url: string): boolean {
  return (
    PLATFORM_AUDIO_ASSETS.some((asset) => asset.url === url) ||
    url === "/tadazz-show/music/cutie-patootie.mp3"
  )
}

/** Persist inheritance, so later platform defaults still reach an uncustomized game. */
export function createPlatformAudioExtras(): AudioExtras {
  const cues = Object.fromEntries(
    CUE_IDS.map((cueId) => [
      cueId,
      {
        source: "default",
        volume: cueId === "answersMusic" ? 0.38 : 0.8,
        enabled: true,
        loop: cueId === "answersMusic",
      },
    ]),
  ) as Record<CueId, AudioCueSetting>
  const soundtrack = Object.fromEntries(
    Object.entries(PLATFORM_SOUNDTRACK_DEFAULTS).map(([slot, setting]) => [
      slot,
      { ...setting, mode: "inherit", url: undefined },
    ]),
  ) as NonNullable<AudioExtras["soundtrack"]>

  return { cues, soundtrack }
}

/** Recognize only the former untouched factory shape, never a partial custom mix. */
function isLegacyPlaceholderAudio(audio: AudioExtras | undefined): boolean {
  const savedCues: Partial<Record<CueId, AudioCueSetting>> | undefined =
    audio?.cues

  return Boolean(
    audio &&
    !Object.keys(audio.soundtrack ?? {}).length &&
    CUE_IDS.every((cueId) => {
      const cue = savedCues?.[cueId]

      return (
        cue?.source === "default" &&
        !cue.url &&
        cue.volume === 0.8 &&
        // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- Persisted factory data must contain literal true; truthy custom values must not trigger migration.
        cue.enabled === true &&
        cue.loop === (cueId === "answersMusic")
      )
    }),
  )
}

/** Upgrade only the old untouched factory record; keep every authored mix intact. */
export function normalizePlatformAudioSettings(
  audio?: AudioExtras,
): AudioExtras {
  return !audio || isLegacyPlaceholderAudio(audio)
    ? createPlatformAudioExtras()
    : audio
}

/** Runtime/editor inheritance. Explicit media, disabled cues and muted beds survive. */
export function resolvePlatformAudioDefaults(audio?: AudioExtras): AudioExtras {
  const defaults = createPlatformAudioExtras()
  const saved = normalizePlatformAudioSettings(audio)
  const savedCues: Partial<Record<CueId, AudioCueSetting>> = saved.cues
  const cues = Object.fromEntries(
    CUE_IDS.map((cueId) => {
      const setting = savedCues[cueId] ?? defaults.cues[cueId]

      return [
        cueId,
        setting.source === "default"
          ? { ...setting, source: "media", url: PLATFORM_CUE_URLS[cueId] }
          : { ...setting },
      ]
    }),
  ) as AudioExtras["cues"]
  const soundtrack = { ...saved.soundtrack }

  for (const [slot, setting] of Object.entries(
    PLATFORM_SOUNDTRACK_DEFAULTS,
  ) as Array<[SoundtrackSlotId, SoundtrackSetting]>) {
    const configured = saved.soundtrack?.[slot]

    if (!configured || configured.mode === "inherit") {
      soundtrack[slot] = {
        ...setting,
        ...configured,
        mode: "media",
        url: setting.url,
      }
    }
  }

  return { cues, soundtrack }
}
