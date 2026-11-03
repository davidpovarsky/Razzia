import { useEffect, useMemo, useRef, useState } from "react"
import { validateLottieJson, type LottieFitMode, type LottieMeta } from "../core/lottie"

export interface LottiePlayerProps {
  src?: string
  animationData?: Record<string, unknown> | string
  loop?: boolean
  speed?: number
  fit?: LottieFitMode
  autoplay?: boolean
  className?: string
  testId?: string
  onComplete?: () => void
  onError?: (error: string) => void
}

interface ParsedBodymovin {
  meta: LottieMeta
  raw: Record<string, unknown>
}

const interpolateNumber = (
  prop: unknown,
  frame: number,
  defaultVal: number,
): number => {
  if (!prop || typeof prop !== "object") {
    return defaultVal
  }
  const obj = prop as Record<string, unknown>
  const k = obj.k
  if (typeof k === "number") {
    return k
  }
  if (Array.isArray(k)) {
    if (typeof k[0] === "number") {
      return k[0]
    }
    // Keyframe array
    for (let i = 0; i < k.length; i += 1) {
      const kf = k[i] as Record<string, unknown> | undefined
      const nextKf = k[i + 1] as Record<string, unknown> | undefined
      if (!kf || typeof kf.t !== "number") {
        continue
      }
      const startVal = Array.isArray(kf.s)
        ? Number(kf.s[0] ?? defaultVal)
        : defaultVal
      if (!nextKf || typeof nextKf.t !== "number" || frame <= kf.t) {
        return startVal
      }
      if (frame >= kf.t && frame <= nextKf.t) {
        const endArr = Array.isArray(kf.e)
          ? kf.e
          : Array.isArray(nextKf.s)
            ? nextKf.s
            : [startVal]
        const endVal = Number(endArr[0] ?? startVal)
        const span = Math.max(1e-5, nextKf.t - kf.t)
        const ratio = Math.min(1, Math.max(0, (frame - kf.t) / span))
        return startVal + (endVal - startVal) * ratio
      }
    }
  }
  return defaultVal
}

const interpolateVec2 = (
  prop: unknown,
  frame: number,
  defaultVec: [number, number],
): [number, number] => {
  if (!prop || typeof prop !== "object") {
    return defaultVec
  }
  const obj = prop as Record<string, unknown>
  const k = obj.k
  if (Array.isArray(k)) {
    if (typeof k[0] === "number") {
      return [
        Number(k[0] ?? defaultVec[0]),
        Number(k[1] ?? k[0] ?? defaultVec[1]),
      ]
    }
    for (let i = 0; i < k.length; i += 1) {
      const kf = k[i] as Record<string, unknown> | undefined
      const nextKf = k[i + 1] as Record<string, unknown> | undefined
      if (!kf || typeof kf.t !== "number") {
        continue
      }
      const sArr = Array.isArray(kf.s) ? kf.s : defaultVec
      const s0 = Number(sArr[0] ?? defaultVec[0])
      const s1 = Number(sArr[1] ?? s0)
      if (!nextKf || typeof nextKf.t !== "number" || frame <= kf.t) {
        return [s0, s1]
      }
      if (frame >= kf.t && frame <= nextKf.t) {
        const eArr = Array.isArray(kf.e)
          ? kf.e
          : Array.isArray(nextKf.s)
            ? nextKf.s
            : [s0, s1]
        const e0 = Number(eArr[0] ?? s0)
        const e1 = Number(eArr[1] ?? s1)
        const span = Math.max(1e-5, nextKf.t - kf.t)
        const ratio = Math.min(1, Math.max(0, (frame - kf.t) / span))
        return [s0 + (e0 - s0) * ratio, s1 + (e1 - s1) * ratio]
      }
    }
  }
  return defaultVec
}

