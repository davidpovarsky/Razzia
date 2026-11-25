import { normalizePhoneE164 } from "@razzia/extensions/core"
import type { RegistrationInput } from "../../../server/phone-lifecycle-v2/contracts"
import { binding, credential, deny, exact, id, integer } from "./codec"

export interface GatewayCallAttempt {
  readonly requestId: string
  readonly providerReference: string
  readonly phone: string
  readonly expectedPredecessor: number
}
export const callAttemptText = (value: GatewayCallAttempt) =>
  JSON.stringify([
    value.requestId,
    value.providerReference,
    value.phone,
    value.expectedPredecessor,
  ])
export function callAttempt(input: unknown): GatewayCallAttempt {
  const row = exact(input, [
    "requestId",
    "providerReference",
    "phone",
    "expectedPredecessor",
  ])
  const phone =
    typeof row.phone === "string" ? normalizePhoneE164(row.phone) : null
  if (!phone) deny()
  const predecessor = integer(row.expectedPredecessor)
  if (predecessor >= Number.MAX_SAFE_INTEGER) deny()
  return Object.freeze({
    requestId: id(row.requestId),
    providerReference: id(row.providerReference),
    phone,
    expectedPredecessor: predecessor,
  })
}
// Pure internal decoder. Its input is already decrypted by a fixed private
// record; it performs no I/O, authorization, generation or dispatch.
export function decodeCallRecord(input: unknown, expected: GatewayCallAttempt) {
  const body = exact(input, ["schema", "binding", "input"])
  if (body.schema !== 1) deny()
  const value = binding(body.binding),
    row = exact(body.input, [
      "requestId",
      "providerReference",
      "phone",
      "expectedPredecessor",
      "capability",
    ])
  const canonical = callAttempt({
    requestId: row.requestId,
    providerReference: row.providerReference,
    phone: row.phone,
    expectedPredecessor: row.expectedPredecessor,
  })
  if (
    canonical.phone !== row.phone ||
    callAttemptText(canonical) !== callAttemptText(expected)
  )
    deny()
  const registration: RegistrationInput = Object.freeze({
    ...canonical,
    capability: credential(row.capability),
  })
  return { binding: value, input: registration }
}
