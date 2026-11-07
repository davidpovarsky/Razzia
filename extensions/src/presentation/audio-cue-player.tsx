import {
  DEFAULT_CUE_URLS,
  SOUNDTRACK_SLOT_IDS,
  resolveEffectiveAudioCue,
  type AudioCueSetting,
  type AudioExtras,
  type CardAudioMode,
  type CardAudioOverrides,
  type CueId,
  type SoundtrackSetting,
  type SoundtrackSlotId,
} from "@razzia/extensions/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export { DEFAULT_CUE_URLS }

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

export const shouldDuckMusic = (
  hasCompetingQuestionMedia: boolean,
  cueId: CueId,
): boolean => cueId === "answersMusic" && hasCompetingQuestionMedia

export const TADAZZ_SFX_BY_CUE: Readonly<Record<string, string>> = {
  impact: "/sounds/boump.mp3",
  "countdown-ended": "/sounds/results.mp3",
  "survey-reveal": "/sounds/results.mp3",
  "story-begin": "/sounds/show.mp3",
  "wipe-covered": "/sounds/boump.mp3",
  "company-ident": "/sounds/show.mp3",
  "tadazz-welcome": "/sounds/boump.mp3",
  "opening-portal": "/sounds/show.mp3",
  "opening-logo": "/sounds/boump.mp3",
  "directory-loaded": "/sounds/answersSound.mp3",
  "phone-ready": "/sounds/answersSound.mp3",
  "readiness-grid": "/sounds/answersSound.mp3",
  "round-launch": "/sounds/boump.mp3",
  "story-progress-update": "/sounds/answersSound.mp3",
  "story-assembled": "/sounds/results.mp3",
  "story-live-hold": "/sounds/show.mp3",
  "finale-impact": "/sounds/first.mp3",
  "curtains-closed": "/sounds/boump.mp3",
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
  soundtrackSlot?: SoundtrackSlotId
  continuityKey?: string
  gameId?: string | null
  activeCardKey?: string | null
  phase?: string | null
  epoch?: number | string | null
  hasCompetingMedia?: boolean
  paused?: boolean
  autoPlay?: boolean
  showControls?: boolean
  controlLabels?: {
    enable: string
    mute: string
    unmute: string
    pause: string
    play: string
    track: string
    followShow: string
    volume?: string
  }
  soundtrackLabels?: Partial<Record<SoundtrackSlotId, string>>
  onPlaybackStarted?: (_identity: string) => void
  onEnded?: () => void
  onError?: (_error: unknown) => void
}

interface DesiredTrack {
  identity: string
  url: string
  volume: number
  loop: boolean
  fadeMs: number
  startOffsetSeconds: number
  maxDurationMs?: number
  fallbackUrl?: string
}

function resolveSoundtrack(
  slot: SoundtrackSlotId | undefined,
  audioExtras: AudioExtras | undefined,
): SoundtrackSetting | null {
  if (!slot) {
    return null
  }
  const setting = audioExtras?.soundtrack?.[slot]

  if (setting?.mode !== "media" || !setting.url) {
    return null
  }
  return setting
}

/**
 * Presenter-scoped audio owner. It keeps two background elements for bounded
 * crossfades and one SFX element for deterministic stage events. The elements
 * survive phase renders; only their sources and gain change.
 */
