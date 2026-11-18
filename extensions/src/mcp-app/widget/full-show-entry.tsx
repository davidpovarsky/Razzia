import { restoreNativeCspConfiguration } from "../../presentation/show-library-preview/renderer-csp-admission.ts"
import { App } from "@modelcontextprotocol/ext-apps"
import { createRoot } from "react-dom/client"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { createFullShowConsumerV3 } from "../client/full-show-frame.ts"
import {
  fullShowToolInputV3Schema,
  type FullShowFrameV3,
  type FullShowToolInputV3,
} from "../contracts/full-show-frame.ts"
import { dataSchemas, outputs } from "../contracts/tools.ts"
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
}
let state: State = { frame: null, status: "waiting", selected: null }
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
const accept = (ticket: object, raw: unknown) => {
  try {
    const frame = consumer.receive(ticket, raw)

    if (!frame) {
      return
    }

    void i18n.changeLanguage(frame.inventory.context.locale)
    publish({ frame, status: "ready" })
  } catch {
    unavailable()
  }
}
const nextGeneration = () => {
  generation += 1

  return generation
}
const remainsCurrent = (pending: number) => !closed && pending === generation
async function preview(raw: unknown) {
  if (closed || !app.getHostCapabilities()?.serverTools) {
    return
  }

  const args = fullShowToolInputV3Schema.parse(raw)
  const ticket = consumer.begin(args),
    pending = nextGeneration()
  hostTicket = null
  publish({ frame: null, status: "loading", selected: args })

  try {
    const result = await app.callServerTool(
      { name: "preview_show", arguments: args },
      { timeout: 15000 },
    )

    if (remainsCurrent(pending)) {
      accept(ticket, result)
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
  publish({ frame: null, status: "closed" })
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

function Surface({ frame }: { frame: FullShowFrameV3 }) {
  const element = useRef<HTMLDivElement>(null)
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
    const renderer = createRoot(body, { onUncaughtError: unavailable })
    renderer.render(
      <FullShowNativeStageV3 value={frame} onUnavailable={unavailable} />,
    )

    return () => {
      renderer.unmount()
      shadow.replaceChildren()
    }
  }, [frame])

  return (
    <div
      ref={element}
      className="widget-stage-host"
      data-testid="full-show-native-surface"
    />
  )
}
function FullShowWidget() {
  const current = useSyncExternalStore(subscribe, () => state)
  const { t } = useTranslation("widget")
  const [title, setTitle] = useState("")
  const { frame } = current
  useEffect(() => {
    if (frame) {
      setTitle(frame.inventory.title)
    }
  }, [frame?.inventory.title, frame?.inventory.revision])
  const index =
    frame?.inventory.chapters.findIndex(
      (c) => c.id === frame.inventory.selectedChapterId,
    ) ?? -1
  const canCall = !closed && Boolean(app.getHostCapabilities()?.serverTools)
  async function refresh() {
    const { selected } = current

    if (!selected || !canCall) {
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
  async function rename() {
    if (!frame || !canCall || !title.trim()) {
      return
    }

    const selected = selection(frame)
    const pending = nextGeneration()
    consumer.cancel()
    publish({ frame: null, status: "loading" })

    try {
      const result = await app.callServerTool(
        {
          name: "update_game_title",
          arguments: {
            contractVersion: "0.1.0",
            draftId: selected.draftId,
            expectedRevision: selected.expectedRevision,
            title,
            idempotencyKey: crypto.randomUUID(),
          },
        },
        { timeout: 10000 },
      )
      const body = outputs.update_game_title.parse(result.structuredContent)

      if (!body.ok || result.isError) {
        throw new Error("title")
      }

      const data = dataSchemas.update_game_title.parse(body.data)

      if (
        data.draftId !== selected.draftId ||
        data.revision !== selected.expectedRevision + 1 ||
        data.summary.title !== title
      ) {
        throw new Error("title")
      }

      if (remainsCurrent(pending)) {
        await preview({ ...selected, expectedRevision: data.revision })
      }
    } catch {
      if (remainsCurrent(pending)) {
        publish({ frame: null, status: "conflict" })
      }
    }
  }

  return (
    <main className="widget-shell" data-testid="full-show-widget">
      <header>
        <h1 className="text-xl font-bold">
          {frame?.inventory.title ?? t("title")}
        </h1>
        <p>{t("demo")}</p>
      </header>
      {frame ? (
        <>
          <Surface frame={frame} />
          <nav
            className="flex flex-wrap items-center gap-3"
            aria-label={t("title")}
          >
            <button
              type="button"
              disabled={!canCall || index <= 0}
              onClick={() =>
                void preview(
                  selection(frame, frame.inventory.chapters[index - 1]?.id),
                )
              }
            >
              {t("previous")}
            </button>
            <output>
              {index + 1} / {frame.inventory.chapters.length}
            </output>
            <button
              type="button"
              disabled={
                !canCall || index >= frame.inventory.chapters.length - 1
              }
              onClick={() =>
                void preview(
                  selection(frame, frame.inventory.chapters[index + 1]?.id),
                )
              }
            >
              {t("next")}
            </button>
            <button
              type="button"
              disabled={!canCall}
              onClick={() =>
                void preview(
                  selection(frame, frame.inventory.selectedChapterId),
                )
              }
            >
              {t("replay")}
            </button>
            <button
              type="button"
              onClick={() =>
                void app.requestDisplayMode({ mode: "fullscreen" })
              }
            >
              {t("expand")}
            </button>
            <label>
              {t("language")}{" "}
              <select
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
          </nav>
          <div className="flex flex-wrap items-center gap-3" role="group">
            <label>
              {t("edit")}{" "}
              <input
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void rename()}
              disabled={
                !canCall || title === frame.inventory.title || !title.trim()
              }
            >
              {t("apply")}
            </button>
          </div>
          <p>{t("revision", { revision: frame.inventory.revision })}</p>
        </>
      ) : (
        <p role="status">{t(current.status)}</p>
      )}
      <button
        type="button"
        disabled={!canCall || !current.selected}
        onClick={() => void refresh()}
      >
        {t("refresh")}
      </button>
      <p className="text-sm">{t("noSave")}</p>
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
