import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
} from "motion/react"
import { useEffect, useState } from "react"
import type { PublicRankEntry } from "../core/studio-timeline-schema"
import "./tadazz-leaderboard.css"

interface Props {
  entries: PublicRankEntry[]
  epochKey: string
  pointsLabel?: string
  emptyLabel?: string
}

/** Stage-only leaderboard. Reuses the server-authoritative rank; never recomputes scores. */
function AnimatedScore({ points }: { points: number }) {
  const spring = useSpring(points, { stiffness: 230, damping: 28, mass: 1 })
  const [value, setValue] = useState(points)
  useEffect(() => {
    spring.set(points)
    const cancel = spring.on("change", (latest) => setValue(Math.round(latest)))

    return () => cancel()
  }, [points, spring])

  return <span className="tdz-rank-score tabular-nums">{value}</span>
}

export function TadazzLeaderboard({
  entries,
  epochKey,
  pointsLabel,
  emptyLabel,
}: Props) {
  const reduced = useReducedMotion()
  const sorted = [...entries].sort(
    (a, b) => a.rank - b.rank || b.points - a.points,
  )
  const seen = new Map<string, number>()
  const rows = sorted.slice(0, 6).map((entry) => {
    const suffix = seen.get(entry.displayName) ?? 0
    seen.set(entry.displayName, suffix + 1)

    return { ...entry, key: `${entry.displayName}:${suffix}` }
  })

  if (rows.length === 0) {
    return <div className="tdz-rank-empty">{emptyLabel ?? ""}</div>
  }

  return (
    <ol
      className="tdz-rank-board"
      data-testid="tadazz-leaderboard"
      data-epoch={epochKey}
    >
      <AnimatePresence mode="popLayout" initial={!reduced}>
        {rows.map((entry, index) => (
          <motion.li
            layout={!reduced}
            key={entry.key}
            data-testid="tadazz-leaderboard-row"
            className="tdz-rank-row"
            initial={reduced ? false : { opacity: 0, y: 45, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduced
                ? undefined
                : { opacity: 0, x: -55, transition: { duration: 0.24 } }
            }
            transition={
              reduced
                ? { duration: 0 }
                : {
                    layout: { type: "spring", stiffness: 270, damping: 29 },
                    delay: index * 0.09,
                    duration: 0.45,
                  }
            }
          >
            <span className="tdz-rank-number">{entry.rank}</span>
            <span className="tdz-rank-name">{entry.displayName}</span>
            <div className="tdz-rank-points">
              <AnimatedScore points={entry.points} />
              <span className="tdz-rank-label">{pointsLabel ?? ""}</span>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
