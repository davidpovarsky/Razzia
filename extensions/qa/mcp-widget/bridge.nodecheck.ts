import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { AppBridge } from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js"
import type { NativePreviewCandidateMountV2, NativePreviewRendererInputV2 } from "../../src/core/show-library/native-preview-renderer-v2-schema"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import {
  createWidgetBridgeCore,
  type AppTransport,
} from "../../src/mcp-app/widget/bridge-core.ts"
import { retainedPacket } from "./retained-schema.ts"

function loadRetainedPacket() {
  const raw: unknown = JSON.parse(
    process.env.TADAZZ_WIDGET_PREVIEW_PACKET
      ? readFileSync(process.env.TADAZZ_WIDGET_PREVIEW_PACKET, "utf8")
      : (() => {
          try {
            return execFileSync(
              "git",
              [
                "show",
                "7f0d4d89e0f77be49c6543411937d977212f132f:docs/extensions/qa-evidence/mcp-foundation-20261115/preview-candidate/candidate-07/tool-results.json",
              ],
              { encoding: "utf8" },
            )
          } catch {
            return readFileSync(
              new URL(
                "../../../docs/extensions/qa-evidence/mcp-foundation-20261115/preview-candidate/candidate-07/tool-results.json",
                import.meta.url,
              ),
              "utf8",
            )
          }
        })(),
  )

  return retainedPacket.parse(raw).results
}

const retainedResults = loadRetainedPacket()
const [retainedEn, retainedJa] = retainedResults

assert.ok(retainedEn)
assert.ok(retainedJa)

const summary = {
  title: "Private example",
  cardCount: 1,
  questionCount: 1,
  themeId: "tadazz-classic",
  themeVersion: "1.0.0",
  diagnostics: [],
}

function makeResult(data: Record<string, unknown>) {
  return {
    content: [] as Array<{ type: "text"; text: string }>,
    structuredContent: {
      contractVersion: "0.1.0",
      ok: true,
      correlationId: "widget_result_123456789012",
      data,
    },
  }
}

function makeConflict(currentRevision: number) {
  return {
    content: [] as Array<{ type: "text"; text: string }>,
    isError: true,
    structuredContent: {
      contractVersion: "0.1.0",
      ok: false,
      correlationId: "widget_result_123456789012",
      error: {
        code: "REVISION_CONFLICT",
        messageKey: "extensions:mcp.REVISION_CONFLICT",
        retryable: true,
        currentRevision,
      },
    },
  }
}

function makePlainUnavailable() {
  return {
    content: [] as Array<{ type: "text"; text: string }>,
    isError: true,
    structuredContent: {
      contractVersion: "0.1.0",
      ok: false,
      correlationId: "widget_result_123456789012",
      error: {
        code: "PREVIEW_UNAVAILABLE",
        messageKey: "extensions:mcp.PREVIEW_UNAVAILABLE",
        retryable: false,
      },
    },
  }
}

function cloneForRevision(
  base: (typeof retainedResults)[number]["result"],
  revision: number,
) {
  const cloned = structuredClone(base)
  const candidate = cloned._meta["tadazz/preview-candidate-v2"]
  candidate.revision = revision
  candidate.input.frame.revision = revision
  candidate.input.themeBinding.draftRevision = revision
  candidate.inputDigest = hashJson(candidate.input)

  return cloned
}

type ToolResult = Awaited<
  ReturnType<NonNullable<AppBridge["oncalltool"]>>
>
type TransportMessage = Parameters<NonNullable<AppTransport["send"]>>[0]

function createTransportPair(): [AppTransport, AppTransport] {
  const createHalf = (): AppTransport & {
    peer?: AppTransport
    closed?: boolean
  } => ({
    async start() {},
    async close() {
      if (this.closed) {
        return
      }

      this.closed = true
      this.onclose?.()
      if (this.peer && !(this.peer as { closed?: boolean }).closed) {
        await this.peer.close()
      }
    },
    async send(message: TransportMessage) {
      queueMicrotask(() => {
        if (!this.closed) {
          this.peer?.onmessage?.(message)
        }
      })
    },
  })
  const appTransport = createHalf()
  const hostTransport = createHalf()
  appTransport.peer = hostTransport
  hostTransport.peer = appTransport

  return [appTransport, hostTransport]
}

