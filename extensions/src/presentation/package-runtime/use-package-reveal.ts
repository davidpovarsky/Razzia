import { useEffect, useRef, useState } from "react"
import {
  advancePackageRevealClock,
  packageRevealAudioTransition,
  packageRevealStage,
  packageTimerAudioTransition,
  PACKAGE_REVEAL_TIMING,
  type PackageRevealAudioState,
  type PackageRevealClock,
  type PackageRevealStage,
  type PackageTimerAudioState,
} from "./reveal-clock"

/** Only the trusted host advances result milestones, shared by all imported themes. */
export function usePackageRevealClock(input: {
  active: boolean
  identity: string
  startedAt?: number
  paused: boolean
  hasCorrectAnswer: boolean
  reducedMotion: boolean
}) {
  const clockRef = useRef<PackageRevealClock | null>(null)
  const [sample, setSample] = useState<PackageRevealClock | null>(null)
  const {
    active,
    identity,
    startedAt,
    paused,
    hasCorrectAnswer,
    reducedMotion,
  } = input
  const clock = active
    ? advancePackageRevealClock(sample, {
        identity,
        now: Date.now(),
        startedAt,
        paused,
      })
    : null

  useEffect(() => {
    if (!active) {
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined = undefined
    const update = () => {
      const current = advancePackageRevealClock(clockRef.current, {
        identity,
        now: Date.now(),
        startedAt,
        paused,
      })
      clockRef.current = current
      setSample(current)

      if (paused || reducedMotion) {
        return
      }

      const next = [
        PACKAGE_REVEAL_TIMING.audienceMs,
        ...(hasCorrectAnswer ? [PACKAGE_REVEAL_TIMING.correctMs] : []),
      ].find((milestone) => milestone > current.elapsedMs)

      if (next !== undefined) {
        timer = setTimeout(update, next - current.elapsedMs + 1)
      }
    }
    update()

    return () => clearTimeout(timer)
  }, [active, identity, startedAt, paused, hasCorrectAnswer, reducedMotion])

  return {
    elapsedMs: clock?.elapsedMs,
    stage: clock
      ? packageRevealStage({
          elapsedMs: clock.elapsedMs,
          hasCorrectAnswer,
          reducedMotion,
        })
      : undefined,
  }
}

export function usePackageRevealAudio(input: {
  identity: string
  stage?: PackageRevealStage
  elapsedMs?: number
  enabled: boolean
  paused: boolean
  reducedMotion?: boolean
}) {
  const previous = useRef<PackageRevealAudioState | null>(null)
  const { identity, stage, elapsedMs, enabled, paused, reducedMotion } = input

  useEffect(() => {
    if (stage === undefined || elapsedMs === undefined) {
      return
    }

    const transition = packageRevealAudioTransition(previous.current, {
      identity,
      stage,
      elapsedMs,
      enabled,
      paused,
      reducedMotion,
    })
    previous.current = transition.state

    if (transition.cue) {
      window.dispatchEvent(
        new CustomEvent("tadazz:sfx", {
          detail: {
            name: transition.cue,
            identity: `${identity}:${transition.cue}`,
            volume: transition.cue === "survey-reveal" ? 0.9 : 0.7,
          },
        }),
      )
    }
  }, [identity, stage, elapsedMs, enabled, paused, reducedMotion])
}

/** Side effects follow the preview's native clock and the same result metadata. */
export function PackagePreviewAudioEffects(input: {
  cardKey: string
  epoch: number
  phase: string
  remainingMs: number
  elapsedMs: number
  stage?: PackageRevealStage
  enabled: boolean
  paused: boolean
  reducedMotion: boolean
}) {
  const previous = useRef<PackageTimerAudioState | null>(null)
  const {
    cardKey,
    epoch,
    phase,
    remainingMs,
    elapsedMs,
    stage,
    enabled,
    paused,
    reducedMotion,
  } = input
  usePackageRevealAudio({
    identity: `read-only-package-preview:${cardKey}:${epoch}:results`,
    stage,
    elapsedMs,
    enabled,
    paused,
    reducedMotion,
  })
  useEffect(() => {
    const transition = packageTimerAudioTransition(previous.current, {
      cardKey,
      epoch,
      phase,
      remainingMs,
      enabled,
      paused,
    })
    previous.current = transition.state

    if (phase !== "voting" || paused || !enabled) {
      window.dispatchEvent(new Event("tadazz:timer-stop"))
    }

    if (transition.cue) {
      window.dispatchEvent(
        new CustomEvent("tadazz:sfx", {
          detail: {
            name: transition.cue,
            identity: `read-only-package-preview:${cardKey}:${epoch}:timer:${transition.state.seconds}:${transition.cue}`,
            volume: transition.volume,
          },
        }),
      )
    }
  }, [cardKey, epoch, phase, remainingMs, enabled, paused])

  return null
}
