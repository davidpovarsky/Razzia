import { randomUUID, timingSafeEqual } from "node:crypto"
import { chmodSync, lstatSync, realpathSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  capabilityHash,
  Denied,
  digest,
  fail,
  identifier,
  validateContext,
  type Action,
  type OperationDecision,
  type OperationInput,
  type Receipt,
  type RegistrationDecision,
  type RegistrationRow,
  type Reservation,
  type VerifiedServiceContext,
} from "./contracts"

// Unmounted, synthetic-only foundation. There is no customer storage factory,
// lease provisioner, global fallback, migration, retention or recovery worker.
export class PrototypeStore {
  private readonly sql: DatabaseSync
  private readonly context: VerifiedServiceContext

  constructor(
    privateRoot: string,
    context: VerifiedServiceContext,
    private readonly verifyLiveAuthority: (
      context: VerifiedServiceContext,
      action: Action,
    ) => boolean,
  ) {
    validateContext(context, "register") // Must run BEFORE any filesystem access.
    if (!verifyLiveAuthority(context, "register"))
      throw new Denied("service_denied")
    this.context = Object.freeze({
      ...context,
      actions: Object.freeze([...context.actions]),
    })
    const root = resolve(privateRoot)
    if (
      !isAbsolute(privateRoot) ||
      root !== realpathSync(root) ||
      !lstatSync(root).isDirectory()
    )
      throw new Denied("private_synthetic_root_required")
    const marker = join(root, "PHONE_V2A_SYNTHETIC_ONLY")
    if (
      !lstatSync(marker).isFile() ||
      lstatSync(marker).isSymbolicLink() ||
      readFileSync(marker, "utf8") !== "synthetic-v2a-only\n"
    )
      throw new Denied("private_synthetic_root_required")
    if (process.platform !== "win32" && (lstatSync(root).mode & 0o077) !== 0)
      throw new Denied("private_root_permissions_required")
    const path = join(root, "phone-lifecycle-v2a.sqlite")
    for (const candidate of [path, path + "-wal", path + "-shm"]) {
      try {
        const stat = lstatSync(candidate)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
          throw new Denied("unsafe_database_file")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
    const prior = process.umask(0o077)
    let opened: DatabaseSync | undefined
    try {
      this.sql = opened = new DatabaseSync(path, { timeout: 2000 })
      this.sql.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS game_authorities (
          owner TEXT NOT NULL, game TEXT NOT NULL, provider TEXT NOT NULL,
          service TEXT NOT NULL, issuer_sid TEXT NOT NULL, executor_id TEXT NOT NULL,
          PRIMARY KEY(owner,game));
        CREATE TABLE IF NOT EXISTS registrations (
          owner TEXT NOT NULL, game TEXT NOT NULL, provider TEXT NOT NULL,
          request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
          issuer_sid TEXT NOT NULL, service TEXT NOT NULL,
          caller_hash TEXT NOT NULL, reference_hash TEXT NOT NULL,
          capability_hash TEXT NOT NULL, registration_id TEXT NOT NULL,
          generation INTEGER NOT NULL, state TEXT NOT NULL,
          roster_id TEXT, client_id TEXT, receipt TEXT,
          PRIMARY KEY(owner,game,provider,request_id),
          UNIQUE(owner,game,provider,reference_hash),
          UNIQUE(owner,game,provider,registration_id));
        CREATE TABLE IF NOT EXISTS bindings (
          owner TEXT NOT NULL, game TEXT NOT NULL, provider TEXT NOT NULL,
          caller_hash TEXT NOT NULL, generation INTEGER NOT NULL,
          request_id TEXT NOT NULL, state TEXT NOT NULL,
          PRIMARY KEY(owner,game,provider,caller_hash));
        CREATE TABLE IF NOT EXISTS operations (
          owner TEXT NOT NULL, game TEXT NOT NULL, provider TEXT NOT NULL,
          operation_id TEXT NOT NULL, request_id TEXT NOT NULL,
          caller_hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
          state TEXT NOT NULL, receipt TEXT,
          PRIMARY KEY(owner,game,provider,operation_id));
        CREATE TABLE IF NOT EXISTS registration_denials (
          owner TEXT NOT NULL, game TEXT NOT NULL, provider TEXT NOT NULL,
          request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL,
          PRIMARY KEY(owner,game,provider,request_id));`)
      this.transaction(() => {
        // A game-wide authority UNIQUE key prevents independent provider/service
        // partitions from both projecting onto Game's one phone index.
        this.sql
          .prepare(
            `INSERT INTO game_authorities(owner,game,provider,service,issuer_sid,executor_id) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,game) DO NOTHING`,
          )
          .run(
            ...this.scope,
            context.service,
            context.issuerSid,
            context.executorId,
          )
        const authority = this.sql
          .prepare(
            `SELECT service,issuer_sid,executor_id FROM game_authorities WHERE owner=? AND game=? AND provider=?`,
          )
          .get(...this.scope) as
          | { service: string; issuer_sid: string; executor_id: string }
          | undefined
        if (
          !authority ||
          authority.service !== context.service ||
          authority.issuer_sid !== context.issuerSid ||
          authority.executor_id !== context.executorId
        )
          throw new Denied("game_authority_conflict")
      })
      if (process.platform !== "win32") {
        for (const file of [path, path + "-wal", path + "-shm"]) {
          try {
            chmodSync(file, 0o600)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          }
        }
      }
    } catch (error) {
      opened?.close()
      throw error
    } finally {
      process.umask(prior)
    }
  }

  authorize(context: VerifiedServiceContext, action: Action) {
    validateContext(context, action)
    validateContext(this.context, action)
    if (!this.verifyLiveAuthority(context, action))
      throw new Denied("service_denied")
    if (
      [
        "owner",
        "game",
        "provider",
        "issuerSid",
        "service",
        "executorId",
        "expiresAt",
      ].some(
        (key) =>
          context[key as keyof VerifiedServiceContext] !==
          this.context[key as keyof VerifiedServiceContext],
      )
    )
      throw new Denied("scope_mismatch")
  }

  private get scope() {
    return [this.context.owner, this.context.game, this.context.provider]
  }
  private transaction<T>(fn: () => T): T {
    this.sql.exec("BEGIN IMMEDIATE")
    try {
      const result = fn()
      this.sql.exec("COMMIT")
      return result
    } catch (error) {
      this.sql.exec("ROLLBACK")
      throw error
    }
  }
  private row(requestId: string) {
    return this.sql
      .prepare(
        `SELECT * FROM registrations WHERE owner=? AND game=? AND provider=? AND request_id=?`,
      )
      .get(...this.scope, requestId) as unknown as RegistrationRow | undefined
  }
  private pending(callerHash: string) {
    return !!this.sql
      .prepare(
        `SELECT 1 FROM operations WHERE owner=? AND game=? AND provider=? AND caller_hash=? AND state='PENDING' LIMIT 1`,
      )
      .get(...this.scope, callerHash)
  }

  reserveRegistration(
    context: VerifiedServiceContext,
    input: {
      requestId: string
      callerHash: string
      referenceHash: string
      capabilityHash: string
      expectedPredecessor: number
      fingerprint: string
    },
  ): RegistrationDecision {
    this.authorize(context, "register")
    return this.transaction(() => {
      this.authorize(context, "register")
      const prior = this.row(input.requestId)
      if (prior) {
        if (prior.fingerprint !== input.fingerprint)
          return { kind: "receipt", receipt: fail("request_conflict") }
        if (prior.state === "RETIRED")
          return { kind: "receipt", receipt: fail("registration_retired") }
        if (prior.state === "ACTIVE") {
          const current = this.sql
            .prepare(
              `SELECT state,request_id FROM bindings WHERE owner=? AND game=? AND provider=? AND caller_hash=?`,
            )
            .get(...this.scope, prior.caller_hash) as
            { state: string; request_id: string } | undefined
          if (
            current?.state !== "ACTIVE" ||
            current.request_id !== prior.request_id ||
            this.pending(prior.caller_hash)
          )
            return { kind: "receipt", receipt: fail("binding_pending_unknown") }
        }
        return {
          kind: "receipt",
          row: prior,
          receipt: prior.receipt
            ? JSON.parse(prior.receipt)
            : fail("registration_pending_unknown"),
        }
      }
      const denied = this.sql
        .prepare(
          `SELECT fingerprint,receipt FROM registration_denials WHERE owner=? AND game=? AND provider=? AND request_id=?`,
        )
        .get(...this.scope, input.requestId) as
        { fingerprint: string; receipt: string } | undefined
      if (denied)
        return {
          kind: "receipt",
          receipt:
            denied.fingerprint === input.fingerprint
              ? JSON.parse(denied.receipt)
              : fail("request_conflict"),
        }
      const reject = (status: string): RegistrationDecision => {
        const receipt = fail(status)
        this.sql
          .prepare(
            `INSERT INTO registration_denials(owner,game,provider,request_id,fingerprint,receipt) VALUES(?,?,?,?,?,?)`,
          )
          .run(
            ...this.scope,
            input.requestId,
            input.fingerprint,
            JSON.stringify(receipt),
          )
        return { kind: "receipt", receipt }
      }
      const reused = this.sql
        .prepare(
          `SELECT 1 FROM registrations WHERE owner=? AND game=? AND provider=? AND reference_hash=?`,
        )
        .get(...this.scope, input.referenceHash)
      if (reused) return reject("reference_reuse_ambiguous")
      const binding = this.sql
        .prepare(
          `SELECT generation,request_id,state FROM bindings WHERE owner=? AND game=? AND provider=? AND caller_hash=?`,
        )
        .get(...this.scope, input.callerHash) as
        { generation: number; request_id: string; state: string } | undefined
      if (
        (binding && binding.state !== "ACTIVE") ||
        this.pending(input.callerHash)
      )
        return reject("binding_pending_unknown")
      if ((binding?.generation ?? 0) !== input.expectedPredecessor)
        return reject("predecessor_conflict")
      const predecessor = binding ? this.row(binding.request_id)! : null
      if (
        predecessor &&
        (predecessor.state !== "ACTIVE" ||
          predecessor.service !== context.service ||
          predecessor.issuer_sid !== context.issuerSid)
      )
        return reject("predecessor_conflict")
      const generation = input.expectedPredecessor + 1
      const registrationId = randomUUID()
      this.sql
        .prepare(
          `INSERT INTO registrations(owner,game,provider,request_id,fingerprint,issuer_sid,service,caller_hash,reference_hash,capability_hash,registration_id,generation,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED')`,
        )
        .run(
          ...this.scope,
          input.requestId,
          input.fingerprint,
          context.issuerSid,
          context.service,
          input.callerHash,
          input.referenceHash,
          input.capabilityHash,
          registrationId,
          generation,
        )
      this.sql
        .prepare(
          `INSERT INTO bindings(owner,game,provider,caller_hash,generation,request_id,state) VALUES(?,?,?,?,?,?,'RESERVED')
        ON CONFLICT(owner,game,provider,caller_hash) DO UPDATE SET generation=excluded.generation,request_id=excluded.request_id,state='RESERVED'`,
        )
        .run(...this.scope, input.callerHash, generation, input.requestId)
      return { kind: "reserved", row: this.row(input.requestId)!, predecessor }
    })
  }

