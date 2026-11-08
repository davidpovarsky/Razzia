import { useLayoutEffect, useRef } from "react"
import type { FullShowInput } from "../FullShowScenes"
import { TADAZZ_V4_LABELS } from "../types"
import { MixerMarkup } from "./mixer-markup"
import { RevealMarkup } from "./reveal-markup"
import { createMixerRenderer } from "./mixer-renderer"
import { createRevealRenderer } from "./reveal-renderer"
import { storyElapsedSeconds } from "./story-clock"
import "./reference-stages.css"

/** Native React cards and scoped, deterministic reference choreography. */
export function ReferenceStoryScene({
  scene,
  data,
}: {
  scene: "story-assembly" | "story-live"
  data: FullShowInput
}) {
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(data)
  latest.current = data
  const labels = { ...TADAZZ_V4_LABELS, ...data.labels }
  const copy = {
    begin: labels.storyBuild,
    storytime: labels.storyReady,
    time: labels.storyTime,
    unfolds: labels.storyUnfolds,
    andNow: labels.storyNow,
    story: labels.storyTitle,
    round: `${labels.storyRound} ${String(data.round || 1).padStart(2, "0")}`,
  }
  const winners = Array.from({ length: 5 }, (_, i) => data.winners?.[i])
  const mixer = scene === "story-assembly"
  const photo = (i: number, className?: string) =>
    winners[i]?.imageUrl ? (
      <img
        className={className}
        src={winners[i]!.imageUrl!}
        alt={winners[i]?.alt || winners[i]?.title || ""}
        draggable={false}
      />
    ) : (
      <div className={className} aria-label={labels.noVotes} />
    )
  const cards = winners.map((winner, i) =>
    mixer ? (
      <div className="card-col" key={i}>
        <div className="card-shell">
          <div className="card-photo-wrap">
            {photo(i, "card-photo")}
            <div className="photo-flash" />
          </div>
          <div className="card-caption">{winner?.title || labels.noVotes}</div>
        </div>
        <div className="card-num">{String(i + 1).padStart(2, "0")}</div>
      </div>
    ) : (
      <div className="story-card" key={i}>
        <div className="card-body">
          <div className="card-image-wrap">{photo(i, "card-image")}</div>
          <div className="card-title">{winner?.title || labels.noVotes}</div>
        </div>
        <div className="card-badge">{String(i + 1).padStart(2, "0")}</div>
      </div>
    ),
  )
  const flyers = winners.map((_, i) => (
    <div key={i} className={mixer ? "flyer" : "fly-picture"}>
      {photo(i)}
      {mixer && (
        <span className="flyer-number">{String(i + 1).padStart(2, "0")}</span>
      )}
    </div>
  ))
  useLayoutEffect(() => {
    if (!root.current) return
    const render = mixer
      ? createMixerRenderer(root.current)
      : createRevealRenderer(root.current)
    let frame = 0
    let lastPaint = -1
    const paint = () => {
      const elapsed = storyElapsedSeconds(latest.current)
      root.current?.setAttribute("data-story-elapsed", elapsed.toFixed(3))
      const reduced =
        root.current
          ?.closest("[data-reduced-motion]")
          ?.getAttribute("data-reduced-motion") === "true"
      const tick = Math.floor(elapsed * (reduced ? 1 : 60))
      if (tick !== lastPaint) {
        render(elapsed, reduced)
        lastPaint = tick
      }
      frame = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(frame)
  }, [mixer])
  return (
    <div
      ref={root}
      className={`tadazz-reference-${mixer ? "mixer" : "reveal"}`}
      data-testid={mixer ? "tadazz-story-mixer" : "tadazz-story-reveal"}
      data-paused={data.scenePaused ? "true" : "false"}
    >
      {mixer ? (
        <MixerMarkup cards={cards} flyers={flyers} labels={copy} />
      ) : (
        <RevealMarkup cards={cards} flyers={flyers} labels={copy} />
      )}
    </div>
  )
}
