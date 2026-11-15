import { canonicalJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS } from "../contracts/schemas.ts"
import { ToolError } from "./errors.ts"
import { randomUUID } from "node:crypto"
import type { RequestId } from "@modelcontextprotocol/server"
import type { VerifiedPrincipal } from "./dependencies.ts"

export interface Operation {
  readonly wireId: RequestId
  readonly sdkId: string
  readonly tool: boolean
  work: number
  sdkPending: boolean
  forwarded: boolean
  terminal: boolean
  cancelled: boolean
  retired: boolean
  principal?: VerifiedPrincipal
  dispose: Array<() => void>
}

/** One connection's bounded request lifetimes, never an idempotency cache.
 * Cancellation retires authority, but occupied work stays counted until settled.
 * Internal SDK IDs never repeat, even when the client reuses a finished wire ID. */
export class RequestLifetimes {
  readonly byWire = new Map<RequestId, Operation>()
  readonly bySdk = new Map<string, Operation>()
  private prefix = "tadazz-request-" + randomUUID() + ":"
  private next = 0
  closed = false

  admit(id: unknown, tool: boolean): Operation {
    if (
      this.closed ||
      (typeof id !== "string" && typeof id !== "number") ||
      (typeof id === "string" && id.length > 128) ||
      (typeof id === "number" && !Number.isSafeInteger(id)) ||
      this.byWire.has(id) ||
      this.byWire.size >= 32 ||
      this.next === Number.MAX_SAFE_INTEGER
    )
      throw new Error("Invalid request lifetime")
    const op: Operation = {
      wireId: id,
      sdkId: this.prefix + ++this.next,
      tool,
      work: tool ? 1 : 0,
      sdkPending: false,
      forwarded: false,
      terminal: false,
      cancelled: false,
      retired: false,
      dispose: [],
    }
    this.byWire.set(id, op)
    this.bySdk.set(op.sdkId, op)
    return op
  }

  current(op: Operation) {
    return (
      !this.closed &&
      !op.retired &&
      this.byWire.get(op.wireId) === op &&
      this.bySdk.get(op.sdkId) === op
    )
  }
  cancel(op: Operation) {
    op.cancelled = true
    op.terminal = true
    op.principal = undefined
    this.settle(op)
  }
  settledWork(op: Operation) {
    op.work--
    this.settle(op)
  }
  /** Hold each owner once through PUBLIC send completion, not remote receipt. */
  retainSend(...owners: Array<Operation | undefined>) {
    const unique = [...new Set(owners.filter((op): op is Operation => !!op))]
    if (unique.some((op) => !this.current(op) || op.cancelled))
      throw new Error("Request retired")
    for (const op of unique) op.work++
    let held = true
    return () => {
      if (!held) return
      held = false
      for (const op of unique) this.settledWork(op)
    }
  }
  replied(op: Operation) {
    op.sdkPending = false
    op.terminal = true
    this.settle(op)
  }
  private settle(op: Operation) {
    if (op.work !== 0 || (!this.closed && (!op.terminal || op.sdkPending)))
      return
    op.retired = true
    op.principal = undefined
    for (const dispose of op.dispose.splice(0)) dispose()
    // A late completion can only retire its own lifetime, never a newer same-ID call.
    if (this.byWire.get(op.wireId) === op) this.byWire.delete(op.wireId)
    if (this.bySdk.get(op.sdkId) === op) this.bySdk.delete(op.sdkId)
  }
  close() {
    this.closed = true
    for (const op of this.byWire.values()) this.cancel(op)
  }
  isInternal(id: unknown) {
    return typeof id === "string" && id.startsWith(this.prefix)
  }
}

/** Bounded walk BEFORE canonicalization/schema diagnostics. No arbitrary keys,
 * values, validation issues or exception text are returned to the caller. */
export function boundedInput(value: unknown) {
  let elements = 0
  let textUnits = 0
  const seen = new Set<object>()
  const walk = (v: unknown, depth: number) => {
    if (++elements > 100 || depth > 16) throw new ToolError("VALIDATION_FAILED")
    if (typeof v === "string") {
      textUnits += v.length
      if (textUnits > LIMITS.request) throw new ToolError("VALIDATION_FAILED")
    } else if (v && typeof v === "object") {
      if (seen.has(v)) throw new ToolError("VALIDATION_FAILED")
      seen.add(v)
      for (const key of Object.keys(v)) {
        textUnits += key.length
        if (textUnits > LIMITS.request) throw new ToolError("VALIDATION_FAILED")
        walk((v as Record<string, unknown>)[key], depth + 1)
      }
    }
  }
  walk(value, 0)
  if (utf8Bytes(canonicalJson(value)) > LIMITS.request)
    throw new ToolError("VALIDATION_FAILED")
}
