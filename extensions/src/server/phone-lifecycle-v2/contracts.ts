import { createHash } from "node:crypto"

export type Action = "register" | "poll" | "answer" | "hangup"

// Supplied only by a future trusted verifier. This prototype does NOT verify an
// account/session/service credential. Fixture injection is not authentication.
export interface VerifiedServiceContext {
  verified: true
  owner: string
  issuerSid: string
  game: string
  provider: string
  service: string
  executorId: string
  actions: readonly Action[]
  expiresAt: number
}

export class Denied extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

export function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Denied("invalid_identifier")
  }
}

export function validateContext(
  context: VerifiedServiceContext,
  action: Action,
  now = Date.now(),
) {
  if (context?.verified !== true) {
    throw new Denied("service_required")
  }

  for (const part of [
    context.owner,
    context.issuerSid,
    context.game,
    context.provider,
    context.service,
    context.executorId,
  ]) {
    identifier(part)
  }

  if (
    !Number.isSafeInteger(context.expiresAt) ||
    context.expiresAt <= now ||
    !Array.isArray(context.actions) ||
    !context.actions.includes(action)
  ) {
    throw new Denied("service_denied")
  }
}

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")

export function capabilityHash(capability: string) {
  // Exactly 32 bytes in one canonical lower-case hexadecimal representation.
  if (typeof capability !== "string" || !/^[0-9a-f]{64}$/u.test(capability)) {
    throw new Denied("invalid_capability")
  }

  return digest(capability)
}

export interface RegistrationInput {
  requestId: string
  providerReference: string
  phone: string
  expectedPredecessor: number
  // Already durably precommitted with requestId by trusted ingress BEFORE send.
  capability: string
}

export interface OperationInput {
  requestId: string
  registrationId: string
  generation: number
  capability: string
  operationId: string
  action: Exclude<Action, "register">
  epoch?: number
  answerIndex?: number
}

export interface Receipt {
  ok: boolean
  status: string
  registrationId?: string
  generation?: number
  rosterPlayerId?: string
  clientId?: string
  accepted?: boolean
  epoch?: number
  points?: number
  answered?: boolean
}

export interface RegistrationRow {
  request_id: string
  fingerprint: string
  issuer_sid: string
  service: string
  caller_hash: string
  capability_hash: string
  registration_id: string
  generation: number
  state: "RESERVED" | "ACTIVE" | "REJECTED" | "RETIRED"
  roster_id: string | null
  client_id: string | null
  receipt: string | null
}

export interface Reservation {
  kind: "reserved"
  row: RegistrationRow
  predecessor: RegistrationRow | null
}

export type RegistrationDecision =
  Reservation | { kind: "receipt"; receipt: Receipt; row?: RegistrationRow }

export type OperationDecision =
  | { kind: "pending"; row: RegistrationRow }
  | { kind: "receipt"; receipt: Receipt; row?: RegistrationRow }

export const fail = (status: string): Receipt => ({ ok: false, status })
