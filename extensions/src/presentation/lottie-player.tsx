import {
  DotLottieReact,
  setWasmUrl,
  type DotLottie,
} from "@lottiefiles/dotlottie-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { validateLottieJson, type LottieFitMode } from "../core/lottie"

let wasmConfigured = false

export function ensureDotLottieWasmConfigured(
  customUrl = "/api/extensions/lottie-wasm",
): void {
  if (wasmConfigured) {
    return
  }

  try {
    setWasmUrl(customUrl)
    wasmConfigured = true
  } catch {
    // Ignore in environments where setWasmUrl is a no-op
  }
}

if (typeof window !== "undefined") {
  ensureDotLottieWasmConfigured()
}

export interface LottiePlayerProps {
  /** URL to a validated `/media/*.json` or `/media/*.lottie` asset */
  src?: string
  /** Pre-parsed or JSON string Lottie payload (for instant preview / tests) */
  data?: Record<string, unknown> | string
  /** Alias for `data` */
  animationData?: Record<string, unknown> | string
  loop?: boolean
  speed?: number
  fit?: LottieFitMode
  autoplay?: boolean
  /** Pause playback while keeping current frame visible */
  paused?: boolean
  /**
   * Controlled local elapsed time in milliseconds (>= 0).
   * When provided, LottiePlayer deterministically seeks to the corresponding frame
   * instead of running an independent wall-clock loop.
   */
  seekTimeMs?: number
  /** Behavior when a non-looping animation reaches its end frame */
  finish?: "hide" | "holdLastFrame"
  emptyLabel?: string
  className?: string
  testId?: string
  dataTestId?: string
  onReady?: (info: { durationMs: number; totalFrames: number }) => void
  onComplete?: () => void
  onError?: (error: string) => void
  /** Cap expensive full-screen canvas rendering without changing other players. */
  renderDevicePixelRatio?: number
  /** Frame diagnostics need not trigger React renders on every animation frame. */
  frameUpdateIntervalMs?: number
}

/**
 * Extracts a lightweight static SVG poster from inline JSON data so SSR (`renderToStaticMarkup`),
 * initial pre-WASM paint, and `prefers-reduced-motion` environments always render a valid
 * transparent vector preview immediately before the DotLottie WASM canvas takes over.
 */
function extractStaticPosterShapes(data: Record<string, unknown>): {
  w: number
  h: number
  fr: number
  ip: number
  op: number
  elements: Array<{
    key: string
    kind: "ellipse" | "rect" | "solid"
    cx?: number
    cy?: number
    rx?: number
    ry?: number
    x?: number
    y?: number
    width?: number
    height?: number
    fill: string
    opacity: number
  }>
} {
  const w = typeof data.w === "number" && data.w > 0 ? data.w : 400
  const h = typeof data.h === "number" && data.h > 0 ? data.h : 400
  const fr = typeof data.fr === "number" && data.fr > 0 ? data.fr : 60
  const ip = typeof data.ip === "number" && data.ip >= 0 ? data.ip : 0
  const op = typeof data.op === "number" && data.op > ip ? data.op : ip + 60
  const layers = Array.isArray(data.layers) ? data.layers : []
  const elements: Array<{
    key: string
    kind: "ellipse" | "rect" | "solid"
    cx?: number
    cy?: number
    rx?: number
    ry?: number
    x?: number
    y?: number
    width?: number
    height?: number
    fill: string
    opacity: number
  }> = []

  const toRgb = (arr: unknown): string => {
    if (!Array.isArray(arr) || arr.length < 3) {
      return "rgb(250, 204, 21)"
    }

    const r = Number(arr[0]) || 0
    const g = Number(arr[1]) || 0
    const b = Number(arr[2]) || 0
    const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1

    return `rgb(${Math.round(r * scale)}, ${Math.round(g * scale)}, ${Math.round(b * scale)})`
  }

  layers.forEach((rawLayer, idx) => {
    if (typeof rawLayer !== "object" || rawLayer === null) {
      return
    }
    const layer = rawLayer as Record<string, unknown>

    if (layer.ty === 1 && typeof layer.sc === "string") {
      // Do not draw full-canvas background solids in transparent overlay poster
      const sw = typeof layer.sw === "number" ? layer.sw : w
      const sh = typeof layer.sh === "number" ? layer.sh : h

      if (sw < w * 0.95 || sh < h * 0.95) {
        elements.push({
          key: `solid-${idx}`,
          kind: "solid",
          x: 0,
          y: 0,
          width: sw,
          height: sh,
          fill: layer.sc,
          opacity: 0.85,
        })
      }

      return
    }

    const shapes = Array.isArray(layer.shapes) ? layer.shapes : []
    let fill = "rgb(250, 204, 21)"
    const walk = (items: unknown[]) => {
      for (const item of items) {
        if (typeof item !== "object" || item === null) {
          continue
        }
        const s = item as Record<string, unknown>

        if (s.ty === "fl" && typeof s.c === "object" && s.c !== null) {
          fill = toRgb((s.c as Record<string, unknown>).k)
        } else if (s.ty === "gr" && Array.isArray(s.it)) {
          walk(s.it)
        }
      }
    }
    walk(shapes)
    elements.push({
      key: `shape-${idx}`,
      kind: idx % 2 === 0 ? "ellipse" : "rect",
      cx: w / 2,
      cy: h / 2,
      rx: Math.min(w, h) * 0.28,
      ry: Math.min(w, h) * 0.28,
      x: w * 0.22,
      y: h * 0.22,
      width: w * 0.56,
      height: h * 0.56,
      fill,
      opacity: 0.9,
    })
  })

  if (elements.length === 0) {
    elements.push({
      key: "fallback-0",
      kind: "ellipse",
      cx: w / 2,
      cy: h / 2,
      rx: Math.min(w, h) * 0.25,
      ry: Math.min(w, h) * 0.25,
      fill: "rgb(250, 204, 21)",
      opacity: 0.9,
    })
  }

  return { w, h, fr, ip, op, elements }
}

