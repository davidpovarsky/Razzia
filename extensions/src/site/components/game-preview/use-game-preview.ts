import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { GamePreviewSession, PreviewSelection } from "./contracts"
import { useGamePreviewPage } from "./boundary"
import { createPreviewRequestOwner } from "./request-owner"
import {
  createPreviewSessionOwner,
  type PreviewConsumerState,
} from "./session-owner"

export function useGamePreview(selection: PreviewSelection, disabled = false) {
  const page = useGamePreviewPage()
  const enabled = Boolean(page?.enabled && !disabled)
  const encoded = JSON.stringify(selection)
  const selected = useMemo(
    () => JSON.parse(encoded) as PreviewSelection,
    [encoded],
  )
  const hostRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreTriggerFocus = useRef(false)
  const ownerRef = useRef<ReturnType<typeof createPreviewSessionOwner> | null>(
    null,
  )
  const requests = useRef<ReturnType<typeof createPreviewRequestOwner> | null>(
    null,
  )
  const stateRef = useRef<PreviewConsumerState>({ status: "inactive" })
  const [state, setState] = useState(stateRef.current)
  const [pending, setPending] = useState(false)
  const active = state.status !== "inactive"

  useLayoutEffect(() => {
    restoreTriggerFocus.current = false
    stateRef.current = { status: "inactive" }
    setState(stateRef.current)
    setPending(false)

    if (!enabled || !page) {
      return
    }

    const owner = createPreviewSessionOwner({
      coordinator: page.coordinator,
      provider: page.provider,
      preferences: page.preferences,
      selection: selected,
      onState(next) {
        if (ownerRef.current !== owner) {
          return
        }

        if (next.status !== "ready") {
          requests.current?.dispose()
          requests.current =
            next.status === "loading" ? createPreviewRequestOwner() : null
          setPending(false)
        }

        stateRef.current = next
        setState(next)
      },
    })
    ownerRef.current = owner

    return () => {
      ownerRef.current = null
      requests.current?.dispose()
      requests.current = null
      owner.dispose()
    }
  }, [enabled, page, selected])

  const open = useCallback(() => {
    if (stateRef.current.status !== "inactive") {
      closeRef.current?.focus({ preventScroll: true })

      return
    }

    if (hostRef.current) {
      void ownerRef.current?.open(hostRef.current)
    }
  }, [])
  const close = useCallback((restoreFocus = true) => {
    restoreTriggerFocus.current = restoreFocus
    ownerRef.current?.close()
  }, [])

  useLayoutEffect(() => {
    if (active) {
      closeRef.current?.focus({ preventScroll: true })

      return
    }

    // The inactive commit remounts the trigger and closes the child dialog.
    if (restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false

      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus({ preventScroll: true })
      }
    }
  }, [active])

  useEffect(() => {
    if (!active) {
      return
    }

    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault()
        close()
      }
    }
    const blur = () => close(false)
    window.addEventListener("keydown", keyboard)
    window.addEventListener("blur", blur)

    return () => {
      window.removeEventListener("keydown", keyboard)
      window.removeEventListener("blur", blur)
    }
  }, [active, close])

  const run = useCallback(
    async (
      operation: (
        session: GamePreviewSession,
        signal: AbortSignal,
      ) => void | Promise<void>,
    ) => {
      const owner = ownerRef.current
      const session = owner?.session()
      const request = requests.current

      if (!owner || !session || !request) {
        return
      }

      setPending(true)
      const result = await request.run((signal) =>
        Promise.resolve(operation(session, signal)),
      )

      if (
        result.status === "superseded" ||
        ownerRef.current !== owner ||
        owner.session() !== session
      ) {
        return
      }

      setPending(false)

      if (result.status === "failed") {
        await owner.fail()

        return
      }

      try {
        const next: PreviewConsumerState = {
          status: "ready",
          snapshot: session.snapshot(),
        }
        stateRef.current = next
        setState(next)
      } catch {
        await owner.fail()
      }
    },
    [],
  )

  return {
    enabled,
    active,
    state,
    pending,
    open,
    close,
    run,
    hostRef,
    triggerRef,
    closeRef,
    session: ownerRef.current?.session() ?? null,
    text: page?.text,
  }
}

export type GamePreviewController = ReturnType<typeof useGamePreview>
