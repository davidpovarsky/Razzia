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
import { applicationPackagePreviewSchema } from "../../core/show-library/application-package-preview"
import "../legacy-effects.css"
import "@fontsource-variable/rubik/wght.css"
import { acquireNativePreviewFonts } from "./native-fonts"

// Only immutable application CSS is shared. No frame, source, grant or root is retained.
const compiledStyles = new WeakMap<
  Document,
  { css: string; sheet: CSSStyleSheet }
>()

/** This exact self-contained first-party artifact is loaded by a digest-pinned host. */
export function mount(
  element: HTMLElement,
  css: string,
  onUnavailable: () => void,
) {
  const { ownerDocument } = element
  const owner = ownerDocument.defaultView
  const fonts = acquireNativePreviewFonts(ownerDocument, css)
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: "open" })
  const previousSheets = shadow.adoptedStyleSheets
  let style: HTMLStyleElement | undefined = undefined

  if (
    typeof owner?.CSSStyleSheet === "function" &&
    typeof owner.CSSStyleSheet.prototype.replaceSync === "function" &&
    "adoptedStyleSheets" in shadow
  ) {
    let compiledStyle = compiledStyles.get(ownerDocument)

    if (compiledStyle?.css !== css) {
      const sheet = new owner.CSSStyleSheet()
      sheet.replaceSync(css)
      compiledStyle = { css, sheet }
      compiledStyles.set(ownerDocument, compiledStyle)
    }

    shadow.adoptedStyleSheets = [...previousSheets, compiledStyle.sheet]
  } else {
    style = ownerDocument.createElement("style")
    style.textContent = css
  }

  const target = ownerDocument.createElement("div")
  target.className = "font-display"
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
  let previousPackageContext: unknown = undefined,
    parsedPackageContext: ApplicationPreviewFrame["packageContext"] = undefined
  const pending = new Set<() => void>()
  let previousKey = ""

  return {
    update(value: unknown) {
      if (disposed) {
        return Promise.reject(new Error("Preview disposed"))
      }

      assertBoundedJson(value)
      const raw = value as {
        show: unknown
        appearance?: unknown
        packageContext?: unknown
      }
      const core = applicationPreviewFrameSchema
        .omit({ show: true, appearance: true, packageContext: true })
        .parse(
          Object.fromEntries(
            Object.entries(raw).filter(
              ([key]) =>
                !["show", "appearance", "packageContext"].includes(key),
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
        ...(raw.packageContext === undefined
          ? {}
          : {
              packageContext:
                raw.packageContext === previousPackageContext &&
                Object.isFrozen(raw.packageContext)
                  ? requireLibraryValue(parsedPackageContext)
                  : applicationPackagePreviewSchema.parse(raw.packageContext),
            }),
      }
      previousShow = raw.show
      parsedShow = frame.show
      previousAppearance = raw.appearance
      parsedAppearance = frame.appearance
      previousPackageContext = raw.packageContext
      parsedPackageContext = frame.packageContext
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
        void fonts.ready.then(
          () => {
            if (disposed || ticket !== generation) {
              done()

              return
            }

            try {
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
            } catch {
              if (ticket === generation) {
                onUnavailable()
              }

              done()
            }
          },
          () => {
            if (!disposed && ticket === generation) {
              onUnavailable()
            }

            done()
          },
        )
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
      fonts.dispose()
      shadow.replaceChildren()
    },
  }
}
