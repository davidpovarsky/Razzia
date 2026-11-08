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
import {
  applyThemeAudioDefaults,
  CUE_THEME_EVENTS,
  SOUNDTRACK_THEME_EVENTS,
  defaultThemeAudioUrl,
  resolveThemeEffect,
  themeAllowsAudioUrl,
} from "../core/show-themes/audio"
import { useOptionalShowTheme } from "./show-themes/context"

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
  "timer-ended": "/sounds/tadazz-timer-end-368edc1d9522.mp3",
  "countdown-ended": REVEAL,
  "survey-reveal": REVEAL,
  "top-pick-reveal": CONFIRM,
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
  /** Player role: process permitted interaction effects, without a second music engine. */
  eventOnly?: boolean
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
  Math.min(
    1,
    Math.max(
      0,
      volume * (url === "/tadazz-show/music/cutie-patootie.mp3" ? 2.5 : 1),
    ),
  )

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
  eventOnly = false,
  showTrack,
  stageOwnsReveal = false,
  cueId,
  audioExtras: suppliedAudioExtras,
  cardAudioCues: suppliedCardAudioCues,
  sceneAudio: suppliedSceneAudio,
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
  const theme = useOptionalShowTheme()
  const audioExtras = useMemo(
    () =>
      theme
        ? applyThemeAudioDefaults(theme, suppliedAudioExtras)
        : suppliedAudioExtras,
    [theme, suppliedAudioExtras],
  )
  const cardAudioCues = useMemo(() => {
    if (!theme || !suppliedCardAudioCues) {
      return suppliedCardAudioCues
    }
    return Object.fromEntries(
      Object.entries(suppliedCardAudioCues).filter(([key, choice]) => {
        const event = CUE_THEME_EVENTS[key as CueId]
        if (Object.keys(theme.audioSelections[event] ?? {}).length > 0)
          return false
        return (
          choice.mode !== "custom" ||
          Boolean(choice.url && themeAllowsAudioUrl(theme, event, choice.url))
        )
      }),
    ) as CardAudioOverrides
  }, [theme, suppliedCardAudioCues])
  const activeThemeAudioEvent =
    SOUNDTRACK_THEME_EVENTS[soundtrackSlot ?? "lobby"]
  const sceneAudio =
    !theme || !suppliedSceneAudio
      ? suppliedSceneAudio
      : Object.keys(theme.audioSelections[activeThemeAudioEvent] ?? {}).length >
            0 ||
          (suppliedSceneAudio.url &&
            !themeAllowsAudioUrl(
              theme,
              activeThemeAudioEvent,
              suppliedSceneAudio.url,
            ))
        ? undefined
        : suppliedSceneAudio
  const pendingEffectRef = useRef<{
    element: HTMLAudioElement
    volume: number
  } | null>(null)
  useEffect(() => {
    pendingEffectRef.current = null
  }, [gameId, activeCardKey, epoch])
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
  const revealRef = useRef<HTMLAudioElement | null>(null)
  const timerEndRef = useRef<HTMLAudioElement | null>(null)
  const spotlightRef = useRef<HTMLAudioElement | null>(null)
  const epicWarmRef = useRef<HTMLAudioElement | null>(null)
  const tickRef = useRef<HTMLAudioElement | null>(null)
  const sfxLevelRef = useRef(0.7)
  const revealLevelRef = useRef(0.9)
  const timerEndLevelRef = useRef(0.8)
  const spotlightLevelRef = useRef(0.7)
  const tickLevelRef = useRef(0.27)
  const protectedUntilRef = useRef(0)
  const lastEffectRef = useRef({ url: "", at: 0 })
  const duckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ducked, setDucked] = useState(false)
  const [timerEnding, setTimerEnding] = useState(false)
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
  const playbackControlsRef = useRef({ autoPlay, paused, userPaused })
  playbackControlsRef.current = { autoPlay, paused, userPaused }
  const votingAttemptRef = useRef<string | null>(null)
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
  useEffect(() => {
    if (selectedSoundtrackSlot !== "voting") return
    const attempt = `${gameId ?? "g"}:${activeCardKey ?? "q"}:${epoch ?? 0}`
    if (votingAttemptRef.current === attempt) return
    votingAttemptRef.current = attempt
    // A skip/restart must never carry an old milestone into a new question.
    revealRef.current?.pause()
    spotlightRef.current?.pause()
    timerEndRef.current?.pause()
    setTimerEnding(false)
    protectedUntilRef.current = 0
    if (duckTimerRef.current) clearTimeout(duckTimerRef.current)
    setDucked(false)
  }, [selectedSoundtrackSlot, gameId, activeCardKey, epoch])
  const configuredSoundtrackSlots = SOUNDTRACK_SLOT_IDS.filter(
    (slot) => audioExtras?.soundtrack?.[slot]?.mode === "media",
  )
  const effectiveCueId: CueId | undefined =
    selectedSoundtrackSlot === "voting"
      ? "answersMusic"
      : (cueId ?? sceneAudio?.cueId ?? (sceneAudio?.url ? "start" : undefined))
  const resolvedCue = effectiveCueId
    ? resolveEffectiveAudioCue({
        cueId: effectiveCueId,
        cardAudioCues,
        sceneAudio:
          selectedSoundtrackSlot === "voting" ? undefined : sceneAudio,
        globalAudio: audioExtras,
        defaultUrl: DEFAULT_CUE_URLS[effectiveCueId],
        defaultVolume: effectiveCueId === "answersMusic" ? 0.35 : 0.7,
        defaultLoop: effectiveCueId === "answersMusic",
        hasCompetingMediaAudio: false,
      })
    : null
  const soundtrack = resolveSoundtrack(selectedSoundtrackSlot, audioExtras)

  const desired = useMemo<DesiredTrack | null>(() => {
    if (eventOnly) return null
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
    // Native reveal choreography owns one-shot theme effects. A looping
    // alternative is a background bed; it must not also play as an SFX.
    if (
      theme &&
      stageOwnsReveal &&
      (selectedSoundtrackSlot === "results" ||
        selectedSoundtrackSlot === "recap") &&
      Object.keys(theme.audioSelections.revealResults ?? {}).length > 0 &&
      !theme.audio.revealResults.loop
    )
      return null
    // An authored scene can follow a question while its base status still says
    // answersMusic. Scene ownership must win over that previous question's cue.
    if (
      !liveSlotOverride &&
      selectedSoundtrackSlot !== "voting" &&
      sceneAudio?.mode === "mute"
    )
      return null
    if (
      !liveSlotOverride &&
      selectedSoundtrackSlot !== "voting" &&
      sceneAudio?.url &&
      sceneAudio.mode !== "inherit"
    ) {
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
        identity: `${gameId ?? "g"}:voting:${activeCardKey ?? "question"}:${epoch ?? 0}:${resolvedCue.url}`,
        url: resolvedCue.url,
        volume: resolvedCue.volume,
        loop: resolvedCue.loop,
        fadeMs: 0,
        startOffsetSeconds: 0,
        fallbackUrl:
          audioExtras?.cues?.answersMusic?.url !== resolvedCue.url
            ? audioExtras?.cues?.answersMusic?.url
            : undefined,
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
          theme || selectedSoundtrackSlot === "openingIntro"
            ? soundtrack.loop
            : true,
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
      fallbackUrl: theme
        ? defaultThemeAudioUrl(theme, CUE_THEME_EVENTS[effectiveCueId])
        : resolvedCue.url === DEFAULT_CUE_URLS[effectiveCueId]
          ? undefined
          : ((stageOwnsReveal ? TADAZZ_PHASE_SFX[effectiveCueId] : undefined) ??
            DEFAULT_CUE_URLS[effectiveCueId]),
    }
  }, [
    eventOnly,
    theme,
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
          (timerEnding ? 0.15 : ducked ? 0.3 : 1),
    [hasCompetingMedia, masterVolume, muted, ducked, timerEnding],
  )

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return
    }
    const a = new Audio()
    const b = new Audio()
    const sfx = new Audio()
    const reveal = new Audio(
      theme ? resolveThemeEffect(theme, "survey-reveal")?.url : REVEAL,
    )
    const timerEnd = new Audio(
      theme
        ? resolveThemeEffect(theme, "timer-ended")?.url
        : TADAZZ_SFX_BY_CUE["timer-ended"],
    )
    timerEnd.onended = () => setTimerEnding(false)
    const spotlight = new Audio(
      theme ? resolveThemeEffect(theme, "top-pick-reveal")?.url : CONFIRM,
    )
    const tick = new Audio()
    a.preload = "auto"
    b.preload = "auto"
    sfx.preload = "auto"
    reveal.preload = "auto"
    timerEnd.preload = "auto"
    spotlight.preload = "auto"
    tick.preload = "auto"
    backgroundsRef.current = [a, b]
    sfxRef.current = sfx
    revealRef.current = reveal
    timerEndRef.current = timerEnd
    spotlightRef.current = spotlight
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
      timerEnd.onended = null
      for (const audio of new Set([
        a,
        b,
        sfx,
        tick,
        reveal,
        timerEnd,
        spotlight,
        ...(backgroundsRef.current ?? []),
        epicWarmRef.current,
      ])) {
        if (!audio) continue
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
      }
      backgroundsRef.current = null
      sfxRef.current = null
      revealRef.current = null
      timerEndRef.current = null
      spotlightRef.current = null
      epicWarmRef.current = null
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
    const warmed = epicWarmRef.current
    if (warmed && warmed.getAttribute("src") === desired.url && !warmed.error) {
      const displaced = elements[nextIndex]
      displaced.pause()
      displaced.onended = null
      displaced.onerror = null
      elements[nextIndex] = warmed
      epicWarmRef.current = displaced
    }
    const next = elements[nextIndex]
    next.pause()
    delete next.dataset.fallbackAttempted
    // Reuse the result track buffered during voting instead of starting another
    // network request at the exact moment the short reveal scene begins.
    if (next.getAttribute("src") !== desired.url || next.error)
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
      // Same-track state updates legitimately advance the generation while an
      // asynchronous network error is pending. Retain this handler for that
      // active element/identity, but never let it revive an abandoned scene.
      const stillActive = () =>
        currentRef.current?.identity === desired.identity &&
        elements[activeIndexRef.current] === next
      if (!stillActive()) {
        return
      }
      if (desired.fallbackUrl && next.dataset.fallbackAttempted !== "true") {
        next.dataset.fallbackAttempted = "true"
        next.src = desired.fallbackUrl

        const controls = playbackControlsRef.current
        if (controls.autoPlay && !controls.paused && !controls.userPaused) {
          void next
            .play()
            .then(() => {
              if (!stillActive()) return
              next.volume = effectiveVolume(desired)
              old.pause()
              setAudioBlocked(false)
              onPlaybackStarted(desired.identity)
            })
            .catch((error: unknown) => {
              if (!stillActive()) return
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

    if (!autoPlay || paused || userPaused || audioBlocked) {
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
        if (
          next.dataset.fallbackAttempted === "true" &&
          next.getAttribute("src") === desired.fallbackUrl
        )
          return
        old.pause()
        setAudioBlocked(true)
        onError(error)
      })
  }, [
    autoPlay,
    audioBlocked,
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
    if (
      !autoPlay ||
      selectedSoundtrackSlot !== "voting" ||
      showTrack !== undefined
    )
      return
    const upcoming = audioExtras?.soundtrack?.results
    const elements = backgroundsRef.current
    if (
      !elements ||
      upcoming?.mode !== "media" ||
      !upcoming.url ||
      rampRef.current
    )
      return
    const inactive = elements[activeIndexRef.current === 0 ? 1 : 0]
    if (!inactive.paused || inactive.getAttribute("src") === upcoming.url)
      return
    inactive.onended = null
    inactive.onerror = null
    inactive.volume = 0
    inactive.preload = "auto"
    inactive.src = upcoming.url
    inactive.load()
  }, [autoPlay, selectedSoundtrackSlot, showTrack, audioExtras, desired])

  useEffect(() => {
    if (
      !autoPlay ||
      audioExtras?.soundtrack?.results?.url !==
        "/tadazz-show/music/cutie-patootie.mp3"
    )
      return
    const url = "/tadazz-show/music/epic-main-menu.mp3"
    if (backgroundsRef.current?.some((a) => a.getAttribute("src") === url))
      return
    const warm = epicWarmRef.current ?? new Audio()
    epicWarmRef.current = warm
    if (warm.getAttribute("src") === url && !warm.error) return
    warm.pause()
    warm.onended = null
    warm.onerror = null
    warm.volume = 0
    warm.preload = "auto"
    warm.src = url
    warm.load()
  }, [autoPlay, audioExtras, desired])

  useEffect(() => {
    const elements = backgroundsRef.current
    const { current } = currentRef
    if (!elements || !current) {
      return
    }
    const active = elements[activeIndexRef.current]
    const generation = generationRef.current
    const stillCurrent = () =>
      generationRef.current === generation &&
      currentRef.current?.identity === current.identity &&
      elements[activeIndexRef.current] === active
    active.volume = effectiveVolume(current)

    if (paused || userPaused) {
      elements.forEach((element) => element.pause())
    } else if (
      autoPlay &&
      !audioBlocked &&
      active.paused &&
      finishedIdentityRef.current !== current.identity
    ) {
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
          if (
            active.dataset.fallbackAttempted === "true" &&
            active.getAttribute("src") === current.fallbackUrl
          )
            return
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
      if (
        eventOnly &&
        detail?.name !== "answer-selected" &&
        detail?.name !== "answer-submitted"
      )
        return
      const themeCue =
        theme && detail?.name
          ? resolveThemeEffect(theme, detail.name)
          : undefined
      let url = theme
        ? themeCue?.url
        : (detail?.url ??
          (detail?.name ? TADAZZ_SFX_BY_CUE[detail.name] : undefined))
      if (
        theme &&
        themeCue &&
        Object.keys(theme.audioSelections[themeCue.event] ?? {}).length > 0 &&
        url &&
        currentRef.current?.url === url
      )
        return
      if (
        theme &&
        themeCue &&
        !Object.keys(theme.audioSelections[themeCue.event] ?? {}).length
      ) {
        const savedCueId = (Object.keys(CUE_THEME_EVENTS) as CueId[]).find(
          (key) => CUE_THEME_EVENTS[key] === themeCue.event,
        )
        const saved =
          savedCueId && theme.requested.legacyPolicy !== "theme-defaults"
            ? suppliedAudioExtras?.cues[savedCueId]
            : undefined
        if (saved?.enabled === false || saved?.volume === 0) return
        const card =
          savedCueId &&
          (savedCueId === "showQuestion" ||
            savedCueId === "answersMusic" ||
            savedCueId === "revealResults")
            ? cardAudioCues?.[savedCueId]
            : undefined
        if (card?.mode === "mute") return
        const custom =
          card?.mode === "custom"
            ? card.url
            : saved?.source === "media"
              ? saved.url
              : undefined
        if (custom && themeAllowsAudioUrl(theme, themeCue.event, custom)) {
          url = custom
        }
      }
      const identity = detail?.identity

      if (!url || !identity || playedSfxRef.current.has(identity)) {
        return
      }
      const isTimerEnd =
        detail.name === "timer-ended" || detail.name === "vote-locked"
      const isTick = !isTimerEnd && (detail.name?.startsWith("timer-") ?? false)
      const isReveal = detail.name === "survey-reveal"
      const isSpotlight = detail.name === "top-pick-reveal"
      const isMilestone = isReveal || isSpotlight || isTimerEnd
      const now = Date.now()
      if (!isTick && !isMilestone && now < protectedUntilRef.current) return
      playedSfxRef.current.add(identity)
      // The wipe/impact animation can emit adjacent cues for one movement.
      if (
        !isTick &&
        !isMilestone &&
        lastEffectRef.current.url === url &&
        now - lastEffectRef.current.at < 500
      )
        return
      if (!isTick) lastEffectRef.current = { url, at: now }
      if (isReveal || isTimerEnd) {
        if (isTimerEnd) setTimerEnding(true)
        protectedUntilRef.current = Math.max(
          protectedUntilRef.current,
          now + (isTimerEnd ? 2530 : 1100),
        )
        setDucked(true)
        if (duckTimerRef.current) clearTimeout(duckTimerRef.current)
        duckTimerRef.current = setTimeout(
          () => setDucked(false),
          protectedUntilRef.current - now,
        )
        tickRef.current?.pause()
      }

      // Retain recent identities when long shows add hundreds of timer ticks.
      // Clearing the entire cache could replay the current question's reveal.
      if (playedSfxRef.current.size > 512) {
        const oldest = playedSfxRef.current.values().next().value
        if (oldest) playedSfxRef.current.delete(oldest)
      }
      const sfx = isTick
        ? tickRef.current
        : isTimerEnd
          ? timerEndRef.current
          : isReveal
            ? revealRef.current
            : isSpotlight
              ? spotlightRef.current
              : sfxRef.current

      if (!sfx) {
        return
      }
      sfx.pause()
      if (sfx.getAttribute("src") !== url || sfx.error) sfx.src = url
      sfx.currentTime = 0
      const explicitVolume =
        themeCue && theme?.audioSelections[themeCue.event]?.volume
      const level =
        Math.max(
          0,
          Math.min(
            1,
            explicitVolume ?? detail?.volume ?? themeCue?.volume ?? 0.7,
          ),
        ) *
        (isReveal && timerEndRef.current && !timerEndRef.current.paused
          ? 0.75
          : 1)
      if (isTick) tickLevelRef.current = level
      else if (isTimerEnd) timerEndLevelRef.current = level
      else if (isReveal) revealLevelRef.current = level
      else if (isSpotlight) spotlightLevelRef.current = level
      else sfxLevelRef.current = level
      sfx.volume = level * masterVolume
      if (audioBlocked) {
        pendingEffectRef.current = {
          element: sfx,
          volume: level * masterVolume,
        }
        return
      }
      void sfx.play().catch((error: unknown) => {
        if (isTimerEnd) setTimerEnding(false)
        pendingEffectRef.current = {
          element: sfx,
          volume: level * masterVolume,
        }
        setAudioBlocked(true)
        onError(error)
      })
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
  }, [
    masterVolume,
    muted,
    onError,
    paused,
    userPaused,
    eventOnly,
    audioBlocked,
    theme,
    suppliedAudioExtras,
    cardAudioCues,
  ])

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
    const pending = pendingEffectRef.current
    if (pending && !paused) {
      pending.element.currentTime = 0
      pending.element.volume = pending.volume
      void pending.element
        .play()
        .then(() => {
          pendingEffectRef.current = null
        })
        .catch((error: unknown) => {
          setAudioBlocked(true)
          onError(error)
        })
    }
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
      revealRef.current?.pause()
      timerEndRef.current?.pause()
      setTimerEnding(false)
      spotlightRef.current?.pause()
      tickRef.current?.pause()
    }
    if (sfxRef.current) {
      sfxRef.current.volume = muted ? 0 : sfxLevelRef.current * masterVolume
    }
    if (revealRef.current)
      revealRef.current.volume = muted
        ? 0
        : revealLevelRef.current * masterVolume
    if (timerEndRef.current)
      timerEndRef.current.volume = muted
        ? 0
        : timerEndLevelRef.current * masterVolume
    if (spotlightRef.current)
      spotlightRef.current.volume = muted
        ? 0
        : spotlightLevelRef.current * masterVolume
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
        data-audio-identity={desired?.identity ?? ""}
        data-audio-loop={desired?.loop ? "true" : "false"}
        data-audio-blocked={audioBlocked ? "true" : "false"}
        data-audio-paused={paused || userPaused ? "true" : "false"}
      />
      {!showControls && audioBlocked && (
        <button
          type="button"
          className="tz-x-pill absolute bottom-3 left-3 z-50"
          data-testid="player-enable-audio"
          onClick={unlock}
        >
          {controlLabels.enable}
        </button>
      )}
      {selectedSoundtrackSlot === "finale" &&
        audioExtras?.soundtrack?.results?.url ===
          "/tadazz-show/music/cutie-patootie.mp3" && (
          <a
            className="absolute bottom-2 left-2 z-40 rounded px-2 py-1 text-xs text-white/70 hover:text-white"
            href="/tadazz-show/music/credits.html"
            target="_blank"
            rel="noreferrer"
            data-testid="soundtrack-credit"
          >
            Cutie Patootie · Eric Matyas · soundimage.org / Epic Main Menu Theme
            · Cleyton Kauffman
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
