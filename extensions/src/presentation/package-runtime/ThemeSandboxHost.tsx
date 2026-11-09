import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  RendererMessageGuard,
  runtimeSnapshotSchema,
  type RuntimeSnapshot,
} from "../../core/packages/protocol"

export function ThemeSandboxHost({
  url,
  snapshot,
  onAnswer,
  onAudioCue,
  onFallback,
  fallback,
  title,
}: {
  url: string
  snapshot: RuntimeSnapshot
  onAnswer: (ids: string[]) => void
  onAudioCue?: (id: string) => void
  fallback: ReactNode
  title: string
  onFallback?: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const current = useRef({ snapshot, onAnswer, onAudioCue, onFallback })
  useLayoutEffect(() => {
    current.current = { snapshot, onAnswer, onAudioCue, onFallback }
  }, [snapshot, onAnswer, onAudioCue, onFallback])
  const [failed, setFailed] = useState(false)
  const [failureCode, setFailureCode] = useState("")
  const fail = useCallback((code: string) => {
    setFailureCode(code)
    setFailed(true)
  }, [])
  useEffect(() => {
    if (failed) {
      current.current.onFallback?.()
    }
  }, [failed])
  const connection = useRef<{
    channel: string
    sequence: number
    ready: boolean
  } | null>(null)
  useLayoutEffect(() => {
    const { origin } = new URL(url)

    if (origin === window.location.origin) {
      return
    }

    // Parent policy also constrains child-initiated navigation. sandbox alone
    // prevents top navigation but does not prohibit navigation of its own frame.
    const policy = document.createElement("meta")
    policy.httpEquiv = "Content-Security-Policy"
    policy.content = `frame-src ${origin}`
    document.head.appendChild(policy)

    return () => policy.remove()
  }, [url])
  const send = useCallback(
    (bootstrap = false) => {
      const state = connection.current

      if (!state || !frame.current?.contentWindow) {
        return
      }

      const parsed = runtimeSnapshotSchema.safeParse(current.current.snapshot)

      if (
        !parsed.success ||
        JSON.stringify(current.current.snapshot).length > 8_000_000
      ) {
        fail("SNAPSHOT_INVALID")

        return
      }

      const { data: publicState } = parsed
      state.sequence += 1
      frame.current.contentWindow.postMessage(
        {
          v: 1,
          channel: state.channel,
          roomId: publicState.roomId,
          questionId: publicState.questionId,
          role: publicState.role,
          sequence: state.sequence,
          epoch: publicState.epoch,
          type: bootstrap ? "BOOTSTRAP" : "STATE_SNAPSHOT",
          snapshot: publicState,
          ...(bootstrap ? { assetMap: {} } : {}),
        },
        "*",
      )
    },
    [fail],
  )
  useLayoutEffect(() => {
    const { origin } = new URL(url)

    if (
      origin === window.location.origin ||
      !["https:", "http:"].includes(new URL(url).protocol)
    ) {
      fail("ORIGIN_INVALID")

      return
    }

    setFailed(false)
    const channel = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("")
    const guard = new RendererMessageGuard(channel)
    const connectionState = { channel, sequence: 0, ready: false }
    connection.current = connectionState
    let lastHealth = Date.now()
    const listener = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null"
      ) {
        return
      }

      const data = guard.accept(
        event.data,
        current.current.snapshot,
        Date.now(),
      )

      if (!data) {
        return
      }

      if (data.type === "READY") {
        connectionState.ready = true
        lastHealth = Date.now()
        send()
      } else if (data.type === "RENDER_HEALTH") {
        lastHealth = Date.now()
      } else if (data.type === "RUNTIME_ERROR") {
        fail("RENDER_FAILED")
      } else if (data.type === "ANSWER_INTENT") {
        const s = current.current.snapshot

        if (
          s.role === "player" &&
          s.canAnswer &&
          !s.paused &&
          data.questionId === s.questionId &&
          new Set(data.optionIds).size === data.optionIds.length &&
          data.optionIds.every((id) => s.answers.some((a) => a.id === id))
        ) {
          current.current.onAnswer(data.optionIds)
        }
      } else {
        current.current.onAudioCue?.(data.cueId)
      }
    }
    window.addEventListener("message", listener)
    const watch = setInterval(() => {
      if (!connectionState.ready) {
        send(true)
      }

      if (Date.now() - lastHealth > 5000) {
        fail("HANDSHAKE_OR_HEARTBEAT_TIMEOUT")
      }
    }, 1000)

    return () => {
      window.removeEventListener("message", listener)
      clearInterval(watch)
      connection.current = null
    }
  }, [url, send, fail])
  useEffect(() => {
    if (connection.current?.ready) {
      send()
    }
  }, [snapshot, send])

  if (failed) {
    return (
      <div
        data-testid="package-runtime-fallback"
        data-runtime-error={failureCode}
        className="h-full w-full"
      >
        {fallback}
      </div>
    )
  }

  return (
    <iframe
      ref={frame}
      src={url}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; autoplay 'none'; clipboard-read 'none'; clipboard-write 'none'"
      title={title}
      onLoad={() => send(true)}
      onError={() => fail("FRAME_LOAD_FAILED")}
      data-testid="package-runtime-frame"
      className="h-full w-full border-0"
    />
  )
}
