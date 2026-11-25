import type { Action } from "../contracts"

export interface ServiceAddress {
  readonly owner: string
  readonly game: string
  readonly provider: string
  readonly service: string
  readonly version: number
}

export interface ServiceCredentialBinding extends ServiceAddress {
  readonly issuerSid: string
  readonly executorId: string
  readonly expiresAt: number
  readonly initialActions: readonly Action[]
}

export interface ServiceLeaseRecord extends ServiceCredentialBinding {
  readonly currentActions: readonly Action[]
  readonly state: "PENDING_DELIVERY" | "ACTIVE" | "REVOKED"
  readonly revokedAt: number | null
  readonly capabilityHash: string
}

export interface SynchronousServiceLeaseReader {
  readCurrent(address: ServiceAddress): ServiceLeaseRecord | undefined
}

export interface ControlReceipt {
  readonly ok: boolean
  readonly status: string
  readonly service: string
  readonly version: number
  readonly state?: ServiceLeaseRecord["state"]
  readonly expiresAt?: number
}

export interface SecretAttempt {
  readonly receipt: ControlReceipt
  // Exists only on the newly committed issue/rotate return, never in SQLite or
  // on cached responses. The transport has at most one secret-bearing attempt.
  readonly credential?: string
}

export interface ControlRequest {
  readonly requestId: string
  readonly expectedVersion: number
}

export type SynchronousReauthorize = () => void
