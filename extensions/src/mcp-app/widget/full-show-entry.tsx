import NativeButton from "../../../../packages/web/src/components/Button"
import {
  ArrowLeft,
  ArrowRight,
  Maximize,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  SquarePen,
} from "lucide-react"
import { EditorWorkspace } from "../../presentation/editor-workspace"
import { restoreNativeCspConfiguration } from "../../presentation/show-library-preview/renderer-csp-admission.ts"
import { App } from "@modelcontextprotocol/ext-apps"
import { createRoot, type Root } from "react-dom/client"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { createFullShowConsumerV3 } from "../client/full-show-frame.ts"
import {
  createFullShowPlayback,
  type FullShowPlaybackSnapshot,
} from "../client/full-show-playback.ts"
import {
  fullShowAutomaticChapter,
  fullShowCardNavigation,
} from "../client/full-show-navigation.ts"
import {
  fullShowToolInputV3Schema,
  type FullShowFrameV3,
  type FullShowToolInputV3,
} from "../contracts/full-show-frame.ts"
import { dataSchemas, outputs } from "../contracts/tools.ts"
import type {
  SemanticPatch,
  SemanticPatchInput,
  SemanticUndoInput,
} from "../contracts/semantic-edit.ts"
import { FullShowEditorV3 } from "./full-show-editor.tsx"
import { FullShowSaveV3 } from "./full-show-save.tsx"
import { FullShowNativeStageV3 } from "./full-show-stage.tsx"
import { createWidgetI18n, locales } from "./i18n.ts"
import "./widget.css"

declare const __TADAZZ_FULL_SHOW_BUILD_ID__: string
restoreNativeCspConfiguration()
const bundledStyle = "__TADAZZ_WIDGET_BUNDLED_CSS_20261115__"
const app = new App(
  { name: "tadazz-full-show", version: "0.3.0" },
  {},
  { strict: true, webMcpBridge: false },
)
const consumer = createFullShowConsumerV3(__TADAZZ_FULL_SHOW_BUILD_ID__)
const i18n = createWidgetI18n()
interface State {
  frame: FullShowFrameV3 | null
  status: string
  selected: FullShowToolInputV3 | null
  replaySequence: number
}
let state: State = {
  frame: null,
  status: "waiting",
  selected: null,
  replaySequence: 0,
}
let closed = false,
  inputSeen = false,
  resultSeen = false,
  generation = 0