function deferred<T = unknown>() {
  let resolve: (value: T) => void = () => {
    throw new Error("qa:uninitialized-resolver")
  }
  let reject: (reason?: unknown) => void = () => {
    throw new Error("qa:uninitialized-rejector")
  }
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function createConnectedHarness(options: {
  locale?: string
  onCallTool?: AppBridge["oncalltool"]
  onInitialized?: (host: AppBridge) => void | Promise<void>
} = {}) {
  const [appTransport, hostTransport] = createTransportPair()
  const contexts: unknown[] = []
  const mounts: Array<{
    updated: NativePreviewRendererInputV2[]
    disposed: boolean
    failAsync: () => void
  }> = []
  const mount: NativePreviewCandidateMountV2 = (_element, onUnavailable) => {
    const entry = {
      updated: [] as NativePreviewRendererInputV2[],
      disposed: false,
      failAsync: onUnavailable,
    }
    mounts.push(entry)

    return {
      update(input) {
        entry.updated.push(input)
      },
      dispose() {
        entry.disposed = true
      },
    }
  }
  const host = new AppBridge(
    null,
    { name: "qa-node-host", version: "0.1.0" },
    { serverTools: {} },
    {
      hostContext: {
        locale: options.locale ?? "en",
        theme: "light",
        availableDisplayModes: ["inline"],
      },
    },
  )
  const initialized = new Promise<void>((resolve) => {
    host.addEventListener("initialized", () => {
      void Promise.resolve(options.onInitialized?.(host)).then(resolve)
    })
  })
  if (options.onCallTool) {
    host.oncalltool = options.onCallTool
  }
  const widget = createWidgetBridgeCore(
    (ctx) => contexts.push(ctx),
    mount,
    {
      transport: appTransport,
      appOptions: { autoResize: false },
      isTopWindow: () => false,
    },
  )
  const statuses: string[] = []
  widget.controller.subscribe(() => {
    statuses.push(widget.controller.snapshot().status)
  })
  const detach = widget.attach({} as HTMLElement)
  await host.connect(hostTransport)
  await widget.connect()
  await initialized

  return {
    host,
    widget,
    contexts,
    mounts,
    statuses,
    detach,
    async cleanup() {
      detach()
      widget.dispose()
      await host.close()
    },
  }
}

test("candidate-first handling on preview() avoids intermediate unavailable status", async () => {
  const draftId = retainedEn.selection.draftId
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> =
    []
  const h = await createConnectedHarness({
    onCallTool: async ({ name, arguments: args }) => {
      calls.push({ name, args })
      if (name === "get_game_draft") {
        return makeResult({
          draftId,
          revision: 1,
          summary,
          authoredShowJson: '{"title":"Original"}',
        })
      }
      if (
        name === "preview_game" &&
        args?.draftId === draftId &&
        args?.expectedRevision === 1 &&
        args?.locale === "en"
      ) {
        return structuredClone(retainedEn.result)
      }

      return makeConflict(2)
    },
  })
  try {
    h.widget.controller.select(draftId)
    await h.widget.controller.refresh()
    h.statuses.length = 0
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    assert.deepEqual(h.statuses.slice(), ["candidate"])
    assert.equal(h.mounts.length, 1)
    assert.equal(h.mounts[0]?.updated.length, 1)
    assert.equal(h.mounts[0]?.disposed, false)
    assert.equal(calls[1]?.name, "preview_game")
    assert.deepEqual(calls[1]?.args, retainedEn.selection)
  } finally {
    await h.cleanup()
  }
})

test("candidate-first handling on initial toolresult avoids intermediate unavailable status", async () => {
  let statusSnapshot: string[] = []
  const h = await createConnectedHarness({
    onInitialized: async (host) => {
      await host.sendToolInput({ arguments: retainedEn.selection })
      await host.sendToolResult(structuredClone(retainedEn.result))
    },
  })
  try {
    statusSnapshot = h.statuses.slice()
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    assert.deepEqual(statusSnapshot, ["waiting", "candidate"])
    assert.equal(h.mounts.length, 1)
  } finally {
    await h.cleanup()
  }
})

test("non-candidate REVISION_CONFLICT and V1 ready preview_game responses are not clobbered to unavailable", async () => {
  const draftId = retainedEn.selection.draftId
  let mode: "conflict" | "v1-ready" = "conflict"
  const h = await createConnectedHarness({
    onCallTool: async ({ name }) => {
      if (name === "get_game_draft") {
        return makeResult({
          draftId,
          revision: 1,
          summary,
          authoredShowJson: '{"title":"Original"}',
        })
      }
      if (mode === "conflict") {
        return makeConflict(4)
      }

      return makeResult({
        draftId,
        revision: 1,
        summary,
        previewVersion: 1,
        rendererStatus: "ready",
        projectionDigest: "a".repeat(64),
        sbRegistryVersion: "1.0.0",
      })
    },
  })
  try {
    h.widget.controller.select(draftId)
    await h.widget.controller.refresh()
    h.statuses.length = 0
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "conflict")
    assert.equal(h.widget.controller.snapshot().currentRevision, 4)
    assert.deepEqual(h.statuses.slice(), ["conflict"])

    mode = "v1-ready"
    h.statuses.length = 0
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "ready")
    assert.equal(
      h.widget.controller.snapshot().preview?.rendererStatus,
      "ready",
    )
    assert.deepEqual(h.statuses.slice(), ["ready"])
  } finally {
    await h.cleanup()
  }
})

