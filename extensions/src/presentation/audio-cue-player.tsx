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

const TRANSITION = "/sounds/tadazz-silky-transition-20261108.mp3"
const REVEAL = "/sounds/tadazz-reveal-bright-20261108.mp3"
const CONFIRM = "/sounds/tadazz-confirm-20261108.mp3"
export const TADAZZ_PHASE_SFX: Partial<Record<CueId, string>> = {
  start: TRANSITION,
  showQuestion: TRANSITION,
  answerPressed: CONFIRM,
  revealResults: REVEAL,
}
export const TADAZZ_SFX_BY_CUE: Readonly<Record<string, string>> = {
  "countdown-ended": REVEAL,
  "survey-reveal": REVEAL,
  "timer-tick": "/sounds/tadazz-timer-tick-20261108.mp3",
  "timer-urgent": "/sounds/tadazz-timer-urgent-20261108.mp3",
  "timer-final": "/sounds/tadazz-timer-final-20261108.mp3",
  "story-begin": TRANSITION,
  "wipe-covered": TRANSITION,
  "company-ident": TRANSITION,
  "tadazz-welcome": TRANSITION,
  "opening-portal": TRANSITION,
  "opening-logo": TRANSITION,
  "directory-loaded": CONFIRM,
  "phone-ready": CONFIRM,
  "readiness-grid": CONFIRM,
  "round-launch": TRANSITION,
  "story-progress-update": CONFIRM,
  "story-assembled": REVEAL,
  "story-live-hold": TRANSITION,
  "finale-impact": "/sounds/first.mp3",
  "curtains-closed": TRANSITION,
}

