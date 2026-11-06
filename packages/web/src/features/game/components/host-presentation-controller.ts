import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type CommandAction,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useCallback, useEffect, useRef, useState } from "react"

const CONFIRM_WINDOW_MS = 2000

export type PresentationShortcut =
  | "next"
  | "previous"
  | "end-timer"
  | "pause-toggle"
  | "skip-question"
  | "replay-previous-question"
  | "exit"

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
  if (event.shiftKey && event.key === "ArrowRight") {
    return "skip-question"
  }
  if (event.shiftKey && event.key.toLowerCase() === "s") {
    return "skip-question"
  }
  if (event.shiftKey && event.key === "ArrowLeft") {
    return "replay-previous-question"
  }

  if (event.shiftKey) {
    return null
  }
  if (
    event.key === " " ||
    event.key === "Enter" ||
    event.key === "ArrowRight"
  ) {
    return "next"
  }

  if (event.key === "ArrowLeft") {
    return "previous"
  }
  if (event.key.toLowerCase() === "t") {
    return "end-timer"
  }
  if (event.key.toLowerCase() === "p") {
    return "pause-toggle"
  }
  return null
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
    confirmationRef.current = null
    pendingRef.current = false

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
    }
    pendingTimerRef.current = null
  }, [extensionState?.seq, extensionState?.epoch])

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

      if (pending?.chord === chord && pending.until >= now) {
        confirmationRef.current = null

        return true
      }

      confirmationRef.current = { chord, until: now + CONFIRM_WINDOW_MS }

      return false
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const { current } = latestRef
      if (!current.enabled || shouldIgnorePresentationShortcut(event)) {
        return
      }
      const chord = `${event.shiftKey ? "Shift+" : ""}${event.key}`
      const shortcut = resolvePresentationShortcut(event)

      if (!shortcut) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (shortcut === "exit") {
        current.onExit()

        return
      }

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
        if (current.statusName === STATUS.SELECT_ANSWER) {
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
        const destructive = state.extras.willReopenQuestion === true

        if (canPrevious && !destructive) {
          send("PREVIOUS_SCREEN", { epoch, phase: state.phase }, `${state.seq}`)
        }

        return
      }

      if (shortcut === "skip-question") {
        if (!confirmDestructive(chord)) {
          return
        }
        send(
          "SKIP_QUESTION",
          {
            epoch,
            questionIndex: Math.max(0, current.currentQuestion - 1),
            reason: "Host presentation double-chord skip",
          },
          `${state.seq}`,
        )

        return
      }

      if (shortcut === "replay-previous-question") {
        if (current.currentQuestion <= 1 || !confirmDestructive(shortcut)) {
          return
        }
        send(
          "REPLAY_FROM_CHECKPOINT",
          {
            epoch,
            questionIndex: current.currentQuestion - 2,
            confirmed: true,
          },
          `${state.seq}`,
        )
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

  const exit = useCallback(() => {
    setIsPending(false)
    setIsPresenting(false)
    setError(null)

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  const enter = useCallback(
    async (target: HTMLElement | null) => {
      if (!enabled || !target?.requestFullscreen) {
        setIsPending(false)
        setError("fullscreen-unavailable")

        return false
      }

      targetRef.current = target
      setError(null)
      setIsPending(true)

      try {
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
