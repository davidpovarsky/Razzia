import { createHash, timingSafeEqual } from "node:crypto"
import { Denied, identifier, type Action } from "../contracts"
import type { ServiceAddress, ServiceCredentialBinding } from "./contracts"

export const PHONE_ACTIONS: readonly Action[] = [
  "register",
  "poll",
  "answer",
  "hangup",
]
export const DUMMY_HASH = "0".repeat(64)
export function authorityDenied(): never {
  throw new Denied("authority_unavailable")
}
export function serviceDenied(): never {
  throw new Denied("service_denied")
}

export function copyAddress(input: ServiceAddress): ServiceAddress {
  const address = Object.freeze({
    owner: input.owner,
    game: input.game,
    provider: input.provider,
    service: input.service,
    version: input.version,
  })
  for (const part of [
    address.owner,
    address.game,
    address.provider,
    address.service,
  ])
    identifier(part)
  if (!Number.isSafeInteger(address.version) || address.version < 1)
    serviceDenied()
  return address
}
export function canonicalActions(
  actions: readonly Action[],
): readonly Action[] {
  if (
    !Array.isArray(actions) ||
    actions.length !== new Set(actions).size ||
    actions.some((action) => !PHONE_ACTIONS.includes(action))
  )
    serviceDenied()
  return Object.freeze([...actions].sort())
}
export function sameHash(a: string, b: string): boolean {
  return (
    /^[0-9a-f]{64}$/u.test(a) &&
    /^[0-9a-f]{64}$/u.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  )
}
export function serviceCapabilityHash(
  input: ServiceCredentialBinding,
  capability: string,
): string {
  const address = copyAddress(input)
  if (typeof capability !== "string" || !/^[0-9a-f]{64}$/u.test(capability))
    serviceDenied()
  identifier(input.issuerSid)
  identifier(input.executorId)
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt < 0)
    serviceDenied()
  const initial = canonicalActions(input.initialActions)
  return createHash("sha256")
    .update("tadazz:phone-service:v2\0")
    .update(
      JSON.stringify([
        address.owner,
        address.game,
        address.provider,
        address.service,
        address.version,
        input.issuerSid,
        input.executorId,
        input.expiresAt,
        initial,
      ]),
    )
    .update("\0")
    .update(Buffer.from(capability, "hex"))
    .digest("hex")
}
export const fingerprint = (values: readonly unknown[]) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex")

// Public, deterministic server selector; its secrecy is never authorization.
export function deriveServiceId(
  owner: string,
  game: string,
  provider: string,
  requestId: string,
) {
  for (const value of [owner, game, provider, requestId]) identifier(value)
  return fingerprint(["phone-service-id-v1", owner, game, provider, requestId])
}
