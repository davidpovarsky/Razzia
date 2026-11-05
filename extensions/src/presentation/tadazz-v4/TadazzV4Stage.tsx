import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { StageAmbientV4, StageBackdropV4, StageSceneV4 } from "./components"
import { TadazzV4Motion } from "./motion"
import { normalizeData, TADAZZ_V4_ASSET_BASE, TADAZZ_V4_SHOW_SCENES, type TadazzV4Data, type TadazzV4Scene, type TadazzV4StageHandle, type TadazzV4StageProps } from "./types"
import "./tadazz-v4.css"

interface CurrentScene { scene: TadazzV4Scene; data: TadazzV4Data; revision: number }

/**
 * Pure React stage compositions + precise WAAPI choreography.
 * No embedded HTML, no demo toolbar, no upstream Razzia mutation.
 * The host owns game logic, data, scene scheduling and network transport.
 */
export const TadazzV4Stage = forwardRef<TadazzV4StageHandle, TadazzV4StageProps>(function TadazzV4Stage({
  initialScene,
  initialData = {},
  assetBase = TADAZZ_V4_ASSET_BASE,
  motionScale = 1,
  showPercentages = true,
  reducedMotion = false,
  className,
  onCue,
  onComplete,
}, ref) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<TadazzV4Motion | null>(null)
  const [view, setView] = useState<CurrentScene | null>(initialScene ? { scene: initialScene, data: normalizeData(initialData), revision: 0 } : null)
  const viewRef = useRef(view)
  viewRef.current = view
  const [overridePercentages, setOverridePercentages] = useState<boolean | null>(null)
  const sequence = useRef(0)
  const resolutions = useRef(new Map<number, (completed: boolean) => void>())
  const callbackRef = useRef({ onCue, onComplete })
  callbackRef.current = { onCue, onComplete }

  useLayoutEffect(() => {
    const element = stageRef.current
    const viewport = viewportRef.current
    if (!viewport || !element) return
    const fit = () => {
      const rect = viewport.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const scale = Math.min(width / 1920, height / 1080)
      element.style.setProperty("--scale", String(scale))
    }
    fit()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit)
    observer?.observe(viewport)
    return () => observer?.disconnect()
  }, [])

  const start = useCallback((scene: TadazzV4Scene, data: TadazzV4Data): Promise<boolean> => {
    const revision = ++sequence.current
    // Superseded play requests settle predictably, including pending React renders.
    for (const [key, resolve] of resolutions.current) {
      if (key !== revision) { resolve(false); resolutions.current.delete(key) }
    }
    engineRef.current?.stop()
    setView({ scene, data: normalizeData(data), revision })
    return new Promise<boolean>(resolve => resolutions.current.set(revision, resolve))
  }, [])

  const showPercentagesRef = useRef(showPercentages)
  showPercentagesRef.current = overridePercentages ?? showPercentages

  useImperativeHandle(ref, () => ({
    play: start,
    replay: async () => {
      const current = viewRef.current
      return current ? start(current.scene, current.data) : false
    },
    pause: () => engineRef.current?.pause(),
    resume: () => engineRef.current?.resume(),
    skipToEnd: () => engineRef.current?.finishAll(),
    stop: () => engineRef.current?.stop(),
    setPercentagesVisible: (value) => setOverridePercentages(value),
  }), [start])

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !view) return
    const cueHandler = (cue: {name:string;scene:TadazzV4Scene}) => {
      el.dispatchEvent(new CustomEvent("tadazz:cue", { detail: cue, bubbles: false }))
      callbackRef.current.onCue?.(cue)
    }
    const engine = new TadazzV4Motion(el, { motionScale, reducedMotion, onCue: cueHandler })
    engineRef.current?.dispose()
    engineRef.current = engine
    let alive = true
    void engine.play(view.scene, { ...view.data, showPercentages: view.data.showPercentages ?? showPercentagesRef.current }).then(completed => {
      if (!alive) return
      resolutions.current.get(view.revision)?.(completed)
      resolutions.current.delete(view.revision)
      if (completed) {
        el.dispatchEvent(new CustomEvent("tadazz:animation-complete", { detail: { scene: view.scene } }))
        callbackRef.current.onComplete?.(view.scene)
      }
    })
    return () => {
      alive = false
      resolutions.current.get(view.revision)?.(false)
      resolutions.current.delete(view.revision)
      engine.dispose()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [view?.revision, view?.scene, motionScale, reducedMotion, overridePercentages, showPercentages])

  useEffect(() => () => {
    engineRef.current?.dispose()
    for (const resolve of resolutions.current.values()) resolve(false)
    resolutions.current.clear()
  }, [])

  const scene = view?.scene ?? "question"
  const data = view?.data ?? {}
  const isShow = TADAZZ_V4_SHOW_SCENES.has(scene)
  const stageStyle: CSSProperties = { width: 1920, height: 1080 }

  return <div ref={viewportRef} className={`tzv4-viewport${className ? ` ${className}` : ""}`} data-testid="tadazz-v4-viewport">
    <div
      ref={stageRef}
      className={`tzv4-stage${isShow ? " stage-show" : ""}`}
      data-v4-scene={view?.scene ?? "idle"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={stageStyle}
      data-testid="tadazz-v4-stage"
    >
      <StageBackdropV4 scene={scene} data={data} assetBase={assetBase}/>
      <div className="veil"/>
      <StageAmbientV4/>
      <div className="tzv4-scene-root">{view ? <StageSceneV4 scene={view.scene} data={{...data,showPercentages:data.showPercentages ?? showPercentagesRef.current}} assetBase={assetBase}/> : null}</div>
      <div className="tzv4-fx-root" aria-hidden="true"/>
      <div className="tzv4-screen-flash" aria-hidden="true"/>
    </div>
  </div>
})
