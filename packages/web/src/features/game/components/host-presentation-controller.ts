import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type CommandAction,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useCallback, useEffect, useRef, useState } from "react"

export const DOUBLE_PRESS_WINDOW_MS = 500

export type PresentationShortcut =
  "next" | "previous" | "end-timer" | "pause-toggle" | "exit"

export function shouldIgnorePresentationShortcut(
  event: KeyboardEvent,
): boolean {
  if (
    event.repeat ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return true
  }

  const active =
    (event.target as HTMLElement | null) ??
    (typeof document !== "undefined"
      ? (document.activeElement as HTMLElement | null)
      : null)

  if (!active) {
    return false
  }

  const tag = active.tagName?.toUpperCase()

  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A" ||
    active.isContentEditable
  ) {
    return true
  }

  return Boolean(
    active.closest?.(
      "dialog, [role='dialog'], [role='alertdialog'], [data-state='open'], [data-radix-portal]",
    ),
  )
}

export function resolvePresentationShortcut(
  event: Pick<KeyboardEvent, "key" | "shiftKey">,
): PresentationShortcut | null {
  if (event.key === "Escape") {
    return "exit"
  }
  if (event.shiftKey) {
    return null
  }
  if (event.key === "ArrowRight") {
    return "next"
  }

  if (event.key === "ArrowLeft") {
    return "previous"
  }
  if (event.key === "Enter") {
    return "end-timer"
  }
  if (event.key === " ") {
    return "pause-toggle"
  }
  return null
}

export function isDoublePress(
  previous: { chord: string; until: number } | null,
  chord: string,
  now: number,
): boolean {
  return previous?.chord === chord && previous.until >= now
}

export interface HostPresentationCommandOptions {
  enabled: boolean
  statusName: Status | undefined
  extensionState: ExtensionStateEnvelope | null
  currentQuestion: number
  onExit: () => void
  onAdvanceFallback?: () => void
}

