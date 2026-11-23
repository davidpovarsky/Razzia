import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AudioExtras } from "../../../core/quiz-extras"
import type { SoundtrackSlotId } from "../../../core/constants"
import {
  resolveEffectiveAudioCue,
  type CardAudioOverrides,
} from "../../../core/card-appearance"
import { PLATFORM_CUE_URLS } from "../../../core/platform-audio-defaults"
import {
  resolveShowTheme,
  type ShowThemeSelection,
} from "../../../core/show-themes"
import {
  applyThemeAudioDefaults,
  resolveThemeEffect,
} from "../../../core/show-themes/audio"
import {
  calibratedMusicVolume,
  shouldSuppressAudioEffect,
} from "../../../presentation/audio-cue-player"

interface DemoTrack {
  url: string
  volume: number
  loop: boolean
  startOffsetSeconds: number
}

/** Public solo play shares the installed game's mix, with one bed and one effect owner. */
export function useCatalogueAudio({
  enabled,
  slot,
  screenKey,
  selection,
  audio,
  cardAudioCues,
}: {
  enabled: boolean
  slot: SoundtrackSlotId
  screenKey: string
  selection?: ShowThemeSelection
  audio?: AudioExtras
  cardAudioCues?: CardAudioOverrides
}) {
  const manager = useMemo(
    () => resolveShowTheme({ selection, role: "manager" }),
    [selection],
  )
  const player = useMemo(
    () => resolveShowTheme({ selection, role: "player" }),
    [selection],
  )
  const resolved = useMemo(
    () => applyThemeAudioDefaults(manager, audio),
    [manager, audio],
  )
  const music = useRef<HTMLAudioElement | null>(null)
  const effect = useRef<HTMLAudioElement | null>(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const lastEffect = useRef({ url: "", at: 0 })
  const [closedScreenKey, setClosedScreenKey] = useState<string | null>(null)
  const closed = closedScreenKey === screenKey
  const playedActions = useRef(new Set<string>())
  const track = useMemo<DemoTrack | null>(() => {
    const stage = resolved.soundtrack?.[slot]
    const cardMode = cardAudioCues?.answersMusic?.mode
    const cardOwnsVoting =
      slot === "voting" && cardMode !== undefined && cardMode !== "inherit"

    if (!cardOwnsVoting && stage?.mode === "mute") {
      return null
    }

    if (!cardOwnsVoting && stage?.mode === "media" && stage.url) {
      return { ...stage, url: stage.url }
    }

    if (slot !== "voting") {
      return null
    }

    const cue = resolveEffectiveAudioCue({
      cueId: "answersMusic",
      globalAudio: resolved,
      cardAudioCues,
      defaultUrl: PLATFORM_CUE_URLS.answersMusic,
      defaultVolume: 0.38,
      defaultLoop: true,
    })

    return cue.shouldPlay && cue.url
      ? {
          url: cue.url,
          volume: cue.volume,
          loop: cue.loop,
          startOffsetSeconds: 0,
        }
      : null
  }, [resolved, slot, cardAudioCues])

  useEffect(() => {
    setClosedScreenKey(null)
    playedActions.current.clear()
    lastEffect.current = { url: "", at: 0 }
  }, [screenKey])

  useEffect(() => {
    if (!enabled || !track || closed) {
      music.current?.pause()
      music.current?.removeAttribute("src")

      if (!enabled) {
        effect.current?.pause()
        effect.current?.removeAttribute("src")
      }

      return
    }

    const element = music.current ?? new Audio()
    music.current = element
    element.pause()
    element.src = track.url
    element.loop = track.loop
    element.volume = calibratedMusicVolume(track.url, track.volume)
    element.currentTime = track.startOffsetSeconds
    void element.play().catch(() => {
      // A later direct action or the sound switch can unlock browser playback.
    })

    return () => element.pause()
  }, [enabled, track, screenKey, closed])

  useEffect(
    () => () => {
      music.current?.pause()
      effect.current?.pause()
      music.current?.removeAttribute("src")
      effect.current?.removeAttribute("src")
    },
    [],
  )

  const playEffect = useCallback(
    (name: string, identity?: string) => {
      if (name === "curtains-closed") {
        music.current?.pause()
        setClosedScreenKey(screenKey)
      }

      if (
        !enabledRef.current ||
        (identity && playedActions.current.has(identity))
      ) {
        return
      }

      const role =
        name === "answer-selected" || name === "answer-submitted"
          ? player
          : manager
      const cue = resolveThemeEffect(role, name)

      if (!cue?.url || cue.volume <= 0) {
        return
      }

      const currentMusic = music.current
      const playingUrls =
        currentMusic && !currentMusic.paused && !currentMusic.ended
          ? [currentMusic.getAttribute("src") ?? ""]
          : []

      if (
        shouldSuppressAudioEffect({
          name,
          url: cue.url,
          playingUrls,
          lastEffect: lastEffect.current,
          now: Date.now(),
        })
      ) {
        return
      }

      if (identity) {
        playedActions.current.add(identity)
      }

      lastEffect.current = { url: cue.url, at: Date.now() }
      const element = effect.current ?? new Audio()
      effect.current = element
      element.pause()
      element.src = cue.url
      element.volume = cue.volume
      element.currentTime = 0
      void element.play().catch(() => {
        /* A rejected playback request leaves the current demo state unchanged. */
      })
    },
    [manager, player, screenKey],
  )

  return { playEffect, musicUrl: enabled && !closed ? (track?.url ?? "") : "" }
}
