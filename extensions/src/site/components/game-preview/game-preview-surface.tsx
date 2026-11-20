import { applicationChapterPhase } from "../../../core/show-library/full-show-preview-timeline"
import type { PreviewPhase } from "../../../core/show-library/primitives"
import { requireLibraryValue } from "../../../core/show-library/required"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Play } from "lucide-react"
import { PresentationControls } from "../../../platform-ui"
import { GameViewer } from "../game-viewer/GameViewer"
import { SiteButton } from "../../web/shared/SiteButton"
import { canSeekChapter, type PreviewSelection } from "./contracts"
import { useGamePreview } from "./use-game-preview"
import { usePreviewActivation } from "./use-preview-activation"
import { PreviewTimeline } from "./preview-timeline"
import { gamePreviewCss } from "./styles"
import type { ApplicationPreviewFrame } from "../../../core/show-library/application-preview-schema"
import type { ShowThemeAudioEvent } from "../../../core/show-themes/selection"

/** Consumer only. A missing publisher, tenant source or admitted renderer is visible. */
export function GamePreviewSurface({
  selection,
  children,
  onOpen,
  label,
  disabled,
  onActiveChange,
  appearance,
  previewRole = "spectator",
  initialAuthoredKey,
  initialPhase,
  initialScreenId,
  audioAudition,
  dismissOnOutside = true,
  initiallyOpen = false,
}: {
  selection: PreviewSelection
  children: ReactNode
  onOpen?: () => void
  label: string
  disabled?: boolean
  onActiveChange?: (active: boolean) => void
  appearance?: ApplicationPreviewFrame["appearance"]
  previewRole?: ApplicationPreviewFrame["role"]
  initialAuthoredKey?: string
  initialPhase?: PreviewPhase
  initialScreenId?: string
  audioAudition?: {
    label: string
    listen: string
    stop: string
    events: Array<{ id: ShowThemeAudioEvent; label: string }>
  }
  dismissOnOutside?: boolean
  initiallyOpen?: boolean
}) {
  const controller = useGamePreview(selection, disabled)
  const root = useRef<HTMLDivElement>(null)
  const gesture = usePreviewActivation({
    enabled: controller.enabled,
    active: controller.active,
    rootRef: root,
    open: controller.open,
  })
  const { text, active, state } = controller
  const { session } = controller
  const initialSelectionKey = JSON.stringify(selection)
  useEffect(() => {
    if (initiallyOpen && controller.enabled) {
      controller.open()
    }
  }, [initiallyOpen, initialSelectionKey, controller.enabled, controller.open])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [auditionEvent, setAuditionEvent] =
    useState<ShowThemeAudioEvent>("opening")
  const canvasIntent = useRef<string | null>(null)
  useEffect(() => {
    setSoundEnabled(false)
    canvasIntent.current = null
  }, [session])
  useEffect(() => {
    if (session) {
      void controller.run(async (s, signal) => {
        signal.throwIfAborted()

        if (appearance && s.setAppearance) {
          await s.setAppearance(appearance, signal)
        }

        signal.throwIfAborted()

        if (s.setRole && s.source.kind === "account-owned") {
          await s.setRole(previewRole, signal)
        }

        signal.throwIfAborted()

        const intent = JSON.stringify([
          initialPhase,
          initialAuthoredKey,
          initialScreenId,
        ])

        if (canvasIntent.current === intent) {
          return
        }

        if (initialPhase === "lobby") {
          await requireLibraryValue(s.previewLobby)(signal)
        } else if (initialAuthoredKey || initialPhase) {
          const chapter = s.chapters.find(
            (item) =>
              (!initialAuthoredKey ||
                item.authoredKey === initialAuthoredKey) &&
              (!initialPhase ||
                applicationChapterPhase(item.phase, previewRole) ===
                  initialPhase),
          )

          if (!chapter) {
            throw new Error("Preview screen unavailable for this authored game")
          }

          await s.seekChapter(chapter.id, signal)
        }

        if (!signal.aborted) {
          canvasIntent.current = intent
        }
      })
    }
  }, [
    appearance,
    previewRole,
    initialAuthoredKey,
    initialPhase,
    initialScreenId,
    session,
    controller.run,
  ])
  useEffect(() => {
    onActiveChange?.(active)

    return () => onActiveChange?.(false)
  }, [active, onActiveChange])
  useEffect(() => {
    if (!active || !dismissOnOutside) {
      return
    }

    const outside = (event: PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) {
        controller.close(false)
      }
    }
    window.addEventListener("pointerdown", outside, true)

    return () => window.removeEventListener("pointerdown", outside, true)
  }, [active, controller.close, dismissOnOutside])

  const closePreview = () => {
    controller.close(false)
    requestAnimationFrame(() =>
      controller.triggerRef.current?.focus({ preventScroll: true }),
    )
  }

  const snapshot = state.status === "ready" ? state.snapshot : null
  // Transport follows authored cards; phase snapshots remain available in the timeline.
  const authoredKeys = new Set<string>()
  const cardChapters =
    session?.chapters.filter((chapter) => {
      if (authoredKeys.has(chapter.authoredKey)) {
        return false
      }

      authoredKeys.add(chapter.authoredKey)

      return true
    }) ?? []
  const selectedChapter =
    snapshot?.screenPhase === "lobby"
      ? undefined
      : session?.chapters.find((chapter) => chapter.id === snapshot?.chapterId)
  const cardIndex = selectedChapter
    ? cardChapters.findIndex(
        (chapter) => chapter.authoredKey === selectedChapter.authoredKey,
      )
    : -1
  const previous = cardIndex > 0 ? cardChapters[cardIndex - 1] : undefined
  const next = cardIndex >= 0 ? cardChapters[cardIndex + 1] : undefined
  const seek = (chapter: typeof previous) => {
    if (session && chapter && canSeekChapter(session, chapter)) {
      void controller.run((current, signal) =>
        current.seekChapter(chapter.id, signal),
      )
    }
  }

  return (
    <div
      ref={root}
      className="game-preview-surface"
      data-preview-active={active || undefined}
      {...gesture}
    >
      <style>{gamePreviewCss}</style>
      <div
        className="game-preview-poster"
        aria-hidden={active || undefined}
        inert={active || undefined}
      >
        {onOpen ? (
          <SiteButton
            className="game-preview-cover-action"
            data-preview-cover-action
            onClick={onOpen}
            aria-label={label}
          >
            {children}
          </SiteButton>
        ) : (
          <div data-preview-cover-action>{children}</div>
        )}
      </div>
      {controller.enabled && text && !active && (
        <SiteButton
          ref={controller.triggerRef}
          className="game-preview-trigger"
          onClick={controller.open}
          aria-label={`${text("preview")}: ${label}`}
        >
          <Play size={16} aria-hidden="true" />
          {text("preview")}
        </SiteButton>
      )}
      <div className="game-preview-overlay" hidden={!active}>
        <GameViewer
          title={label}
          status={
            text && (session?.sampleData ? text("sample") : text("preview"))
          }
          open={active}
          modal
          dismissOnOutside={dismissOnOutside}
          busy={state.status === "loading" || controller.pending}
          onClose={closePreview}
          closeRef={controller.closeRef}
          controls={
            text &&
            snapshot && (
              <div className="game-preview-bottom">
                <PreviewTimeline controller={controller} />
                <PresentationControls
                  previous={
                    session?.coverage === "full-show"
                      ? {
                          disabled:
                            controller.pending ||
                            !previous ||
                            !canSeekChapter(session, previous),
                          onClick: () => seek(previous),
                          testId: "game-preview-previous",
                        }
                      : undefined
                  }
                  playback={{
                    state: snapshot.clock.paused ? "paused" : "playing",
                    disabled:
                      controller.pending || snapshot.screenPhase === "lobby",
                    onClick: () =>
                      void controller.run((s, signal) =>
                        snapshot.clock.paused ? s.play(signal) : s.pause(),
                      ),
                    testId: "game-preview-play-pause",
                  }}
                  next={
                    session?.coverage === "full-show"
                      ? {
                          disabled:
                            controller.pending ||
                            !next ||
                            !canSeekChapter(session, next),
                          onClick: () => seek(next),
                          testId: "game-preview-next",
                        }
                      : undefined
                  }
                  replay={{
                    disabled:
                      controller.pending || snapshot.screenPhase === "lobby",
                    onClick: () =>
                      void controller.run((s, signal) => s.replay(signal)),
                    testId: "game-preview-replay",
                  }}
                  sound={
                    session?.setSoundEnabled
                      ? {
                          enabled: soundEnabled,
                          disabled: controller.pending,
                          onClick: () =>
                            void controller.run(async (s, signal) => {
                              await requireLibraryValue(
                                s.setSoundEnabled?.bind(s),
                              )(!soundEnabled, signal)
                              setSoundEnabled(!soundEnabled)
                            }),
                          testId: "game-preview-sound",
                        }
                      : undefined
                  }
                  reveal={
                    session?.setMediaRevealed &&
                    snapshot.manualImageReveal !== undefined
                      ? {
                          revealed: snapshot.manualImageReveal,
                          disabled: controller.pending,
                          onClick: () =>
                            void controller.run((current, signal) =>
                              requireLibraryValue(current.setMediaRevealed)(
                                !snapshot.manualImageReveal,
                                signal,
                              ),
                            ),
                          testId: "game-preview-reveal",
                        }
                      : undefined
                  }
                />
              </div>
            )
          }
          details={
            audioAudition &&
            session?.auditionAudioEvent && (
              <div className="game-preview-audition">
                <label>
                  {audioAudition.label}
                  <select
                    aria-label={audioAudition.label}
                    value={auditionEvent}
                    onChange={(event) =>
                      setAuditionEvent(
                        event.target.value as ShowThemeAudioEvent,
                      )
                    }
                  >
                    {audioAudition.events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.label}
                      </option>
                    ))}
                  </select>
                </label>
                <SiteButton
                  disabled={controller.pending}
                  onClick={() =>
                    void controller.run(async (s, signal) => {
                      await requireLibraryValue(s.auditionAudioEvent)(
                        auditionEvent,
                        signal,
                      )
                      setSoundEnabled(true)
                    })
                  }
                >
                  {audioAudition.listen}
                </SiteButton>
                <SiteButton
                  disabled={controller.pending}
                  onClick={() =>
                    void controller.run(async (s, signal) => {
                      await requireLibraryValue(s.auditionAudioEvent)(
                        null,
                        signal,
                      )
                      setSoundEnabled(false)
                    })
                  }
                >
                  {audioAudition.stop}
                </SiteButton>
              </div>
            )
          }
        >
          <div ref={controller.hostRef} className="game-preview-stage" />
          {text && state.status === "loading" && (
            <p className="game-preview-message" role="status">
              {text("loading")}
            </p>
          )}
          {text && state.status === "unavailable" && (
            <p className="game-preview-message" role="status">
              {text("unavailable")}
              <br />
              {text(state.reason)}
            </p>
          )}
        </GameViewer>
      </div>
    </div>
  )
}
