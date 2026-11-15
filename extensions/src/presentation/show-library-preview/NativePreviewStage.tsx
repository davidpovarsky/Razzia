import { useEffect, useMemo, useRef, useState } from "react"
import { resolveShowTheme } from "../../core/show-themes/resolve"
import { createDefaultShowTheme } from "../../core/show-themes/selection"
import { ShowThemeScope, showThemeStyle } from "../show-themes/context"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import { TadazzV4StageAdapter } from "../tadazz-show/TadazzV4StageAdapter"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"
import { previewNativeLabels, type PreviewLocale } from "./i18n"
import { createPreviewTransitionOwner } from "./preview-transition-owner"
import { pausedPreviewSteps, previewSteps, validatePreviewFrame, type PreviewFrame } from "./stage-scene-adapter"
import { previewVotingDeadline } from "./preview-clock"

/** Candidate only. Genuine producer binding and a reviewed pin precede mounting. */
export function NativePreviewStage({ frame, locale, reducedMotion, fitRevision, onUnavailable }: {
  frame: PreviewFrame; locale: PreviewLocale; reducedMotion: boolean; fitRevision: number; onUnavailable: () => void
}) {
  const stage = useRef<TadazzStageHandle>(null)
  const owner = useRef<ReturnType<typeof createPreviewTransitionOwner> | null>(null)
  const previous = useRef<ShowScene | null>(null)
  const request = useRef(0)
  const lastKey = useRef("")
  const latest = useRef(frame)
  const pausedBootstrap = useRef(false)
  const [hidden, setHidden] = useState(false)
  latest.current = frame
  const theme = useMemo(() => resolveShowTheme({ selection: createDefaultShowTheme(), role: frame.role }), [frame.role])
  const labels = useMemo(() => previewNativeLabels(locale), [locale])

  useEffect(() => {
    if (!stage.current) return
    const nextOwner = createPreviewTransitionOwner(stage.current, (questionKey) => {
      const current = latest.current
      if (current.phase !== "voting" || current.question.id !== questionKey) return null
      if (current.clock.paused && !pausedBootstrap.current) return null
      const deadline = previewVotingDeadline(current.clock, Date.now())
      return { seconds: current.seconds, deadlineMs: deadline?.wallDeadlineMs }
    })
    owner.current = nextOwner
    return () => { request.current += 1; nextOwner.invalidate(); nextOwner.dispose(); owner.current = null }
  }, [])

  useEffect(() => {
    const handle = stage.current
    const transition = owner.current
    if (!handle || !transition) return
    try {
      validatePreviewFrame(frame)
      const key = `${frame.epoch}:${frame.question.id}:${frame.phase}:${frame.clock.paused}`
      if (key === lastKey.current) return // elapsed ticks only update latest.current
      lastKey.current = key
      const ticket = ++request.current
      const current = () => ticket === request.current
      pausedBootstrap.current = false
      transition.invalidate()
      // Completing native animations may fire cues; ownership was revoked first.
      handle.finishAnimations()
      if (transition.hasUnsafe() || frame.clock.paused) setHidden(true)

      void transition.drain().then(async () => {
        if (!current()) return
        const next = latest.current
        const planned = next.clock.paused
          ? pausedPreviewSteps(next, Date.now())
          : previewSteps(next, previous.current, { mode: handle.mode, questionKey: handle.questionKey }, Date.now())
        previous.current = planned.scene
        if (!next.clock.paused) {
          handle.resumeAnimations?.()
          setHidden(false)
          void transition.run(planned.steps).catch(() => { if (current()) onUnavailable() })
          return
        }
        const last = planned.steps.at(-1)
        const voting = last?.op === "openVoting"
        const prefix = voting ? planned.steps.slice(0, -1) : planned.steps
        if (!(await transition.run(prefix)) || !current()) return
        if (voting && last.op === "openVoting") {
          pausedBootstrap.current = true
          const running = transition.run([last])
          const isCurrent = transition.capture()
          void running.catch(() => { if (current() && isCurrent()) onUnavailable() })
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          if (!current() || !isCurrent()) return
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          if (!current() || !isCurrent()) return
          const deadline = previewVotingDeadline(latest.current.clock, Date.now())
          void handle.openVoting(latest.current.seconds, deadline?.wallDeadlineMs).catch(() => { if (current()) onUnavailable() })
        }
        if (!current()) return
        handle.pauseAnimations?.()
        pausedBootstrap.current = false
        setHidden(false)
      }).catch(() => { if (current()) onUnavailable() })
    } catch {
      transition.invalidate()
      setHidden(true)
      onUnavailable()
    }
  }, [frame, onUnavailable])

  return <ShowThemeScope theme={theme}><div style={{ ...showThemeStyle(theme), width: "100%", height: "100%", visibility: hidden ? "hidden" : "visible" }}>
    <TadazzV4StageAdapter ref={stage} labels={labels.labels} v4Labels={labels.v4Labels}
      reducedMotion={reducedMotion || frame.clock.paused} fitRevision={fitRevision} interactive={false} multiSelect={frame.question.type === "multi"} />
  </div></ShowThemeScope>
}
