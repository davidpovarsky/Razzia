import {
  App,
  type AppOptions,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps"
import { createPreviewCandidateConsumerV2 } from "@tadazz/mcp-foundation/preview-candidate-consumer"
import type { NativePreviewCandidateMountV2 } from "../../core/show-library/native-preview-renderer-v2-schema"
import { inputs } from "../contracts/tools.ts"
import { CONTRACT_VERSION } from "../contracts/schemas.ts"
import { WidgetController } from "./controller.ts"
import { hostLocale } from "./i18n.ts"

export type AppTransport = NonNullable<Parameters<App["connect"]>[0]>

export interface WidgetBridgeOptions {
  transport?: AppTransport
  appOptions?: AppOptions
  isTopWindow?: () => boolean
}

// SDK owns postMessage source validation and protocol negotiation. Each MCP
// resource instance has one notification invocation. Additional previews use
// tools/call Promises, whose closure retains its own exact consumer ticket.
export function createWidgetBridgeCore(
  onContext: (context: McpUiHostContext) => void,
  mount: NativePreviewCandidateMountV2,
  options: WidgetBridgeOptions = {},
) {
  const app = new App(
    { name: "tadazz-preview", version: "0.1.0" },
    {},
    { strict: true, webMcpBridge: false, ...options.appOptions },
  )
  let consumer: ReturnType<typeof createPreviewCandidateConsumerV2> | null =
    null
  let disposed = false,
    hostInputSeen = false,
    hostResultSeen = false,
    receivingCandidate = false,
    generation = 0
  const isDisposed = () => disposed
  let hostTicket: ReturnType<typeof inputs.preview_game.parse> | null = null
  let inFlightPreview: {
    key: string
    generation: number
    promise: Promise<void>
  } | null = null
  const cancelPreview = () => {
    generation += 1
    hostTicket = null
    inFlightPreview = null
    consumer?.cancel()
  }
  const applyPreviewResult = (
    ticket: ReturnType<typeof inputs.preview_game.parse>,
    result: unknown,
  ) => {
    let accepted = false

    if (consumer) {
      receivingCandidate = true

      try {
        accepted = consumer.receive(ticket, result)
      } finally {
        receivingCandidate = false
      }
    }

    if (accepted) {
      controller.candidate()

      return
    }

    controller.receivePreview(result)
  }
  const controller = new WidgetController({
    callServerTool: (params, callOptions) => {
      cancelPreview()

      if (!app.getHostCapabilities()?.serverTools) {
        return Promise.reject(new Error("widget:tools-unavailable"))
      }

      return app.callServerTool(params, callOptions)
    },
  })
  const begin = (args: unknown) => {
    generation += 1

    try {
      return consumer?.begin(args) ?? null
    } catch {
      controller.unavailable()

      return null
    }
  }
  app.addEventListener("toolinput", ({ arguments: args }) => {
    // Notifications have no invocation ID. Never attach an old result to the
    // newest input after an unsupported second complete-input notification.
    if (hostInputSeen) {
      cancelPreview()
      controller.unavailable()

      return
    }

    hostInputSeen = true
    const parsed = inputs.preview_game.safeParse(args)

    if (!parsed.success) {
      cancelPreview()
      controller.unavailable()

      return
    }

    controller.select(parsed.data.draftId)
    hostTicket = begin(parsed.data)
  })
  app.addEventListener("toolinputpartial", () => {
    cancelPreview()
    controller.cancel()
  })
  app.addEventListener("toolresult", (result) => {
    if (!hostTicket || hostResultSeen || disposed) {
      return
    }

    hostResultSeen = true
    const ticket = hostTicket
    hostTicket = null
    applyPreviewResult(ticket, result)
  })
  app.addEventListener("toolcancelled", () => {
    cancelPreview()
    controller.cancel()
  })
  app.addEventListener("hostcontextchanged", (context) => {
    if (disposed) {
      return
    }

    if (context.toolInfo) {
      cancelPreview()
      controller.close()
      consumer?.dispose()
      consumer = null
      disposed = true
      void app.close()

      return
    }

    onContext(context)
  })
  app.onclose = () => {
    if (disposed) {
      return
    }

    disposed = true
    cancelPreview()
    consumer?.dispose()
    consumer = null
    controller.close()
  }
  const controllerSubscription = controller.subscribe(() => {
    if (
      ["cancelled", "closed", "loading", "conflict", "acknowledged"].includes(
        controller.snapshot().status,
      )
    ) {
      cancelPreview()
    }
  })
  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    cancelPreview()
    consumer?.dispose()
    consumer = null
    controller.close()
    controllerSubscription()
    void app.close()
  }
  app.onteardown = () => {
    // Let the SDK send the teardown ACK before closing its transport.
    disposed = true
    cancelPreview()
    consumer?.dispose()
    consumer = null
    controller.close()
    controllerSubscription()
    setTimeout(() => void app.close(), 0)

    return {}
  }

  return {
    app,
    controller,
    dispose,
    attach(element: HTMLElement) {
      if (disposed || consumer) {
        throw new Error("widget:invalid-mount-lifecycle")
      }

      consumer = createPreviewCandidateConsumerV2(element, mount, () => {
        if (!receivingCandidate) {
          controller.unavailable()
        }
      })

      return () => {
        cancelPreview()
        consumer?.dispose()
        consumer = null
      }
    },
    async preview() {
      const { draft } = controller.snapshot()

      if (!draft || disposed || !app.getHostCapabilities()?.serverTools) {
        return
      }

      const args = inputs.preview_game.parse({
        contractVersion: CONTRACT_VERSION,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
        locale: hostLocale(app.getHostContext()?.locale),
      })
      const key = `${args.draftId}:${args.expectedRevision}:${args.locale ?? ""}`

      if (
        inFlightPreview?.generation === generation &&
        inFlightPreview.key === key
      ) {
        return inFlightPreview.promise
      }

      hostTicket = null
      hostResultSeen = true
      const ticket = begin(args),
        request = generation

      if (!ticket) {
        return
      }

      const run = (async () => {
        try {
          const result = await app.callServerTool(
            { name: "preview_game", arguments: args },
            { timeout: 10_000 },
          )

          if (isDisposed() || generation !== request) {
            return
          }

          applyPreviewResult(ticket, result)
        } catch {
          if (!isDisposed() && generation === request) {
            consumer?.cancel()
            controller.unavailable()
          }
        } finally {
          if (inFlightPreview?.generation === request) {
            inFlightPreview = null
          }
        }
      })()

      inFlightPreview = { key, generation: request, promise: run }

      return run
    },
    async connect() {
      try {
        const top =
          options.isTopWindow?.() ??
          // oxlint-disable-next-line typescript/prefer-optional-chain -- typeof also guards an undeclared window in the supported non-browser host.
          (typeof window !== "undefined" && window.parent === window)

        if (top) {
          controller.unavailable()

          return
        }

        await app.connect(options.transport, { timeout: 10_000 })

        if (!disposed) {
          onContext(app.getHostContext() ?? {})
        }
      } catch {
        if (!disposed) {
          controller.unavailable()
        }
      }
    },
  }
}
