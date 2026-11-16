import { requireLibraryValue } from "../../core/show-library/required"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { assertBoundedJson } from "../../core/show-library/primitives"
import {
  applicationAppearanceSchema,
  applicationPreviewFrameSchema,
  type ApplicationPreviewFrame,
} from "../../core/show-library/application-preview-schema"
import { ApplicationPreviewStage } from "./application-preview-stage"
import "../legacy-effects.css"

// Only immutable application CSS is shared. No frame, source, grant or root is retained.
let compiledStyle: { css: string; sheet: CSSStyleSheet } | undefined = undefined

/** This exact self-contained first-party artifact is loaded by a digest-pinned host. */
export function mount(
  element: HTMLElement,
  css: string,
  onUnavailable: () => void,
) {
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: "open" })
  const previousSheets = shadow.adoptedStyleSheets
  let style: HTMLStyleElement | undefined = undefined

  if (
    typeof CSSStyleSheet !== "undefined" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function" &&
    "adoptedStyleSheets" in shadow
  ) {
    if (compiledStyle?.css !== css) {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      compiledStyle = { css, sheet }
    }

    shadow.adoptedStyleSheets = [...previousSheets, compiledStyle.sheet]
  } else {
    style = document.createElement("style")
    style.textContent = css
  }

  const target = document.createElement("div")
  target.style.cssText =
    "width:100%;height:100%;position:relative;overflow:hidden"

  if (style) {
    shadow.append(style)
  }

  shadow.append(target)
  const root = createRoot(target, {
    onUncaughtError: () => queueMicrotask(onUnavailable),
  })
  let disposed = false,
    generation = 0
  let previousShow: unknown = undefined,
    parsedShow:
      | ReturnType<typeof applicationPreviewFrameSchema.parse>["show"]
      | undefined = undefined
  let previousAppearance: unknown = undefined,
    parsedAppearance: ApplicationPreviewFrame["appearance"] = undefined
  const pending = new Set<() => void>()
  let previousKey = ""

  return {
    update(value: unknown) {
      if (disposed) {
        return Promise.reject(new Error("Preview disposed"))
      }

      assertBoundedJson(value)
      const raw = value as { show: unknown; appearance?: unknown }
      const core = applicationPreviewFrameSchema
        .omit({ show: true, appearance: true })
        .parse(
          Object.fromEntries(
            Object.entries(raw).filter(
              ([key]) => key !== "show" && key !== "appearance",
            ),
          ),
        )
      const frame: ApplicationPreviewFrame = {
        ...core,
        show:
          raw.show === previousShow && Object.isFrozen(raw.show)
            ? requireLibraryValue(parsedShow)
            : applicationPreviewFrameSchema.shape.show.parse(raw.show),
        ...(raw.appearance === undefined
          ? {}
          : {
              appearance:
                raw.appearance === previousAppearance &&
                Object.isFrozen(raw.appearance)
                  ? requireLibraryValue(parsedAppearance)
                  : applicationAppearanceSchema.parse(raw.appearance),
            }),
      }
      previousShow = raw.show
      parsedShow = frame.show
      previousAppearance = raw.appearance
      parsedAppearance = frame.appearance
      const key = `${frame.clock.epoch}:${frame.chapterIndex}:${frame.appearanceRevision}`
      const sameChapter = key === previousKey
      previousKey = key
      generation += 1

      const ticket = generation
      for (const resolve of pending) {
        resolve()
      }
      pending.clear()

      return new Promise<void>((resolve) => {
        pending.add(resolve)
        const done = () => {
          pending.delete(resolve)
          resolve()
        }
        flushSync(() =>
          root.render(
            <ApplicationPreviewStage
              frame={frame}
              onCommitted={done}
              onUnavailable={() => {
                if (!disposed && ticket === generation) {
                  onUnavailable()
                }

                done()
              }}
            />,
          ),
        )

        if (sameChapter) {
          queueMicrotask(done)
        }
      })
    },
    mediaElement: () => shadow.querySelector<HTMLMediaElement>("video, audio"),
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      generation += 1
      for (const resolve of pending) {
        resolve()
      }
      pending.clear()

      if ("adoptedStyleSheets" in shadow) {
        shadow.adoptedStyleSheets = previousSheets
      }

      root.unmount()
      shadow.replaceChildren()
    },
  }
}