const extractColorCss = (prop: unknown): string => {
  if (!prop || typeof prop !== "object") {
    return "#38bdf8"
  }
  const obj = prop as Record<string, unknown>
  const k = obj.k
  if (Array.isArray(k) && typeof k[0] === "number") {
    const r = Number(k[0] ?? 0)
    const g = Number(k[1] ?? 0)
    const b = Number(k[2] ?? 0)
    const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1
    return `rgb(${Math.round(r * scale)}, ${Math.round(g * scale)}, ${Math.round(b * scale)})`
  }
  return "#38bdf8"
}

/**
 * Safe, expression-free Bodymovin SVG player for user-supplied Lottie JSON files.
 * Validates all input through `validateLottieJson`, respects `prefers-reduced-motion`,
 * and triggers `onComplete` deterministically when non-looping playback finishes.
 */
export const LottiePlayer = ({
  src,
  animationData,
  loop = true,
  speed = 1,
  fit = "contain",
  autoplay = true,
  className = "",
  testId = "tada-lottie-player",
  onComplete,
  onError,
}: LottiePlayerProps) => {
  const [fetchedText, setFetchedText] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [frame, setFrame] = useState<number>(0)
  const completedRef = useRef(false)

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  useEffect(() => {
    completedRef.current = false
    setFetchError(null)

    if (animationData) {
      setFetchedText(null)
      return
    }

    if (!src) {
      setFetchedText(null)
      return
    }

    let cancelled = false
    fetch(src)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.text()
      })
      .then((txt) => {
        if (!cancelled) {
          setFetchedText(txt)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Failed to load Lottie JSON"
          setFetchError(msg)
          onError?.(msg)
        }
      })

    return () => {
      cancelled = true
    }
  }, [src, animationData, onError])

  const parsed = useMemo<ParsedBodymovin | null>(() => {
    const sourceInput = animationData ?? fetchedText
    if (!sourceInput) {
      return null
    }
    const validation = validateLottieJson(sourceInput)
    if (!validation.ok || !validation.meta) {
      const errMsg = validation.error ?? "Invalid Lottie JSON"
      onError?.(errMsg)
      return null
    }
    const rawObj =
      typeof sourceInput === "string"
        ? (JSON.parse(sourceInput) as Record<string, unknown>)
        : sourceInput
    return {
      meta: validation.meta,
      raw: rawObj,
    }
  }, [animationData, fetchedText, onError])

  useEffect(() => {
    if (!parsed) {
      return
    }
    const { inPoint, outPoint, frameRate } = parsed.meta
    const totalFrames = Math.max(1, outPoint - inPoint)

    if (prefersReducedMotion || !autoplay) {
      setFrame(inPoint + totalFrames * 0.5)
      return
    }

    setFrame(inPoint)
    completedRef.current = false

    const effectiveSpeed = Math.max(0.25, Math.min(3, speed || 1))
    const durationMs = (totalFrames / frameRate) * 1000 / effectiveSpeed
    const startTime = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startTime)
      if (!loop && elapsed >= durationMs) {
        setFrame(outPoint)
        if (!completedRef.current) {
          completedRef.current = true
          onComplete?.()
        }
        return
      }
      const progress = (elapsed % durationMs) / durationMs
      setFrame(inPoint + progress * totalFrames)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [parsed, loop, speed, autoplay, prefersReducedMotion, onComplete])

  if (fetchError || (!parsed && (src || animationData) && fetchedText !== null)) {
    return (
      <div
        data-testid={`${testId}-error`}
        className={`flex items-center justify-center rounded-xl border border-white/15 bg-black/30 p-4 text-xs text-white/70 ${className}`}
      >
        Unable to render Lottie animation
      </div>
    )
  }

  if (!parsed) {
    return null
  }

  const { width, height } = parsed.meta
  const layers = Array.isArray(parsed.raw.layers)
    ? (parsed.raw.layers as Array<Record<string, unknown>>)
    : []

  const preserveAspectRatio =
    fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"

  return (
    <div
      data-testid={testId}
      data-fit={fit}
      data-loop={String(loop)}
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={preserveAspectRatio}
        className="h-full w-full"
        aria-label={parsed.meta.name || "Lottie animation"}
      >
        {layers
          .slice()
          .reverse()
          .map((layer, idx) => {
            const ip = typeof layer.ip === "number" ? layer.ip : parsed.meta.inPoint
            const op = typeof layer.op === "number" ? layer.op : parsed.meta.outPoint
            if (frame < ip || frame > op) {
              return null
            }

            const ks = (layer.ks ?? {}) as Record<string, unknown>
            const pos = interpolateVec2(ks.p, frame, [width / 2, height / 2])
            const anchor = interpolateVec2(ks.a, frame, [0, 0])
            const scale = interpolateVec2(ks.s, frame, [100, 100])
            const rot = interpolateNumber(ks.r, frame, 0)
            const opacity = Math.min(
              1,
              Math.max(0, interpolateNumber(ks.o, frame, 100) / 100),
            )

            const transformStr = `translate(${pos[0]}, ${pos[1]}) rotate(${rot}) scale(${scale[0] / 100}, ${scale[1] / 100}) translate(${-anchor[0]}, ${-anchor[1]})`

            // Solid layer (ty === 1)
            if (layer.ty === 1 && typeof layer.sc === "string") {
              const sw = typeof layer.sw === "number" ? layer.sw : width
              const sh = typeof layer.sh === "number" ? layer.sh : height
              return (
                <g key={idx} transform={transformStr} opacity={opacity}>
                  <rect width={sw} height={sh} fill={layer.sc} />
                </g>
              )
            }

            // Shape layer (ty === 4)
            const shapes = Array.isArray(layer.shapes)
              ? (layer.shapes as Array<Record<string, unknown>>)
              : []

            // Flatten 1 level of groups ("gr")
            const items: Array<Record<string, unknown>> = []
            for (const item of shapes) {
              if (item.ty === "gr" && Array.isArray(item.it)) {
                items.push(...(item.it as Array<Record<string, unknown>>))
              } else {
                items.push(item)
              }
            }

            const fillItem = items.find((it) => it.ty === "fl")
            const strokeItem = items.find((it) => it.ty === "st")
            const fillColor = fillItem ? extractColorCss(fillItem.c) : "#38bdf8"
            const strokeColor = strokeItem
              ? extractColorCss(strokeItem.c)
              : undefined
            const strokeWidth = strokeItem
              ? interpolateNumber(strokeItem.w, frame, 2)
              : 0

            return (
              <g key={idx} transform={transformStr} opacity={opacity}>
                {items.map((it, sIdx) => {
                  if (it.ty === "el") {
                    const sz = interpolateVec2(it.s, frame, [80, 80])
                    const p = interpolateVec2(it.p, frame, [0, 0])
                    return (
                      <ellipse
                        key={sIdx}
                        cx={p[0]}
                        cy={p[1]}
                        rx={Math.abs(sz[0]) / 2}
                        ry={Math.abs(sz[1]) / 2}
                        fill={fillItem ? fillColor : "none"}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                      />
                    )
                  }
                  if (it.ty === "rc") {
                    const sz = interpolateVec2(it.s, frame, [100, 40])
                    const p = interpolateVec2(it.p, frame, [0, 0])
                    const r = interpolateNumber(it.r, frame, 8)
                    return (
                      <rect
                        key={sIdx}
                        x={p[0] - Math.abs(sz[0]) / 2}
                        y={p[1] - Math.abs(sz[1]) / 2}
                        width={Math.abs(sz[0])}
                        height={Math.abs(sz[1])}
                        rx={r}
                        fill={fillItem ? fillColor : "none"}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                      />
                    )
                  }
                  return null
                })}
                {items.length === 0 && (
                  <circle
                    cx={0}
                    cy={0}
                    r={Math.min(width, height) * 0.18}
                    fill={fillColor}
                  />
                )}
              </g>
            )
          })}
      </svg>
    </div>
  )
}
