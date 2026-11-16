import { applicationChapterPhase } from "../../../core/show-library/full-show-preview-timeline"
import type { PreviewPhase } from "../../../core/show-library/primitives"
import { requireLibraryValue } from "../../../core/show-library/required"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react"
import { IconButton } from "../../../platform-ui"
import { SiteButton } from "../../web/shared/SiteButton"
import type { PreviewSelection } from "./contracts"
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
      <div
        className="game-preview-overlay"
        hidden={!active}
        role={active ? "region" : undefined}
        aria-label={text?.("preview")}
        aria-busy={state.status === "loading" || controller.pending}
      >
        <div
          ref={controller.hostRef}
          className="game-preview-stage"
          style={{ visibility: controller.pending ? "hidden" : undefined }}
        />
        {text && active && (
          <>
            <div className="game-preview-topbar">
              <span>
                {state.status === "ready" && controller.session?.sampleData
                  ? text("sample")
                  : text("preview")}
              </span>
              <IconButton
                ref={controller.closeRef}
                label={text("close")}
                onClick={() => controller.close()}
              >
                <X />
              </IconButton>
            </div>
            {(state.status === "loading" || controller.pending) && (
              <p className="game-preview-message" role="status">
                {text("loading")}
              </p>
            )}
            {state.status === "unavailable" && (
              <p className="game-preview-message" role="status">
                {text("unavailable")}
                <br />
                {text(state.reason)}
              </p>
            )}
            {state.status === "ready" && (
              <div className="game-preview-bottom">
                <PreviewTimeline controller={controller} />
                {audioAudition && session?.auditionAudioEvent && (
                  <details className="game-preview-audition">
                    <summary>{audioAudition.label}</summary>
                    <div>
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
                  </details>
                )}
                <div className="game-preview-actions">
                  <IconButton
                    label={text(state.snapshot.clock.paused ? "play" : "pause")}
                    disabled={
                      controller.pending ||
                      state.snapshot.screenPhase === "lobby"
                    }
                    onClick={() =>
                      void controller.run((s, signal) =>
                        state.snapshot.clock.paused
                          ? s.play(signal)
                          : s.pause(),
                      )
                    }
                  >
                    {state.snapshot.clock.paused ? <Play /> : <Pause />}
                  </IconButton>
                  <IconButton
                    label={text("replay")}
                    disabled={
                      controller.pending ||
                      state.snapshot.screenPhase === "lobby"
                    }
                    onClick={() =>
                      void controller.run((s, signal) => s.replay(signal))
                    }
                  >
                    <RotateCcw />
                  </IconButton>
                  {session?.setMediaRevealed &&
                    state.snapshot.manualImageReveal !== undefined && (
                      <SiteButton
                        disabled={controller.pending}
                        aria-pressed={state.snapshot.manualImageReveal}
                        onClick={() =>
                          void controller.run((current, signal) =>
                            requireLibraryValue(current.setMediaRevealed)(
                              !state.snapshot.manualImageReveal,
                              signal,
                            ),
                          )
                        }
                      >
                        {text(
                          state.snapshot.manualImageReveal
                            ? "resetReveal"
                            : "showRevealedImage",
                        )}
                      </SiteButton>
                    )}
                  {session?.setSoundEnabled && (
                    <IconButton
                      label={text(soundEnabled ? "mute" : "enableSound")}
                      aria-pressed={soundEnabled}
                      disabled={controller.pending}
                      onClick={() =>
                        void controller.run(async (s, signal) => {
                          await requireLibraryValue(s.setSoundEnabled?.bind(s))(
                            !soundEnabled,
                            signal,
                          )
                          setSoundEnabled(!soundEnabled)
                        })
                      }
                    >
                      {soundEnabled ? <Volume2 /> : <VolumeX />}
                    </IconButton>
                  )}
                  <span>{!soundEnabled && text("muted")}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
