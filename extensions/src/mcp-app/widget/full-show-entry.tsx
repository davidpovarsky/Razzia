import NativeButton from "../../../../packages/web/src/components/Button"
import { restoreNativeCspConfiguration } from "../../presentation/show-library-preview/renderer-csp-admission.ts"
import { App } from "@modelcontextprotocol/ext-apps"
import { createRoot, type Root } from "react-dom/client"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { createFullShowConsumerV3 } from "../client/full-show-frame.ts"
import {
  createFullShowPlayback,
  type FullShowPlaybackSnapshot,
} from "../client/full-show-playback.ts"
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
  const element = useRef<HTMLDivElement>(null)
  const renderer = useRef<Root | null>(null)
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
    <div
      ref={element}
      className="widget-stage-host"
      style={{ aspectRatio: aspect }}
      data-testid="full-show-native-surface"
    />
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

  return (
    <main
      className="widget-shell"
      data-testid="full-show-widget"
      dir={i18n.dir()}
      lang={i18n.language}
    >
      <header>
        <h1 className="text-xl font-bold">
          {frame?.inventory.title ?? t("title")}
        </h1>
        <p>{t("demo")}</p>
      </header>
      {frame ? (
        <>
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
          <nav className="widget-toolbar" aria-label={t("title")}>
            <NativeButton
              classNameContent="contents"
              data-control-source="razzia"
              type="button"
              data-testid="full-show-previous"
              disabled={!canCall || busy || index <= 0}
              onClick={() =>
                void preview(
                  selection(frame, frame.inventory.chapters[index - 1]?.id),
                )
              }
            >
              {t("previousChapter")}
            </NativeButton>
            <output data-testid="full-show-position">
              {index + 1} / {frame.inventory.chapters.length}
            </output>
            <NativeButton
              classNameContent="contents"
              data-control-source="razzia"
              type="button"
              data-testid="full-show-next"
              disabled={
                !canCall || busy || index >= frame.inventory.chapters.length - 1
              }
              onClick={() =>
                void preview(
                  selection(frame, frame.inventory.chapters[index + 1]?.id),
                )
              }
            >
              {t("nextChapter")}
            </NativeButton>
            <NativeButton
              classNameContent="contents"
              data-control-source="razzia"
              type="button"
              data-testid="full-show-replay"
              disabled={!canCall || busy}
              onClick={() =>
                void preview(
                  selection(frame, frame.inventory.selectedChapterId),
                  true,
                )
              }
            >
              {t("replay")}
            </NativeButton>
            <NativeButton
              classNameContent="contents"
              data-control-source="razzia"
              type="button"
              data-testid="full-show-pause"
              disabled={busy}
              onClick={() =>
                setPlayback(
                  playback.clock.paused
                    ? playbackOwner.resume()
                    : playbackOwner.pause(),
                )
              }
            >
              {t(playback.clock.paused ? "resumeShow" : "pauseShow")}
            </NativeButton>
            {canExpand && (
              <NativeButton
                classNameContent="contents"
                data-control-source="razzia"
                type="button"
                data-testid="full-show-expand"
                disabled={busy}
                onClick={() => {
                  setHostActionFailed(false)
                  void app
                    .requestDisplayMode({ mode: "fullscreen" })
                    .catch(() => setHostActionFailed(true))
                }}
              >
                {t("expand")}
              </NativeButton>
            )}
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
            <label>
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
              />{" "}
              {t("reduce")}
            </label>
            <div ref={setDemoControlsTarget} className="widget-demo-controls" />
            <div
              ref={setAudioControlsTarget}
              className="widget-audio-controls"
            />
          </nav>
          <FullShowEditorV3
            app={app}
            frame={frame}
            disabled={!canCall || busy}
            onApply={apply}
          />
          <div className="widget-control-row">
            <p data-testid="full-show-revision">
              {t("revision", { revision: frame.inventory.revision })}
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
          {busy && <p role="status">{t("loading")}</p>}
        </>
      ) : (
        <p role="status">{t(current.status)}</p>
      )}
      <div className="widget-control-row">
        <NativeButton
          classNameContent="contents"
          data-control-source="razzia"
          type="button"
          data-testid="full-show-refresh"
          disabled={!canCall || busy || !current.selected}
          onClick={() => void refresh()}
        >
          {t("refresh")}
        </NativeButton>
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
      </div>
      {current.selected && (
        <FullShowSaveV3
          key={`${current.selected.draftId}:${current.selected.expectedRevision}`}
          app={app}
          draftId={current.selected.draftId}
          revision={current.selected.expectedRevision}
          disabled={!frame || busy || closed}
        />
      )}
      {hostActionFailed && <p role="status">{t("displayModeFailed")}</p>}
      <p className="widget-help">{t("noSave")}</p>
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
