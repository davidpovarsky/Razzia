import { useEffect, useRef, useState } from "react"

export interface MotionQuestion {
  question: string
  round: number
  number: number
  totalQuestions: number
  options: Array<{ label: string; image: string }>
}

export interface TadazzMotionScene {
  key: string
  mode: "intro" | "transition" | "question" | "vote" | "results"
  question?: MotionQuestion
  counts?: number[]
  seconds?: number
  reducedMotion?: boolean
}

/**
 * Runs the original, user-supplied Goldy Motion Kit in a stable isolated stage.
 * Purely presentational: the quiz state, host controls, phone votes, and all
 * question/answer authority remain in the existing Razzia components.
 */
export function TadazzMotionStage({ scene }: { scene: TadazzMotionScene }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== window.location.origin
      ) {
        return
      }
      const message = event.data as { source?: string; kind?: string }
      if (message?.source !== "tadazz-motion") return
      if (message.kind === "ready") setReady(true)
      if (message.kind === "error") setFailed(true)
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const payload = JSON.stringify(scene)
  useEffect(() => {
    if (ready && !failed) {
      frame.current?.contentWindow?.postMessage(
        { source: "tadazz-game", kind: "render", state: JSON.parse(payload) },
        window.location.origin,
      )
    }
  }, [ready, failed, payload])

  return (
    <div
      data-testid="tadazz-motion-stage"
      data-motion-ready={ready && !failed ? "true" : "false"}
      data-motion-scene={scene.mode}
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      style={{ visibility: ready && !failed ? "visible" : "hidden" }}
      aria-hidden="true"
    >
      <iframe
        ref={frame}
        title="TADAZZ Motion Stage"
        src="/motion/tadazz-motion-runtime.html"
        sandbox="allow-scripts allow-same-origin"
        loading="eager"
        tabIndex={-1}
        className="pointer-events-none block h-full w-full border-0"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