  completeRegistration(
    context: VerifiedServiceContext,
    reservation: Reservation,
    result: Receipt,
  ) {
    this.authorize(context, "register")
    return this.transaction(() => {
      this.authorize(context, "register")
      const row = this.row(reservation.row.request_id)
      if (
        !row ||
        row.state !== "RESERVED" ||
        row.fingerprint !== reservation.row.fingerprint
      )
        throw new Denied("reservation_conflict")
      const changed = this.sql
        .prepare(
          `UPDATE bindings SET state=? WHERE owner=? AND game=? AND provider=? AND caller_hash=? AND request_id=? AND generation=? AND state='RESERVED'`,
        )
        .run(
          result.ok ? "ACTIVE" : "BLOCKED",
          ...this.scope,
          row.caller_hash,
          row.request_id,
          row.generation,
        )
      if (Number(changed.changes) !== 1)
        throw new Denied("reservation_conflict")
      if (result.ok && (!result.rosterPlayerId || !result.clientId))
        throw new Denied("admission_not_observed")
      this.sql
        .prepare(
          `UPDATE registrations SET state=?,roster_id=?,client_id=?,receipt=? WHERE owner=? AND game=? AND provider=? AND request_id=? AND state='RESERVED'`,
        )
        .run(
          result.ok ? "ACTIVE" : "REJECTED",
          result.rosterPlayerId ?? null,
          result.clientId ?? null,
          JSON.stringify(result),
          ...this.scope,
          row.request_id,
        )
      if (reservation.predecessor) {
        this.sql
          .prepare(
            `UPDATE registrations SET state='RETIRED' WHERE owner=? AND game=? AND provider=? AND request_id=? AND state='ACTIVE'`,
          )
          .run(...this.scope, reservation.predecessor.request_id)
      }
      return result
    })
  }

