import fs from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import type {
  Browser,
  BrowserContext,
  Page,
  TestInfo,
  WebSocket,
} from "@playwright/test"
import type { LiveObservation } from "./extension-manager"

// Diagnostic-only instrumentation for the unchanged scored-quiz test body.
// It never creates, closes, reconnects, focuses, or mutates a browser resource.
const APPLICATION_REVISION = "1ec7dc5c9549651f1618390a21f8db7efae4ea6f"
const ORIGINAL_SUITE_SHA256 =
  "939781dfc87760952af537b46a8495429bacfd051a20f01ad2b811340d2f54bc"
const PROBE_BUDGET_MS = 2_000
const MAX_LIFECYCLE_EVENTS = 256

type ShowFixtures = { page: Page; browser: Browser }
type ShowBody = (
  fixtures: ShowFixtures,
  testInfo: TestInfo,
) => Promise<void>
type Stamp = { wallTime: number; monotonicMs: number }
type SocketRecord = {
  id: string
  url: string
  createdAt: Stamp
  closedAt: Stamp | null
  socketError: { at: Stamp; message: string } | null
  receivedFrames: number
  sentFrames: number
  lastReceived: { at: Stamp; bytes: number } | null
  lastSent: { at: Stamp; bytes: number } | null
}
type PageRecord = {
  role: string
  page: Page
  pageId: string
  contextId: string
  wire: readonly LiveObservation[] | null
  sockets: SocketRecord[]
}

const stamp = (): Stamp => ({
  wallTime: Date.now(),
  monotonicMs: performance.now(),
})

const errorDescription = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null }
  }

  return { name: typeof error, message: String(error), stack: null }
}

const readOrError = <T,>(read: () => T): T | { diagnosticReadError: string } => {
  try {
    return read()
  } catch (error) {
    return { diagnosticReadError: errorDescription(error).message }
  }
}

const transportAddress = (address: string) => {
  try {
    const url = new URL(address)

    // Do not retain authentication/query values in diagnostic socket metadata.
    return {
      address: url.origin + url.pathname,
      transport: url.searchParams.get("transport"),
    }
  } catch {
    return { address: "<unparseable>", transport: null }
  }
}

