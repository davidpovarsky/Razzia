import { randomUUID } from "node:crypto"
import { Client } from "@modelcontextprotocol/client"
import type { Transport } from "@modelcontextprotocol/server"
import { CallToolResultSchema } from "@modelcontextprotocol/core"
import type {
  Dependencies,
  DraftRecord,
  MutationIdentity,
  NormalizedDraft,
  VerifiedPrincipal,
} from "../../server/dependencies.ts"
import { createTadazzMcpServer } from "../../server/factory.ts"
import { ToolError } from "../../server/errors.ts"
import { jsonObject, opaqueId } from "../../contracts/schemas.ts"
import { scopes, type ToolName } from "../../contracts/tools.ts"

export const config = {
  issuer: "https://auth.example.invalid",
  resource: "https://mcp.example.invalid/mcp",
  resourceMetadataUrl:
    "https://mcp.example.invalid/.well-known/oauth-protected-resource",
  firstPartyOrigins: ["https://studio.example.invalid"],
}

export const principal = (): VerifiedPrincipal => ({
  issuer: config.issuer,
  audience: config.resource,
  subject: randomUUID(),
  clientId: "test-client",
  grantId: randomUUID(),
  accountId: randomUUID(),
  scopes: [...new Set(Object.values(scopes).flat())],
  expiresAt: Date.now() + 60_000,
  active: true,
  accountsEnabled: true,
})

export const show = () => ({
  format: "tada-show",
  version: 1,
  title: "Synthetic test",
  cards: [1, 2, 3, 4, 5].map((n) => ({
    key: `q${n}`,
    kind: "quiz",
    question: `Question ${n}`,
    timeSeconds: 20,
    answers: [{ text: "A" }, { text: "B" }],
    correctAnswers: [1],
  })),
  settings: [],
})

/**
 * Test-only volatile store. It is NEVER exported/imported by server code and
 * does not establish filesystem, durable-idempotency, consent or crash acceptance.
 */

export class MemoryDrafts {
  records = new Map<string, DraftRecord>()
  outcomes = new Map<string, { digest: string; result: DraftRecord }>()
  audit: string[] = []
  private owner(p: VerifiedPrincipal) {
    return `${p.accountId}:${p.subject}`
  }
  private replay(
    p: VerifiedPrincipal,
    tool: string,
    m: MutationIdentity,
    run: () => DraftRecord,
  ) {
    const key = [this.owner(p), p.grantId, tool, m.idempotencyKey].join(":")
    const prior = this.outcomes.get(key)

    if (prior) {
      if (prior.digest !== m.inputDigest) {
        throw new ToolError("REQUEST_KEY_REUSED")
      }

      return structuredClone(prior.result)
    }

    const result = run()
    this.outcomes.set(key, {
      digest: m.inputDigest,
      result: structuredClone(result),
    })
    this.audit.push(tool)

    return structuredClone(result)
  }
  async create(
    p: VerifiedPrincipal,
    value: NormalizedDraft,
    m: MutationIdentity,
  ) {
    return this.replay(p, "create", m, () => {
      const result = { ...value, draftId: randomUUID(), revision: 1 }
      this.records.set(
        `${this.owner(p)}:${result.draftId}`,
        structuredClone(result),
      )

      return result
    })
  }
  async get(p: VerifiedPrincipal, id: string) {
    const found = this.records.get(`${this.owner(p)}:${id}`)

    return found ? structuredClone(found) : undefined
  }
  async replace(
    p: VerifiedPrincipal,
    id: string,
    revision: number,
    value: NormalizedDraft,
    m: MutationIdentity,
  ) {
    return this.replay(p, "replace", m, () => {
      const key = `${this.owner(p)}:${id}`
      const current = this.records.get(key)

      if (!current) {
        throw new ToolError("NOT_FOUND")
      }

      if (current.revision !== revision) {
        throw new ToolError("REVISION_CONFLICT", {
          currentRevision: current.revision,
        })
      }

      const result = {
        ...current,
        ...value,
        draftId: id,
        revision: revision + 1,
      }
      this.records.set(key, structuredClone(result))

      return result
    })
  }
}

function linkedTransportPair(): [Transport, Transport] {
  const a: Transport = {
    start: async () => {
      /* This synthetic transport is connected in memory and needs no startup work. */
    },
    send: async (message) => {
      queueMicrotask(() => b.onmessage?.(structuredClone(message)))
    },
    close: async () => {
      a.onclose?.()
    },
  }
  const b: Transport = {
    start: async () => {
      /* This synthetic transport is connected in memory and needs no startup work. */
    },
    send: async (message) => {
      queueMicrotask(() => a.onmessage?.(structuredClone(message)))
    },
    close: async () => {
      b.onclose?.()
    },
  }

  return [a, b]
}

export async function harness(
  overrides: Dependencies = {},
  account = principal(),
) {
  const store = new MemoryDrafts()
  const deps: Dependencies = {
    authorize: () => Promise.resolve(account),
    prevalidationLimit: () => Promise.resolve(true),
    rateLimit: () => Promise.resolve(true),
    authoring: { allowedPublicAssetUrls: new Set() },
    drafts: store,
    ...overrides,
  }
  const server = createTadazzMcpServer(config, deps)
  const client = new Client({ name: "synthetic-mcp-tests", version: "1" })
  const [ct, st] = linkedTransportPair()
  await server.connect(st)
  await client.connect(ct)

  return {
    account,
    store,
    client,
    async call(name: ToolName, args: Record<string, unknown>) {
      return CallToolResultSchema.parse(
        await client.callTool({
          name,
          arguments: { contractVersion: "0.1.0", ...args },
        }),
      )
    },
    async close() {
      await client.close()
      await server.close()
    },
  }
}

export function data(result: { structuredContent?: unknown }) {
  const envelope = jsonObject.parse(result.structuredContent)

  if (envelope.ok !== true) {
    throw new Error(`Expected success: ${JSON.stringify(envelope.error)}`)
  }

  return jsonObject.parse(envelope.data)
}

export function code(result: { structuredContent?: unknown }) {
  return jsonObject.parse(jsonObject.parse(result.structuredContent).error).code
}

export const newKey = () => opaqueId.parse(randomUUID())

function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function requireObservedRecord(value: unknown): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error("Expected an object in the observed JSON response")
  }

  return value
}

function isObservedShow(
  value: unknown,
): value is Record<string, unknown> & {
  cards: Array<Record<string, unknown>>
} {
  return (
    isObservedRecord(value) &&
    Array.isArray(value.cards) &&
    value.cards.every(isObservedRecord)
  )
}

export function requireObservedShow(
  value: unknown,
): Record<string, unknown> & { cards: Array<Record<string, unknown>> } {
  if (!isObservedShow(value)) {
    throw new Error(
      "Expected the observed authored show to contain object cards",
    )
  }

  return value
}
