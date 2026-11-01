import {
  DEFAULT_CUE_URLS,
  resolveEffectiveAudioCue,
  type AudioCueSetting,
  type AudioExtras,
  type CardAudioMode,
  type CardAudioOverrides,
  type CueId,
} from "@razzia/extensions/core"
import { useEffect, useRef } from "react"

export { DEFAULT_CUE_URLS }

/**
 * Resolves the effective audio URL, effective volume, and enabled state for a cue.
 */
export interface ResolvedAudioCue {
  cueId: CueId
  url: string
  volume: number
  enabled: boolean
  loop: boolean
  isDefault: boolean
}

export const resolveAudioCue = (
  cueId: CueId,
  audioExtras?: AudioExtras,
): ResolvedAudioCue => {
  const setting: AudioCueSetting | undefined = audioExtras?.cues[cueId]

  if (!setting) {
    return {
      cueId,
      url: DEFAULT_CUE_URLS[cueId],
      volume: 0.8,
      enabled: true,
      loop: cueId === "answersMusic",
      isDefault: true,
    }
  }

  const isCustom = setting.source === "media" && Boolean(setting.url)
  const effectiveUrl =
    isCustom && setting.url ? setting.url : DEFAULT_CUE_URLS[cueId]
  const isEnabled = setting.enabled && setting.volume > 0

  return {
    cueId,
    url: effectiveUrl,
    volume: isEnabled ? setting.volume : 0,
    enabled: isEnabled,
    loop: setting.loop,
    isDefault: !isCustom,
  }
}

/**
 * Pure evaluation for audio ducking when question media (video/audio) is active.
 * Adheres to AUDIO02: question media takes precedence; competing music is ducked.
 */
export const shouldDuckMusic = (
  hasCompetingQuestionMedia: boolean,
  cueId: CueId,
): boolean => {
  // Only duck background answering music when media has sound
  if (cueId === "answersMusic" && hasCompetingQuestionMedia) {
    return true
  }

  return false
}

export interface AudioCuePlayerProps {
  cueId?: CueId
  audioExtras?: AudioExtras
  cardAudioCues?: CardAudioOverrides | null
  sceneAudio?: {
    mode?: CardAudioMode
    cueId?: CueId
    url?: string
    volume?: number
    loop?: boolean
  } | null
  gameId?: string | null
  activeCardKey?: string | null
  phase?: string | null
  epoch?: number | string | null
  hasCompetingMedia?: boolean
  autoPlay?: boolean
  onEnded?: () => void
  onError?: (_error: unknown) => void
}

/**
 * AudioCuePlayer manages sound effect and music playback for the quiz lifecycle.
 * - Precedence: card-level override > global show audio > built-in default.
 * - Deduplicates playback by (gameId, activeCardKey, phase, epoch, cueId) so timer ticks
 *   or vote count updates never restart active audio.
 * - Stops loops immediately on phase exit, Next/Previous, revote, or competing media.
 */
export const AudioCuePlayer = ({
  cueId,
  audioExtras,
  cardAudioCues,
  sceneAudio,
  gameId,
  activeCardKey,
  phase,
  epoch,
  hasCompetingMedia = false,
  autoPlay = true,
  onEnded,
  onError,
}: AudioCuePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastPlaybackKeyRef = useRef<string | null>(null)

  const effectiveCueId: CueId | undefined =
    cueId ?? sceneAudio?.cueId ?? (sceneAudio?.url ? "start" : undefined)

  const resolved = effectiveCueId
    ? resolveEffectiveAudioCue({
        cueId: effectiveCueId,
        cardAudioCues,
        sceneAudio,
        globalAudio: audioExtras,
        defaultUrl: DEFAULT_CUE_URLS[effectiveCueId],
        defaultVolume: effectiveCueId === "answersMusic" ? 0.35 : 0.7,
        defaultLoop: effectiveCueId === "answersMusic",
        hasCompetingMediaAudio: hasCompetingMedia,
      })
    : null

  const playbackIdentity = effectiveCueId
    ? `${gameId ?? "g"}:${activeCardKey ?? "card"}:${phase ?? "phase"}:${epoch ?? 0}:${effectiveCueId}:${resolved?.url ?? "none"}:${resolved?.shouldPlay ? "play" : "mute"}:${resolved?.loop ? "loop" : "once"}`
    : null

  useEffect(() => {
    const stopActiveAudio = () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
        } catch {
          // Ignore cleanup errors
        }
        audioRef.current = null
      }
    }

    if (!effectiveCueId || !resolved || !resolved.shouldPlay || !resolved.url) {
      stopActiveAudio()
      lastPlaybackKeyRef.current = null
      return
    }

    if (typeof Audio === "undefined") {
      return
    }

    // Stop any previous audio instance before starting the new phase/card cue
    stopActiveAudio()
    lastPlaybackKeyRef.current = playbackIdentity

    let isCancelled = false
    const audio = new Audio(resolved.url)
    audioRef.current = audio

    audio.volume = Math.min(1, Math.max(0, resolved.volume))
    audio.loop = resolved.loop

    const isDefaultUrl = resolved.url === DEFAULT_CUE_URLS[effectiveCueId]

    // Safe error handling for missing/corrupt asset fallback (AUDIO01)
    audio.onerror = () => {
      if (isCancelled) {
        return
      }

      if (!isDefaultUrl) {
        const defaultUrl = DEFAULT_CUE_URLS[effectiveCueId]
        const fallbackAudio = new Audio(defaultUrl)
        audioRef.current = fallbackAudio
        fallbackAudio.volume = Math.min(1, Math.max(0, resolved.volume))
        fallbackAudio.loop = resolved.loop

        fallbackAudio.play().catch(() => {
          // Silent fallback if browser restricts autoplay
        })
      }

      onError?.(
        new Error(
          `Failed to load audio cue ${effectiveCueId} from ${resolved.url}`,
        ),
      )
    }

    audio.onended = () => {
      if (!isCancelled) {
        onEnded?.()
      }
    }

    if (autoPlay) {
      audio.play().catch((error: unknown) => {
        onError?.(error)
      })
    }

    return () => {
      isCancelled = true
      stopActiveAudio()
    }
    // Depend on playbackIdentity + volume so timer ticks / vote re-renders never restart playback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackIdentity, autoPlay])

  // Update volume dynamically if slider/props change while playing
  useEffect(() => {
    if (audioRef.current && resolved) {
      audioRef.current.volume = Math.min(1, Math.max(0, resolved.volume))
    }
  }, [resolved?.volume])

  return (
    <span
      className="sr-only"
      data-testid="audio-cue-player-state"
      data-cue-id={effectiveCueId ?? "none"}
      data-should-play={resolved?.shouldPlay ? "true" : "false"}
      data-muted-by-override={resolved?.mutedByOverride ? "true" : "false"}
      data-audio-url={resolved?.url ?? ""}
      data-audio-loop={resolved?.loop ? "true" : "false"}
      data-playback-key={playbackIdentity ?? ""}
    />
  )
}
