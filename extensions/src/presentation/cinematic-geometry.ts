import type React from "react"
import type { CinematicOverlayAnimation } from "../core/cinematic-overlays"

/**
 * Converts a `CinematicOverlayAnimation`'s normalized stage coordinates (`0..1`)
 * and `widthPct` (`1..100`) into deterministic CSS style properties relative to
 * the shared stage coordinate plane.
 */
export function computeOverlayStageStyle(
  overlay: Pick<
    CinematicOverlayAnimation,
    "position" | "anchor" | "widthPct" | "rotationDeg" | "order"
  >,
  effectiveOpacity: number,
): React.CSSProperties {
  const clampedX = Math.max(0, Math.min(1, overlay.position.x))
  const clampedY = Math.max(0, Math.min(1, overlay.position.y))
  const clampedWidthPct = Math.max(1, Math.min(100, overlay.widthPct))
  const rotation = Number.isFinite(overlay.rotationDeg)
    ? overlay.rotationDeg
    : 0

  const transforms: string[] = []
  if (overlay.anchor === "center") {
    transforms.push("translate(-50%, -50%)")
  }
  if (rotation !== 0) {
    transforms.push(`rotate(${rotation}deg)`)
  }

  return {
    position: "absolute",
    left: `${(clampedX * 100).toFixed(2)}%`,
    top: `${(clampedY * 100).toFixed(2)}%`,
    width: `${clampedWidthPct.toFixed(2)}%`,
    aspectRatio: "1 / 1",
    transform: transforms.length > 0 ? transforms.join(" ") : undefined,
    opacity: effectiveOpacity,
    zIndex: Math.max(0, Math.min(63, overlay.order)),
  }
}

/**
 * Clamps normalized pointer drag coordinates inside `[0, 1]`.
 */
export function clampNormalizedStagePoint(
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: Number(Math.max(0, Math.min(1, x)).toFixed(3)),
    y: Number(Math.max(0, Math.min(1, y)).toFixed(3)),
  }
}
