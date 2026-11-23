import { randomBytes } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { identifier, type Action } from "../contracts"
import {
  authorityDenied,
  canonicalActions,
  copyAddress,
  fingerprint,
  sameHash,
  serviceCapabilityHash,
  serviceDenied,
} from "./credential-codec"
import { PrivateAuthorityFiles } from "./private-authority-files"
import type {
  ControlReceipt,
  ControlRequest,
  SecretAttempt,
  ServiceAddress,
  ServiceCredentialBinding,
  ServiceLeaseRecord,
  SynchronousReauthorize,
  SynchronousServiceLeaseReader,
} from "./contracts"

const WHERE = "owner=? AND game=? AND provider=? AND service=?"
const SCHEMA = `
CREATE TABLE authority_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),schema_version INTEGER NOT NULL,store_id TEXT NOT NULL);
CREATE TABLE leases(
 owner TEXT NOT NULL,game TEXT NOT NULL,provider TEXT NOT NULL,service TEXT NOT NULL,
 issuer_sid TEXT NOT NULL,executor_id TEXT NOT NULL,expires_at INTEGER NOT NULL,
 initial_actions TEXT NOT NULL,current_actions TEXT NOT NULL,version INTEGER NOT NULL,
 state TEXT NOT NULL,revoked_at INTEGER,capability_hash TEXT NOT NULL,
 PRIMARY KEY(owner,game,provider,service),UNIQUE(owner,game));
CREATE TABLE control_receipts(
 owner TEXT NOT NULL,game TEXT NOT NULL,provider TEXT NOT NULL,service TEXT NOT NULL,
 request_id TEXT NOT NULL,action TEXT NOT NULL,fingerprint TEXT NOT NULL,
 metadata TEXT NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(owner,game,provider,service,request_id));`