export interface AudioCuePlayerProps {
  /** Timed stage soundtrack, played by this same master pause/mute/volume owner.
   * undefined uses normal policy; null deliberately keeps the stage silent. */
  showTrack?: {
    key: string
    url: string
    startedAt?: number
    elapsedMs?: number
    durationMs: number
    volume: number
  } | null
  /** The show animation owns the question's reveal cue, rather than phase changes. */
  stageOwnsReveal?: boolean
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

/** Match the approved, quieter recording to the existing voting music level. */
export const calibratedMusicVolume = (url: string, volume: number) =>
  Math.min(1, Math.max(0, volume * (url === "/tadazz-show/music/cutie-patootie.mp3" ? 2.5 : 1)))

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
  showTrack,
  stageOwnsReveal = false,
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
  const tickRef = useRef<HTMLAudioElement | null>(null)
  const sfxLevelRef = useRef(0.7)
  const tickLevelRef = useRef(0.27)
  const protectedUntilRef = useRef(0)
  const lastEffectRef = useRef({ url: "", at: 0 })
  const duckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ducked, setDucked] = useState(false)
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
  const synchronizeShowTrack = useCallback(
    (active: HTMLAudioElement, track: DesiredTrack) => {
      if (showTrack === undefined) return true
      if (!showTrack) return false
      const elapsed = paused
        ? (showTrack.elapsedMs ?? 0)
        : showTrack.startedAt === undefined
          ? (showTrack.elapsedMs ?? 0)
          : Math.max(0, Date.now() - showTrack.startedAt)
      if (elapsed >= showTrack.durationMs) {
        active.pause()
        finishedIdentityRef.current = track.identity
        return false
      }
      // Compute from the live clock on each user action. Reusing the initial
      // offset here would rewind the soundtrack whenever volume/mute changes.
      if (Math.abs(active.currentTime - elapsed / 1000) > 0.4)
        active.currentTime = elapsed / 1000
      track.maxDurationMs = showTrack.durationMs - elapsed
      stopRemainingRef.current = track.maxDurationMs
      return true
    },
    [showTrack, paused],
  )
  // Manual track previews apply only to the current show phase. On the next
  // scene transition, automatically resume the soundtrack chosen by the show.
  const [manualTrack, setManualTrack] = useState<{
    slot: SoundtrackSlotId
    stageKey: string
  } | null>(null)
  const stageKey = `${soundtrackSlot ?? ""}:${continuityKey ?? ""}`
  const liveSlotOverride =
    manualTrack?.stageKey === stageKey ? manualTrack.slot : null
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
    if (showTrack !== undefined) {
      if (!showTrack) return null
      const elapsed = paused
        ? (showTrack.elapsedMs ?? 0)
        : showTrack.startedAt === undefined
          ? (showTrack.elapsedMs ?? 0)
          : Math.max(0, Date.now() - showTrack.startedAt)
      if (elapsed >= showTrack.durationMs) return null
      return {
        identity: `${gameId ?? "g"}:reference-story:${showTrack.key}:${showTrack.url}`,
        url: showTrack.url,
        volume: showTrack.volume,
        loop: false,
        fadeMs: 0,
        startOffsetSeconds: elapsed / 1000,
        maxDurationMs: showTrack.durationMs - elapsed,
      }
    }
    // An authored scene can follow a question while its base status still says
    // answersMusic. Scene ownership must win over that previous question's cue.
    if (!liveSlotOverride && sceneAudio?.mode === "mute") return null
    if (!liveSlotOverride && sceneAudio?.url && sceneAudio.mode !== "inherit") {
      return {
        identity: `${gameId ?? "g"}:scene-music:${activeCardKey ?? continuityKey}:${sceneAudio.url}`,
        url: sceneAudio.url,
        volume: sceneAudio.volume ?? 0.8,
        loop: sceneAudio.loop ?? true,
        fadeMs: 400,
        startOffsetSeconds: 0,
      }
    }

    // Voting retains the existing answersMusic URL/gain/loop or authored question override.
    if (
      effectiveCueId === "answersMusic" &&
      (!selectedSoundtrackSlot || selectedSoundtrackSlot === "voting") &&
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
        loop:
          selectedSoundtrackSlot === "openingIntro" ? soundtrack.loop : true,
        fadeMs: soundtrack.fadeMs,
        startOffsetSeconds: soundtrack.startOffsetSeconds,
        maxDurationMs:
          selectedSoundtrackSlot === "openingIntro" ? 12000 : undefined,
      }
    }

    if (
      !effectiveCueId ||
      (stageOwnsReveal && effectiveCueId === "revealResults") ||
      !resolvedCue?.shouldPlay ||
      !resolvedCue.url
    ) {
      return null
    }
    return {
      identity: `${gameId ?? "g"}:${continuityKey ?? activeCardKey ?? phase ?? epoch ?? 0}:${effectiveCueId}:${resolvedCue.url}`,
      url:
        stageOwnsReveal && resolvedCue.url === DEFAULT_CUE_URLS[effectiveCueId]
          ? (TADAZZ_PHASE_SFX[effectiveCueId] ?? resolvedCue.url)
          : resolvedCue.url,
      volume: resolvedCue.volume,
      loop: resolvedCue.loop,
      fadeMs: 250,
      startOffsetSeconds: 0,
      fallbackUrl:
        resolvedCue.url === DEFAULT_CUE_URLS[effectiveCueId]
          ? undefined
          : ((stageOwnsReveal ? TADAZZ_PHASE_SFX[effectiveCueId] : undefined) ??
            DEFAULT_CUE_URLS[effectiveCueId]),
    }
  }, [
    showTrack,
    paused,
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
    stageOwnsReveal,
    liveSlotOverride,
    sceneAudio,
  ])

  const effectiveVolume = useCallback(
    (track: DesiredTrack) =>
      muted
        ? 0
        : calibratedMusicVolume(track.url, track.volume) *
          masterVolume *
          (hasCompetingMedia ? 0.22 : 1) *
          (ducked ? 0.3 : 1),
    [hasCompetingMedia, masterVolume, muted, ducked],
  )

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return
    }
    const a = new Audio()
    const b = new Audio()
    const sfx = new Audio()
    const tick = new Audio()
    a.preload = "auto"
    b.preload = "auto"
    sfx.preload = "auto"
    tick.preload = "auto"
    backgroundsRef.current = [a, b]
    sfxRef.current = sfx
    tickRef.current = tick

    return () => {
      generationRef.current += 1

      if (rampRef.current) {
        clearInterval(rampRef.current)
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current)
      }
      if (duckTimerRef.current) clearTimeout(duckTimerRef.current)
      for (const audio of [a, b, sfx, tick]) {
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
      }
      backgroundsRef.current = null
      sfxRef.current = null
      tickRef.current = null
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
      rampRef.current = null
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
      if (!synchronizeShowTrack(active, desired)) return
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
    if (showTrack !== undefined) old.pause()

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
    // Reuse the result track buffered during voting instead of starting another
    // network request at the exact moment the short reveal scene begins.
    if (next.getAttribute("src") !== desired.url || next.error) next.src = desired.url
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
        if (!synchronizeShowTrack(next, desired)) return
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
    synchronizeShowTrack,
  ])

  useEffect(() => {
    if (!autoPlay || selectedSoundtrackSlot !== "voting" || showTrack !== undefined) return
    const upcoming = audioExtras?.soundtrack?.results
    const elements = backgroundsRef.current
    if (!elements || upcoming?.mode !== "media" || !upcoming.url || rampRef.current) return
    const inactive = elements[activeIndexRef.current === 0 ? 1 : 0]
    if (!inactive.paused || inactive.getAttribute("src") === upcoming.url) return
    inactive.onended = null
    inactive.onerror = null
    inactive.volume = 0
    inactive.preload = "auto"
    inactive.src = upcoming.url
    inactive.load()
  }, [autoPlay, selectedSoundtrackSlot, showTrack, audioExtras, desired])

  useEffect(() => {
    const elements = backgroundsRef.current
    const { current } = currentRef
    if (!elements || !current) {
      return
    }
    const active = elements[activeIndexRef.current]
    const generation = generationRef.current
    const stillCurrent = () => generationRef.current === generation &&
      currentRef.current?.identity === current.identity &&
      elements[activeIndexRef.current] === active
    active.volume = effectiveVolume(current)

    if (paused || userPaused) {
      elements.forEach((element) => element.pause())
    } else if (autoPlay && finishedIdentityRef.current !== current.identity) {
      if (!synchronizeShowTrack(active, current)) return
      void active
        .play()
        .then(() => {
          if (!stillCurrent()) return
          if (!synchronizeShowTrack(active, current)) return
          onPlaybackStarted(current.identity)

          if (
            current.maxDurationMs &&
            stopTimerRef.current === null &&
            stopRemainingRef.current === null
          ) {
            stopRemainingRef.current = current.maxDurationMs
            stopDeadlineRef.current = Date.now() + current.maxDurationMs
            stopTimerRef.current = setTimeout(() => {
              if (!stillCurrent()) return
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
          if (!stillCurrent()) return
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
    synchronizeShowTrack,
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
        volume?: number
      }>
      const url =
        detail?.url ??
        (detail?.name ? TADAZZ_SFX_BY_CUE[detail.name] : undefined)
      const identity = detail?.identity

      if (!url || !identity || playedSfxRef.current.has(identity)) {
        return
      }
      const isTick = detail.name?.startsWith("timer-") ?? false
      const isReveal = detail.name === "survey-reveal"
      const now = Date.now()
      if (!isTick && !isReveal && now < protectedUntilRef.current) return
      playedSfxRef.current.add(identity)
      // The wipe/impact animation can emit adjacent cues for one movement.
      if (
        !isTick &&
        lastEffectRef.current.url === url &&
        now - lastEffectRef.current.at < 500
      )
        return
      if (!isTick) lastEffectRef.current = { url, at: now }
      if (isReveal) {
        protectedUntilRef.current = now + 1100
        setDucked(true)
        if (duckTimerRef.current) clearTimeout(duckTimerRef.current)
        duckTimerRef.current = setTimeout(() => setDucked(false), 1100)
        tickRef.current?.pause()
      }

      // Retain recent identities when long shows add hundreds of timer ticks.
      // Clearing the entire cache could replay the current question's reveal.
      if (playedSfxRef.current.size > 512) {
        const oldest = playedSfxRef.current.values().next().value
        if (oldest) playedSfxRef.current.delete(oldest)
      }
      const sfx = isTick ? tickRef.current : sfxRef.current

      if (!sfx) {
        return
      }
      sfx.pause()
      sfx.src = url
      sfx.currentTime = 0
      const level = Math.max(0, Math.min(1, detail?.volume ?? 0.7))
      if (isTick) tickLevelRef.current = level
      else sfxLevelRef.current = level
      sfx.volume = level * masterVolume
      void sfx.play().catch(onError)
    }
    window.addEventListener("tadazz:sfx", handleCue)
    const stopTimer = () => {
      tickRef.current?.pause()
    }
    window.addEventListener("tadazz:timer-stop", stopTimer)

    return () => {
      window.removeEventListener("tadazz:sfx", handleCue)
      window.removeEventListener("tadazz:timer-stop", stopTimer)
    }
  }, [masterVolume, muted, onError, paused, userPaused])

  useEffect(() => {
    if (
      !soundtrack ||
      !effectiveCueId ||
      effectiveCueId === "answersMusic" ||
      (stageOwnsReveal && effectiveCueId === "revealResults") ||
      selectedSoundtrackSlot === "openingIntro" ||
      selectedSoundtrackSlot === "lobby"
    ) {
      return
    }
    window.dispatchEvent(
      new CustomEvent("tadazz:sfx", {
        detail: {
          name: `phase-${effectiveCueId}`,
          ...(stageOwnsReveal ? { volume: 0.55 } : {}),
          url:
            (stageOwnsReveal ? TADAZZ_PHASE_SFX[effectiveCueId] : undefined) ??
            DEFAULT_CUE_URLS[effectiveCueId],
          identity: `${gameId ?? "g"}:${epoch ?? 0}:phase:${effectiveCueId}`,
        },
      }),
    )
  }, [
    effectiveCueId,
    epoch,
    gameId,
    selectedSoundtrackSlot,
    soundtrack,
    stageOwnsReveal,
  ])

  const unlock = useCallback(() => {
    setAudioBlocked(false)
    setUserPaused(false)
    const { current } = currentRef
    const elements = backgroundsRef.current

    if (!current || !elements || paused) {
      return
    }
    const active = elements[activeIndexRef.current]
    if (!synchronizeShowTrack(active, current)) return
    void active
      .play()
      .then(() => {
        if (!synchronizeShowTrack(active, current)) return
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
  }, [
    effectiveVolume,
    onEnded,
    onError,
    onPlaybackStarted,
    paused,
    synchronizeShowTrack,
  ])

  useEffect(() => {
    if (paused || userPaused || muted) {
      sfxRef.current?.pause()
      tickRef.current?.pause()
    }
    if (sfxRef.current) {
      sfxRef.current.volume = muted ? 0 : sfxLevelRef.current * masterVolume
    }
    if (tickRef.current)
      tickRef.current.volume = muted ? 0 : tickLevelRef.current * masterVolume
  }, [masterVolume, muted, paused, userPaused])

  useEffect(() => {
    window.addEventListener("tadazz:audio-unlock", unlock)

    return () => window.removeEventListener("tadazz:audio-unlock", unlock)
  }, [unlock])

  return (
    <>
      <span
        className="sr-only"
        data-testid="audio-cue-player-state"
        data-sfx-ducked={ducked ? "true" : "false"}
        data-cue-id={effectiveCueId ?? "none"}
        data-soundtrack-slot={selectedSoundtrackSlot ?? "none"}
        data-should-play={desired ? "true" : "false"}
        data-audio-url={desired?.url ?? ""}
        data-audio-loop={desired?.loop ? "true" : "false"}
        data-audio-blocked={audioBlocked ? "true" : "false"}
        data-audio-paused={paused || userPaused ? "true" : "false"}
      />
      {selectedSoundtrackSlot === "finale" &&
        audioExtras?.soundtrack?.results?.url === "/tadazz-show/music/cutie-patootie.mp3" && (
        <a
          className="absolute bottom-2 left-2 z-40 rounded px-2 py-1 text-xs text-white/70 hover:text-white"
          href="/tadazz-show/music/credits.html"
          target="_blank"
          rel="noreferrer"
          data-testid="soundtrack-credit"
        >
          Cutie Patootie · Eric Matyas · soundimage.org / Epic Main Menu Theme · Cleyton Kauffman
        </a>
      )}
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
          {configuredSoundtrackSlots.length > 0 && showTrack === undefined && (
            <label className="tz-x-pill flex items-center gap-2">
              <span>{controlLabels.track}</span>
              <select
                value={liveSlotOverride ?? ""}
                onChange={(event) =>
                  setManualTrack(
                    event.target.value
                      ? {
                          slot: event.target.value as SoundtrackSlotId,
                          stageKey,
                        }
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
