// Genuine SDK AppBridge fixture. These tool responses are synthetic witnesses,
// not proof of an installed ChatGPT/Claude connector or authenticated persistence.
import {
  AppBridge,
  PostMessageTransport,
} from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js"
import { retainedSelection } from "./retained-schema.ts"
const id = "widget_draft_A_123456789012"
const summary = {
  title: "Private example",
  cardCount: 1,
  questionCount: 1,
  themeId: "tadazz-classic",
  themeVersion: "1.0.0",
  diagnostics: [],
}
let revision = 1,
  text = '{"title":"Original"}',
  conflict = false,
  delay = 0
const calls: string[] = []
const result = (data: Record<string, unknown>) => ({
  content: [],
  structuredContent: {
    contractVersion: "0.1.0",
    ok: true,
    correlationId: "widget_result_123456789012",
    data,
  },
})
const iframe = document.createElement("iframe")
iframe.setAttribute("sandbox", "allow-scripts")
iframe.style.cssText = "width:100%;height:900px;border:0"
iframe.title = "Tadazz private SDK fixture"
document.body.append(iframe)
const bridge = new AppBridge(
  null,
  { name: "private-test-host", version: "0.1.0" },
  new URL(window.location.href).searchParams.has("noTools")
    ? {}
    : { serverTools: {} },
  {
    hostContext: {
      locale: "en",
      theme: "light",
      availableDisplayModes: ["inline"],
    },
  },
)
bridge.oncalltool = async ({ name, arguments: args }) => {
  calls.push(name)
  await new Promise((resolve) => {
    setTimeout(resolve, delay)
  })

  if (name === "get_game_draft") {
    return result({ draftId: id, revision, summary, authoredShowJson: text })
  }

  if (
    name === "update_game_draft" &&
    args?.expectedRevision === revision &&
    !conflict
  ) {
    text = String(args.authoredShowJson)
    revision += 1

    return result({ draftId: id, revision, summary })
  }

  return {
    content: [],
    isError: true,
    structuredContent: {
      contractVersion: "0.1.0",
      ok: false,
      correlationId: "widget_result_123456789012",
      error: {
        code: "REVISION_CONFLICT",
        messageKey: "extensions:mcp.REVISION_CONFLICT",
        retryable: true,
        currentRevision: revision + 1,
      },
    },
  }
}
async function initialized() {
  const candidate = new URL(window.location.href).searchParams.get("candidate")

  if (candidate) {
    const raw: unknown = await (await fetch("/qa/retained-tool-result")).json()
    const retained = retainedSelection.parse(raw)

    if (candidate === "tampered") {
      retained.result._meta["tadazz/preview-candidate-v2"].inputDigest =
        "0".repeat(64)
    }

    await bridge.sendToolInput({ arguments: retained.selection })

    if (candidate === "repeated") {
      await bridge.sendToolInput({
        arguments: {
          ...retained.selection,
          expectedRevision: retained.selection.expectedRevision + 1,
        },
      })
    }

    await bridge.sendToolResult(retained.result)
    document.documentElement.dataset.hostReady = "true"

    return
  }

  await bridge.sendToolInput({
    arguments: { contractVersion: "0.1.0", draftId: id, expectedRevision: 1 },
  })
  await bridge.sendToolResult(
    result({
      draftId: id,
      revision,
      summary,
      previewVersion: 1,
      rendererStatus: "unavailable",
      projectionDigest: "a".repeat(64),
      sbRegistryVersion: null,
    }),
  )
  document.documentElement.dataset.hostReady = "true"
}
bridge.addEventListener("initialized", () => {
  void initialized()
})
const frameWindow = iframe.contentWindow

if (!frameWindow) {
  throw new Error("qa:missing-frame")
}

void bridge
  .connect(new PostMessageTransport(frameWindow, frameWindow))
  .then(() => {
    iframe.src = "/widget.html"
  })
Object.assign(window, {
  __host: {
    revision: () => revision,
    toolChange: () =>
      bridge.setHostContext({
        toolInfo: {
          id: "new-invocation",
          tool: { name: "preview_game", inputSchema: { type: "object" } },
        },
      }),
    remoteEdit: () => {
      revision += 1
      text = '{"title":"Remote server edit"}'
      conflict = false
    },
    conflict: (value: boolean) => {
      conflict = value
    },
    delay: (value: number) => {
      delay = value
    },
    calls: () => calls.slice(),
    context: (locale: string, theme: "light" | "dark") =>
      bridge.setHostContext({ locale, theme }),
    cancel: () =>
      bridge.sendToolCancelled({ reason: "synthetic user cancellation" }),
    teardown: () => bridge.teardownResource({}),
  },
})
