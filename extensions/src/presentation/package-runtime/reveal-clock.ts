export const PACKAGE_REVEAL_TIMING = {
  audienceMs: 200,
  correctMs: 1450,
} as const

export type PackageRevealStage = "pending" | "audience" | "correct"

export interface PackageRevealClock {
  identity: string
  elapsedMs: number
  sampledAt: number
  paused: boolean
}

/** A host clock anchored once to the server result; presence sequences cannot rewind it. */
export function advancePackageRevealClock(
  previous: PackageRevealClock | null,
  input: {
    identity: string
    now: number
    startedAt?: number
    paused: boolean
  },
): PackageRevealClock {
  const elapsedMs =
    previous?.identity === input.identity
      ? previous.elapsedMs +
        (previous.paused ? 0 : Math.max(0, input.now - previous.sampledAt))
      : Math.max(0, input.now - (input.startedAt ?? input.now))

  return {
    identity: input.identity,
    elapsedMs,
    sampledAt:
      previous?.identity === input.identity
        ? Math.max(previous.sampledAt, input.now)
        : input.now,
    paused: input.paused,
  }
}

export function packageRevealStage(input: {
  elapsedMs: number
  hasCorrectAnswer: boolean
  reducedMotion?: boolean
}): PackageRevealStage {
  if (input.reducedMotion) {
    return input.hasCorrectAnswer ? "correct" : "audience"
  }

  if (input.elapsedMs < PACKAGE_REVEAL_TIMING.audienceMs) {
    return "pending"
  }

  if (
    input.hasCorrectAnswer &&
    input.elapsedMs >= PACKAGE_REVEAL_TIMING.correctMs
  ) {
    return "correct"
  }

  return "audience"
}

export interface PackageRevealAudioState {
  identity: string
  stage: PackageRevealStage
}

/** Reconnect and throttled tabs observe the current result without replaying a burst. */
export function packageRevealAudioTransition(
  previous: PackageRevealAudioState | null,
  input: {
    identity: string
    stage: PackageRevealStage
    elapsedMs: number
    enabled: boolean
    paused: boolean
    reducedMotion?: boolean
  },
) {
  const state: PackageRevealAudioState = {
    identity: input.identity,
    stage: input.stage,
  }
  const current =
    previous?.identity === input.identity ? previous.stage : undefined

  if (
    !input.enabled ||
    input.paused ||
    input.reducedMotion ||
    current === undefined ||
    current === input.stage ||
    input.stage === "pending"
  ) {
    return { state, cue: undefined }
  }

  const cue = input.stage === "correct" ? "top-pick-reveal" : "survey-reveal"
  const at =
    input.stage === "correct"
      ? PACKAGE_REVEAL_TIMING.correctMs
      : PACKAGE_REVEAL_TIMING.audienceMs

  return {
    state,
    cue: input.elapsedMs <= at + 500 ? cue : undefined,
  }
}

export interface PackageTimerAudioState {
  cardKey: string
  epoch: number
  phase: string
  seconds: number
}

/** Preview consumes its native demo clock; it never runs a second voting timer. */
export function packageTimerAudioTransition(
  previous: PackageTimerAudioState | null,
  input: {
    cardKey: string
    epoch: number
    phase: string
    remainingMs: number
    enabled: boolean
    paused: boolean
  },
) {
  const seconds = Math.max(0, Math.ceil(input.remainingMs / 1000))
  const state: PackageTimerAudioState = {
    cardKey: input.cardKey,
    epoch: input.epoch,
    phase: input.phase,
    seconds,
  }

  if (!input.enabled || input.paused) {
    return { state, cue: undefined, volume: 0 }
  }

  if (
    previous?.cardKey === input.cardKey &&
    previous.phase === "voting" &&
    (input.phase === "voteLocked" || input.phase === "results")
  ) {
    return {
      state,
      // The host may finish the native preview clock before its deadline.
      cue: "timer-ended",
      volume: 0.8,
    }
  }

  if (
    input.phase !== "voting" ||
    seconds === 0 ||
    (previous?.cardKey === input.cardKey &&
      previous.epoch === input.epoch &&
      previous.phase === input.phase &&
      previous.seconds === seconds)
  ) {
    return { state, cue: undefined, volume: 0 }
  }

  if (seconds <= 3) {
    return { state, cue: "timer-final", volume: 0.42 }
  }

  if (seconds <= 5) {
    return { state, cue: "timer-urgent", volume: 0.34 }
  }

  return { state, cue: "timer-tick", volume: 0.27 }
}
