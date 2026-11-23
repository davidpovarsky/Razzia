// Explicit separate private fixture artifact. The shipped MCP resource has no
// fixture endpoint, query flag, synthetic authority or mock host implementation.
import { createRoot } from "react-dom/client"
import {
  Widget,
  type PrivateFixturePort,
} from "../../src/mcp-app/widget/Widget.tsx"
import { WidgetController } from "../../src/mcp-app/widget/controller.ts"
import "../../src/mcp-app/widget/widget.css"
const port = Object.freeze<PrivateFixturePort>({
  async load(query, signal) {
    const response = await fetch(
      `/qa/input-v2?${new URLSearchParams({ ...query })}`,
      {
        signal,
        credentials: "omit",
      },
    )

    if (!response.ok) {
      throw new Error("widget:fixture-unavailable")
    }

    const value: unknown = await response.json()

    return value
  },
})
const controller = new WidgetController({
  callServerTool: () => Promise.reject(new Error("qa:no-live-tools")),
})
const element = document.getElementById("tadazz-widget")

if (!element) {
  throw new Error("qa:missing-root")
}

const root = createRoot(element)
root.render(<Widget controller={controller} privateFixture={port} />)
window.addEventListener(
  "pagehide",
  () => {
    controller.close()
    root.unmount()
  },
  { once: true },
)
