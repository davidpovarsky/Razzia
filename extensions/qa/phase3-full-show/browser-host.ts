import "../../src/presentation/show-library-preview/renderer-csp-admission.ts"
// Local synthetic host. The real OAuth principal and tokens remain in the Node harness.
import {
  AppBridge,
  PostMessageTransport,
} from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js"
const query = new URL(window.location.href).searchParams
const scenario = query.get("scenario") ?? ""
const calls: string[] = []
let tamper = false
let held = false
const pending = new Set<() => void>()
const frame = document.createElement("iframe")
frame.setAttribute("sandbox", "allow-scripts")
frame.style.cssText = "width:100%;height:1100px;border:0"
frame.title = "Native full show QA"
document.body.append(frame)
const bridge = new AppBridge(
  null,
  { name: "tadazz-full-show-private-qa", version: "3" },
  { serverTools: {} },
  {
    hostContext: {
      locale: "en",
      theme: "light",
      availableDisplayModes: ["inline", "fullscreen"],
    },
  },
)
const request = async (path: string, body?: unknown) => {
  const response = await fetch(
    `${path}?scenario=${encodeURIComponent(scenario)}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  )

  if (!response.ok) {
    throw new Error("QA backend refused request")
  }

  const raw: unknown = await response.json()

  return raw
}
function asToolResult(
  raw: unknown,
): Parameters<typeof bridge.sendToolResult>[0] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("content" in raw) ||
    !Array.isArray(raw.content)
  ) {
    throw new Error("QA tool result missing")
  }

  return raw as Parameters<typeof bridge.sendToolResult>[0]
}
bridge.oncalltool = async ({ name, arguments: args }) => {
  calls.push(name)
  const result = asToolResult(
    await request("/qa/call", { name, arguments: args }),
  )

  if (name === "preview_show") {
    if (held) {
      await new Promise<void>((resolve) => {
        pending.add(resolve)
      })
    }

    if (tamper) {
      const body = result.structuredContent as
        { data?: Record<string, unknown> } | undefined

      if (body?.data) {
        body.data.frameDigest = "0".repeat(64)
      }
    }
  }

  return result
}
bridge.addEventListener("initialized", () => {
  void (async () => {
    const raw = await request("/qa/initial")

    if (
      !raw ||
      typeof raw !== "object" ||
      !("selection" in raw) ||
      !("result" in raw)
    ) {
      throw new Error("QA initial packet missing")
    }

    const initial = {
      selection: raw.selection as Record<string, unknown>,
      result: asToolResult(raw.result),
    }
    await bridge.sendToolInput({ arguments: initial.selection })
    await bridge.sendToolResult(initial.result)
    document.documentElement.dataset.hostReady = "true"
  })()
})
const frameWindow = frame.contentWindow

if (!frameWindow) {
  throw new Error("QA frame missing")
}

void bridge
  .connect(new PostMessageTransport(frameWindow, frameWindow))
  .then(() => {
    frame.src = "/widget"
  })
Object.assign(window, {
  __host: {
    calls: () => calls.slice(),
    tamper: (value: boolean) => {
      tamper = value
    },
    hold: (value: boolean) => {
      held = value

      if (!value) {
        for (const release of pending) {
          release()
        }
        pending.clear()
      }
    },
    cancel: () => bridge.sendToolCancelled({ reason: "QA user cancellation" }),
    toolChange: () =>
      bridge.setHostContext({
        toolInfo: {
          id: "other-invocation",
          tool: { name: "preview_show", inputSchema: { type: "object" } },
        },
      }),
    teardown: () => bridge.teardownResource({}),
  },
})
