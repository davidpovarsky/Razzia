import type { DatabaseSync } from "node:sqlite"
import { identifier, type Action } from "../contracts"
import {
  authorityDenied,
  canonicalActions,
  copyAddress,
} from "./credential-codec"
import { PrivateAuthorityFiles } from "./private-authority-files"
import type {
  ServiceAddress,
  ServiceLeaseRecord,
  SynchronousServiceLeaseReader,
} from "./contracts"

export const LEASE_WHERE = "owner=? AND game=? AND provider=? AND service=?"

export const leaseAddressValues = (address: ServiceAddress) => [
  address.owner,
  address.game,
  address.provider,
  address.service,
]

type SqlRow = Record<string, unknown>

function decode(leaseRow: SqlRow | undefined): ServiceLeaseRecord | undefined {
  if (!leaseRow) {
    return undefined
  }

  const text = (key: string) => {
    if (typeof leaseRow[key] !== "string") {
      authorityDenied()
    }

    return leaseRow[key]
  }
  const integer = (key: string) => {
    if (!Number.isSafeInteger(leaseRow[key])) {
      authorityDenied()
    }

    return leaseRow[key] as number
  }
  const initial = canonicalActions(
    JSON.parse(text("initial_actions")) as Action[],
  )
  const current = canonicalActions(
    JSON.parse(text("current_actions")) as Action[],
  )
  const address = copyAddress({
    owner: text("owner"),
    game: text("game"),
    provider: text("provider"),
    service: text("service"),
    version: integer("version"),
  })
  const issuerSid = text("issuer_sid"),
    executorId = text("executor_id"),
    expiresAt = integer("expires_at")
  identifier(issuerSid)
  identifier(executorId)
  const state = text("state"),
    revoked = leaseRow.revoked_at,
    hash = text("capability_hash")

  if (
    !initial.includes("register") ||
    current.some((action) => !initial.includes(action)) ||
    expiresAt <= 0 ||
    !["PENDING_DELIVERY", "ACTIVE", "REVOKED"].includes(state) ||
    (revoked !== null &&
      (!Number.isSafeInteger(revoked) || (revoked as number) <= 0)) ||
    !/^[0-9a-f]{64}$/u.test(hash) ||
    (state === "REVOKED"
      ? revoked === null || current.length !== 0
      : revoked !== null)
  ) {
    authorityDenied()
  }

  return Object.freeze({
    ...address,
    issuerSid,
    executorId,
    expiresAt,
    initialActions: initial,
    currentActions: current,
    state: state as ServiceLeaseRecord["state"],
    revokedAt: revoked as number | null,
    capabilityHash: hash,
  })
}

export function readServiceLease(db: DatabaseSync, address: ServiceAddress) {
  return decode(
    db
      .prepare(`SELECT * FROM leases WHERE ${LEASE_WHERE}`)
      .get(...leaseAddressValues(address)),
  )
}

export class ReadonlyServiceLeaseReader implements SynchronousServiceLeaseReader {
  constructor(private readonly files: PrivateAuthorityFiles) {}
  readCurrent(input: ServiceAddress): ServiceLeaseRecord | undefined {
    const address = copyAddress(input)

    return this.files.read((db) => readServiceLease(db, address))
  }
}
