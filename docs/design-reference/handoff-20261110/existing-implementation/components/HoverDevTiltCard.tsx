/**
 * Original source: Hover.dev "Hover Tilt Card" (Free), TypeScript/Motion variant.
 * https://www.hover.dev/components/cards (Hover Tilt Card / CODE / react/typescript/tailwind/motion)
 * Saved ORIGINAL file: docs/design-reference/upstream/HoverDev-TiltCard-original.tsx
 * Original SHA256: 8e9b71be0cd7ea646c6b534804cffe7841d8404d213d1bd4fe52f574b3a44859
 * Adaptations: export a reusable article with children; replace the example's
 * demo dimensions/markup with the original TADAZZ game-card CSS class; reduce
 * rotation range from 32.5 to 8 for near-identical at-rest visual fidelity;
 * add prefers-reduced-motion handling. Algorithm, Motion hooks, event formulas
 * and reset are directly adapted from the published source.
 * Exact attribution and commercial-license verification status:
 * docs/design-reference/COMPONENT_SOURCES.md.
 */
import { useRef, type MouseEvent, type ReactNode } from "react"
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react"

const ROTATION_RANGE = 8
const HALF_ROTATION_RANGE = ROTATION_RANGE / 2

export function HoverDevTiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const xSpring = useSpring(x)
  const ySpring = useSpring(y)
  const transform = useMotionTemplate`rotateX(${xSpring}deg) rotateY(${ySpring}deg)`

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    if (!ref.current || prefersReducedMotion) {
      return
    }

    const rect = ref.current.getBoundingClientRect()
    const { width, height } = rect

    if (!width || !height) {
      return
    }

    const mouseX = (event.clientX - rect.left) * ROTATION_RANGE
    const mouseY = (event.clientY - rect.top) * ROTATION_RANGE
    const rX = (mouseY / height - HALF_ROTATION_RANGE) * -1
    const rY = mouseX / width - HALF_ROTATION_RANGE
    x.set(rX)
    y.set(rY)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.article
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transformStyle: "preserve-3d",
        transform: prefersReducedMotion ? "none" : transform,
      }}
      className="game-card"
    >
      {children}
    </motion.article>
  )
}
