import {
  CUE_IDS,
  type AudioCueSetting,
  type AudioExtras,
  type CueId,
} from "@razzia/extensions/core"
import { useEffect, useRef } from "react"

/**
 * Default audio asset map for the 9 cues.
 * In a web browser environment, these map to standard upstream sound assets or silent fallbacks.
 */
export const DEFAULT_CUE_URLS: Record<CueId, string> = {
  start: "/sfx/start.mp3",
  showQuestion: "/sfx/show-question.mp3",
  answersMusic: "/sfx/answers-music.mp3",
  answerPressed: "/sfx/answer-pressed.mp3",
  revealResults: "/sfx/reveal-results.mp3",
  leaderboard: "/sfx/leaderboard.mp3",
  podium1: "/sfx/podium1.mp3",
  podium2: "/sfx/podium2.mp3",
  podium3: "/sfx/podium3.mp3",
}

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
  const setting: AudioCueSetting | undefined = audioExtras?.cues?.[cueId]

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
  const effectiveUrl = isCustom
    ? (setting.url as string)
    : DEFAULT_CUE_URLS[cueId]
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
  hasCompetingMedia?: boolean
  autoPlay?: boolean
  onEnded?: () => void
  onError?: (_error: unknown) => void
}

/**
 * AudioCuePlayer manages sound effect and music playback for the quiz lifecycle.
 * - Respects custom uploaded audio files or falls back safely to upstream defaults.
 * - Handles mute and volume bounds (0..1).
 * - Implements audio ducking vs question media (video/audio).
 * - Catches browser autoplay restrictions (NotAllowedError) without uncaught exceptions.
 * - Recovers from missing or corrupt media assets gracefully without freezing the game.
 * - Cleans up active audio instances on unmount.
 */
export const AudioCuePlayer = ({
  cueId,
  audioExtras,
  hasCompetingMedia = false,
  autoPlay = true,
  onEnded,
  onError,
}: AudioCuePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!cueId) {
      return
    }

    const resolved = resolveAudioCue(cueId, audioExtras)

    // Check mute / disabled
    if (!resolved.enabled) {
      return
    }

    // Check ducking against competing question video/audio
    const isDucked = shouldDuckMusic(hasCompetingMedia, cueId)

    if (isDucked) {
      return
    }

    // Create safe audio instance if in browser environment
    if (typeof Audio === "undefined") {
      return
    }

    let isCancelled = false
    const audio = new Audio(resolved.url)
    audioRef.current = audio

    audio.volume = resolved.volume
    audio.loop = resolved.loop

    // Safe error handling for missing/corrupt asset fallback (AUDIO01)
    audio.onerror = () => {
      if (isCancelled) return

      // Fallback to default asset if custom media failed
      if (!resolved.isDefault) {
        const defaultUrl = DEFAULT_CUE_URLS[cueId]
        const fallbackAudio = new Audio(defaultUrl)
        audioRef.current = fallbackAudio
        fallbackAudio.volume = resolved.volume
        fallbackAudio.loop = resolved.loop

        fallbackAudio.play().catch(() => {
          // Silent fallback if browser restricts autoplay or default is absent
        })
      }

      onError?.(
        new Error(`Failed to load audio cue ${cueId} from ${resolved.url}`),
      )
    }

    audio.onended = () => {
      if (!isCancelled) {
        onEnded?.()
      }
    }

    if (autoPlay) {
      // Safe play call catching browser autoplay policy restrictions
      audio.play().catch((error: unknown) => {
        // Autoplay restrictions are expected on un-interacted mobile/browsers; do not crash
        onError?.(error)
      })
    }

    // Cleanup on unmount or cue change (AUDIO02)
    return () => {
      isCancelled = true

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
    }
  }, [cueId, audioExtras, hasCompetingMedia, autoPlay, onEnded, onError])

  return null
}
