// Genuine SDK AppBridge fixture. These tool responses are synthetic witnesses,
// not proof of an installed ChatGPT/Claude connector or authenticated persistence.
import {
  AppBridge,
  PostMessageTransport,
} from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { retainedPacket, retainedSelection } from "./retained-schema.ts"

type PreviewMode = "retained" | "tampered" | "stale" | "unavailable"
type RetainedEntry = ReturnType<typeof retainedPacket.parse>["results"][number]

const { searchParams } = new URL(window.location.href)
const candidateParam = searchParams.get("candidate")
const previewParam = searchParams.get("preview")
let id = "widget_draft_A_123456789012"
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
let updatesHeld = false
const heldUpdates = new Set<() => void>()
let previewsHeld = false
const heldPreviews = new Set<() => void>()
let previewMode: PreviewMode =
  previewParam === "tampered" ||
  previewParam === "stale" ||
  previewParam === "unavailable"
    ? previewParam
    : "retained"
let retainedEntries: RetainedEntry[] | null = null

async function loadRetainedEntries() {
  if (retainedEntries) {
    return retainedEntries
  }

  const response = await fetch("/qa/retained-tool-packet")

  if (!response.ok) {
    return null
  }

  const raw: unknown = await response.json()
  retainedEntries = retainedPacket.parse(raw).results

  return retainedEntries
}

function candidateForRevision(
  entry: RetainedEntry,
  targetRevision: number,
): RetainedEntry["result"] {
  const cloned = structuredClone(entry.result)
  const candidate = cloned._meta["tadazz/preview-candidate-v2"]

  if (
    targetRevision === entry.selection.expectedRevision &&
    candidate.revision === targetRevision
  ) {
    return cloned
  }

  candidate.revision = targetRevision
  candidate.input.frame.revision = targetRevision
  candidate.input.themeBinding.draftRevision = targetRevision
  candidate.inputDigest = hashJson(candidate.input)

  return cloned
}

const result = (data: Record<string, unknown>) => ({
  content: [],
  structuredContent: {
    contractVersion: "0.1.0",
    ok: true,
    correlationId: "widget_result_123456789012",
    data,
  },
})
const errorResult = (
  code: "REVISION_CONFLICT" | "PREVIEW_UNAVAILABLE",
  extra: Record<string, unknown> = {},
) => ({
  content: [],
  isError: true,
  structuredContent: {
    contractVersion: "0.1.0",
    ok: false,
    correlationId: "widget_result_123456789012",
    error: {
      code,
      messageKey: `extensions:mcp.${code}`,
      retryable: code === "REVISION_CONFLICT",
      ...extra,
    },
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
  searchParams.has("noTools") ? {} : { serverTools: {} },
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

  if (name === "update_game_draft" && updatesHeld) {
    await new Promise<void>((resolve) => {
      heldUpdates.add(resolve)
    })
  }

  if (name === "preview_game" && previewsHeld) {
    await new Promise<void>((resolve) => {
      heldPreviews.add(resolve)
    })
  }

  if (name === "get_game_draft") {
    return result({ draftId: id, revision, summary, authoredShowJson: text })
  }

  if (
    name === "update_game_draft" &&
    args?.draftId === id &&
    args?.expectedRevision === revision &&
    !conflict
  ) {
    text = String(args.authoredShowJson)
    revision += 1

    return result({ draftId: id, revision, summary })
  }

  if (name === "preview_game") {
    if (
      args?.contractVersion !== "0.1.0" ||
      args?.draftId !== id ||
      args?.expectedRevision !== revision ||
      conflict
    ) {
      return errorResult("REVISION_CONFLICT", { currentRevision: revision })
    }

    if (previewMode === "unavailable") {
      return errorResult("PREVIEW_UNAVAILABLE")
    }

    const entries = await loadRetainedEntries()
    const locale = typeof args?.locale === "string" ? args.locale : "en"
    const entry = entries?.find(
      (item) => (item.selection.locale ?? "en") === locale,
    )

    if (!entry || args.draftId !== entry.selection.draftId) {
      return errorResult("PREVIEW_UNAVAILABLE")
    }

    if (previewMode === "tampered") {
      const tampered = candidateForRevision(entry, revision)
      tampered._meta["tadazz/preview-candidate-v2"].inputDigest = "0".repeat(64)

      return tampered
    }

    if (previewMode === "stale") {
      const mismatchedRevision = revision === 1 ? 2 : 1

      return candidateForRevision(entry, mismatchedRevision)
    }

    if (
      revision === entry.selection.expectedRevision &&
      locale === (entry.selection.locale ?? "en")
    ) {
      return structuredClone(entry.result)
    }

    return candidateForRevision(entry, revision)
  }

  return errorResult("REVISION_CONFLICT", { currentRevision: revision + 1 })
}
async function initialized() {
  if (candidateParam) {
    const raw: unknown = await (await fetch("/qa/retained-tool-result")).json()
    const retained = retainedSelection.parse(raw)

    if (candidateParam === "tampered") {
      retained.result._meta["tadazz/preview-candidate-v2"].inputDigest =
        "0".repeat(64)
    }

    await bridge.sendToolInput({ arguments: retained.selection })

    if (candidateParam === "repeated") {
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

  if (previewParam) {
    const entries = await loadRetainedEntries()
    const first = entries?.[0]

    if (!first) {
      throw new Error("qa:missing-retained-packet")
    }

    id = first.selection.draftId
    revision = first.selection.expectedRevision
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
    holdUpdates: (value: boolean) => {
      updatesHeld = value

      if (!value) {
        heldUpdates.forEach((resolve) => {
          resolve()
        })
        heldUpdates.clear()
      }
    },
    holdPreviews: (value: boolean) => {
      previewsHeld = value

      if (!value) {
        heldPreviews.forEach((resolve) => {
          resolve()
        })
        heldPreviews.clear()
      }
    },
    previewMode: (value: PreviewMode) => {
      previewMode = value
    },
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
