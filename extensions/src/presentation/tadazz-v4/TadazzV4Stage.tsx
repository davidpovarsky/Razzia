import type { CSSProperties, ReactNode } from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  StageAmbientV4,
  StageBackdropV4,
  StageSceneV4,
  ZWipeV4,
} from "./components"
import "./full-show.css"
import { TadazzV4Motion } from "./motion"
import "./source-layout.css"
import "./tadazz-v4.css"
import {
  normalizeData,
  TADAZZ_V4_ASSET_BASE,
  TADAZZ_V4_SHOW_SCENES,
  type TadazzV4Data,
  type TadazzV4Scene,
  type TadazzV4StageHandle,
  type TadazzV4StageProps,
} from "./types"

interface CurrentScene {
  scene: TadazzV4Scene
  data: TadazzV4Data
  revision: number
}

/**
 * Pure React stage compositions + precise WAAPI choreography.
 * No embedded HTML, no demo toolbar, no upstream Razzia mutation.
 * The host owns game logic, data, scene scheduling and network transport.
 */
export const TadazzV4Stage = forwardRef<
  TadazzV4StageHandle,
  TadazzV4StageProps
>(function TadazzV4Stage(
  {
    initialScene,
    initialData = {},
    assetBase = TADAZZ_V4_ASSET_BASE,
    motionScale = 1,
    showPercentages = true,
    reducedMotion = false,
    fitRevision = 0,
    className,
    underlay,
    overlay,
    customScreen,
    onCue,
    onComplete,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<TadazzV4Motion | null>(null)
  const [view, setView] = useState<CurrentScene | null>(
    initialScene
      ? { scene: initialScene, data: normalizeData(initialData), revision: 0 }
      : null,
  )
  const viewRef = useRef(view)
  viewRef.current = view
  const [overridePercentages, setOverridePercentages] = useState<
    boolean | null
  >(null)
  const sequence = useRef(0)
  const resolutions = useRef(new Map<number, (completed: boolean) => void>())
  const callbackRef = useRef({ onCue, onComplete })
  callbackRef.current = { onCue, onComplete }
  const motionScaleRef = useRef(motionScale)
  motionScaleRef.current = motionScale
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion])

  useLayoutEffect(() => {
    const element = stageRef.current
    const viewport = viewportRef.current

    if (!viewport || !element) {
      return
    }
    const fit = () => {
      const rect = viewport.getBoundingClientRect()
      const vw = Math.min(
        Math.max(1, rect.width || viewport.clientWidth),
        typeof window !== "undefined" && window.innerWidth > 0
          ? window.innerWidth
          : Infinity,
      )
      const vh = Math.min(
        Math.max(1, rect.height || viewport.clientHeight),
        typeof window !== "undefined" && window.innerHeight > 0
          ? window.innerHeight
          : Infinity,
      )
      const scale = Math.min(vw / 1920, vh / 1080)
      element.style.setProperty("--scale", String(scale > 0 ? scale : 0.0001))
    }
    fit()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit)
    observer?.observe(viewport)
    window.addEventListener("resize", fit)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [fitRevision])

  const start = useCallback(
    (scene: TadazzV4Scene, data: TadazzV4Data): Promise<boolean> => {
      const revision = ++sequence.current
      // Superseded play requests settle predictably, including pending React renders.
      for (const [key, resolve] of resolutions.current) {
        if (key !== revision) {
          resolve(false)
          resolutions.current.delete(key)
        }
      }
      engineRef.current?.stop()
      setView({ scene, data: normalizeData(data), revision })

      return new Promise<boolean>((resolve) =>
        resolutions.current.set(revision, resolve),
      )
    },
    [],
  )
  const clear = useCallback(() => {
    sequence.current += 1
    for (const [, resolve] of resolutions.current) {
      resolve(false)
    }
    resolutions.current.clear()
    engineRef.current?.stop()
    setView(null)
  }, [])

  // Overlay Z-wipe: plays the canonical z-wipe choreography ABOVE the current
  // scene so the host can swap the underlying content exactly at "wipe-covered".
  const wipeLayerRef = useRef<HTMLDivElement>(null)
  const wipeEngineRef = useRef<TadazzV4Motion | null>(null)
  const wipeCounter = useRef(0)
  const [wipeRev, setWipeRev] = useState(0)
  const wipeRequest = useRef<{
    rev: number
    onCovered?: () => void | Promise<void>
    resolve: (ok: boolean) => void
  } | null>(null)
  const wipe = useCallback(
    (onCovered?: () => void | Promise<void>): Promise<boolean> => {
      wipeEngineRef.current?.stop()
      wipeRequest.current?.resolve(false)
      const rev = ++wipeCounter.current

      return new Promise<boolean>((resolve) => {
        wipeRequest.current = { rev, onCovered, resolve }
        setWipeRev(rev)
      })
    },
    [],
  )
  useLayoutEffect(() => {
    const layer = wipeLayerRef.current
    const req = wipeRequest.current

    if (!layer || !req || req.rev !== wipeRev) {
      return
    }
    let covered = false
    const fireCovered = () => {
      if (covered) {
        return
      }
      covered = true
      void Promise.resolve(req.onCovered?.()).catch(() => undefined)
    }
    const engine = new TadazzV4Motion(layer, {
      motionScale: motionScaleRef.current,
      reducedMotion: reducedMotionRef.current,
      onCue: (cue) => {
        if (cue.name === "wipe-covered") {
          fireCovered()
        }
        callbackRef.current.onCue?.(cue)
      },
    })
    wipeEngineRef.current = engine
    let alive = true
    void engine.play("z-wipe", {}).then((ok) => {
      if (!alive) {
        return
      }
      fireCovered()

      if (wipeRequest.current === req) {
        wipeRequest.current = null
      }
      req.resolve(ok)
      // Remove the blades: zero stuck blocking layers after the wipe.
      setWipeRev((r) => (r === req.rev ? 0 : r))
    })

    return () => {
      alive = false
      engine.dispose()

      if (wipeEngineRef.current === engine) {
        wipeEngineRef.current = null
      }
    }
  }, [wipeRev])

  const showPercentagesRef = useRef(showPercentages)
  showPercentagesRef.current = overridePercentages ?? showPercentages

  useImperativeHandle(
    ref,
    () => ({
      play: start,
      clear,
      wipe,
      patchData: (patch) => {
        engineRef.current?.syncCountdown(patch)
        setView((prev) =>
          prev
            ? { ...prev, data: normalizeData({ ...prev.data, ...patch }) }
            : prev,
        )
      },
      replay: async () => {
        const { current } = viewRef
        return current ? start(current.scene, current.data) : false
      },
      pause: () => {
        engineRef.current?.pause()
        wipeEngineRef.current?.pause()
      },
      resume: () => {
        engineRef.current?.resume()
        wipeEngineRef.current?.resume()
      },
      skipToEnd: () => {
        engineRef.current?.finishAll()
        wipeEngineRef.current?.finishAll()
      },
      stop: () => {
        engineRef.current?.stop()
        wipeEngineRef.current?.stop()
      },
      setPercentagesVisible: (value) => {
        setOverridePercentages(value)
        const { current } = viewRef
        if (current?.scene === "survey-results") {
          void start(current.scene, { ...current.data, showPercentages: value })
        }
      },
    }),
    [start, clear, wipe],
  )

  useLayoutEffect(() => {
    const el = stageRef.current

    if (!el || !view) {
      return
    }
    const cueHandler = (cue: { name: string; scene: TadazzV4Scene }) => {
      el.dispatchEvent(
        new CustomEvent("tadazz:cue", { detail: cue, bubbles: false }),
      )
      callbackRef.current.onCue?.(cue)
    }
    const engine = new TadazzV4Motion(el, {
      motionScale: motionScaleRef.current,
      reducedMotion: reducedMotionRef.current,
      onCue: cueHandler,
    })
    engineRef.current?.dispose()
    engineRef.current = engine
    let alive = true
    void engine
      .play(view.scene, {
        ...view.data,
        showPercentages:
          view.data.showPercentages ?? showPercentagesRef.current,
      })
      .then((completed) => {
        if (!alive) {
          return
        }
        resolutions.current.get(view.revision)?.(completed)
        resolutions.current.delete(view.revision)

        if (completed) {
          el.dispatchEvent(
            new CustomEvent("tadazz:animation-complete", {
              detail: { scene: view.scene },
            }),
          )
          callbackRef.current.onComplete?.(view.scene)
        }
      })

    return () => {
      alive = false
      resolutions.current.get(view.revision)?.(false)
      resolutions.current.delete(view.revision)
      engine.dispose()

      if (engineRef.current === engine) {
        engineRef.current = null
      }
    }
  }, [view?.revision, view?.scene])

  useEffect(
    () => () => {
      engineRef.current?.dispose()
      wipeEngineRef.current?.dispose()
      wipeRequest.current?.resolve(false)
      wipeRequest.current = null
      for (const resolve of resolutions.current.values()) {
        resolve(false)
      }
      resolutions.current.clear()
    },
    [],
  )

  const scene = view?.scene ?? "interlude"
  const data = view?.data ?? initialData
  const isShow = view ? TADAZZ_V4_SHOW_SCENES.has(view.scene) : true
  const stageStyle: CSSProperties = { width: 1920, height: 1080 }

  return (
    <div
      ref={viewportRef}
      className={`tz-viewport tzv4-viewport${className ? ` ${className}` : ""}`}
      data-testid="tadazz-stage-viewport"
    >
      <div
        ref={stageRef}
        className={["tzv4-stage", isShow && "stage-show"]
          .filter(Boolean)
          .join(" ")}
        data-v4-scene={view?.scene ?? "idle"}
        data-stage-mode={view?.scene ?? (customScreen ? "custom" : "idle")}
        data-question-key={data.questionKey ?? ""}
        data-reduced-motion={reducedMotion ? "true" : "false"}
        style={stageStyle}
        data-testid="tadazz-stage"
      >
        <StageBackdropV4 scene={scene} data={data} assetBase={assetBase} />
        <div className="veil" />
        {underlay as ReactNode}
        <StageAmbientV4 />
        {view &&
          !["company-opening", "grand-opening", "grand-finale", "story-assembly", "story-live"].includes(
            view.scene,
          ) && (
            <img
              className="stage-teaser"
              src="/tadazz-show/second-library/teaser-screen-source.jpg"
              alt="Creating Worlds"
            />
          )}
        <div className="tzv4-scene-root" key={view?.revision}>
          {view ? (
            <StageSceneV4
              scene={view.scene}
              data={{
                ...data,
                showPercentages:
                  data.showPercentages ?? showPercentagesRef.current,
              }}
              assetBase={assetBase}
            />
          ) : null}
        </div>
        {customScreen ? (
          <div className="tzv4-custom-root">{customScreen as ReactNode}</div>
        ) : null}
        {overlay as ReactNode}
        <div className="tzv4-fx-root" aria-hidden="true" />
        <div className="tzv4-screen-flash" aria-hidden="true" />
        {wipeRev > 0 && (
          <div
            ref={wipeLayerRef}
            className="tzv4-wipe-layer"
            aria-hidden="true"
            data-testid="tadazz-v4-wipe-layer"
          >
            <ZWipeV4 />
            <div className="tzv4-fx-root" />
            <div className="tzv4-screen-flash" />
          </div>
        )}
      </div>
    </div>
  )
})
