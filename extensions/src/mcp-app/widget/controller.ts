import { z } from "zod"
import {
  CONTRACT_VERSION,
  LIMITS,
  outputSchema,
  type ToolFailure,
} from "../contracts/schemas.ts"
import { dataSchemas, inputs } from "../contracts/tools.ts"

export type Draft = z.infer<typeof dataSchemas.get_game_draft>

export type Preview = z.infer<typeof dataSchemas.preview_game>

export type WidgetStatus =
  | "waiting"
  | "loading"
  | "ready"
  | "acknowledged"
  | "conflict"
  | "cancelled"
  | "unavailable"
  | "invalid"
  | "error"
  | "closed"
  | "candidate"

export interface WidgetState {
  status: WidgetStatus
  draft: Draft | null
  preview: Preview | null
  selectedDraftId: string | null
  currentRevision?: number
  undoAvailable: boolean
}

export interface WidgetBridge {
  callServerTool(
    params: { name: string; arguments: Record<string, unknown> },
    options?: { signal?: AbortSignal },
  ): Promise<unknown>
}

const envelope = z.object({
  structuredContent: z.unknown(),
  isError: z.boolean().optional(),
})

/** Only strict structured results are authoritative. Never parse model text or HTML. */
export function parseResult<T extends z.ZodType>(
  schema: T,
  value: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; error: ToolFailure } {
  const result = envelope.parse(value)

  if (
    new TextEncoder().encode(JSON.stringify(result.structuredContent))
      .byteLength > LIMITS.structured
  ) {
    throw new Error("widget:result-too-large")
  }

  const data = outputSchema(schema).parse(result.structuredContent)

  if (result.isError && data.ok) {
    throw new Error("widget:contradictory-result")
  }

  return data.ok ? { ok: true, data: schema.parse(data.data) } : data
}

