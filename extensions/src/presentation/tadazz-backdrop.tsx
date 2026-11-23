import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { TadazzBackdropState } from "../core/tadazz-appearance"
import "./tadazz-backdrop.css"

export const TADAZZ_IMAGE_URL = new URL(
  "../../assets/tadazz-question-background.png",
  import.meta.url,
).href

const W = 1920
const H = 1080
const FPS = 30

/** Deterministic particles; no random redraw and no canvas work while hidden. */
export function buildTadazzParticles(count = 34) {
  return Array.from({ length: count }, (_, i) => ({
    t: i / count,
    speed: 0.0008 + ((i * 53) % 47) / 47000,
    size: 1.2 + ((i * 13) % 23) / 10,
    alpha: 0.15 + ((i * 11) % 35) / 100,
    offset: (((i * 127) % 360) / 180) * Math.PI,
    gold: i % 2 === 0,
  }))
}

/** Match original 1920x1080 coordinates regardless of aspect ratio. */
export function tadazzArtScale(
  width: number,
  height: number,
  fit: "cover" | "contain",
) {
  return fit === "contain"
    ? Math.min(width / W, height / H)
    : Math.max(width / W, height / H)
}

export interface TadazzAnimatedBackdropProps {
  state: TadazzBackdropState
  className?: string
  onImageFailure?: () => void
}

export function TadazzAnimatedBackdrop({
  state,
  className,
  onImageFailure,
}: TadazzAnimatedBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [state.url])
  const enabled =
    (state.source === "tadazz" || state.source === "static") &&
    Boolean(state.url) &&
    !broken
  const moving =
    enabled &&
    state.source === "tadazz" &&
    state.animate &&
    !hidden &&
    !reducedMotion
  const particles = useMemo(() => buildTadazzParticles(), [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const root = rootRef.current

    if (!root) {
      return
    }

    const measure = () => {
      const { width, height } = root.getBoundingClientRect()

      if (width > 0 && height > 0) {
        setScale(tadazzArtScale(width, height, state.fit))
      }
    }
    measure()
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    observer?.observe(root)
    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [enabled, state.fit])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReducedMotion(media.matches)
    sync()
    media.addEventListener("change", sync)
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener("visibilitychange", onVisibility)
    onVisibility()

    return () => {
      media.removeEventListener("change", sync)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!moving || !canvas) {
      return
    }

    const ctx = canvas.getContext("2d", { alpha: true })

    if (!ctx) {
      return
    }

    const ratio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
    canvas.width = W * ratio
    canvas.height = H * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    let raf = 0
    let lastDrawn = -Infinity
    const intensity = Math.max(0, Math.min(1.5, state.intensity))
    const frame = (now: number) => {
      raf = window.requestAnimationFrame(frame)

      if (now - lastDrawn < 1000 / FPS) {
        return
      }

      lastDrawn = now
      ctx.clearRect(0, 0, W, H)
      for (const p of particles) {
        const phase = (p.t + now * p.speed) % 1
        const angle = phase * 2 * Math.PI + p.offset * 0.04
        const x = W * 0.505 + Math.cos(angle) * W * 0.245
        const y = H * 0.47 + Math.sin(angle) * H * 0.102
        const twinkle = (Math.sin(angle - 0.2) + 1) / 2
        const alpha = p.alpha * (0.45 + twinkle * 0.85) * intensity
        const radius = p.size * (0.8 + twinkle * 0.6) * (0.9 + intensity * 0.15)
        ctx.beginPath()
        ctx.fillStyle = p.gold
          ? `rgba(255,198,68,${alpha})`
          : `rgba(245,104,255,${alpha * 0.95})`
        ctx.shadowBlur = 12 * intensity
        ctx.shadowColor = p.gold
          ? "rgba(255,198,68,.75)"
          : "rgba(245,104,255,.68)"
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }
    raf = window.requestAnimationFrame(frame)

    return () => {
      window.cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, W, H)
    }
  }, [moving, state.intensity, particles])

  if (!enabled) {
    return null
  }

  const style = {
    transform: `translate(-50%, -50%) scale(${scale || 1})`,
    visibility: scale > 0 ? "visible" : "hidden",
    "--tdz-intensity": String(Math.max(0, Math.min(1.5, state.intensity))),
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-testid="tadazz-animated-background"
      className={`tdz-artbackdrop${moving ? "" : "tdz-artbackdrop--still"}${className ? ` ${className}` : ""}`}
    >
      <div className="tdz-artbackdrop__art" style={style}>
        <img
          className="tdz-artbackdrop__image"
          style={
            state.source === "static" ? { objectFit: state.fit } : undefined
          }
          src={state.url}
          alt=""
          draggable={false}
          onError={() => {
            setBroken(true)
            onImageFailure?.()
          }}
        />
        {moving && (
          <div className="tdz-artbackdrop__fx">
            <div className="tdz-artbackdrop__soft" />
            <div className="tdz-artbackdrop__beam tdz-artbackdrop__beam--1" />
            <div className="tdz-artbackdrop__beam tdz-artbackdrop__beam--2" />
            <div className="tdz-artbackdrop__beam tdz-artbackdrop__beam--3" />
            <div className="tdz-artbackdrop__beam tdz-artbackdrop__beam--4" />
            <div className="tdz-artbackdrop__edge tdz-artbackdrop__edge--left" />
            <div className="tdz-artbackdrop__edge tdz-artbackdrop__edge--right" />
            <div className="tdz-artbackdrop__glint tdz-artbackdrop__glint--left" />
            <div className="tdz-artbackdrop__glint tdz-artbackdrop__glint--right" />
            <canvas ref={canvasRef} className="tdz-artbackdrop__particles" />
            <div className="tdz-artbackdrop__floor" />
            <div className="tdz-artbackdrop__bulbs" />
            <div className="tdz-artbackdrop__vignette" />
          </div>
        )}
      </div>
    </div>
  )
}