let hostTicket: object | null = null
const listeners = new Set<() => void>()
const publish = (next: Partial<State>) => {
  state = { ...state, ...next }
  for (const listener of listeners) {
    listener()
  }
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
const unavailable = () => {
  consumer.cancel()
  publish({ frame: null, status: "unavailable" })
}
const accept = (ticket: object, raw: unknown, replay = false) => {
  try {
    const frame = consumer.receive(ticket, raw)

    if (!frame) {
      return
    }

    void i18n.changeLanguage(frame.inventory.context.locale)
    publish({
      frame,
      status: "ready",
      replaySequence: state.replaySequence + Number(replay),
    })
  } catch {
    unavailable()
  }
}
const nextGeneration = () => {
  generation += 1

  return generation
}
const remainsCurrent = (pending: number) => !closed && pending === generation
async function preview(raw: unknown, replay = false) {
  if (closed || !app.getHostCapabilities()?.serverTools) {
    return
  }

  const args = fullShowToolInputV3Schema.parse(raw)
  const ticket = consumer.begin(args),
    pending = nextGeneration()
  hostTicket = null
  publish({ status: "loading", selected: args })

  try {
    const result = await app.callServerTool(
      { name: "preview_show", arguments: args },
      { timeout: 15000 },
    )

    if (remainsCurrent(pending)) {
      accept(ticket, result, replay)
    }
  } catch {
    if (remainsCurrent(pending)) {
      unavailable()
    }
  }
}
function selection(
  frame: FullShowFrameV3,
  chapterId?: string,
): FullShowToolInputV3 {
  return {
    contractVersion: "0.1.0",
    selectionVersion: 3,
    draftId: frame.inventory.draftId,
    expectedRevision: frame.inventory.revision,
    context: frame.inventory.context,
    ...(chapterId ? { chapterId } : {}),
  }
}
app.addEventListener("toolinput", ({ arguments: args }) => {
  if (closed || inputSeen) {
    generation += 1
    unavailable()

    return
  }

  inputSeen = true

  try {
    const selected = fullShowToolInputV3Schema.parse(args)
    hostTicket = consumer.begin(selected)
    publish({ selected, status: "loading" })
  } catch {
    unavailable()
  }
})
app.addEventListener("toolresult", (result) => {
  if (closed || !hostTicket || resultSeen) {
    return
  }

  resultSeen = true
  const ticket = hostTicket
  hostTicket = null
  accept(ticket, result)
})
app.addEventListener("toolinputpartial", () => {
  generation += 1
  unavailable()
})
app.addEventListener("toolcancelled", () => {
  generation += 1
  consumer.cancel()
  publish({ frame: null, status: "cancelled" })
})
const close = () => {
  if (closed) {
    return
  }

  closed = true
  generation += 1
  consumer.dispose()
  publish({ frame: null, status: "closed", selected: null })
}
app.addEventListener("hostcontextchanged", (context) => {
  if (context.toolInfo) {
    close()
    void app.close()

    return
  }

  publish({})
})
app.onclose = close
app.onteardown = () => {
  close()
  setTimeout(() => void app.close(), 0)

  return {}
}

function Surface({
  frame,
  playback,
  aspect,
  audioControlsTarget,
  demoControlsTarget,
  onDemoReveal,
  demoLabels,
  soundEnabled,
  onSoundEnabled,
}: {
  frame: FullShowFrameV3
  playback: FullShowPlaybackSnapshot
  aspect: "16 / 9" | "4 / 3"
  audioControlsTarget: HTMLDivElement | null
  demoControlsTarget: HTMLDivElement | null
  onDemoReveal: () => void
  demoLabels: {
    choose: string
    selected: (answerNumber: number) => string
    reveal: string
    correct: string
    incorrect: string
    survey: string
  }
  soundEnabled: boolean
  onSoundEnabled: (enabled: boolean) => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const element = useRef<HTMLDivElement>(null)
  const renderer = useRef<Root | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [appearance, setAppearance] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    const target = viewport.current

    if (!target) {
      return
    }

    const ratio = aspect === "4 / 3" ? 4 / 3 : 16 / 9
    const fit = () => {
      const width = Math.min(target.clientWidth, target.clientHeight * ratio)
      setSize({ width, height: width / ratio })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(target)

    return () => observer.disconnect()
  }, [aspect])
  useEffect(() => {
    const target = element.current

    if (!target) {
      return
    }

    const shadow = target.shadowRoot ?? target.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = bundledStyle
    const body = document.createElement("div")
    body.className = "widget-native-stage"
    shadow.replaceChildren(style, body)
    renderer.current = createRoot(body, { onUncaughtError: unavailable })

    return () => {
      renderer.current?.unmount()
      renderer.current = null
      shadow.replaceChildren()
    }
  }, [])
  useEffect(() => {
    renderer.current?.render(
      <FullShowNativeStageV3
        value={frame}
        playback={playback}
        audioControlsTarget={audioControlsTarget}
        demoControlsTarget={demoControlsTarget}
        onDemoReveal={onDemoReveal}
        demoLabels={demoLabels}
        onUnavailable={unavailable}
        onWorkspaceAppearance={setAppearance}
        soundEnabled={soundEnabled}
        onSoundEnabled={onSoundEnabled}
      />,
    )
  }, [
    frame,
    playback,
    soundEnabled,
    onSoundEnabled,
    audioControlsTarget,
    demoControlsTarget,
    onDemoReveal,
    demoLabels,
  ])

  return (
    <div ref={viewport} className="widget-stage-viewport" style={appearance}>
      <div
        ref={element}
        className="widget-stage-host"
        style={{
          ...size,
          aspectRatio: aspect,
          visibility: size.width ? "visible" : "hidden",
        }}
        data-testid="full-show-native-surface"
      />
    </div>
  )
}
interface PendingMutation {
  name: "apply_game_edit" | "undo_game_edit"
  input: SemanticPatchInput | SemanticUndoInput
  selection: FullShowToolInputV3
}
function FullShowWidget() {
  const current = useSyncExternalStore(subscribe, () => state)
  const { t } = useTranslation("widget")
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [audioControlsTarget, setAudioControlsTarget] =
    useState<HTMLDivElement | null>(null)
  const [demoControlsTarget, setDemoControlsTarget] =
    useState<HTMLDivElement | null>(null)
  const [hostActionFailed, setHostActionFailed] = useState(false)
  const [aspect, setAspect] = useState<"16 / 9" | "4 / 3">("16 / 9")
  const [playbackOwner] = useState(() => createFullShowPlayback())
  const [playback, setPlayback] = useState(() => playbackOwner.snapshot())
  const [undoId, setUndoId] = useState<string>()
  const [pendingMutation, setPendingMutation] =
    useState<PendingMutation | null>(null)
  const { frame } = current
  const canCall = !closed && Boolean(app.getHostCapabilities()?.serverTools)
  const busy = current.status === "loading"
  const canExpand =
    !closed &&
    Boolean(app.getHostContext()?.availableDisplayModes?.includes("fullscreen"))
  useLayoutEffect(() => {
    setPlayback(playbackOwner.select(frame, current.replaySequence))
  }, [frame, current.replaySequence, playbackOwner])
  useEffect(() => {
    if (!frame || playback.clock.paused) {
      return
    }

    let request = 0
    let previousPaint = 0
    // This RAF only samples the existing native demo clock; it never advances time.
    const paint = (now: number) => {
      if (now - previousPaint >= 100) {
        previousPaint = now
        setPlayback(playbackOwner.snapshot())
      }

      request = requestAnimationFrame(paint)
    }
    request = requestAnimationFrame(paint)

    return () => cancelAnimationFrame(request)
  }, [Boolean(frame), playback.clock.paused, playbackOwner])
  const index =
    frame?.inventory.chapters.findIndex(
      (c) => c.id === frame.inventory.selectedChapterId,
    ) ?? -1
  const navigation = frame ? fullShowCardNavigation(frame.inventory) : null
  const automaticAttempt = useRef("")
  useEffect(() => {
    if (!frame || !canCall || busy) {
      return
    }

    // Read the clock owner after the layout effect selected this frame. A React
    // render can still carry the preceding phase's sampled elapsed time.
    const livePlayback = playbackOwner.snapshot()
    const next = fullShowAutomaticChapter(frame.inventory, livePlayback)

    if (!next) {
      return
    }

    const key = `${frame.inventory.draftId}:${frame.inventory.revision}:${frame.inventory.selectedChapterId}:${livePlayback.clock.epoch}:${current.replaySequence}`

    if (automaticAttempt.current === key) {
      return
    }

    automaticAttempt.current = key
    void preview(selection(frame, next.id))
  }, [frame, canCall, busy, playback, playbackOwner, current.replaySequence])
  useEffect(() => {
    if (!frame) {
      setSoundEnabled(false)
    }
  }, [Boolean(frame)])
  useEffect(() => {
    setUndoId(undefined)

    if (!frame || !canCall) {
      return
    }

    let active = true
    void app
      .callServerTool(
        {
          name: "get_game_draft_summary",
          arguments: {
            contractVersion: "0.1.0",
            draftId: frame.inventory.draftId,
            expectedRevision: frame.inventory.revision,
          },
        },
        { timeout: 10000 },
      )
      .then((result) => {
        const body = outputs.get_game_draft_summary.parse(
          result.structuredContent,
        )

        if (!body.ok || result.isError) {
          return
        }

        const data = dataSchemas.get_game_draft_summary.parse(body.data)

        if (
          active &&
          data.draftId === frame.inventory.draftId &&
          data.revision === frame.inventory.revision
        ) {
          setUndoId(data.undoOperationId)
        }
      })
      .catch(() => {
        /* Discovery is optional; edits still require an exact server ACK. */
      })

    return () => {
      active = false
    }
  }, [frame?.inventory.draftId, frame?.inventory.revision, canCall])

  async function refresh() {
    const { selected } = current

    if (!selected || !canCall || busy) {
      return
    }

    const pending = nextGeneration()
    consumer.cancel()
    publish({ frame: null, status: "loading" })

    try {
      const result = await app.callServerTool(
        {
          name: "get_game_draft_summary",
          arguments: {
            contractVersion: "0.1.0",
            draftId: selected.draftId,
          },
        },
        { timeout: 10000 },
      )
      const body = outputs.get_game_draft_summary.parse(
        result.structuredContent,
      )

      if (!body.ok || result.isError) {
        throw new Error("summary")
      }

      const data = dataSchemas.get_game_draft_summary.parse(body.data)

      if (data.draftId !== selected.draftId) {
        throw new Error("summary")
      }

      if (remainsCurrent(pending)) {
        setUndoId(data.undoOperationId)
        await preview({
          ...selected,
          expectedRevision: data.revision,
          chapterId: undefined,
        })
      }
    } catch {
      if (remainsCurrent(pending)) {
        unavailable()
      }
    }
  }
  async function execute(request: PendingMutation) {
    if (!canCall || busy) {
      return
    }

    const pending = nextGeneration()
    consumer.cancel()
    setPendingMutation(request)
    publish({ status: "loading" })

    try {
      const result = await app.callServerTool(
        {
          name: request.name,
          arguments: request.input,
        },
        { timeout: 15000 },
      )
      const body = outputs[request.name].parse(result.structuredContent)

      if (!body.ok || result.isError) {
        throw new Error("mutation")
      }

      const data = dataSchemas[request.name].parse(body.data)

      if (
        data.draftId !== request.input.draftId ||
        data.revision !== request.input.expectedRevision + 1
      ) {
        throw new Error("mutation")
      }

      if (remainsCurrent(pending)) {
        setPendingMutation(null)
        setUndoId(data.undoOperationId)
        await preview({ ...request.selection, expectedRevision: data.revision })
      }
    } catch {
      if (remainsCurrent(pending)) {
        consumer.cancel()
        publish({ frame: null, status: "conflict" })
      }
    }
  }
  async function apply(patch: SemanticPatch) {
    if (!frame || !canCall || busy) {
      return
    }

    const selected = selection(frame, frame.inventory.selectedChapterId)
    await execute({
      name: "apply_game_edit",
      selection: selected,
      input: {
        contractVersion: "0.1.0",
        draftId: selected.draftId,
        expectedRevision: selected.expectedRevision,
        idempotencyKey: crypto.randomUUID(),
        patch,
      },
    })
  }
  async function undo() {
    if (!frame || !undoId || !canCall || busy) {
      return
    }

    const selected = selection(frame, frame.inventory.selectedChapterId)
    await execute({
      name: "undo_game_edit",
      selection: selected,
      input: {
        contractVersion: "0.1.0",
        draftId: selected.draftId,
        expectedRevision: selected.expectedRevision,
        idempotencyKey: crypto.randomUUID(),
        undoOperationId: undoId,
      },
    })
  }

  const displayControls = frame ? (
    <div className="widget-toolbar widget-display-options">
      <label>
        {t("aspectRatio")}
        <select
          data-testid="full-show-aspect"
          value={aspect}
          onChange={(event) =>
            setAspect(event.target.value === "4 / 3" ? "4 / 3" : "16 / 9")
          }
        >
          <option value="16 / 9">16:9</option>
          <option value="4 / 3">4:3</option>
        </select>
      </label>
      <label>
        {t("language")}
        <select
          data-testid="full-show-language"
          disabled={!canCall || busy}
          value={frame.inventory.context.locale}
          onChange={(event) =>
            void preview({
              ...selection(frame, frame.inventory.selectedChapterId),
              context: {
                ...frame.inventory.context,
                locale: event.target.value,
              },
            })
          }
        >
          {locales.map((locale) => (
            <option key={locale}>{locale}</option>
          ))}
        </select>
      </label>
      <label className="widget-checkbox-label">
        <input
          data-testid="full-show-reduce-motion"
          type="checkbox"
          checked={frame.inventory.context.reducedMotion}
          disabled={!canCall || busy}
          onChange={(event) =>
            void preview({
              ...selection(frame, frame.inventory.selectedChapterId),
              context: {
                ...frame.inventory.context,
                reducedMotion: event.target.checked,
              },
            })
          }
        />
        {t("reduce")}
      </label>
      <div ref={setAudioControlsTarget} className="widget-audio-controls" />
    </div>
  ) : null
  const saveControls = (
    <div className="widget-save-panel">
      {current.selected && (
        <FullShowSaveV3
          key={`${current.selected.draftId}:${current.selected.expectedRevision}`}
          app={app}
          draftId={current.selected.draftId}
          revision={current.selected.expectedRevision}
          disabled={!frame || busy || closed}
        />
      )}
      {pendingMutation && (
        <NativeButton
          classNameContent="contents"
          data-control-source="razzia"
          type="button"
          data-testid="full-show-retry-edit"
          disabled={!canCall || busy}
          onClick={() => void execute(pendingMutation)}
        >
          {t("retryEdit")}
        </NativeButton>
      )}
      <p className="widget-help">{t("noSave")}</p>
    </div>
  )
  const transport =
    frame && navigation ? (
      <nav className="widget-transport" aria-label={t("title")}>
        <NativeButton
          classNameContent="contents"
          data-control-source="razzia"
          type="button"
          data-testid="full-show-previous"
          aria-label={t("previousChapter")}
          title={t("previousChapter")}
          disabled={!canCall || busy || !navigation.previous}
          onClick={() =>
            navigation.previous &&
            void preview(selection(frame, navigation.previous.id))
          }
        >
          <ArrowLeft aria-hidden="true" />
        </NativeButton>
        <output data-testid="full-show-position">
          {navigation.index + 1} / {navigation.cards.length}
        </output>
        <NativeButton
          classNameContent="contents"
          data-control-source="razzia"
          type="button"
          data-testid="full-show-next"
          aria-label={t("nextChapter")}
          title={t("nextChapter")}
          disabled={!canCall || busy || !navigation.next}
          onClick={() =>
            navigation.next &&
            void preview(selection(frame, navigation.next.id))
          }
        >
          <ArrowRight aria-hidden="true" />
        </NativeButton>
        <NativeButton
          classNameContent="contents"
          data-control-source="razzia"
          type="button"
          data-testid="full-show-pause"
          aria-label={t(playback.clock.paused ? "resumeShow" : "pauseShow")}
          title={t(playback.clock.paused ? "resumeShow" : "pauseShow")}
          disabled={busy}
          onClick={() =>
            setPlayback(
              playback.clock.paused
                ? playbackOwner.resume()
                : playbackOwner.pause(),
            )
          }
        >
          {playback.clock.paused ? (
            <Play aria-hidden="true" />
          ) : (
            <Pause aria-hidden="true" />
          )}
        </NativeButton>
        <NativeButton
          classNameContent="contents"
          data-control-source="razzia"
          type="button"
          data-testid="full-show-replay"
          aria-label={t("replay")}
          title={t("replay")}
          disabled={!canCall || busy}
          onClick={() =>
            void preview(selection(frame, navigation.current?.id), true)
          }
        >
          <RotateCcw aria-hidden="true" />
        </NativeButton>
        <div ref={setDemoControlsTarget} className="widget-demo-controls" />
      </nav>
    ) : undefined

  return (
    <main
      className="widget-shell widget-workspace-shell"
      data-testid="full-show-widget"
      dir={i18n.dir()}
      lang={i18n.language}
    >
      <header className="widget-workspace-header">
        <div className="widget-heading">
          <h1 title={frame?.inventory.title ?? t("title")}>
            {frame?.inventory.title ?? t("title")}
          </h1>
          <p>{t("demo")}</p>
        </div>
        <div className="widget-header-actions">
          <NativeButton
            classNameContent="contents"
            data-control-source="razzia"
            type="button"
            data-testid="full-show-refresh"
            aria-label={t("refresh")}
            title={t("refresh")}
            disabled={!canCall || busy || !current.selected}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" />
          </NativeButton>
          {canExpand && (
            <NativeButton
              classNameContent="contents"
              data-control-source="razzia"
              type="button"
              data-testid="full-show-expand"
              aria-label={t("expand")}
              title={t("expand")}
              disabled={busy}
              onClick={() => {
                setHostActionFailed(false)
                void app
                  .requestDisplayMode({ mode: "fullscreen" })
                  .catch(() => setHostActionFailed(true))
              }}
            >
              <Maximize aria-hidden="true" />
            </NativeButton>
          )}
        </div>
      </header>
      <EditorWorkspace
        className="widget-editor-workspace"
        ariaLabel={t("editing")}
        closeLabel={t("closePanel")}
        toolbar={transport}
        panels={[
          ...(frame
            ? [
                {
                  id: "edit",
                  label: t("editing"),
                  icon: <SquarePen aria-hidden="true" />,
                  side: "right" as const,
                  dock: true,
                  content: (
                    <div
                      onFocusCapture={(event) => {
                        const field = (event.target as HTMLElement).dataset
                          .testid

                        // Text editing must stay on this question; live audio
                        // controls keep the current media element playing.
                        if (
                          field === "full-show-title" ||
                          field === "full-show-question-text"
                        ) {
                          setPlayback(playbackOwner.pause())
                        }
                      }}
                    >
                      <FullShowEditorV3
                        app={app}
                        frame={frame}
                        disabled={!canCall || busy}
                        onApply={apply}
                      />
                      <div className="widget-control-row widget-revision-controls">
                        <p data-testid="full-show-revision">
                          {t("revision", {
                            revision: frame.inventory.revision,
                          })}
                        </p>
                        <NativeButton
                          classNameContent="contents"
                          data-control-source="razzia"
                          type="button"
                          data-testid="full-show-undo"
                          disabled={!canCall || busy || !undoId}
                          onClick={() => void undo()}
                        >
                          {t("undo")}
                        </NativeButton>
                      </div>
                    </div>
                  ),
                },
                {
                  id: "display",
                  label: t("appearanceAndSound"),
                  icon: <SlidersHorizontal aria-hidden="true" />,
                  side: "right" as const,
                  content: displayControls,
                },
              ]
            : []),
          {
            id: "save",
            label: t("saveAction"),
            icon: <Save aria-hidden="true" />,
            side: "left" as const,
            content: saveControls,
          },
        ]}
      >
        {frame ? (
          <Surface
            frame={frame}
            playback={playback}
            aspect={aspect}
            audioControlsTarget={audioControlsTarget}
            demoControlsTarget={demoControlsTarget}
            onDemoReveal={() => {
              const selected = frame.inventory.chapters[index]
              const results = frame.inventory.chapters.find(
                (chapter) =>
                  chapter.cardId === selected.cardId &&
                  chapter.kind === "results",
              )

              if (canCall && !busy && results) {
                void preview(selection(frame, results.id))
              }
            }}
            demoLabels={{
              choose: t("demoChoose"),
              selected: (number) => t("demoSelected", { number }),
              reveal: t("results"),
              correct: t("demoCorrect"),
              incorrect: t("demoIncorrect"),
              survey: t("demoSurvey"),
            }}
            soundEnabled={soundEnabled}
            onSoundEnabled={setSoundEnabled}
          />
        ) : (
          <p className="widget-empty-state" role="status">
            {t(current.status)}
          </p>
        )}
      </EditorWorkspace>
      {(busy || hostActionFailed) && (
        <p className="widget-workspace-status" role="status">
          {t(hostActionFailed ? "displayModeFailed" : "loading")}
        </p>
      )}
    </main>
  )
}

const target = document.getElementById("tadazz-widget")

if (!target) {
  throw new Error("full-show:missing-root")
}

const root = createRoot(target)
root.render(
  <I18nextProvider i18n={i18n}>
    <FullShowWidget />
  </I18nextProvider>,
)

if (window.parent === window) {
  unavailable()
} else {
  void app
    .connect(undefined, { timeout: 15000 })
    .then(() => publish({}))
    .catch(unavailable)
}

window.addEventListener(
  "pagehide",
  () => {
    close()
    root.unmount()
    void app.close()
  },
  { once: true },
)
