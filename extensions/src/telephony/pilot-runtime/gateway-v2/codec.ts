import { createHash, timingSafeEqual } from "node:crypto"
import { identifier } from "../../../server/phone-lifecycle-v2/contracts"
import { canonicalActions } from "../../../server/phone-lifecycle-v2/auth/credential-codec"
import {
  GATEWAY_DELIVERY_PURPOSE,
  GatewayDenied,
  type GatewayBinding,
  type GatewayDelivery,
  type GatewayDeliveryAck,
  type GatewayLeaseView,
  type GatewayTarget,
} from "./contracts"

export function deny(): never {
  throw new GatewayDenied()
}
export function object(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    "then" in value
  )
    deny()
  return value as Record<string, unknown>
}
export function exact(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const row = object(value)
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key))
  )
    deny()
  return row
}
export function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) deny()
  return value as number
}
export function id(value: unknown): string {
  try {
    identifier(value)
    return value
  } catch {
    return deny()
  }
}
export function target(value: unknown): GatewayTarget {
  const row = exact(value, ["owner", "game", "provider", "service"])
  return Object.freeze({
    owner: id(row.owner),
    game: id(row.game),
    provider: id(row.provider),
    service: id(row.service),
  })
}
export function binding(value: unknown): GatewayBinding {
  const row = exact(value, [
    "protocol",
    "purpose",
    "owner",
    "game",
    "provider",
    "service",
    "version",
    "issuerSid",
    "executorId",
    "expiresAt",
    "initialActions",
  ])
  if (row.protocol !== 1 || row.purpose !== GATEWAY_DELIVERY_PURPOSE) deny()
  let actions
  try {
    actions = canonicalActions(
      row.initialActions as GatewayBinding["initialActions"],
    )
  } catch {
    return deny()
  }
  if (!actions.includes("register")) deny()
  return Object.freeze({
    protocol: 1,
    purpose: GATEWAY_DELIVERY_PURPOSE,
    ...target({
      owner: row.owner,
      game: row.game,
      provider: row.provider,
      service: row.service,
    }),
    version: integer(row.version, 1),
    issuerSid: id(row.issuerSid),
    executorId: id(row.executorId),
    expiresAt: integer(row.expiresAt, 1),
    initialActions: actions,
  })
}
export const scopeText = (value: GatewayTarget) =>
  JSON.stringify([value.owner, value.game, value.provider, value.service])
export const immutableText = (value: GatewayBinding) =>
  JSON.stringify([
    value.protocol,
    value.purpose,
    value.owner,
    value.game,
    value.provider,
    value.service,
    value.issuerSid,
    value.executorId,
    value.expiresAt,
    value.initialActions,
  ])
export const bindingText = (value: GatewayBinding) =>
  JSON.stringify([immutableText(value), value.version])
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function credential(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) deny()
  return value
}
export function sameCredential(a: string, b: string): boolean {
  return timingSafeEqual(
    Buffer.from(credential(a), "hex"),
    Buffer.from(credential(b), "hex"),
  )
}
export function lease(
  value: unknown,
  expected: GatewayTarget,
): GatewayLeaseView {
  const row = exact(value, ["binding", "state", "allowedActions"]),
    actual = binding(row.binding)
  if (
    scopeText(actual) !== scopeText(expected) ||
    actual.expiresAt <= Date.now() ||
    !["PENDING_DELIVERY", "ACTIVE"].includes(row.state as string)
  )
    deny()
  let allowed
  try {
    allowed = canonicalActions(
      row.allowedActions as GatewayBinding["initialActions"],
    )
  } catch {
    return deny()
  }
  if (allowed.some((action) => !actual.initialActions.includes(action))) deny()
  return Object.freeze({
    binding: actual,
    state: row.state as GatewayLeaseView["state"],
    allowedActions: allowed,
  })
}
export function delivery(value: unknown): GatewayDelivery {
  const row = exact(value, [
    "protocol",
    "purpose",
    "deliveryId",
    "expectedStoredVersion",
    "binding",
    "credential",
  ])
  if (row.protocol !== 1 || row.purpose !== GATEWAY_DELIVERY_PURPOSE) deny()
  return Object.freeze({
    protocol: 1,
    purpose: GATEWAY_DELIVERY_PURPOSE,
    deliveryId: id(row.deliveryId),
    expectedStoredVersion: integer(row.expectedStoredVersion),
    binding: binding(row.binding),
    credential: credential(row.credential),
  })
}
export function acknowledgement(value: unknown): GatewayDeliveryAck {
  const row = exact(value, [
    "protocol",
    "deliveryId",
    "installationId",
    "service",
    "storedVersion",
  ])
  if (row.protocol !== 1) deny()
  return Object.freeze({
    protocol: 1,
    deliveryId: id(row.deliveryId),
    installationId: id(row.installationId),
    service: id(row.service),
    storedVersion: integer(row.storedVersion, 1),
  })
}