function createCollector(testInfo: TestInfo, browser: Browser) {
  const events: Record<string, unknown>[] = []
  const observerErrors: Record<string, unknown>[] = []
  const pages = new Map<string, PageRecord>()
  const pageIds = new Map<Page, string>()
  const contextIds = new Map<BrowserContext, string>()
  const disposers: (() => void)[] = []
  let droppedLifecycleEvents = 0
  let nextSocket = 0

  const record = (event: string, details: Record<string, unknown> = {}) => {
    if (events.length < MAX_LIFECYCLE_EVENTS) {
      events.push({ at: stamp(), event, ...details })
    } else {
      droppedLifecycleEvents += 1
    }
  }

  const noteError = (where: string, error: unknown) => {
    observerErrors.push({ at: stamp(), where, ...errorDescription(error) })
  }

  const safely = (where: string, action: () => void) => {
    try {
      action()
    } catch (error) {
      noteError(where, error)
    }
  }

  const pageId = (page: Page) => {
    let id = pageIds.get(page)

    if (!id) {
      id = "page-" + (pageIds.size + 1)
      pageIds.set(page, id)
    }

    return id
  }

  const contextId = (context: BrowserContext) => {
    let id = contextIds.get(context)

    if (!id) {
      id = "context-" + (contextIds.size + 1)
      contextIds.set(context, id)
      const currentId = id
      const onClose = () => record("context.close", { contextId: currentId })

      safely("context.close.subscribe", () => {
        context.on("close", onClose)
        disposers.push(() => context.off("close", onClose))
      })
    }

    return id
  }

  const inventory = () =>
    readOrError(() =>
      browser.contexts().map((context) => ({
        contextId: contextId(context),
        pages: context.pages().map((page) => ({
          pageId: pageId(page),
          url: page.url(),
          closed: page.isClosed(),
        })),
      })),
    )

  const initialContexts = inventory()
  const onDisconnected = () => record("browser.disconnected")

  safely("browser.disconnected.subscribe", () => {
    browser.on("disconnected", onDisconnected)
    disposers.push(() => browser.off("disconnected", onDisconnected))
  })

  const watchPage = (role: string, page: Page) => {
    safely("watchPage:" + role, () => {
      if (pages.has(role)) {
        record("diagnostic.duplicate-role", { role })
        return
      }

      const entry: PageRecord = {
        role,
        page,
        pageId: pageId(page),
        contextId: contextId(page.context()),
        wire: null,
        sockets: [],
      }
      pages.set(role, entry)
      record("page.registered", {
        role,
        pageId: entry.pageId,
        contextId: entry.contextId,
        url: page.url(),
        closed: page.isClosed(),
      })

      const onCrash = () => record("page.crash", { role, pageId: entry.pageId })
      const onClose = () => record("page.close", { role, pageId: entry.pageId })
      const onPageError = (error: Error) =>
        record("page.pageerror", {
          role,
          pageId: entry.pageId,
          error: errorDescription(error),
        })

      const onWebSocket = (socket: WebSocket) => {
        safely("websocket.subscribe:" + role, () => {
          const address = transportAddress(socket.url())
          const socketRecord: SocketRecord = {
            id: "socket-" + ++nextSocket,
            url: address.address,
            createdAt: stamp(),
            closedAt: null,
            socketError: null,
            receivedFrames: 0,
            sentFrames: 0,
            lastReceived: null,
            lastSent: null,
          }
          entry.sockets.push(socketRecord)
          record("websocket.created", {
            role,
            pageId: entry.pageId,
            socketId: socketRecord.id,
            ...address,
          })

          const onSocketClose = () => {
            socketRecord.closedAt = stamp()
            record("websocket.close", {
              role,
              pageId: entry.pageId,
              socketId: socketRecord.id,
            })
          }
          const onSocketError = (message: string) => {
            socketRecord.socketError = { at: stamp(), message }
            record("websocket.socketerror", {
              role,
              pageId: entry.pageId,
              socketId: socketRecord.id,
              message,
            })
          }
          const onReceived = ({ payload }: { payload: string | Buffer }) => {
            socketRecord.receivedFrames += 1
            socketRecord.lastReceived = {
              at: stamp(),
              bytes: typeof payload === "string" ? Buffer.byteLength(payload) : payload.length,
            }
          }
          const onSent = ({ payload }: { payload: string | Buffer }) => {
            socketRecord.sentFrames += 1
            socketRecord.lastSent = {
              at: stamp(),
              bytes: typeof payload === "string" ? Buffer.byteLength(payload) : payload.length,
            }
          }

          socket.on("close", onSocketClose)
          socket.on("socketerror", onSocketError)
          socket.on("framereceived", onReceived)
          socket.on("framesent", onSent)
          disposers.push(
            () => socket.off("close", onSocketClose),
            () => socket.off("socketerror", onSocketError),
            () => socket.off("framereceived", onReceived),
            () => socket.off("framesent", onSent),
          )
        })
      }

      page.on("crash", onCrash)
      page.on("close", onClose)
      page.on("pageerror", onPageError)
      page.on("websocket", onWebSocket)
      disposers.push(
        () => page.off("crash", onCrash),
        () => page.off("close", onClose),
        () => page.off("pageerror", onPageError),
        () => page.off("websocket", onWebSocket),
      )
    })
  }

  const watchWire = (role: string, rows: readonly LiveObservation[]) => {
    const entry = pages.get(role)

    if (entry) {
      // Reference the original observer's array. Do not duplicate transport
      // listeners, response.body reads, JSON parsing, or application messages.
      entry.wire = rows
    } else {
      record("diagnostic.wire-without-page", { role })
    }
  }

  const pageSnapshot = (entry: PageRecord) => {
    const rows = entry.wire

    return {
      role: entry.role,
      pageId: entry.pageId,
      contextId: entry.contextId,
      url: readOrError(() => entry.page.url()),
      closed: entry.page.isClosed(),
      viewport: entry.page.viewportSize(),
      sockets: entry.sockets,
      originalObserver: rows
        ? {
            rows: rows.length,
            lastEvent: rows.at(-1) ?? null,
            lastExtensionState:
              rows.findLast((row) => row.name === "extensions:state") ?? null,
            transportErrors: rows
              .filter((row) => row.name === "observer:transport-error")
              .slice(-5),
            recentEventNames: rows.slice(-20).map((row) => ({
              name: row.name,
              observedAt: row.observedAt,
            })),
          }
        : null,
    }
  }

  const probePage = async (entry: PageRecord) => {
    const base = {
      role: entry.role,
      pageId: entry.pageId,
      contextId: entry.contextId,
      startedAt: stamp(),
      diagnosticOnly: true,
      budgetMs: PROBE_BUDGET_MS,
    }

    if (entry.page.isClosed()) {
      return { ...base, status: "already-closed", completedAt: stamp() }
    }
    if (!browser.isConnected()) {
      return { ...base, status: "browser-disconnected", completedAt: stamp() }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const read = entry.page
        .evaluate(() => ({
          readyState: document.readyState,
          visibilityState: document.visibilityState,
          href: location.href,
          performanceNow: globalThis.performance.now(),
        }))
        .then(
          (value) => ({ status: "completed", value, completedAt: stamp() }),
          (error: unknown) => ({
            status: "rejected",
            error: errorDescription(error),
            completedAt: stamp(),
          }),
        )
      const deadline = new Promise<{ status: string; completedAt: Stamp }>(
        (resolve) => {
          timer = setTimeout(
            () => resolve({ status: "diagnostic-timeout", completedAt: stamp() }),
            PROBE_BUDGET_MS,
          )
        },
      )

      return { ...base, ...(await Promise.race([read, deadline])) }
    } catch (error) {
      return {
        ...base,
        status: "rejected",
        error: errorDescription(error),
        completedAt: stamp(),
      }
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }

  const captureFailure = async (originalError: unknown) => {
    const outputRoot =
      process.env.TADAZZ_SHOW_DIAGNOSTIC_DIR ??
      testInfo.outputPath("tadazz-show-diagnostic")
    const project = testInfo.project.name.replace(/[^a-zA-Z0-9_-]/gu, "_")
    const identity = testInfo.testId.replace(/[^a-zA-Z0-9_-]/gu, "_")
    const prefix = project + "-" + testInfo.workerIndex + "-" + testInfo.retry + "-" + identity
    const beforePath = path.join(outputRoot, prefix + ".before-probes.json")
    const afterPath = path.join(outputRoot, prefix + ".after-probes.json")
    const before = {
      kind: "TADAZZ_SHOW_ORIGINAL_FAILURE_DIAGNOSTIC",
      version: 1,
      diagnosticOnly: true,
      qualificationClaimed: false,
      intendedApplicationRevision: APPLICATION_REVISION,
      originalSuiteSha256: ORIGINAL_SUITE_SHA256,
      originalError: errorDescription(originalError),
      test: {
        project: testInfo.project.name,
        titlePath: testInfo.titlePath,
        testId: testInfo.testId,
        workerIndex: testInfo.workerIndex,
        parallelIndex: testInfo.parallelIndex,
        retry: testInfo.retry,
      },
      capturedAt: stamp(),
      initialContexts,
      currentContexts: inventory(),
      browserConnected: browser.isConnected(),
      lifecycleEvents: events,
      droppedLifecycleEvents,
      observerErrors,
      pages: [...pages.values()].map(pageSnapshot),
      postFailureProbeBudgetMs: PROBE_BUDGET_MS,
      probesConcurrent: true,
      probesRunYet: false,
    }

    // Freeze original failure evidence on disk BEFORE any page evaluation.
    fs.mkdirSync(outputRoot, { recursive: true })
    fs.writeFileSync(beforePath, JSON.stringify(before, null, 2) + "\n", {
      flag: "wx",
    })

    const probes = await Promise.all([...pages.values()].map(probePage))
    const after = {
      kind: "TADAZZ_SHOW_POST_FAILURE_READ_ONLY_PROBES",
      version: 1,
      diagnosticOnly: true,
      qualificationClaimed: false,
      beforeProbeSnapshot: beforePath,
      originalErrorRethrowRequired: true,
      probes,
      capturedAt: stamp(),
      currentContexts: inventory(),
      browserConnected: browser.isConnected(),
      lifecycleEvents: events,
      observerErrors,
    }
    fs.writeFileSync(afterPath, JSON.stringify(after, null, 2) + "\n", {
      flag: "wx",
    })

    for (const [name, file] of [
      ["show-failure-before-probes", beforePath],
      ["show-failure-read-only-probes", afterPath],
    ] as const) {
      try {
        await testInfo.attach(name, { path: file, contentType: "application/json" })
      } catch (error) {
        noteError("attach:" + name, error)
      }
    }
  }

  const dispose = () => {
    for (const remove of disposers.reverse()) {
      safely("unsubscribe", remove)
    }
  }

  return { watchPage, watchWire, captureFailure, dispose }
}

type Collector = ReturnType<typeof createCollector>
const collectors = new WeakMap<TestInfo, Collector>()

// Keep explicit fixture destructuring: Playwright discovers fixture
// dependencies from the callback signature, not from the original callback.
export const withShowDiagnostics = (body: ShowBody): ShowBody =>
  async ({ page, browser }, testInfo) => {
    const collector = createCollector(testInfo, browser)
    collectors.set(testInfo, collector)
    collector.watchPage("host", page)

    try {
      await body({ page, browser }, testInfo)
    } catch (originalError) {
      try {
        await collector.captureFailure(originalError)
      } catch (diagnosticError) {
        // Diagnostic collection must never replace the original gate failure.
        try {
          process.stderr.write(
            "[tadazz-show diagnostic collection failed] " +
              errorDescription(diagnosticError).message +
              "\n",
          )
        } catch {
          // Preserve the exact original exception even if stderr is unavailable.
        }
      }
      throw originalError
    } finally {
      try {
        collector.dispose()
      } catch {
        // Passive listener removal must not alter the original test outcome.
      }
      collectors.delete(testInfo)
    }
  }

export const observeShowPage = (
  testInfo: TestInfo,
  role: "alice" | "bob",
  page: Page,
) => {
  collectors.get(testInfo)?.watchPage(role, page)
}

export const observeShowWire = (
  testInfo: TestInfo,
  role: "host" | "alice" | "bob",
  rows: readonly LiveObservation[],
) => {
  collectors.get(testInfo)?.watchWire(role, rows)
}
