import { useEffect, useMemo, useRef } from "react"
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

/** Candidate only. Callers must establish genuine producer binding before mounting. */
export function NativePreviewStage({ frame, locale, reducedMotion, fitRevision, onUnavailable }: {
  frame: PreviewFrame; locale: PreviewLocale; reducedMotion: boolean; fitRevision: number; onUnavailable: () => void
}) {
  const stage = useRef<TadazzStageHandle>(null)
  const owner = useRef<ReturnType<typeof createPreviewTransitionOwner> | null>(null)
  const previous = useRef<ShowScene | null>(null)
  const lastSemantic = useRef("")
  const wasPaused = useRef(false)
  const reconstructing = useRef(false)
  const latest = useRef(frame)
  latest.current = frame
  const theme = useMemo(() => resolveShowTheme({ selection: createDefaultShowTheme(), role: frame.role }), [frame.role])
  const nativeLabels = useMemo(() => previewNativeLabels(locale), [locale])

  useEffect(() => {
    if (!stage.current) return
    const nextOwner = createPreviewTransitionOwner(stage.current)
    owner.current = nextOwner
    return () => { nextOwner.dispose(); owner.current = null }
  }, [])

  useEffect(() => {
    const handle = stage.current
    const transition = owner.current
    if (!handle || !transition) return
    try {
      validatePreviewFrame(frame)
      const semantic = `${frame.epoch}:${frame.question.id}:${frame.phase}`
      if (frame.clock.paused && semantic !== lastSemantic.current) {
        // Invalidate before finishing: native finish may synchronously fire a wipe cue.
        transition.invalidate()
        handle.finishAnimations()
        wasPaused.current = true
        reconstructing.current = true
        lastSemantic.current = semantic
        const planned = pausedPreviewSteps(frame, Date.now())
        const last = planned.steps.at(-1)
        const hasVoting = last?.op === "openVoting"
        const prefix = hasVoting ? planned.steps.slice(0, -1) : planned.steps
        const building = transition.run(prefix)
        const current = transition.capture()
        void building.then(async (complete) => {
          if (!complete || !current() || !latest.current.clock.paused) return
          previous.current = planned.scene
          let stillCurrent = current
          if (hasVoting && last.op === "openVoting") {
            const deadline = previewVotingDeadline(latest.current.clock, Date.now())
            const voting = transition.run([{ ...last, deadlineMs: deadline?.wallDeadlineMs }])
            const votingCurrent = transition.capture()
            stillCurrent = votingCurrent
            void voting.catch(() => { if (votingCurrent()) onUnavailable() })
            // Let the native stage commit its countdown, then re-anchor and pause it.
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            if (!votingCurrent() || !latest.current.clock.paused) return
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            if (!votingCurrent() || !latest.current.clock.paused) return
            const frozenDeadline = previewVotingDeadline(latest.current.clock, Date.now())
            void handle.openVoting(latest.current.seconds, frozenDeadline?.wallDeadlineMs).catch(() => { if (votingCurrent()) onUnavailable() })
          }
          if (!stillCurrent() || !latest.current.clock.paused) return
          handle.pauseAnimations?.()
          reconstructing.current = false
        }).catch(() => { if (current()) onUnavailable() })
        return
      }
      if (frame.clock.paused) {
        if (!wasPaused.current && !reconstructing.current) handle.pauseAnimations?.()
        wasPaused.current = true
        return
      }
      const resumed = wasPaused.current
      if (resumed) {
        wasPaused.current = false
        if (reconstructing.current) { transition.invalidate(); reconstructing.current = false; lastSemantic.current = "" }
        handle.resumeAnimations?.()
      }
      if (semantic === lastSemantic.current) {
        if (resumed && frame.phase === "voting" && handle.mode === "voting") {
          const deadline = previewVotingDeadline(frame.clock, Date.now())
          void transition.run([{ op: "openVoting", seconds: frame.seconds, deadlineMs: deadline?.wallDeadlineMs }]).catch(onUnavailable)
        }
        return
      }
      if ((frame.phase === "answerCards" || frame.phase === "voteLocked") && handle.questionKey !== frame.question.id) throw new Error("show-preview:missing-current-stage")
      const planned = previewSteps(frame, previous.current, { mode: handle.mode, questionKey: handle.questionKey }, Date.now())
      lastSemantic.current = semantic
      previous.current = planned.scene
      void transition.run(planned.steps).catch(onUnavailable)
    } catch { transition.invalidate(); onUnavailable() }
  }, [frame, onUnavailable])

  return <ShowThemeScope theme={theme}><div style={{ ...showThemeStyle(theme), width: "100%", height: "100%" }}>
    <TadazzV4StageAdapter ref={stage} labels={nativeLabels.labels} v4Labels={nativeLabels.v4Labels}
      reducedMotion={reducedMotion || frame.clock.paused} fitRevision={fitRevision} interactive={false} multiSelect={frame.question.type === "multi"} />
  </div></ShowThemeScope>
}
