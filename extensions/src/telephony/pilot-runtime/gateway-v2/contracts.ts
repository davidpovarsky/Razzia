import type { Action } from "../../../server/phone-lifecycle-v2/contracts"
import type {
  ControlReceipt,
  ServiceCredentialBinding,
} from "../../../server/phone-lifecycle-v2/auth/contracts"

export const GATEWAY_PROTOCOL = 1 as const
export const GATEWAY_DELIVERY_PURPOSE =
  "tadazz-phone-gateway-delivery-v1" as const
export const GATEWAY_KEY_PURPOSE = "tadazz-phone-gateway-custody-v1" as const
export const GATEWAY_ROOT_MARKER = "TADAZZ_PHONE_GATEWAY_CUSTODY_V1"
export const GATEWAY_ROOT_CONTENT = "private-phone-gateway-custody-v1\n"

export interface GatewayTarget {
  readonly owner: string
  readonly game: string
  readonly provider: string
  readonly service: string
}
export interface GatewayBinding extends ServiceCredentialBinding {
  readonly protocol: 1
  readonly purpose: typeof GATEWAY_DELIVERY_PURPOSE
}
export interface GatewayLeaseView {
  readonly binding: GatewayBinding
  readonly state: "PENDING_DELIVERY" | "ACTIVE"
  readonly allowedActions: readonly Action[]
}
export interface GatewayDelivery {
  readonly protocol: 1
  readonly purpose: typeof GATEWAY_DELIVERY_PURPOSE
  readonly deliveryId: string
  readonly expectedStoredVersion: number
  readonly binding: GatewayBinding
  // In-flight only. No SQL/response receipt/adapter credential cache.
  readonly credential: string
}
export interface GatewayDeliveryAck {
  readonly protocol: 1
  readonly deliveryId: string
  readonly installationId: string
  readonly service: string
  readonly storedVersion: number
}
export interface GatewayDeliveryDestination {
  acceptDelivery(delivery: GatewayDelivery): Promise<GatewayDeliveryAck>
}
export interface GatewayAuthorityPort {
  // An injected trusted host port, never deserialized callback/journal fields.
  current(): GatewayLeaseView
  assertCredential(
    binding: GatewayBinding,
    credential: string,
    action?: Action,
  ): void
  activate(
    binding: GatewayBinding,
    credential: string,
    requestId: string,
  ): Promise<ControlReceipt>
}
export interface GatewayPrivateKeyHandle {
  readonly purpose: typeof GATEWAY_KEY_PURPOSE
  readonly installationId: string
  readonly keyId: string
  readonly bytes: Buffer
  // Synchronous close owns/clears the temporary key handle. No key-path fallback.
  close(): void
}
export interface GatewayPrivateKeyPort {
  open(): GatewayPrivateKeyHandle
}
export interface GatewayCustodyOptions {
  readonly enabled?: boolean
  readonly root: string
  readonly installationId: string
  readonly keyId: string
  readonly target: GatewayTarget
  readonly key: GatewayPrivateKeyPort
  readonly authority: GatewayAuthorityPort
}
export class GatewayDenied extends Error {
  constructor() {
    super("gateway_custody_denied")
  }
}
