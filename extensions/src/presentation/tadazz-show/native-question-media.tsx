import { useEffect, useRef } from "react"
import type { QuestionReveal } from "../../core/media"
import { RevealMedia } from "../../media/reveal-media"

/** Original native question-media markup, shared with the readonly stage. */
export function NativeQuestionMedia({
  media,
  alt,
  muted = false,
  controls = true,
  controlledTimeMs,
  controlledPaused,
  reveal,
  serverStartedAt,
  currentEpoch,
  isManager,
  isManuallyRevealed,
  reducedMotion,
}: {
  media: { type?: string; url: string }
  alt: string
  muted?: boolean
  controls?: boolean
  controlledTimeMs?: number
  controlledPaused?: boolean
  reveal?: QuestionReveal
  serverStartedAt?: number
  currentEpoch?: number
  isManager?: boolean
  isManuallyRevealed?: boolean
  reducedMotion?: boolean
}) {
  const element = useRef<HTMLMediaElement | null>(null)
  useEffect(() => {
    if (controlledTimeMs === undefined) {
      return
    }

    const node = element.current

    if (!node) {
      return
    }

    const synchronize = () => {
      const time = Math.max(0, controlledTimeMs / 1000)

      if (
        Number.isFinite(node.duration) &&
        node.duration > 0 &&
        Math.abs(node.currentTime - time) > 0.25
      ) {
        node.currentTime = Math.min(time, node.duration)
      }

      if (controlledPaused ?? true) {
        node.pause()
      } else if (node.paused && !node.ended) {
        void node.play().catch(() => undefined)
      }
    }
    synchronize()
    node.addEventListener("loadedmetadata", synchronize)

    return () => node.removeEventListener("loadedmetadata", synchronize)
  }, [controlledTimeMs, controlledPaused, media.url])
  const playing = controlledPaused === undefined || !controlledPaused

  if (media.type === "audio") {
    return (
      <audio
        ref={(node) => {
          element.current = node
        }}
        src={media.url}
        autoPlay={playing}
        muted={muted}
        controls={controls}
        className="absolute bottom-3 left-1/2 z-30 w-full max-w-md -translate-x-1/2 rounded-md"
        data-testid="tadazz-question-audio"
      />
    )
  }

  const image =
    reveal && reveal.effect !== "none" ? (
      <RevealMedia
        src={media.url}
        alt={alt}
        reveal={reveal}
        serverStartedAt={serverStartedAt}
        currentEpoch={currentEpoch}
        isManager={isManager}
        isManuallyRevealed={isManuallyRevealed}
        reducedMotion={reducedMotion}
        controlledTimeMs={controlledTimeMs}
        className="h-full w-full"
        mediaClassName="h-full !max-h-full w-full"
      />
    ) : (
      <img src={media.url} alt={alt} style={{ objectFit: "contain" }} />
    )

  return (
    <div className="tz-scene-media" data-testid="tadazz-question-media">
      {media.type === "video" ? (
        <video
          ref={(node) => {
            element.current = node
          }}
          src={media.url}
          autoPlay={playing}
          playsInline
          muted={muted}
          style={{ objectFit: "contain" }}
        />
      ) : (
        image
      )}
    </div>
  )
}