  reserveOperation(
    context: VerifiedServiceContext,
    input: OperationInput,
  ): OperationDecision {
    this.authorize(context, input.action)
    identifier(input.requestId)
    identifier(input.registrationId)
    identifier(input.operationId)
    const capHash = capabilityHash(input.capability)
    const fingerprint = digest(
      JSON.stringify([
        input.requestId,
        input.registrationId,
        input.generation,
        capHash,
        input.action,
        input.epoch ?? null,
        input.answerIndex ?? null,
        context.issuerSid,
        context.service,
      ]),
    )
    return this.transaction(() => {
      this.authorize(context, input.action)
      const row = this.row(input.requestId)
      if (
        !row ||
        row.issuer_sid !== context.issuerSid ||
        row.service !== context.service ||
        row.registration_id !== input.registrationId ||
        row.generation !== input.generation ||
        !timingSafeEqual(
          Buffer.from(row.capability_hash, "hex"),
          Buffer.from(capHash, "hex"),
        )
      )
        return { kind: "receipt", receipt: fail("binding_denied") }
      if (row.state === "RETIRED")
        return { kind: "receipt", receipt: fail("registration_retired") }
      const binding = this.sql
        .prepare(
          `SELECT state,request_id FROM bindings WHERE owner=? AND game=? AND provider=? AND caller_hash=?`,
        )
        .get(...this.scope, row.caller_hash) as
        { state: string; request_id: string } | undefined
      if (
        row.state !== "ACTIVE" ||
        binding?.state !== "ACTIVE" ||
        binding.request_id !== row.request_id
      )
        return { kind: "receipt", receipt: fail("binding_denied") }
      const prior = this.sql
        .prepare(
          `SELECT fingerprint,receipt FROM operations WHERE owner=? AND game=? AND provider=? AND operation_id=?`,
        )
        .get(...this.scope, input.operationId) as
        { fingerprint: string; receipt: string | null } | undefined
      if (prior)
        return {
          kind: "receipt",
          row,
          receipt:
            prior.fingerprint !== fingerprint
              ? fail("operation_conflict")
              : prior.receipt
                ? JSON.parse(prior.receipt)
                : fail("operation_pending_unknown"),
        }
      if (this.pending(row.caller_hash))
        return { kind: "receipt", receipt: fail("binding_pending_unknown") }
      this.sql
        .prepare(
          `INSERT INTO operations(owner,game,provider,operation_id,request_id,caller_hash,fingerprint,state) VALUES(?,?,?,?,?,?,?,'PENDING')`,
        )
        .run(
          ...this.scope,
          input.operationId,
          row.request_id,
          row.caller_hash,
          fingerprint,
        )
      return { kind: "pending", row }
    })
  }