export const AudioCuePlayer = ({
  cueId,
  audioExtras,
  cardAudioCues,
  sceneAudio,
  soundtrackSlot,
  continuityKey,
  gameId,
  activeCardKey,
  phase,
  epoch,
  hasCompetingMedia = false,
  paused = false,
  autoPlay = true,
  showControls = false,
  controlLabels = {
    enable: "Enable sound",
    mute: "Mute",
    unmute: "Unmute",
    pause: "Pause audio",
    play: "Play audio",
    track: "Track",
    followShow: "Follow show",
  },
  soundtrackLabels,
  onPlaybackStarted: onPlaybackStartedProp,
  onEnded: onEndedProp,
  onError: onErrorProp,
}: AudioCuePlayerProps) => {
  const callbacksRef = useRef({
    onPlaybackStartedProp,
    onEndedProp,
    onErrorProp,
  })
  callbacksRef.current = { onPlaybackStartedProp, onEndedProp, onErrorProp }
  const onPlaybackStarted = useCallback(
    (identity: string) =>
      callbacksRef.current.onPlaybackStartedProp?.(identity),
    [],
  )
  const onEnded = useCallback(() => callbacksRef.current.onEndedProp?.(), [])
  const onError = useCallback(
    (error: unknown) => callbacksRef.current.onErrorProp?.(error),
    [],
  )
  const backgroundsRef = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(
    null,
  )
  const sfxRef = useRef<HTMLAudioElement | null>(null)
  const activeIndexRef = useRef(0)
  const generationRef = useRef(0)
  const rampRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopDeadlineRef = useRef<number | null>(null)
  const stopRemainingRef = useRef<number | null>(null)
  const currentRef = useRef<DesiredTrack | null>(null)
  const finishedIdentityRef = useRef<string | null>(null)
  const playedSfxRef = useRef(new Set<string>())
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const [masterVolume, setMasterVolume] = useState(1)
  const [userPaused, setUserPaused] = useState(false)
  // Manual track previews apply only to the current show phase. On the next
  // scene transition, automatically resume the soundtrack chosen by the show.
  const [manualTrack, setManualTrack] = useState<{
    slot: SoundtrackSlotId
    stageKey: string
  } | null>(null)
  const stageKey = `${soundtrackSlot ?? ""}:${continuityKey ?? ""}`
  const liveSlotOverride = manualTrack?.stageKey === stageKey ? manualTrack.slot : null
  const selectedSoundtrackSlot = liveSlotOverride ?? soundtrackSlot
  const configuredSoundtrackSlots = SOUNDTRACK_SLOT_IDS.filter(
    (slot) => audioExtras?.soundtrack?.[slot]?.mode === "media",
  )
  const effectiveCueId: CueId | undefined =
    cueId ?? sceneAudio?.cueId ?? (sceneAudio?.url ? "start" : undefined)
  const resolvedCue = effectiveCueId
    ? resolveEffectiveAudioCue({
        cueId: effectiveCueId,
        cardAudioCues,
        sceneAudio,
        globalAudio: audioExtras,
        defaultUrl: DEFAULT_CUE_URLS[effectiveCueId],
        defaultVolume: effectiveCueId === "answersMusic" ? 0.35 : 0.7,
        defaultLoop: effectiveCueId === "answersMusic",
        hasCompetingMediaAudio: false,
      })
    : null
  const soundtrack = resolveSoundtrack(selectedSoundtrackSlot, audioExtras)

  const desired = useMemo<DesiredTrack | null>(() => {
    // Voting is a protected invariant: the existing answersMusic URL/gain/loop wins.
    if (
      effectiveCueId === "answersMusic" &&
      resolvedCue?.shouldPlay &&
      resolvedCue.url
    ) {
      return {
        identity: `${gameId ?? "g"}:voting:${resolvedCue.url}`,
        url: resolvedCue.url,
        volume: resolvedCue.volume,
        loop: resolvedCue.loop,
        fadeMs: 0,
        startOffsetSeconds: 0,
        fallbackUrl: undefined,
      }
    }

    if (
      audioExtras?.soundtrack?.[selectedSoundtrackSlot ?? "lobby"]?.mode ===
      "mute"
    ) {
      return null
    }

    if (soundtrack?.url) {
      return {
        identity: `${gameId ?? "g"}:soundtrack:${continuityKey ?? selectedSoundtrackSlot}:${soundtrack.url}`,
        url: soundtrack.url,
        volume: soundtrack.volume,
        // Continuous stage beds must repeat until the show changes phase.
        // The deliberately timed 12-second opening ident is the only exception.
        loop: selectedSoundtrackSlot === "openingIntro" ? soundtrack.loop : true,
        fadeMs: soundtrack.fadeMs,
        startOffsetSeconds: soundtrack.startOffsetSeconds,
        maxDurationMs:
          selectedSoundtrackSlot === "openingIntro" ? 12000 : undefined,
      }
    }

    if (!effectiveCueId || !resolvedCue?.shouldPlay || !resolvedCue.url) {
      return null
    }
    return {
      identity: `${gameId ?? "g"}:${continuityKey ?? activeCardKey ?? phase ?? epoch ?? 0}:${effectiveCueId}:${resolvedCue.url}`,
      url: resolvedCue.url,
      volume: resolvedCue.volume,
      loop: resolvedCue.loop,
      fadeMs: 250,
      startOffsetSeconds: 0,
      fallbackUrl:
        resolvedCue.url === DEFAULT_CUE_URLS[effectiveCueId]
          ? undefined
          : DEFAULT_CUE_URLS[effectiveCueId],
    }
  }, [
    activeCardKey,
    continuityKey,
    effectiveCueId,
    epoch,
    gameId,
    phase,
    resolvedCue?.loop,
    resolvedCue?.shouldPlay,
    resolvedCue?.url,
    resolvedCue?.volume,
    selectedSoundtrackSlot,
    soundtrack,
    audioExtras,
  ])

  const effectiveVolume = useCallback(
    (track: DesiredTrack) =>
      muted ? 0 : track.volume * masterVolume * (hasCompetingMedia ? 0.22 : 1),
    [hasCompetingMedia, masterVolume, muted],
  )

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return
    }
    const a = new Audio()
    const b = new Audio()
    const sfx = new Audio()
    a.preload = "auto"
    b.preload = "auto"
    sfx.preload = "auto"
    backgroundsRef.current = [a, b]
    sfxRef.current = sfx

    return () => {
      generationRef.current += 1

      if (rampRef.current) {
        clearInterval(rampRef.current)
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current)
      }
      for (const audio of [a, b, sfx]) {
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
      }
      backgroundsRef.current = null
      sfxRef.current = null
    }
  }, [])

  useEffect(() => {
    const elements = backgroundsRef.current

    if (!elements) {
      return
    }
    const generation = ++generationRef.current

    if (rampRef.current) {
      clearInterval(rampRef.current)
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null

      if (stopDeadlineRef.current !== null) {
        stopRemainingRef.current = Math.max(
          0,
          stopDeadlineRef.current - Date.now(),
        )
      }

      stopDeadlineRef.current = null
    }

    const { current } = currentRef
    if (current && desired && current.identity === desired.identity) {
      const active = elements[activeIndexRef.current]
      elements[activeIndexRef.current === 0 ? 1 : 0].pause()
      active.onended = () => {
        if (
          generationRef.current !== generation ||
          finishedIdentityRef.current === desired.identity
        ) {
          return
        }
        if (stopTimerRef.current) {
          clearTimeout(stopTimerRef.current)
        }
        stopTimerRef.current = null
        stopRemainingRef.current = null
        stopDeadlineRef.current = null
        finishedIdentityRef.current = desired.identity
        onEnded()
      }
      active.loop = desired.loop
      active.volume = effectiveVolume(desired)
      currentRef.current = desired

      if (
        !paused &&
        !userPaused &&
        stopRemainingRef.current !== null &&
        stopRemainingRef.current > 0
      ) {
        const remaining = stopRemainingRef.current
        stopDeadlineRef.current = Date.now() + remaining
        stopTimerRef.current = setTimeout(() => {
          elements[activeIndexRef.current].pause()
          stopTimerRef.current = null
          stopRemainingRef.current = null
          stopDeadlineRef.current = null
          finishedIdentityRef.current = desired.identity
          onEnded()
        }, remaining)
      }

      return
    }

    const old = elements[activeIndexRef.current]

    if (!desired) {
      elements.forEach((element) => element.pause())
      old.currentTime = 0
      currentRef.current = null
      stopRemainingRef.current = null
      stopDeadlineRef.current = null

      return
    }

    const nextIndex = activeIndexRef.current === 0 ? 1 : 0
    finishedIdentityRef.current = null
    stopRemainingRef.current = null
    stopDeadlineRef.current = null
    const next = elements[nextIndex]
    next.pause()
    delete next.dataset.fallbackAttempted
    next.src = desired.url
    next.currentTime = desired.startOffsetSeconds
    next.loop = desired.loop
    next.volume = desired.fadeMs > 0 ? 0 : effectiveVolume(desired)
    next.onended = () => {
      if (
        generationRef.current !== generation ||
        finishedIdentityRef.current === desired.identity
      ) {
        return
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current)
      }
      stopTimerRef.current = null
      stopRemainingRef.current = null
      stopDeadlineRef.current = null
      finishedIdentityRef.current = desired.identity
      onEnded()
    }
    next.onerror = () => {
      if (generationRef.current !== generation) {
        return
      }
      if (desired.fallbackUrl && next.dataset.fallbackAttempted !== "true") {
        next.dataset.fallbackAttempted = "true"
        next.src = desired.fallbackUrl

        if (autoPlay && !paused && !userPaused) {
          void next.play().catch((error: unknown) => {
            setAudioBlocked(true)
            onError(error)
          })
        }
      } else {
        onError(new Error(`Failed to load presenter audio: ${desired.url}`))
      }
    }

    // Retain the requested track even when play() is rejected by autoplay.
    // A subsequent user gesture must unlock this exact element and position.
    currentRef.current = desired
    activeIndexRef.current = nextIndex

    if (!autoPlay || paused || userPaused) {
      old.pause()

      return
    }

    void next
      .play()
      .then(() => {
        if (generationRef.current !== generation) {
          return
        }
        setAudioBlocked(false)
        onPlaybackStarted(desired.identity)
        const target = effectiveVolume(desired)
        const started = Date.now()
        const fromOld = old.volume
        const duration = Math.max(0, desired.fadeMs)

        if (duration === 0) {
          next.volume = target
          old.pause()
        } else {
          rampRef.current = setInterval(() => {
            const progress = Math.min(1, (Date.now() - started) / duration)
            next.volume = target * progress
            old.volume = fromOld * (1 - progress)

            if (progress >= 1 && rampRef.current) {
              clearInterval(rampRef.current)
              rampRef.current = null
              old.pause()
            }
          }, 40)
        }

        activeIndexRef.current = nextIndex
        currentRef.current = desired

        if (desired.maxDurationMs) {
          stopRemainingRef.current = desired.maxDurationMs
          stopDeadlineRef.current = Date.now() + desired.maxDurationMs
          stopTimerRef.current = setTimeout(() => {
            if (generationRef.current !== generation) {
              return
            }
            next.pause()
            stopTimerRef.current = null
            stopRemainingRef.current = null
            stopDeadlineRef.current = null
            finishedIdentityRef.current = desired.identity
            onEnded()
          }, desired.maxDurationMs)
        }
      })
      .catch((error: unknown) => {
        if (generationRef.current !== generation) {
          return
        }
        old.pause()
        setAudioBlocked(true)
        onError(error)
      })
  }, [
    autoPlay,
    desired,
    effectiveVolume,
    onEnded,
    onError,
    onPlaybackStarted,
    paused,
    userPaused,
  ])

  useEffect(() => {
    const elements = backgroundsRef.current
    const { current } = currentRef
    if (!elements || !current) {
      return
    }
    const active = elements[activeIndexRef.current]
    active.volume = effectiveVolume(current)

    if (paused || userPaused) {
      elements.forEach((element) => element.pause())
    } else if (autoPlay && finishedIdentityRef.current !== current.identity) {
      void active
        .play()
        .then(() => {
          onPlaybackStarted(current.identity)

          if (
            current.maxDurationMs &&
            stopTimerRef.current === null &&
            stopRemainingRef.current === null
          ) {
            stopRemainingRef.current = current.maxDurationMs
            stopDeadlineRef.current = Date.now() + current.maxDurationMs
            stopTimerRef.current = setTimeout(() => {
              active.pause()
              stopTimerRef.current = null
              stopRemainingRef.current = null
              stopDeadlineRef.current = null
              finishedIdentityRef.current = current.identity
              onEnded()
            }, current.maxDurationMs)
          }
        })
        .catch((error: unknown) => {
          setAudioBlocked(true)
          onError(error)
        })
    }
  }, [
    autoPlay,
    effectiveVolume,
    onEnded,
    onError,
    onPlaybackStarted,
    paused,
    userPaused,
  ])

  useEffect(() => {
    const handleCue = (event: Event) => {
      if (paused || userPaused || muted) {
        return
      }
      const { detail } = event as CustomEvent<{
        name?: string
        identity?: string
        url?: string
      }>
      const url =
        detail?.url ??
        (detail?.name ? TADAZZ_SFX_BY_CUE[detail.name] : undefined)
      const identity = detail?.identity

      if (!url || !identity || playedSfxRef.current.has(identity)) {
        return
      }
      playedSfxRef.current.add(identity)

      if (playedSfxRef.current.size > 200) {
        playedSfxRef.current.clear()
      }
      const sfx = sfxRef.current

      if (!sfx) {
        return
      }
      sfx.pause()
      sfx.src = url
      sfx.currentTime = 0
      sfx.volume = 0.7
      void sfx.play().catch(onError)
    }
    window.addEventListener("tadazz:sfx", handleCue)

    return () => window.removeEventListener("tadazz:sfx", handleCue)
  }, [muted, onError, paused, userPaused])

  useEffect(() => {
    if (
      !soundtrack ||
      !effectiveCueId ||
      effectiveCueId === "answersMusic" ||
      selectedSoundtrackSlot === "openingIntro" ||
      selectedSoundtrackSlot === "lobby"
    ) {
      return
    }
    window.dispatchEvent(
      new CustomEvent("tadazz:sfx", {
        detail: {
          name: `phase-${effectiveCueId}`,
          url: DEFAULT_CUE_URLS[effectiveCueId],
          identity: `${gameId ?? "g"}:${epoch ?? 0}:phase:${effectiveCueId}`,
        },
      }),
    )
  }, [effectiveCueId, epoch, gameId, selectedSoundtrackSlot, soundtrack])

  const unlock = useCallback(() => {
    setAudioBlocked(false)
    setUserPaused(false)
    const { current } = currentRef
    const elements = backgroundsRef.current

    if (!current || !elements || paused) {
      return
    }
    const active = elements[activeIndexRef.current]
    void active
      .play()
      .then(() => {
        active.volume = effectiveVolume(current)
        onPlaybackStarted(current.identity)

        if (
          current.maxDurationMs &&
          stopTimerRef.current === null &&
          finishedIdentityRef.current !== current.identity
        ) {
          const remaining = stopRemainingRef.current ?? current.maxDurationMs
          stopRemainingRef.current = remaining
          stopDeadlineRef.current = Date.now() + remaining
          stopTimerRef.current = setTimeout(() => {
            active.pause()
            stopTimerRef.current = null
            stopRemainingRef.current = null
            stopDeadlineRef.current = null
            finishedIdentityRef.current = current.identity
            onEnded()
          }, remaining)
        }
      })
      .catch((error: unknown) => {
        setAudioBlocked(true)
        onError(error)
      })
  }, [effectiveVolume, onEnded, onError, onPlaybackStarted, paused])

  useEffect(() => {
    if (paused || userPaused) {
      sfxRef.current?.pause()
    }
    if (sfxRef.current) {
      sfxRef.current.volume = muted ? 0 : 0.7
    }
  }, [muted, paused, userPaused])

  useEffect(() => {
    window.addEventListener("tadazz:audio-unlock", unlock)

    return () => window.removeEventListener("tadazz:audio-unlock", unlock)
  }, [unlock])

  return (
    <>
      <span
        className="sr-only"
        data-testid="audio-cue-player-state"
        data-cue-id={effectiveCueId ?? "none"}
        data-soundtrack-slot={selectedSoundtrackSlot ?? "none"}
        data-should-play={desired ? "true" : "false"}
        data-audio-url={desired?.url ?? ""}
        data-audio-loop={desired?.loop ? "true" : "false"}
        data-audio-blocked={audioBlocked ? "true" : "false"}
        data-audio-paused={paused || userPaused ? "true" : "false"}
      />
      {showControls && (
        <div
          className="z-50 flex items-center gap-2 px-2 pb-2"
          data-testid="host-audio-controls"
        >
          {audioBlocked && (
            <button
              type="button"
              onClick={unlock}
              className="tz-x-pill"
              data-testid="host-enable-audio"
            >
              {controlLabels.enable}
            </button>
          )}
          {configuredSoundtrackSlots.length > 0 && (
            <label className="tz-x-pill flex items-center gap-2">
              <span>{controlLabels.track}</span>
              <select
                value={liveSlotOverride ?? ""}
                onChange={(event) =>
                  setManualTrack(
                    event.target.value
                      ? { slot: event.target.value as SoundtrackSlotId, stageKey }
                      : null,
                  )
                }
                className="rounded bg-black/30 px-2 py-1 text-white"
                data-testid="host-audio-track-select"
              >
                <option value="">{controlLabels.followShow}</option>
                {configuredSoundtrackSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {soundtrackLabels?.[slot] ?? slot}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="tz-x-pill"
            data-testid="host-toggle-audio-mute"
            aria-pressed={muted}
          >
            {muted ? controlLabels.unmute : controlLabels.mute}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            aria-label={controlLabels.volume ?? "Volume"}
            data-testid="host-audio-volume"
            onChange={(event) => setMasterVolume(Number(event.target.value))}
            className="accent-primary w-24"
          />
          <button
            type="button"
            onClick={() => setUserPaused((value) => !value)}
            className="tz-x-pill"
            data-testid="host-toggle-audio-pause"
            aria-pressed={userPaused}
          >
            {userPaused ? controlLabels.play : controlLabels.pause}
          </button>
        </div>
      )}
    </>
  )
}