// Draft persistence uses the original app-visible tools and exact-revision CAS.
// A cancelled/changed session never adopts a late response. A cancelled write may
// have reached the server; only an explicit refresh can reconcile that outcome.
export class WidgetController {
  private state: WidgetState = {
    status: "waiting",
    draft: null,
    preview: null,
    selectedDraftId: null,
    undoAvailable: false,
  }
  private listeners = new Set<() => void>()
  private generation = 0
  private active?: AbortController
  private history: {
    draftId: string
    revision: number
    before: string
  } | null = null
  constructor(
    private bridge: WidgetBridge,
    private key: () => string = () => crypto.randomUUID(),
  ) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(patch: Partial<WidgetState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => {
      listener()
    })
  }
  select(draftId: string) {
    if (this.state.status === "closed") {
      return
    }

    inputs.get_game_draft.parse({ contractVersion: CONTRACT_VERSION, draftId })

    if (draftId === this.state.selectedDraftId) {
      return
    }

    this.invalidate()
    this.history = null
    this.publish({
      status: "waiting",
      selectedDraftId: draftId,
      draft: null,
      preview: null,
      currentRevision: undefined,
      undoAvailable: false,
    })
  }
  private invalidate() {
    this.generation += 1
    this.active?.abort()
    this.active = undefined
  }
  cancel() {
    if (this.state.status !== "closed") {
      this.invalidate()
      this.publish({ status: "cancelled", preview: null })
    }
  }
  unavailable() {
    if (this.state.status !== "closed") {
      this.invalidate()
      this.publish({ status: "unavailable", preview: null })
    }
  }
  candidate() {
    if (this.state.status !== "closed") {
      this.publish({ status: "candidate" })
    }
  }
  close() {
    this.history = null
    this.invalidate()
    this.publish({
      status: "closed",
      draft: null,
      preview: null,
      selectedDraftId: null,
      undoAvailable: false,
    })
    this.listeners.clear()
  }
  /** Host notifications only belong to the exact selected preview invocation. */
  receivePreview(value: unknown) {
    if (this.state.status === "closed") {
      return
    }

    try {
      const parsed = parseResult(dataSchemas.preview_game, value)

      if (!parsed.ok) {
        this.failure(parsed.error)

        return
      }

      if (
        !this.state.selectedDraftId ||
        parsed.data.draftId !== this.state.selectedDraftId
      ) {
        return
      }

      if (
        this.state.draft &&
        parsed.data.revision < this.state.draft.revision
      ) {
        return
      }

      this.invalidate()
      const draft =
        this.state.draft?.revision === parsed.data.revision
          ? this.state.draft
          : null
      this.publish({
        preview: parsed.data,
        draft,
        currentRevision: undefined,
        status:
          parsed.data.rendererStatus === "ready" ? "ready" : "unavailable",
      })
    } catch {
      this.publish({ status: "invalid", preview: null })
    }
  }
  private failure(error: { code: string; currentRevision?: number }) {
    let status: WidgetStatus = "error"

    if (error.code === "REVISION_CONFLICT") {
      status = "conflict"
    } else if (
      ["ACCOUNT_UNAVAILABLE", "SCOPE_REQUIRED", "PREVIEW_UNAVAILABLE"].includes(
        error.code,
      )
    ) {
      status = "unavailable"
    }

    this.publish({
      status,
      currentRevision: error.currentRevision,
      preview: null,
    })
  }
  private async request(
    name: "get_game_draft" | "update_game_draft",
    args: Record<string, unknown>,
    undo = false,
  ) {
    const schema =
      name === "get_game_draft"
        ? dataSchemas.get_game_draft
        : dataSchemas.update_game_draft

    if (this.state.status === "closed") {
      return
    }

    const previous = this.state.draft
    this.invalidate()
    const { generation } = this
    const active = new AbortController()
    this.active = active
    this.publish({ status: "loading", currentRevision: undefined })

    try {
      const raw = await this.bridge.callServerTool(
        { name, arguments: args },
        { signal: active.signal },
      )

      if (generation !== this.generation) {
        return
      }

      const result = parseResult(schema, raw)

      if (!result.ok) {
        this.failure(result.error)

        return
      }

      const expectedId = args.draftId
      const { expectedRevision } = args

      if (
        result.data.draftId !== expectedId ||
        (name === "update_game_draft" &&
          result.data.revision !== Number(expectedRevision) + 1) ||
        (this.state.draft && result.data.revision < this.state.draft.revision)
      ) {
        throw new Error("widget:unexpected-ack")
      }

      const authoredShowJson =
        name === "get_game_draft"
          ? (result.data as Draft).authoredShowJson
          : String(args.authoredShowJson)

      if (name === "update_game_draft" && previous && !undo) {
        this.history = {
          draftId: previous.draftId,
          revision: result.data.revision,
          before: previous.authoredShowJson,
        }
      } else if (
        undo ||
        this.history?.revision !== result.data.revision ||
        this.history.draftId !== result.data.draftId
      ) {
        this.history = null
      }

      this.publish({
        status: name === "get_game_draft" ? "ready" : "acknowledged",
        draft: { ...result.data, authoredShowJson },
        preview: null,
        undoAvailable: this.history !== null,
      })
    } catch {
      if (generation === this.generation) {
        this.publish({ status: "error", preview: null })
      }
    } finally {
      if (this.active === active) {
        this.active = undefined
      }
    }
  }
  refresh() {
    const draftId = this.state.selectedDraftId

    if (!draftId) {
      return Promise.resolve()
    }

    return this.request(
      "get_game_draft",
      inputs.get_game_draft.parse({
        contractVersion: CONTRACT_VERSION,
        draftId,
      }),
    )
  }
  update(
    authoredShowJson: string,
    expectedRevision = this.state.draft?.revision,
    undo = false,
  ) {
    const { draft } = this.state

    if (
      !draft ||
      this.state.status === "loading" ||
      this.state.status === "closed"
    ) {
      return Promise.resolve()
    }

    if (expectedRevision !== draft.revision) {
      this.publish({ status: "conflict", currentRevision: draft.revision })

      return Promise.resolve()
    }

    return this.request(
      "update_game_draft",
      inputs.update_game_draft.parse({
        contractVersion: CONTRACT_VERSION,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
        authoredShowJson,
        idempotencyKey: this.key(),
      }),
      undo,
    )
  }
  undo() {
    if (
      !this.history ||
      this.history.revision !== this.state.draft?.revision ||
      this.history.draftId !== this.state.selectedDraftId
    ) {
      return Promise.resolve()
    }

    return this.update(this.history.before, this.history.revision, true)
  }
}