test("duplicate in-flight preview() coalesces to a single preview_game tool call", async () => {
  const draftId = retainedEn.selection.draftId
  let previewCalls = 0
  const pending = deferred<ToolResult>()
  let callTool: NonNullable<AppBridge["oncalltool"]> = async ({ name }) => {
    if (name === "get_game_draft") {
      return makeResult({
        draftId,
        revision: 1,
        summary,
        authoredShowJson: '{"title":"Original"}',
      })
    }
    previewCalls += 1

    return pending.promise
  }
  const h = await createConnectedHarness({
    onCallTool: (params, extra) => callTool(params, extra),
  })
  try {
    h.widget.controller.select(draftId)
    await h.widget.controller.refresh()
    h.statuses.length = 0

    const first = h.widget.preview()
    const second = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(previewCalls, 1)

    pending.resolve(structuredClone(retainedEn.result))
    await Promise.all([first, second])

    assert.equal(previewCalls, 1)
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    assert.deepEqual(h.statuses.slice(), ["candidate"])
    assert.equal(h.mounts.length, 1)
    assert.equal(h.mounts[0]?.disposed, false)

    // After settling, a subsequent preview() performs a fresh request.
    const nextDeferred = deferred<ToolResult>()
    callTool = async ({ name }) => {
      if (name === "preview_game") {
        previewCalls += 1
        return nextDeferred.promise
      }

      return makeConflict(2)
    }
    const third = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(previewCalls, 2)
    nextDeferred.resolve(structuredClone(retainedEn.result))
    await third
    assert.equal(h.widget.controller.snapshot().status, "candidate")

    // Changing host locale while a preview is in-flight supersedes it on next preview().
    const slowEn = deferred<ToolResult>()
    const fastJa = deferred<ToolResult>()
    const localesSeen: unknown[] = []
    callTool = async ({ name, arguments: args }) => {
      if (name === "preview_game") {
        previewCalls += 1
        localesSeen.push(args?.locale)
        return args?.locale === "ja" ? fastJa.promise : slowEn.promise
      }

      return makeConflict(2)
    }
    const fourth = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await h.host.setHostContext({ locale: "ja" })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const fifth = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(localesSeen, ["en", "ja"])
    fastJa.resolve(structuredClone(retainedJa.result))
    await fifth
    assert.equal(h.mounts.at(-1)?.updated[0]?.locale, "ja")
    slowEn.resolve(structuredClone(retainedEn.result))
    await fourth
    assert.equal(h.mounts.at(-1)?.updated[0]?.locale, "ja")
  } finally {
    await h.cleanup()
  }
})

test("concurrent refresh and edit invalidate in-flight preview via existing generation check", async () => {
  const draftId = retainedEn.selection.draftId
  let serverRevision = 1
  let pendingPreview = deferred<ToolResult>()
  const h = await createConnectedHarness({
    onCallTool: async ({ name, arguments: args }) => {
      if (name === "get_game_draft") {
        return makeResult({
          draftId,
          revision: serverRevision,
          summary,
          authoredShowJson: `{"title":"Rev ${serverRevision}"}`,
        })
      }
      if (name === "update_game_draft") {
        serverRevision += 1
        return makeResult({ draftId, revision: serverRevision, summary })
      }
      if (name === "preview_game") {
        return pendingPreview.promise
      }

      return makeConflict(serverRevision)
    },
  })
  try {
    h.widget.controller.select(draftId)
    await h.widget.controller.refresh()

    // Case 1: Concurrent refresh while preview_game rev 1 is in-flight
    const inflight1 = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    serverRevision = 2
    await h.widget.controller.refresh()
    assert.equal(h.widget.controller.snapshot().status, "ready")
    assert.equal(h.widget.controller.snapshot().draft?.revision, 2)

    pendingPreview.resolve(structuredClone(retainedEn.result))
    await inflight1
    assert.equal(h.widget.controller.snapshot().status, "ready")
    assert.equal(h.widget.controller.snapshot().draft?.revision, 2)
    assert.equal(h.mounts.length, 0)

    // Case 2: Concurrent edit (update_game_draft) while preview_game rev 2 is in-flight
    pendingPreview = deferred()
    const inflight2 = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await h.widget.controller.update('{"title":"Local edit"}')
    assert.equal(h.widget.controller.snapshot().status, "acknowledged")
    assert.equal(h.widget.controller.snapshot().draft?.revision, 3)

    pendingPreview.resolve(cloneForRevision(retainedEn.result, 2))
    await inflight2
    assert.equal(h.widget.controller.snapshot().status, "acknowledged")
    assert.equal(h.widget.controller.snapshot().draft?.revision, 3)
    assert.equal(h.mounts.length, 0)
  } finally {
    await h.cleanup()
  }
})

