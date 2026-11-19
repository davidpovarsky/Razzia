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
let saveFixture: { requests: unknown[]; saved: unknown } | null = null
let tamper = false
let held = false
let dropMutationAck = false
const pending = new Set<() => void>()
const documentId = crypto.randomUUID()
let disposing = false
const isDisposing = () => disposing
let connectionPending = true
let rejectedNewCalls = 0
const activeHttp = new Set<Promise<unknown>>()
const activeHandlers = new Set<Promise<unknown>>()
const activeInitializations = new Set<Promise<void>>()
const lifecycleFailures: string[] = []
const requestEvents: Array<{
  at: string
  path: string
  status: string
  error?: string
}> = []
const drainWaiters = new Set<() => void>()
const replies = new Map<
  string | number,
  {
    handlerSettled: boolean
    cancelled: boolean
    removeAbortListener?: () => void
  }
>()
let sentReplies = 0
let cancelledReplies = 0
const counts = () => ({
  http: activeHttp.size,
  handlers: activeHandlers.size,
  initialization: activeInitializations.size,
  replies: replies.size,
  connecting: connectionPending,
})
const idle = () =>
  !connectionPending &&
  !activeHttp.size &&
  !activeHandlers.size &&
  !activeInitializations.size &&
  !replies.size
const notifyDrain = () => {
  if (idle()) {
    for (const resolve of drainWaiters) {
      resolve()
    }
    drainWaiters.clear()
  }
}
const retireReply = (id: string | number, cancelled: boolean) => {
  const reply = replies.get(id)

  if (!reply) {
    return
  }

  reply.removeAbortListener?.()
  replies.delete(id)

  if (cancelled) {
    cancelledReplies += 1
  } else {
    sentReplies += 1
  }

  notifyDrain()
}
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
const requestBackend = async (path: string, body?: unknown) => {
  if (isDisposing()) {
    rejectedNewCalls += 1
    throw new Error("QA host is disposing")
  }

  requestEvents.push({ at: new Date().toISOString(), path, status: "started" })
  const operation = (async () => {
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
  })()
  activeHttp.add(operation)

  try {
    const result = await operation
    requestEvents.push({
      at: new Date().toISOString(),
      path,
      status: "completed",
    })

    return result
  } catch (error) {
    lifecycleFailures.push(String(error))
    requestEvents.push({
      at: new Date().toISOString(),
      path,
      status: "failed",
      error: String(error),
    })
    throw error
  } finally {
    activeHttp.delete(operation)
    notifyDrain()
  }
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
const performToolCall: NonNullable<typeof bridge.oncalltool> = async ({
  name,
  arguments: args,
}) => {
  if (isDisposing()) {
    rejectedNewCalls += 1
    throw new Error("QA host is disposing")
  }

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
    await requestBackend("/qa/call", { name, arguments: args }),
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
bridge.oncalltool = (params, context) => {
  const { id } = context.mcpReq
  const { signal } = context.mcpReq
  const reply = replies.get(id)

  if (!reply) {
    throw new Error("QA tool request was not observed by its transport")
  }

  const cancelled = () => {
    reply.cancelled = true

    if (reply.handlerSettled) {
      retireReply(id, true)
    }
  }
  reply.removeAbortListener = () =>
    signal.removeEventListener("abort", cancelled)
  signal.addEventListener("abort", cancelled, { once: true })

  if (signal.aborted) {
    cancelled()
  }

  const operation = performToolCall(params, context)
  activeHandlers.add(operation)
  const settled = () => {
    activeHandlers.delete(operation)
    reply.handlerSettled = true

    if (reply.cancelled) {
      retireReply(id, true)
    }

    notifyDrain()
  }
  // Observe settlement without replacing the exact promise returned to AppBridge.
  // Both callbacks resolve; there is no detached rejecting finally promise.
  void operation.then(settled, settled)

  return operation
}
bridge.onopenlink = ({ url }) => {
  openedLinks.push(url)

  return Promise.resolve({})
}
bridge.onrequestdisplaymode = ({ mode }) => {
  displayRequests.push(mode)
  bridge.setHostContext({ displayMode: mode })

  return Promise.resolve({ mode })
}
const initialize = async () => {
  if (isDisposing()) {
    return
  }

  const raw = await requestBackend("/qa/initial")

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

  if (isDisposing()) {
    return
  }

  await bridge.sendToolInput({ arguments: initial.selection })

  if (isDisposing()) {
    return
  }

  await bridge.sendToolResult(initial.result)

  if (!isDisposing()) {
    document.documentElement.dataset.hostReady = "true"
  }
}
bridge.addEventListener("initialized", () => {
  if (isDisposing()) {
    return
  }

  const operation = initialize()
  activeInitializations.add(operation)
  void operation.then(
    () => {
      activeInitializations.delete(operation)
      notifyDrain()
    },
    (error: unknown) => {
      activeInitializations.delete(operation)
      lifecycleFailures.push(String(error))
      notifyDrain()
      // Preserve unexpected initialization failures in the browser-error assertion.
      window.reportError(error)
    },
  )
})
const frameWindow = frame.contentWindow

if (!frameWindow) {
  throw new Error("QA frame missing")
}

const observeToolRequest = (event: MessageEvent<unknown>) => {
  const message = event.data

  if (
    event.source !== frameWindow ||
    !message ||
    typeof message !== "object" ||
    !("jsonrpc" in message) ||
    message.jsonrpc !== "2.0" ||
    !("method" in message) ||
    message.method !== "tools/call" ||
    !("id" in message) ||
    (typeof message.id !== "string" && typeof message.id !== "number")
  ) {
    return
  }

  replies.set(message.id, { handlerSettled: false, cancelled: false })
}

class ObservedTransport extends PostMessageTransport {
  override async send(...args: Parameters<PostMessageTransport["send"]>) {
    const [message] = args

    try {
      await super.send(...args)

      if (
        "id" in message &&
        ("result" in message || "error" in message) &&
        (typeof message.id === "string" || typeof message.id === "number")
      ) {
        retireReply(message.id, false)
      }
    } catch (error) {
      lifecycleFailures.push(String(error))
      notifyDrain()
      throw error
    }
  }
}

// Install before connect/start so an accepted request cannot escape reply tracking.
window.addEventListener("message", observeToolRequest)
void bridge.connect(new ObservedTransport(frameWindow, frameWindow)).then(
  () => {
    connectionPending = false

    if (!isDisposing()) {
      frame.src = "/widget"
    }

    notifyDrain()
  },
  (error: unknown) => {
    connectionPending = false
    lifecycleFailures.push(String(error))
    notifyDrain()
    window.reportError(error)
  },
)
interface DisposalReceipt {
  documentId: string
  url: string
  status: "drained" | "failed"
  startedAt: string
  finishedAt: string
  elapsedMs: number
  initial: ReturnType<typeof counts>
  remaining: ReturnType<typeof counts>
  sentReplies: number
  cancelledReplies: number
  rejectedNewCalls: number
  requestEvents: typeof requestEvents
  errors: string[]
}
let disposal: Promise<DisposalReceipt> | null = null
let disposalReceipt: DisposalReceipt | null = null
const prepareNavigation = () => {
  if (disposal) {
    return disposal
  }

  disposing = true
  const initial = counts()
  const startedAt = new Date().toISOString()
  const start = performance.now()
  // A handler finishing its fetch after disposal must not newly park an ACK.
  held = false
  for (const release of pending) {
    release()
  }
  pending.clear()
  disposal = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined
    let waiter: () => void = () => undefined
    const receipt = (status: DisposalReceipt["status"]): DisposalReceipt => ({
      documentId,
      url: location.href,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: performance.now() - start,
      initial,
      remaining: counts(),
      sentReplies,
      cancelledReplies,
      rejectedNewCalls,
      requestEvents: requestEvents.slice(),
      errors: lifecycleFailures.slice(),
    })

    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          waiter = resolve
          drainWaiters.add(resolve)
          notifyDrain()
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("QA_HOST_DRAIN_TIMEOUT:15000")),
            15000,
          )
        }),
      ])

      if (lifecycleFailures.length) {
        throw new Error(
          `QA host request failed: ${lifecycleFailures.join("; ")}`,
        )
      }

      // Normal replies have actually been posted by the SDK. Aborted RPCs have
      // settled their real handlers without inventing the SDK's skipped response.
      await bridge.close()
      window.removeEventListener("message", observeToolRequest)
      disposalReceipt = receipt("drained")

      return disposalReceipt
    } catch (error) {
      disposalReceipt = receipt("failed")
      disposalReceipt.errors.push(String(error))
      throw error
    } finally {
      clearTimeout(timeout)

      drainWaiters.delete(waiter)
    }
  })()

  return disposal
}
Object.assign(window, {
  __host: {
    prepareNavigation,
    lifecycle: () => ({
      documentId,
      disposing,
      remaining: counts(),
      receipt: disposalReceipt,
    }),
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