export const LottiePlayer: React.FC<LottiePlayerProps> = ({
  src,
  data,
  animationData,
  loop = true,
  speed = 1,
  fit = "contain",
  autoplay = true,
  paused = false,
  seekTimeMs,
  finish = "holdLastFrame",
  emptyLabel,
  className,
  testId,
  dataTestId,
  onReady,
  onComplete,
  onError,
  renderDevicePixelRatio,
  frameUpdateIntervalMs = 0,
}) => {
  const effectiveData = data ?? animationData
  const resolvedTestId = dataTestId ?? testId ?? "lottie-player"
  const clampedSpeed = Math.max(0.25, Math.min(3, speed))

  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null)
  const [isEngineReady, setIsEngineReady] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const lastFrameReport = useRef(0)
  const renderConfig = useMemo(
    () =>
      renderDevicePixelRatio === undefined
        ? undefined
        : { devicePixelRatio: renderDevicePixelRatio },
    [renderDevicePixelRatio],
  )

  useEffect(() => {
    ensureDotLottieWasmConfigured()

    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      setPrefersReducedMotion(mq.matches)
      const listener = (e: MediaQueryListEvent) =>
        setPrefersReducedMotion(e.matches)
      mq.addEventListener?.("change", listener)

      return () => mq.removeEventListener?.("change", listener)
    }

    return undefined
  }, [])

  // Validate inline JSON data synchronously when provided
  const inlineValidation = useMemo(() => {
    if (effectiveData === undefined) {
      return null
    }

    return validateLottieJson(effectiveData)
  }, [effectiveData])

  useEffect(() => {
    if (inlineValidation && !inlineValidation.ok) {
      setRuntimeError(inlineValidation.error)
      onErrorRef.current?.(inlineValidation.error)
    } else {
      setRuntimeError(null)
    }
  }, [inlineValidation])

  // Reset completion state when source or inline data changes
  useEffect(() => {
    setHasCompletedOnce(false)
    setCurrentFrame(0)
    setIsEngineReady(false)
  }, [src, effectiveData])

  const dotLottieRefCallback = useCallback((instance: DotLottie | null) => {
    setDotLottie(instance)
  }, [])

  // Attach DotLottie lifecycle listeners and clean up on unmount
  useEffect(() => {
    if (!dotLottie) {
      return undefined
    }

    const handleLoad = () => {
      const frames = Math.max(1, dotLottie.totalFrames || 60)
      const durSec = dotLottie.duration || frames / 60
      const durMs = Math.max(100, Math.round(durSec * 1000))
      setTotalFrames(frames)
      setDurationMs(durMs)
      setIsEngineReady(true)
      setRuntimeError(null)
      onReadyRef.current?.({ durationMs: durMs, totalFrames: frames })

      if (prefersReducedMotion) {
        dotLottie.pause()
        const midFrame = Math.floor(frames * 0.5)
        dotLottie.setFrame(midFrame)
        setCurrentFrame(midFrame)
      } else if (seekTimeMs !== undefined) {
        dotLottie.pause()
      } else if (paused || !autoplay) {
        dotLottie.pause()
      }
    }

    const handleFrame = (evt: { currentFrame: number }) => {
      const now = performance.now()
      if (now - lastFrameReport.current < frameUpdateIntervalMs) return
      lastFrameReport.current = now
      setCurrentFrame(Math.round(evt.currentFrame))
    }

    const handleComplete = () => {
      setCurrentFrame(Math.max(0, dotLottie.totalFrames - 1))
      setHasCompletedOnce(true)
      onCompleteRef.current?.()
    }

    const handleLoadError = (evt: { error?: Error }) => {
      const msg = evt?.error?.message || "errors:extensions.invalidLottieJson"
      setRuntimeError(msg)
      onErrorRef.current?.(msg)
    }

    dotLottie.addEventListener("load", handleLoad)
    dotLottie.addEventListener("frame", handleFrame)
    dotLottie.addEventListener("complete", handleComplete)
    dotLottie.addEventListener("loadError", handleLoadError)
    dotLottie.addEventListener("renderError", handleLoadError)

    if (dotLottie.isLoaded) {
      handleLoad()
    }

    return () => {
      dotLottie.removeEventListener("load", handleLoad)
      dotLottie.removeEventListener("frame", handleFrame)
      dotLottie.removeEventListener("complete", handleComplete)
      dotLottie.removeEventListener("loadError", handleLoadError)
      dotLottie.removeEventListener("renderError", handleLoadError)
    }
  }, [
    dotLottie,
    prefersReducedMotion,
    autoplay,
    paused,
    seekTimeMs,
    frameUpdateIntervalMs,
  ])

  // Synchronize controlled seekTimeMs or play/pause state with DotLottie instance
  useEffect(() => {
    if (!dotLottie || !isEngineReady) {
      return
    }

    const frames = Math.max(1, dotLottie.totalFrames || totalFrames || 60)
    const durMs = Math.max(
      100,
      durationMs || Math.round((dotLottie.duration || 1) * 1000),
    )

    if (prefersReducedMotion) {
      if (dotLottie.isPlaying) {
        dotLottie.pause()
      }

      const representativeFrame = Math.floor(frames * 0.5)
      dotLottie.setFrame(representativeFrame)
      setCurrentFrame(representativeFrame)

      return
    }

    if (seekTimeMs !== undefined) {
      if (dotLottie.isPlaying) {
        dotLottie.pause()
      }

      const effectiveElapsedMs = Math.max(0, seekTimeMs) * clampedSpeed

      if (!loop && effectiveElapsedMs >= durMs) {
        const lastFrame = Math.max(0, frames - 1)

        if (Math.abs(dotLottie.currentFrame - lastFrame) >= 0.5) {
          dotLottie.setFrame(lastFrame)
        }

        setCurrentFrame(lastFrame)

        if (!hasCompletedOnce) {
          setHasCompletedOnce(true)
          onCompleteRef.current?.()
        }

        return
      }

      if (hasCompletedOnce && effectiveElapsedMs < durMs) {
        setHasCompletedOnce(false)
      }

      const cycleMs = loop
        ? effectiveElapsedMs % durMs
        : Math.min(durMs, effectiveElapsedMs)
      const targetFrame = Math.min(
        frames - 1,
        Math.max(0, (cycleMs / durMs) * Math.max(1, frames - 1)),
      )

      if (Math.abs(dotLottie.currentFrame - targetFrame) >= 0.25) {
        dotLottie.setFrame(targetFrame)
        setCurrentFrame(Math.round(targetFrame))
      }

      return
    }

    if (paused || !autoplay) {
      if (dotLottie.isPlaying) {
        dotLottie.pause()
      }
    } else if (!dotLottie.isPlaying && (loop || !hasCompletedOnce)) {
      dotLottie.play()
    }
  }, [
    dotLottie,
    isEngineReady,
    seekTimeMs,
    clampedSpeed,
    loop,
    paused,
    autoplay,
    prefersReducedMotion,
    totalFrames,
    durationMs,
    hasCompletedOnce,
  ])

  const shouldHideAfterFinish =
    !loop && finish === "hide" && hasCompletedOnce && !prefersReducedMotion

  const staticPoster = useMemo(() => {
    if (inlineValidation && inlineValidation.ok) {
      return extractStaticPosterShapes(inlineValidation.data)
    }

    return null
  }, [inlineValidation])

  // Calculate deterministic fallback frame when WASM hasn't initialized yet (e.g. SSR or fast seek test)
  const effectiveFrame = useMemo(() => {
    if (isEngineReady) {
      return currentFrame
    }

    const posterFr = staticPoster?.fr ?? 60
    const posterIp = staticPoster?.ip ?? 0
    const posterOp = staticPoster?.op ?? 120
    const span = Math.max(1, posterOp - posterIp)

    if (seekTimeMs !== undefined) {
      const elapsedFrames =
        (Math.max(0, seekTimeMs) / 1000) * posterFr * clampedSpeed
      const rawFrame = loop
        ? posterIp + (elapsedFrames % span)
        : Math.min(posterOp, posterIp + elapsedFrames)

      return Math.round(rawFrame)
    }

    return posterIp
  }, [
    isEngineReady,
    currentFrame,
    staticPoster,
    seekTimeMs,
    clampedSpeed,
    loop,
  ])

  // All Hooks must run before an empty/invalid source can return early.
  const trimmedSrc = src?.trim() ?? ""

  if (!trimmedSrc && effectiveData === undefined) {
    if (!emptyLabel) {
      return null
    }

    return (
      <div
        data-testid={`${resolvedTestId}-empty`}
        className={
          className ??
          "flex items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-xs text-white/60"
        }
      >
        {emptyLabel}
      </div>
    )
  }

  if (runtimeError || (inlineValidation && !inlineValidation.ok)) {
    return (
      <div
        data-testid={`${resolvedTestId}-error`}
        data-lottie-error={
          runtimeError ??
          (inlineValidation && !inlineValidation.ok
            ? inlineValidation.error
            : "invalid")
        }
        className={
          className ??
          "flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200"
        }
      >
        Lottie preview unavailable
      </div>
    )
  }

  return (
    <div
      data-testid={resolvedTestId}
      data-lottie-engine="dotlottie-web"
      data-lottie-ready={isEngineReady ? "true" : "false"}
      data-lottie-fit={fit}
      data-lottie-loop={loop ? "true" : "false"}
      data-lottie-speed={String(clampedSpeed)}
      data-lottie-reduced-motion={prefersReducedMotion ? "true" : "false"}
      data-lottie-frame={String(effectiveFrame)}
      data-lottie-hidden={shouldHideAfterFinish ? "true" : "false"}
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden select-none ${className ?? "relative flex h-full w-full items-center justify-center"}`}
      style={{
        opacity: shouldHideAfterFinish ? 0 : 1,
        backgroundColor: "transparent",
      }}
    >
      <DotLottieReact
        renderConfig={renderConfig}
        src={trimmedSrc || undefined}
        data={
          !trimmedSrc && inlineValidation && inlineValidation.ok
            ? inlineValidation.sanitizedJson
            : undefined
        }
        loop={loop}
        speed={clampedSpeed}
        autoplay={
          autoplay &&
          !paused &&
          !prefersReducedMotion &&
          seekTimeMs === undefined
        }
        layout={{
          fit: fit === "cover" ? "cover" : "contain",
          align: [0.5, 0.5],
        }}
        stateMachineConfig={{
          openUrlPolicy: {
            requireUserInteraction: true,
            whitelist: [],
          },
        }}
        dotLottieRefCallback={dotLottieRefCallback}
        className="pointer-events-none h-full w-full"
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "transparent",
          pointerEvents: "none",
        }}
      />
      {staticPoster && !isEngineReady && (
        <svg
          data-testid={`${resolvedTestId}-svg`}
          viewBox={`0 0 ${staticPoster.w} ${staticPoster.h}`}
          preserveAspectRatio={
            fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
          }
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {staticPoster.elements.map((el) =>
            el.kind === "ellipse" ? (
              <ellipse
                key={el.key}
                cx={el.cx}
                cy={el.cy}
                rx={el.rx}
                ry={el.ry}
                fill={el.fill}
                opacity={el.opacity}
              />
            ) : (
              <rect
                key={el.key}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                rx={8}
                fill={el.fill}
                opacity={el.opacity}
              />
            ),
          )}
        </svg>
      )}
    </div>
  )
}