test("preview after edit sends expectedRevision + 1 and disposes prior candidate on ACK", async () => {
  const draftId = retainedEn.selection.draftId
  let serverRevision = 1
  const previewRevisions: number[] = []
  const h = await createConnectedHarness({
    onCallTool: async ({ name, arguments: args }) => {
      if (name === "get_game_draft") {
        return makeResult({
          draftId,
          revision: serverRevision,
          summary,
          authoredShowJson: '{"title":"Original"}',
        })
      }
      if (name === "update_game_draft") {
        serverRevision += 1
        return makeResult({ draftId, revision: serverRevision, summary })
      }
      if (name === "preview_game") {
        const rev = Number(args?.expectedRevision)
        previewRevisions.push(rev)

        return rev === 1
          ? structuredClone(retainedEn.result)
          : cloneForRevision(retainedEn.result, rev)
      }

      return makeConflict(serverRevision)
    },
  })
  try {
    h.widget.controller.select(draftId)
    await h.widget.controller.refresh()
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    assert.equal(h.mounts.length, 1)
    assert.equal(h.mounts[0]?.disposed, false)

    await h.widget.controller.update('{"title":"Edited"}')
    assert.equal(h.widget.controller.snapshot().status, "acknowledged")
    assert.equal(h.mounts[0]?.disposed, true)

    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    assert.equal(h.mounts.length, 2)
    assert.equal(h.mounts[1]?.updated[0]?.frame.revision, 2)
    assert.deepEqual(previewRevisions, [1, 2])
  } finally {
    await h.cleanup()
  }
})

test("adversarial tamper, stale candidate, toolcancelled, toolInfo, and plain unavailable fail closed", async () => {
  const draftId = retainedEn.selection.draftId
  let nextPreview: () => Promise<ToolResult> = async () => makePlainUnavailable()
  const h = await createConnectedHarness({
    onCallTool: async ({ name }) => {
      if (name === "get_game_draft") {
        return makeResult({
          draftId,
          revision: 2,
          summary,
          authoredShowJson: '{"title":"Rev 2"}',
        })
      }

      return nextPreview()
    },
  })
  try {
    h.widget.controller.select(draftId)
    await h.widget.controller.refresh()

    // 1. Tampered inputDigest
    nextPreview = async () => {
      const tampered = cloneForRevision(retainedEn.result, 2)
      tampered._meta["tadazz/preview-candidate-v2"].inputDigest = "0".repeat(64)
      return tampered
    }
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "unavailable")
    assert.equal(h.mounts.length, 0)

    // 2. Stale revision (host sends rev 1 for expectedRevision 2)
    nextPreview = async () => structuredClone(retainedEn.result)
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "unavailable")
    assert.equal(h.mounts.length, 0)

    // 3. Wrong locale
    nextPreview = async () => cloneForRevision(retainedJa.result, 2)
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "unavailable")
    assert.equal(h.mounts.length, 0)

    // 4. toolcancelled during in-flight preview ignores late candidate
    const pending = deferred<ToolResult>()
    nextPreview = () => pending.promise
    const cancelledPreview = h.widget.preview()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await h.host.sendToolCancelled({ reason: "cancelled by host" })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(h.widget.controller.snapshot().status, "cancelled")
    pending.resolve(cloneForRevision(retainedEn.result, 2))
    await cancelledPreview
    assert.equal(h.widget.controller.snapshot().status, "cancelled")
    assert.equal(h.mounts.length, 0)

    // 5. Async renderer failure callback transitions to unavailable
    nextPreview = async () => cloneForRevision(retainedEn.result, 2)
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    assert.equal(h.mounts.length, 1)
    h.mounts[0]?.failAsync()
    assert.equal(h.widget.controller.snapshot().status, "unavailable")

    // 6. hostcontextchanged with toolInfo closes and disposes
    await h.widget.preview()
    assert.equal(h.widget.controller.snapshot().status, "candidate")
    await h.host.setHostContext({
      toolInfo: {
        id: "next-invocation",
        tool: { name: "preview_game", inputSchema: { type: "object" } },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(h.widget.controller.snapshot().status, "closed")
    assert.equal(h.mounts[1]?.disposed, true)
  } finally {
    await h.cleanup()
  }
})