const scope = (address: ServiceAddress) => [
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
function row(db: DatabaseSync, address: ServiceAddress) {
  return decode(
    db.prepare(`SELECT * FROM leases WHERE ${WHERE}`).get(...scope(address)),
  )
}
function request(input: ControlRequest) {
  identifier(input.requestId)

  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    serviceDenied()
  }
}
function immutable(binding: ServiceCredentialBinding) {
  return [
    binding.owner,
    binding.game,
    binding.provider,
    binding.service,
    binding.issuerSid,
    binding.executorId,
    binding.expiresAt,
    canonicalActions(binding.initialActions),
  ]
}
function sameBinding(a: ServiceCredentialBinding, b: ServiceCredentialBinding) {
  return JSON.stringify(immutable(a)) === JSON.stringify(immutable(b))
}
function metadata(
  ok: boolean,
  status: string,
  address: ServiceAddress,
  lease?: ServiceLeaseRecord,
): ControlReceipt {
  return Object.freeze({
    ok,
    status,
    service: address.service,
    version: lease?.version ?? address.version,
    ...(lease ? { state: lease.state, expiresAt: lease.expiresAt } : {}),
  })
}
function parseReceipt(raw: unknown): ControlReceipt {
  if (typeof raw !== "string") {
    authorityDenied()
  }

  const parsed: unknown = JSON.parse(raw)

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    authorityDenied()
  }

  const data = parsed as Record<string, unknown>
  const statuses = [
    "request_conflict",
    "authority_exists",
    "game_authority_conflict",
    "pending_delivery",
    "version_conflict",
    "active",
    "revoked",
  ]

  if (
    Object.keys(data).some(
      (key) =>
        !["ok", "status", "service", "version", "state", "expiresAt"].includes(
          key,
        ),
    ) ||
    typeof data.ok !== "boolean" ||
    typeof data.status !== "string" ||
    typeof data.service !== "string" ||
    !Number.isSafeInteger(data.version) ||
    (data.version as number) < 1 ||
    !statuses.includes(data.status)
  ) {
    authorityDenied()
  }

  identifier(data.service)

  if (
    data.state !== undefined &&
    (typeof data.state !== "string" ||
      !["PENDING_DELIVERY", "ACTIVE", "REVOKED"].includes(data.state))
  ) {
    authorityDenied()
  }

  if (
    data.expiresAt !== undefined &&
    (!Number.isSafeInteger(data.expiresAt) || (data.expiresAt as number) <= 0)
  ) {
    authorityDenied()
  }

  return Object.freeze(data) as unknown as ControlReceipt
}
function prior(
  db: DatabaseSync,
  address: ServiceAddress,
  input: ControlRequest,
  fp: string,
): ControlReceipt | undefined {
  const found = db
    .prepare(
      `SELECT fingerprint,metadata FROM control_receipts WHERE ${WHERE} AND request_id=?`,
    )
    .get(...scope(address), input.requestId)

  if (!found) {
    return undefined
  }

  if (found.fingerprint !== fp) {
    return metadata(false, "request_conflict", address)
  }

  const receipt = parseReceipt(found.metadata)

  if (receipt.service !== address.service) {
    authorityDenied()
  }

  return receipt
}
function finish(
  db: DatabaseSync,
  address: ServiceAddress,
  input: ControlRequest,
  action: string,
  fp: string,
  receipt: ControlReceipt,
): SecretAttempt {
  // Explicit whitelist construction: never serialize a SecretAttempt/lease/credential.
  const safe = {
    ok: receipt.ok,
    status: receipt.status,
    service: receipt.service,
    version: receipt.version,
    ...(receipt.state ? { state: receipt.state } : {}),
    ...(receipt.expiresAt !== undefined
      ? { expiresAt: receipt.expiresAt }
      : {}),
  }
  db.prepare(
    `INSERT INTO control_receipts(owner,game,provider,service,request_id,action,fingerprint,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
  ).run(
    ...scope(address),
    input.requestId,
    action,
    fp,
    JSON.stringify(safe),
    Date.now(),
  )

  return { receipt: Object.freeze(safe) }
}

export class ReadonlyServiceLeaseReader implements SynchronousServiceLeaseReader {
  constructor(private readonly files: PrivateAuthorityFiles) {}
  readCurrent(input: ServiceAddress): ServiceLeaseRecord | undefined {
    const address = copyAddress(input)

    return this.files.read((db) => row(db, address))
  }
}

export class ServiceAuthorityWriter {
  constructor(private readonly files: PrivateAuthorityFiles) {}
  initialize(check: SynchronousReauthorize) {
    this.files.initialize(check, SCHEMA)
  }

  issue(
    binding: ServiceCredentialBinding,
    input: ControlRequest,
    actorSid: string,
    check: SynchronousReauthorize,
  ): SecretAttempt {
    const address = copyAddress(binding),
      initial = canonicalActions(binding.initialActions)
    request(input)
    identifier(actorSid)
    identifier(binding.issuerSid)
    identifier(binding.executorId)

    if (
      address.version !== 1 ||
      input.expectedVersion !== 0 ||
      !initial.includes("register") ||
      !Number.isSafeInteger(binding.expiresAt) ||
      binding.expiresAt <= Date.now() ||
      actorSid !== binding.issuerSid
    ) {
      serviceDenied()
    }

    const fp = fingerprint([
      "issue-v1",
      input.requestId,
      input.expectedVersion,
      actorSid,
      immutable(binding),
    ])

    return this.files.mutate(check, (db) => {
      if (binding.expiresAt <= Date.now()) {
        serviceDenied()
      }

      const current = row(db, address)

      if (current && !sameBinding(current, binding)) {
        serviceDenied()
      }

      const cached = prior(db, address, input, fp)

      if (cached) {
        return { receipt: cached }
      }

      if (current) {
        return finish(
          db,
          address,
          input,
          "issue",
          fp,
          metadata(false, "authority_exists", address, current),
        )
      }

      const credential = randomBytes(32).toString("hex")
      const hash = serviceCapabilityHash(binding, credential)
      const inserted = db
        .prepare(
          `INSERT INTO leases(owner,game,provider,service,issuer_sid,executor_id,expires_at,initial_actions,current_actions,version,state,revoked_at,capability_hash)
        VALUES(?,?,?,?,?,?,?,?,?,1,'PENDING_DELIVERY',NULL,?) ON CONFLICT(owner,game) DO NOTHING`,
        )
        .run(
          ...scope(address),
          binding.issuerSid,
          binding.executorId,
          binding.expiresAt,
          JSON.stringify(initial),
          JSON.stringify(initial),
          hash,
        )

      if (Number(inserted.changes) !== 1) {
        return finish(
          db,
          address,
          input,
          "issue",
          fp,
          metadata(false, "game_authority_conflict", address),
        )
      }

      const completed = row(db, address)

      if (!completed) {
        authorityDenied()
      }

      const result = finish(
        db,
        address,
        input,
        "issue",
        fp,
        metadata(true, "pending_delivery", address, completed),
      )

      return { ...result, credential }
    })
  }

  rotate(
    binding: ServiceCredentialBinding,
    input: ControlRequest,
    actorSid: string,
    check: SynchronousReauthorize,
  ): SecretAttempt {
    const address = copyAddress(binding)
    request(input)
    identifier(actorSid)
    const fp = fingerprint([
      "rotate-v1",
      input.requestId,
      input.expectedVersion,
      actorSid,
      immutable(binding),
    ])

    return this.files.mutate(check, (db) => {
      const current = row(db, address)

      if (
        !current ||
        !sameBinding(current, binding) ||
        current.issuerSid !== actorSid ||
        current.expiresAt <= Date.now()
      ) {
        serviceDenied()
      }

      const cached = prior(db, address, input, fp)

      if (cached) {
        return { receipt: cached }
      }

      if (
        current.state === "REVOKED" ||
        current.version !== input.expectedVersion ||
        current.version >= Number.MAX_SAFE_INTEGER
      ) {
        return finish(
          db,
          address,
          input,
          "rotate",
          fp,
          metadata(false, "version_conflict", address, current),
        )
      }

      const next = { ...current, version: current.version + 1 }
      const credential = randomBytes(32).toString("hex"),
        hash = serviceCapabilityHash(next, credential)
      const changed = db
        .prepare(
          `UPDATE leases SET version=?,state='PENDING_DELIVERY',capability_hash=? WHERE ${WHERE} AND version=? AND state!='REVOKED'`,
        )
        .run(next.version, hash, ...scope(address), input.expectedVersion)

      if (Number(changed.changes) !== 1) {
        authorityDenied()
      }

      const result = finish(
        db,
        address,
        input,
        "rotate",
        fp,
        metadata(true, "pending_delivery", address, row(db, address)),
      )

      return { ...result, credential }
    })
  }

  activate(
    inputAddress: ServiceAddress,
    capability: string,
    input: ControlRequest,
    check: SynchronousReauthorize,
  ): SecretAttempt {
    const address = copyAddress(inputAddress)
    request(input)

    if (input.expectedVersion !== address.version) {
      serviceDenied()
    }

    return this.files.mutate(check, (db) => {
      const current = row(db, address)

      // Service proof must be current BEFORE any cached receipt is disclosed.
      if (
        !current ||
        current.version !== address.version ||
        current.state === "REVOKED" ||
        current.currentActions.length === 0 ||
        current.expiresAt <= Date.now() ||
        !sameHash(
          serviceCapabilityHash(current, capability),
          current.capabilityHash,
        )
      ) {
        serviceDenied()
      }

      const fp = fingerprint([
        "activate-v1",
        input.requestId,
        input.expectedVersion,
        immutable(current),
        current.capabilityHash,
      ])
      const cached = prior(db, address, input, fp)

      if (cached) {
        return { receipt: cached }
      }

      const changed = db
        .prepare(
          `UPDATE leases SET state='ACTIVE' WHERE ${WHERE} AND version=? AND state IN ('PENDING_DELIVERY','ACTIVE')`,
        )
        .run(...scope(address), input.expectedVersion)

      if (Number(changed.changes) !== 1) {
        authorityDenied()
      }

      return finish(
        db,
        address,
        input,
        "activate",
        fp,
        metadata(true, "active", address, row(db, address)),
      )
    })
  }

  revoke(
    binding: ServiceCredentialBinding,
    input: ControlRequest,
    actorSid: string,
    check: SynchronousReauthorize,
  ): SecretAttempt {
    const address = copyAddress(binding)
    request(input)
    identifier(actorSid)
    const fp = fingerprint([
      "revoke-v1",
      input.requestId,
      input.expectedVersion,
      actorSid,
      immutable(binding),
    ])

    return this.files.mutate(check, (db) => {
      const current = row(db, address)

      if (!current || !sameBinding(current, binding)) {
        serviceDenied()
      }

      const cached = prior(db, address, input, fp)

      if (cached) {
        return { receipt: cached }
      }

      if (
        current.version !== input.expectedVersion ||
        current.version >= Number.MAX_SAFE_INTEGER
      ) {
        return finish(
          db,
          address,
          input,
          "revoke",
          fp,
          metadata(false, "version_conflict", address, current),
        )
      }

      if (current.state !== "REVOKED") {
        const changed = db
          .prepare(
            `UPDATE leases SET version=version+1,state='REVOKED',revoked_at=?,current_actions='[]' WHERE ${WHERE} AND version=?`,
          )
          .run(Date.now(), ...scope(address), input.expectedVersion)

        if (Number(changed.changes) !== 1) {
          authorityDenied()
        }
      }

      return finish(
        db,
        address,
        input,
        "revoke",
        fp,
        metadata(true, "revoked", address, row(db, address)),
      )
    })
  }
}
