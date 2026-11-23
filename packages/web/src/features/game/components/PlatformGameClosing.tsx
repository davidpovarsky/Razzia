import {
  PLATFORM_CLOSING_DURATION_MS,
  readPlatformOpening,
  readTerminalFinaleStartedAt,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { PlatformClosingBoundary } from "@razzia/extensions/presentation"
import { useReducedMotion } from "motion/react"
import type { PropsWithChildren } from "react"
import { usePlatformClock } from "./use-platform-clock"

/** Product curtain around every host/theme surface; player screens remain usable. */
type Props = PropsWithChildren<{
  extensionState?: ExtensionStateEnvelope | null
  role: "manager" | "spectator" | "player"
}>

export function PlatformGameClosing(props: Props) {
  return props.role === "player" ? props.children : <HostClosing {...props} />
}

function HostClosing({ children, extensionState }: Props) {
  const launch = readPlatformOpening(extensionState?.extras.presentationLaunch)
  const ending = launch?.stage === "closing" || launch?.stage === "closed"
  const authoredStartedAt = readTerminalFinaleStartedAt(
    extensionState?.extras.activeTimelineStep,
  )
  const enabled = ending || authoredStartedAt !== null
  const paused = extensionState?.pause?.paused ?? false
  const { now } = usePlatformClock(
    enabled && launch?.stage !== "closed",
    paused,
  )
  const reducedMotion = useReducedMotion() ?? false
  let elapsedMs: number | null = null

  if (enabled) {
    if (launch?.stage === "closed") {
      elapsedMs = PLATFORM_CLOSING_DURATION_MS
    } else if (ending && launch.startedAt !== null) {
      elapsedMs =
        paused && typeof extensionState?.pause?.remainingMs === "number"
          ? PLATFORM_CLOSING_DURATION_MS - extensionState.pause.remainingMs
          : now - launch.startedAt
    } else if (authoredStartedAt !== null) {
      const sceneElapsedMs = extensionState?.extras.sceneElapsedMs
      elapsedMs =
        paused && typeof sceneElapsedMs === "number"
          ? sceneElapsedMs
          : now - authoredStartedAt
    }
  }

  return (
    <PlatformClosingBoundary
      elapsedMs={elapsedMs}
      reducedMotion={reducedMotion}
    >
      {children}
    </PlatformClosingBoundary>
  )
}
