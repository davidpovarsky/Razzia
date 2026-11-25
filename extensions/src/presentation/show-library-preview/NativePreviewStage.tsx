import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import {
  resolveShowTheme,
  type ResolvedShowTheme,
} from "../../core/show-themes/resolve"
import { createDefaultShowTheme } from "../../core/show-themes/selection"
import { ShowThemeScope, showThemeStyle } from "../show-themes/context"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import { TadazzV4StageAdapter } from "../tadazz-show/TadazzV4StageAdapter"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"
import { previewNativeLabels, type PreviewLocale } from "./i18n"
import { createPreviewTransitionOwner } from "./preview-transition-owner"
import {
  pausedPreviewSteps,
  previewSteps,
  validatePreviewFrame,
  type PreviewFrame,
  type NativePreviewPresentation,
} from "./stage-scene-adapter"
import { previewVotingDeadline } from "./preview-clock"

const phaseOrder: Record<PreviewFrame["phase"], number> = {
  question: 0,
  answerCards: 1,
  voting: 2,
  voteLocked: 3,
  results: 4,
}

/** Candidate only. Genuine producer binding and a reviewed pin precede mounting. */
export function NativePreviewStage({
  frame,
  locale,
  reducedMotion,
  fitRevision,
  onUnavailable,
  onStageHandle,
  resolvedTheme,
  presentation,
  continuousPlayback = false,
  onDemoSelect,
}: {
  frame: PreviewFrame
  locale: PreviewLocale
  reducedMotion: boolean
  fitRevision: number
  onUnavailable: () => void
  onStageHandle?: (handle: TadazzStageHandle | null) => void
  resolvedTheme?: ResolvedShowTheme
  presentation?: NativePreviewPresentation
  continuousPlayback?: boolean
  onDemoSelect?: (index: number) => void
}) {
  const stage = useRef<TadazzStageHandle>(null)
  const observed = useRef(onStageHandle)
  observed.current = onStageHandle
  const attachStage = useCallback((handle: TadazzStageHandle | null) => {
    if (stage.current === handle) {
      return
    }

    stage.current = handle
    observed.current?.(handle)
  }, [])
  const owner = useRef<ReturnType<typeof createPreviewTransitionOwner> | null>(
    null,
  )
  const previous = useRef<ShowScene | null>(null)
  const request = useRef(0)
  const lastKey = useRef("")
  const lastSelection = useRef("")
  const lastPhase = useRef<PreviewFrame["phase"] | null>(null)
  const lastPaused = useRef(frame.clock.paused)
  const latest = useRef(frame)
  const pausedBootstrap = useRef(false)
  const [hidden, setHidden] = useState(false)
  latest.current = frame
  const theme = useMemo(
    () =>
      resolvedTheme ??
      resolveShowTheme({
        selection: createDefaultShowTheme(),
        role: frame.role,
      }),
    [frame.role, resolvedTheme],
  )
  const labels = useMemo(() => previewNativeLabels(locale), [locale])

  useLayoutEffect(() => {
    if (!stage.current) {
      return
    }

    const nextOwner = createPreviewTransitionOwner(
      stage.current,
      (questionKey) => {
        const { current } = latest

        if (current.phase !== "voting" || current.question.id !== questionKey) {
          return null
        }

        if (current.clock.paused && !pausedBootstrap.current) {
          return null
        }

        const deadline = previewVotingDeadline(current.clock, Date.now())

        return {
          seconds: current.seconds,
          deadlineMs: deadline?.wallDeadlineMs,
        }
      },
    )
    owner.current = nextOwner

    return () => {
      request.current += 1
      nextOwner.invalidate()
      nextOwner.dispose()
      owner.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const handle = stage.current
    const transition = owner.current

    if (!handle || !transition) {
      return
    }

    try {
      validatePreviewFrame(frame)
      const selectionKey = `${frame.epoch}:${frame.question.id}:${frame.phase}`

      if (continuousPlayback && selectionKey === lastSelection.current) {
        if (lastPaused.current !== frame.clock.paused) {
          lastPaused.current = frame.clock.paused

          if (frame.clock.paused) {
            handle.pauseAnimations?.()
          } else {
            if (frame.phase === "voting") {
              const deadline = previewVotingDeadline(frame.clock, Date.now())

              void handle
                .openVoting(frame.seconds, deadline?.wallDeadlineMs)
                .catch(onUnavailable)
            }

            handle.resumeAnimations?.()
          }
        }

        return
      }

      const rewinding =
        continuousPlayback &&
        handle.questionKey === frame.question.id &&
        lastPhase.current !== null &&
        phaseOrder[frame.phase] < phaseOrder[lastPhase.current]
      lastPhase.current = frame.phase
      lastSelection.current = selectionKey
      lastPaused.current = frame.clock.paused

      const key = `${frame.epoch}:${frame.question.id}:${frame.phase}:${frame.clock.paused}`

      // Elapsed ticks only update latest.current.
      if (key === lastKey.current) {
        return
      }

      lastKey.current = key
      request.current += 1
      const ticket = request.current
      const current = () => ticket === request.current
      pausedBootstrap.current = false
      transition.invalidate()
      // Completing native animations may fire cues; ownership was revoked first.
      handle.finishAnimations()
      const continueQuestion =
        continuousPlayback &&
        handle.questionKey === frame.question.id &&
        !rewinding

      if (!continueQuestion && (transition.hasUnsafe() || frame.clock.paused)) {
        setHidden(true)
      }

      const begin = async () => {
        if (!current()) {
          return
        }

        const next = latest.current
        // A projected new card is a snapshot replacement, not a request to
        // replay a full-game wipe while the previous card remains on stage.
        // Reuse the existing native current-phase reconstruction and real clock.
        const sameQuestion =
          continuousPlayback &&
          handle.questionKey === next.question.id &&
          !rewinding
        // Explicit backward navigation reconstructs the requested phase so
        // answers/results from a later phase cannot remain on the stage.
        const planned =
          rewinding ||
          (next.clock.paused && !sameQuestion) ||
          (handle.questionKey !== next.question.id &&
            !(
              continuousPlayback &&
              next.phase === "question" &&
              !reducedMotion
            ))
            ? pausedPreviewSteps(next, Date.now(), presentation)
            : previewSteps(
                next,
                previous.current,
                { mode: handle.mode, questionKey: handle.questionKey },
                Date.now(),
                presentation,
              )
        previous.current = planned.scene

        // Manual steps in a paused continuous question keep the visible scene;
        // only new answer/result details enter, then remain paused.
        if (sameQuestion) {
          setHidden(false)
        }

        if (!next.clock.paused) {
          handle.resumeAnimations?.()
          setHidden(false)
          void transition.run(planned.steps).catch(() => {
            if (current()) {
              onUnavailable()
            }
          })

          return
        }

        const last = planned.steps.at(-1)
        const voting = last?.op === "openVoting"
        const prefix = voting ? planned.steps.slice(0, -1) : planned.steps

        if (!(await transition.run(prefix)) || !current()) {
          return
        }

        if (voting) {
          pausedBootstrap.current = true
          const running = transition.run([last])
          const isCurrent = transition.capture()
          void running.catch(() => {
            if (current() && isCurrent()) {
              onUnavailable()
            }
          })
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
          })

          if (!current() || !isCurrent()) {
            return
          }

          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
          })

          if (!current() || !isCurrent()) {
            return
          }

          const deadline = previewVotingDeadline(
            latest.current.clock,
            Date.now(),
          )
          void handle
            .openVoting(latest.current.seconds, deadline?.wallDeadlineMs)
            .catch(() => {
              if (current()) {
                onUnavailable()
              }
            })
        }

        if (!current()) {
          return
        }

        if (latest.current.clock.paused) {
          handle.pauseAnimations?.()
        } else {
          handle.resumeAnimations?.()
        }

        pausedBootstrap.current = false
        // Native reconstruction has completed across the await above. Commit the
        // mask removal now rather than leaving it behind a deferred React paint.
        flushSync(() => setHidden(false))
      }
      // With no unsafe transition to drain, start the native state update in
      // this layout effect, before painting the initial empty teaser surface.
      const pending = transition.hasUnsafe()
        ? transition.drain().then(begin)
        : begin()
      void pending.catch(() => {
        if (current()) {
          onUnavailable()
        }
      })
    } catch {
      transition.invalidate()
      setHidden(true)
      onUnavailable()
    }
  }, [frame, onUnavailable, presentation, continuousPlayback, reducedMotion])

  return (
    <ShowThemeScope theme={theme}>
      <div
        data-testid="native-preview-surface"
        data-preview-ready={hidden ? "false" : "true"}
        aria-hidden={hidden || undefined}
        style={{
          ...showThemeStyle(theme),
          width: "100%",
          height: "100%",
          opacity: hidden ? 0 : 1,
        }}
      >
        <TadazzV4StageAdapter
          ref={attachStage}
          labels={labels.labels}
          v4Labels={labels.v4Labels}
          reducedMotion={
            reducedMotion || (!continuousPlayback && frame.clock.paused)
          }
          fitRevision={fitRevision}
          interactive={Boolean(onDemoSelect)}
          multiSelect={onDemoSelect ? false : frame.question.type === "multi"}
          onSelectOption={onDemoSelect}
          backdropUrl={presentation?.background?.url}
          backdropFit={presentation?.background?.fit}
        />
      </div>
    </ShowThemeScope>
  )
}