/** Keyboard controller remains mounted even while every visual host control is absent. */
export function useHostPresentationCommands({
  enabled,
  statusName,
  extensionState,
  currentQuestion,
  onExit,
  onAdvanceFallback,
}: HostPresentationCommandOptions): void {
  const { socket, isConnected } = useSocket()
  const pendingRef = useRef(false)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmationRef = useRef<{
    chord: string
    until: number
  } | null>(null)
  const latestRef = useRef({
    enabled,
    statusName,
    extensionState,
    currentQuestion,
    onExit,
    onAdvanceFallback,
    isConnected,
  })
  latestRef.current = {
    enabled,
    statusName,
    extensionState,
    currentQuestion,
    onExit,
    onAdvanceFallback,
    isConnected,
  }

  useEffect(() => {
    pendingRef.current = false

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
    }
    pendingTimerRef.current = null
  }, [extensionState?.seq, extensionState?.epoch])

  // Presence/clock snapshots can arrive between the two physical presses.
  // They must not cancel a valid double press.
  useEffect(() => {
    confirmationRef.current = null
  }, [extensionState?.gameId])

  useEffect(() => {
    if (!enabled) {
      confirmationRef.current = null
      pendingRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    const send = (
      action: CommandAction,
      payload: Record<string, unknown>,
      requestSuffix: string,
    ) => {
      const { current } = latestRef
      const gameId = current.extensionState?.gameId

      if (!gameId || !current.isConnected || pendingRef.current) {
        return
      }

      pendingRef.current = true
      const requestId = `host-present-${action}-${current.extensionState?.epoch ?? 0}-${requestSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      socket.emit(
        EXTENSION_EVENTS.COMMAND,
        {
          v: 1,
          gameId,
          action,
          payload,
          requestId,
        },
        (result) => {
          if (pendingTimerRef.current) {
            clearTimeout(pendingTimerRef.current)
          }
          pendingTimerRef.current = null
          pendingRef.current = false

          if (!result.success) {
            console.warn(
              "Host presentation command rejected",
              action,
              result.error,
            )
          }
        },
      )
      pendingTimerRef.current = setTimeout(() => {
        pendingRef.current = false
        pendingTimerRef.current = null
      }, 1500)
    }

    const confirmDestructive = (chord: string): boolean => {
      const now = Date.now()
      const pending = confirmationRef.current

      if (isDoublePress(pending, chord, now)) {
        confirmationRef.current = null

        return true
      }

      confirmationRef.current = { chord, until: now + DOUBLE_PRESS_WINDOW_MS }

      return false
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const { current } = latestRef
      if (!current.enabled || shouldIgnorePresentationShortcut(event)) {
        if (!event.repeat) confirmationRef.current = null
        return
      }
      const chord = `${event.shiftKey ? "Shift+" : ""}${event.key}`
      const shortcut = resolvePresentationShortcut(event)

      if (!shortcut) {
        confirmationRef.current = null
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (shortcut === "exit") {
        current.onExit()

        return
      }

      if (!confirmDestructive(chord)) return

      const state = current.extensionState

      if (!state) {
        return
      }
      const { epoch } = state
      const paused = Boolean(state.pause?.paused)
      const isScene = state.phase === "scene"
      const isInterlude = state.phase === "interlude"

      if (shortcut === "pause-toggle") {
        send(paused ? "RESUME_GAME" : "PAUSE_GAME", { epoch }, `${state.seq}`)

        return
      }

      if (paused) {
        return
      }

      if (shortcut === "end-timer") {
        if (current.statusName === STATUS.SELECT_ANSWER) {
          send(
            "END_ANSWER_TIMER",
            { epoch, questionIndex: Math.max(0, current.currentQuestion - 1) },
            `${state.seq}`,
          )
        }

        return
      }

      if (shortcut === "next") {
        if (
          current.statusName === STATUS.SELECT_ANSWER &&
          state.phase !== "responses" &&
          !isScene
        ) {
          send(
            "SKIP_QUESTION",
            {
              epoch,
              questionIndex: Math.max(0, current.currentQuestion - 1),
              reason: "Double-press next question",
            },
            `${state.seq}`,
          )
          return
        }
        if (isInterlude) {
          send(
            "END_OR_SKIP_INTERLUDE",
            { epoch, reason: "manual" },
            `${state.seq}`,
          )
        } else if (
          isScene ||
          state.phase === "responses" ||
          current.statusName === STATUS.SHOW_ROOM ||
          current.statusName === STATUS.SHOW_RESPONSES ||
          current.statusName === STATUS.SHOW_LEADERBOARD
        ) {
          send("NEXT_SCREEN", { epoch, phase: state.phase }, `${state.seq}`)
        } else if (!state.gameId) {
          current.onAdvanceFallback?.()
        }

        return
      }

      if (shortcut === "previous") {
        const canPrevious = state.extras.canPrevious === true
        if (canPrevious) {
          send(
            "PREVIOUS_SCREEN",
            { epoch, phase: state.phase, confirmed: true },
            `${state.seq}`,
          )
        }

        return
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true })

      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current)
      }
    }
  }, [socket])
}

export function useHostPresentation(enabled: boolean) {
  const [isPresenting, setIsPresenting] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const exitPromiseRef = useRef<Promise<void> | null>(null)

  const exit = useCallback(() => {
    setIsPending(false)
    setIsPresenting(false)
    setError(null)

    if (document.fullscreenElement) {
      // Chrome may paint the restored toolbar before the native exit event.
      // A new enter must wait for that event or the old exit cancels it later.
      const exiting = new Promise<void>((resolve) => {
        const complete = () => {
          if (document.fullscreenElement) return
          document.removeEventListener("fullscreenchange", complete)
          resolve()
        }
        document.addEventListener("fullscreenchange", complete)
        void document
          .exitFullscreen()
          .then(() => {
            if (!document.fullscreenElement) requestAnimationFrame(complete)
          })
          .catch(() => {
            document.removeEventListener("fullscreenchange", complete)
            resolve()
          })
      })
      exitPromiseRef.current = exiting
      void exiting.then(() => {
        if (exitPromiseRef.current === exiting) exitPromiseRef.current = null
      })
    }
  }, [])

  const enter = useCallback(
    async (target: HTMLElement | null) => {
      if (!enabled || !target?.requestFullscreen) {
        setIsPending(false)
        setError("fullscreen-unavailable")

        return false
      }

      setError(null)
      setIsPending(true)

      try {
        await exitPromiseRef.current
        targetRef.current = target
        await target.requestFullscreen()

        if (document.fullscreenElement !== target) {
          setIsPending(false)
          setError("fullscreen-denied")

          return false
        }

        setIsPending(false)
        setIsPresenting(true)
        target.tabIndex = -1
        target.focus({ preventScroll: true })

        return true
      } catch {
        setIsPresenting(false)
        setError("fullscreen-denied")
        setIsPending(false)

        return false
      }
    },
    [enabled],
  )

  useEffect(() => {
    const change = () => {
      const active = Boolean(
        targetRef.current && document.fullscreenElement === targetRef.current,
      )
      setIsPending(false)
      setIsPresenting(active)

      if (active) {
        // Host chrome disappears after the fullscreen event. Refit the 16:9
        // stage on the following painted frame, once its viewport has expanded.
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            window.dispatchEvent(new Event("resize")),
          ),
        )
      }

      if (!active) {
        targetRef.current = null
      }
    }
    const failed = () => {
      setIsPending(false)
      setIsPresenting(false)
      setError("fullscreen-denied")
    }
    document.addEventListener("fullscreenchange", change)
    document.addEventListener("fullscreenerror", failed)

    return () => {
      document.removeEventListener("fullscreenchange", change)
      document.removeEventListener("fullscreenerror", failed)
    }
  }, [])

  return { isPresenting, isPending, error, enter, exit }
}
