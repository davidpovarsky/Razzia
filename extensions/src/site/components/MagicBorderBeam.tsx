/**
 * Upstream component: Magic UI Border Beam (actual source, not a recreation).
 * Source: https://github.com/magicuidesign/magicui/blob/1ac985adca3cdfab9b1739253fd14209687c4e9c/apps/www/registry/magicui/border-beam.tsx
 * Licence: MIT; Copyright (c) Magic UI.
 * Local change: join the supplied class strings locally instead of the upstream utils alias.
 * Provenance / integration status: docs/extensions/UNIFIED_SITE_SOURCES_20261110.md.
 */
"use client"

import {
  motion,
  useReducedMotion,
  type MotionStyle,
  type Transition,
} from "motion/react"

const cn = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(" ")

interface BorderBeamProps {
  /**
   * The size of the border beam.
   */
  size?: number
  /**
   * The duration of the border beam.
   */
  duration?: number
  /**
   * The delay of the border beam.
   */
  delay?: number
  /**
   * The color of the border beam from.
   */
  colorFrom?: string
  /**
   * The color of the border beam to.
   */
  colorTo?: string
  /**
   * The motion transition of the border beam.
   */
  transition?: Transition
  /**
   * The class name of the border beam.
   */
  className?: string
  /**
   * The style of the border beam.
   */
  style?: React.CSSProperties
  /**
   * Whether to reverse the animation direction.
   */
  reverse?: boolean
  /**
   * The initial offset position (0-100).
   */
  initialOffset?: number
  /**
   * The border width of the beam.
   */
  borderWidth?: number
}

export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  const prefersReducedMotion = useReducedMotion()
  const offsetDistance = reverse
    ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
    : [`${initialOffset}%`, `${100 + initialOffset}%`]

  return (
    <div
      className="magic-source-beam pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={
        {
          "--border-beam-width": `${borderWidth}px`,
        } as React.CSSProperties
      }
    >
      <motion.div
        className={cn(
          "magic-source-beam-inner absolute aspect-square",
          "bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent",
          className,
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--color-from": colorFrom,
            "--color-to": colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: prefersReducedMotion
            ? `${initialOffset}%`
            : offsetDistance,
        }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
          ...transition,
        }}
      />
    </div>
  )
}
