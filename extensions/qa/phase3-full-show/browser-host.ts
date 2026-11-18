import "../../src/presentation/show-library-preview/renderer-csp-admission.ts"
import { inputs, outputs } from "../../src/mcp-app/contracts/tools.ts"
// Local synthetic host. The real OAuth principal and tokens remain in the Node harness.
import {
  AppBridge,
  PostMessageTransport,
} from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js"
const query = new URL(window.location.href).searchParams
const scenario = query.get("scenario") ?? ""
const unsupported = query.get("unsupported") === "1"
const calls: string[] = []
const openedLinks: string[] = []
const displayRequests: string[] = []
let saveFixture: { requests: unknown[]; saved: unknown | null } | null = null
let tamper = false
let held = false
let dropMutationAck = false
const pending = new Set<() => void>()
const frame = document.createElement("iframe")
frame.setAttribute("sandbox", "allow-scripts")
frame.style.cssText = "width:100%;height:1100px;border:0"
frame.title = "Native full show QA"
document.body.append(frame)
const bridge = new AppBridge(
  null,
  { name: "tadazz-full-show-private-qa", version: "3" },
  unsupported ? {} : { serverTools: {}, openLinks: {} },
  {
    hostContext: {
      locale: "en",
      theme: "light",
      availableDisplayModes: unsupported
        ? ["inline"]
        : ["inline", "fullscreen"],
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
  if (name === "save_game" && saveFixture) {
    // Explicit synthetic host-control fixture only. This never reaches the
    // issuer or the native-save adapter, and cannot create a library game.
    const request = inputs.save_game.parse(args)
    saveFixture.requests.push(request)
    const attempt = saveFixture.requests.length
    const consentRequestId = "S".repeat(54)
    const quizId = "Q".repeat(21)
    const structuredContent = outputs.save_game.parse(
      attempt === 1
        ? {
            contractVersion: "0.1.0",
            ok: false,
            correlationId: "synthetic-save-controls",
            error: {
              code: "CONSENT_REQUIRED",
              messageKey: "mcp.consentRequired",
              retryable: true,
              consentRequestId,
              consentUrl: `https://tadazz.com/studio/native-save-consent/${consentRequestId}`,
            },
          }
        : {
            contractVersion: "0.1.0",
            ok: true,
            correlationId: "synthetic-save-controls",
            data: {
              draftId: request.draftId,
              revision: request.expectedRevision,
              quizId,
              savedRevision: 1,
              studioUrl: `https://tadazz.com/manager/quizz/${quizId}`,
            },
          },
    )
    const result = {
      content: [
        { type: "text" as const, text: "Synthetic host control fixture" },
      ],
      structuredContent,
      isError: attempt === 1,
    }
    if (attempt === 2) {
      saveFixture.saved = result
      throw new Error(
        "Synthetic lost save acknowledgement after fixture commit",
      )
    }
    return attempt > 2 ? asToolResult(saveFixture.saved) : result
  }
  const result = asToolResult(
    await request("/qa/call", { name, arguments: args }),
  )

  if (dropMutationAck && name === "apply_game_edit") {
    dropMutationAck = false
    throw new Error("Synthetic lost acknowledgement after durable commit")
  }
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
bridge.onopenlink = async ({ url }) => {
  openedLinks.push(url)
  return {}
}
bridge.onrequestdisplaymode = async ({ mode }) => {
  displayRequests.push(mode)
  bridge.setHostContext({ displayMode: mode })
  return { mode }
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
    enableSaveFixture: () => {
      saveFixture = { requests: [], saved: null }
    },
    hostControls: () => ({
      proof: "synthetic-host-ui-control-fixture",
      saveRequests: saveFixture?.requests ?? [],
      openedLinks: openedLinks.slice(),
      displayRequests: displayRequests.slice(),
    }),
    dropMutationAck: () => {
      dropMutationAck = true
    },
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
