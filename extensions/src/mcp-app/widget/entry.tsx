import { createRoot } from "react-dom/client"
import { useEffect, useRef } from "react"
import { Widget } from "./Widget.tsx"
import { createWidgetBridge } from "./bridge.ts"
import "./widget.css"
import { bundledStyle } from "./stage.tsx"
const target = document.getElementById("tadazz-widget")

if (!target) {
  throw new Error("widget:missing-root")
}

const root = createRoot(target)
let context = {}
function ResourceStage() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mountHost = host.current

    if (!mountHost) {
      return
    }

    const shadow = mountHost.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = bundledStyle
    const element = document.createElement("div")
    element.className = "widget-native-stage"
    shadow.append(style, element)
    const detach = bridge.attach(element)
    void bridge.connect()

    return () => {
      detach()
      shadow.replaceChildren()
    }
  }, [])

  return (
    <div
      ref={host}
      className="widget-stage-host"
      data-testid="sdk-candidate-stage"
    />
  )
}
const render = () =>
  root.render(
    <Widget
      controller={bridge.controller}
      context={context}
      toolsAvailable={Boolean(bridge.app.getHostCapabilities()?.serverTools)}
      nativeSurface={<ResourceStage />}
      requestPreview={() => bridge.preview()}
      expand={() => bridge.app.requestDisplayMode({ mode: "fullscreen" })}
    />,
  )
const bridge = createWidgetBridge((next) => {
  context = { ...context, ...next }
  render()
})
render()
window.addEventListener(
  "pagehide",
  () => {
    bridge.dispose()
    root.unmount()
  },
  { once: true },
)
