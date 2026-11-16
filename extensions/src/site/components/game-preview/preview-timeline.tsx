import { requireLibraryValue } from "../../../core/show-library/required"
// oxlint-disable typescript/no-unnecessary-condition -- Chapter navigation indexes may be absent at runtime.
import { canSeekChapter } from "./contracts"
import { chapterKeyTarget, isSeekableMediaTime } from "./timeline-input"
import type { GamePreviewController } from "./use-game-preview"
import { useEffect, useRef, useState } from "react"

export function PreviewTimeline({
  controller,
}: {
  controller: GamePreviewController
}) {
  const { session, state, text, run } = controller
  const index =
    session && state.status === "ready"
      ? Math.max(
          0,
          session.chapters.findIndex((c) => c.id === state.snapshot.chapterId),
        )
      : 0
  const requested = useRef(index)
  const intent = useRef(0),
    seeking = useRef(false)
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)
  useEffect(() => {
    intent.current += 1
    seeking.current = false
    setPendingIndex(null)

    return () => {
      intent.current += 1
      seeking.current = false
    }
  }, [session])

  if (!session || state.status !== "ready" || !text) {
    return null
  }

  if (state.snapshot.screenPhase === "lobby") {
    return (
      <div className="game-preview-timeline" role="status">
        {text("lobby")}
      </div>
    )
  }

  const chapter = session.chapters[index]
  const seek = (target: number) => {
    const next = session.chapters[target]

    if (next && canSeekChapter(session, next)) {
      intent.current += 1

      const ticket = intent.current
      seeking.current = true
      requested.current = target
      setPendingIndex(target)
      void run((s, signal) => s.seekChapter(next.id, signal)).finally(() => {
        if (ticket !== intent.current) {
          return
        }

        seeking.current = false
        setPendingIndex(null)
      })
    }
  }
  const inputIndex = pendingIndex ?? index
  const inputChapter = session.chapters[inputIndex]

  return (
    <div className="game-preview-timeline">
      <div className="game-preview-segments" aria-hidden="true">
        {session.chapters.map((item, n) => (
          <span key={item.id} data-passed={n <= index || undefined} />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={session.chapters.length - 1}
        step={1}
        value={inputIndex}
        aria-busy={controller.pending}
        aria-label={text("chapters")}
        aria-valuetext={`${controller.pending ? `${text("loading")} ` : ""}${text("chapter", { number: inputIndex + 1, count: session.chapters.length, title: inputChapter.title })}`}
        disabled={!canSeekChapter(session, chapter)}
        onPointerDown={(event) => {
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => seek(Number(event.target.value))}
        onKeyDown={(event) => {
          // React can commit an older pending=false frame between key events.
          // Keep the user's latest in-flight intent until that exact seek settles.
          const current = seeking.current
            ? requested.current
            : Math.max(
                0,
                session.chapters.findIndex(
                  (item) => item.id === session.snapshot().chapterId,
                ),
              )
          const target = chapterKeyTarget(
            event.key,
            current,
            session.chapters.length,
          )

          if (target !== null) {
            event.preventDefault()
            event.stopPropagation()
            seek(target)
          }
        }}
      />
      <output>
        {chapter.title} · {index + 1}/{session.chapters.length}
      </output>
      {session.seekMedia &&
        state.snapshot.media &&
        state.snapshot.media.seekable.length > 0 && (
          <input
            type="range"
            aria-label={text("mediaSeek")}
            min={0}
            max={state.snapshot.media.durationSeconds}
            step={0.1}
            value={state.snapshot.media.timeSeconds}
            onChange={(event) => {
              const seconds = Number(event.target.value)

              if (isSeekableMediaTime(state.snapshot.media, seconds)) {
                void run((s, signal) =>
                  requireLibraryValue(s.seekMedia?.bind(s))(seconds, signal),
                )
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        )}
    </div>
  )
}