  completeOperation(
    context: VerifiedServiceContext,
    input: OperationInput,
    result: Receipt,
  ) {
    this.authorize(context, input.action)
    return this.transaction(() => {
      this.authorize(context, input.action)
      const changed = this.sql
        .prepare(
          `UPDATE operations SET state=?,receipt=? WHERE owner=? AND game=? AND provider=? AND operation_id=? AND request_id=? AND state='PENDING'`,
        )
        .run(
          result.ok ? "APPLIED" : "REJECTED",
          JSON.stringify(result),
          ...this.scope,
          input.operationId,
          input.requestId,
        )
      if (Number(changed.changes) !== 1) throw new Denied("operation_conflict")
      if (input.action === "hangup" && result.ok) {
        this.sql
          .prepare(
            `UPDATE registrations SET state='RETIRED' WHERE owner=? AND game=? AND provider=? AND request_id=? AND state='ACTIVE'`,
          )
          .run(...this.scope, input.requestId)
        // Terminal generation stays as a durable predecessor marker. This
        // prototype deliberately denies further registration after hangup;
        // trusted new-attempt disposition/reconciliation is a separate gate.
        this.sql
          .prepare(
            `UPDATE bindings SET state='TERMINAL' WHERE owner=? AND game=? AND provider=? AND request_id=?`,
          )
          .run(...this.scope, input.requestId)
      }
      return result
    })
  }

  close() {
    this.sql.close()
  }
}
