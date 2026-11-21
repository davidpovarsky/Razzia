import { createHash, createHmac, randomInt, randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import type {
  ManagedClientCodeResponse,
  ManagedClientSummary,
} from "@razzia/common/types/managed-clients"
import { getAccountDb } from "./account-db"
import { ManagedClientFailure } from "./managed-client-errors"

export { ManagedClientFailure }

export const MANAGED_CLIENT_COOKIE = "tdz_client_auth"

export const MANAGED_CLIENT_HEADER = "X-Tadazz-Session"

export const MANAGED_CLIENT_MODE = "managed-client"

export const MANAGED_CLIENT_TTL_SECONDS = 12 * 60 * 60

interface ClientRow {
  id: string
  owner_id: string
  name: string
  code_digest: string | null
  enabled: number
  created_at: number
  updated_at: number
}

export interface ManagedClientPrincipal {
  id: string
  ownerId: string
  name: string
  sessionId: string
  expiresAt: number
}

const sessionDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex")

const listeners = new Set<() => void>()

export function onManagedClientAccessChanged(listener: () => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

function accessChanged(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** All writes are synchronous transactions in the existing private account DB. */
export class ManagedClientStore {
  private readonly db: DatabaseSync
  private readonly secret: string
  private readonly now: () => number
  private readonly randomCode: () => string

  constructor(
    options: {
      db?: DatabaseSync
      secret?: string
      now?: () => number
      randomCode?: () => string
    } = {},
  ) {
    this.db = options.db ?? getAccountDb()
    this.secret = options.secret ?? process.env.JWT_SECRET ?? ""
    this.now = options.now ?? Date.now
    this.randomCode =
      options.randomCode ??
      (() => randomInt(0, 1_000_000).toString().padStart(6, "0"))

    if (this.secret.length < 32) {
      throw new Error("Persistent account signing configuration is required")
    }
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE")

    try {
      const value = operation()
      this.db.exec("COMMIT")

      return value
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  private keyedDigest(purpose: string, value: string): string {
    return createHmac("sha256", this.secret)
      .update(`tadazz-managed-client:${purpose}:v1\0${value}`)
      .digest("hex")
  }

  private ownerActive(ownerId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM accounts WHERE id=? AND disabled=0 AND verified_at IS NOT NULL",
        )
        .get(ownerId),
    )
  }

  private requireOwner(ownerId: string): void {
    if (!this.ownerActive(ownerId)) {
      throw new ManagedClientFailure("client-not-found", 404)
    }
  }

  private owned(ownerId: string, clientId: string): ClientRow {
    this.requireOwner(ownerId)
    const row = this.db
      .prepare("SELECT * FROM managed_clients WHERE id=? AND owner_id=?")
      .get(clientId, ownerId) as ClientRow | undefined

    if (!row) {
      throw new ManagedClientFailure("client-not-found", 404)
    }

    return row
  }

  private summary(row: ClientRow): ManagedClientSummary {
    const games = this.db
      .prepare(
        "SELECT quiz_id FROM managed_client_games WHERE client_id=? ORDER BY assigned_at,quiz_id",
      )
      .all(row.id) as Array<{ quiz_id: string }>

    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      gameIds: games.map((game) => game.quiz_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  list(ownerId: string): ManagedClientSummary[] {
    this.requireOwner(ownerId)
    const rows = this.db
      .prepare(
        "SELECT * FROM managed_clients WHERE owner_id=? ORDER BY created_at,id",
      )
      .all(ownerId) as unknown as ClientRow[]

    return rows.map((row) => this.summary(row))
  }

  get(ownerId: string, clientId: string): ManagedClientSummary {
    return this.summary(this.owned(ownerId, clientId))
  }

  findCreation(
    ownerId: string,
    requestId: string,
  ): ManagedClientSummary | null {
    this.requireOwner(ownerId)
    const row = this.db
      .prepare(
        "SELECT * FROM managed_clients WHERE owner_id=? AND create_request_id=?",
      )
      .get(ownerId, requestId) as ClientRow | undefined

    return row ? this.summary(row) : null
  }

  private unusedCode(previous: string | null = null) {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const code = this.randomCode()

      if (!/^[0-9]{6}$/u.test(code)) {
        throw new Error("Invalid generated managed-client credential")
      }

      const digest = this.keyedDigest("code", code)

      if (
        digest !== previous &&
        !this.db
          .prepare("SELECT 1 FROM managed_clients WHERE code_digest=?")
          .get(digest)
      ) {
        return { code, digest }
      }
    }

    throw new ManagedClientFailure("client-code-space-exhausted", 409)
  }

  /** Game IDs must first be validated through the owner's native game service. */
  create(
    ownerId: string,
    input: { name: string; gameIds: string[]; requestId: string },
  ): ManagedClientCodeResponse {
    return this.transaction(() => {
      this.requireOwner(ownerId)
      const existing = this.db
        .prepare(
          "SELECT id FROM managed_clients WHERE owner_id=? AND create_request_id=?",
        )
        .get(ownerId, input.requestId) as { id: string } | undefined

      if (existing) {
        throw new ManagedClientFailure("client-create-already-completed", 409, {
          clientId: existing.id,
        })
      }

      const id = randomUUID()
      const issued = this.unusedCode()
      const now = this.now()
      this.db
        .prepare(
          `INSERT INTO managed_clients
          (id,owner_id,name,code_digest,enabled,create_request_id,created_at,updated_at)
          VALUES(?,?,?,?,1,?,?,?)`,
        )
        .run(id, ownerId, input.name, issued.digest, input.requestId, now, now)
      this.replaceGames(id, input.gameIds, now)

      return { client: this.get(ownerId, id), code: issued.code }
    })
  }

  update(
    ownerId: string,
    clientId: string,
    input: { name?: string; enabled?: false },
  ): ManagedClientSummary {
    const result = this.transaction(() => {
      const prior = this.owned(ownerId, clientId)
      this.db
        .prepare(
          "UPDATE managed_clients SET name=?,enabled=?,code_digest=?,updated_at=? WHERE id=? AND owner_id=?",
        )
        .run(
          input.name ?? prior.name,
          input.enabled === false ? 0 : prior.enabled,
          prior.code_digest,
          this.now(),
          clientId,
          ownerId,
        )

      if (input.enabled === false) {
        this.revokeClientSessions(clientId)
      }

      return this.get(ownerId, clientId)
    })

    accessChanged()

    return result
  }

  private replaceGames(clientId: string, gameIds: string[], now: number) {
    this.db
      .prepare("DELETE FROM managed_client_games WHERE client_id=?")
      .run(clientId)

    for (const quizId of new Set(gameIds)) {
      this.db
        .prepare(
          "INSERT INTO managed_client_games(client_id,quiz_id,assigned_at) VALUES(?,?,?)",
        )
        .run(clientId, quizId, now)
    }
  }

  /** Replacing assignments never copies or changes the owner's original games. */
  assign(
    ownerId: string,
    clientId: string,
    gameIds: string[],
  ): ManagedClientSummary {
    const result = this.transaction(() => {
      this.owned(ownerId, clientId)
      const now = this.now()
      this.replaceGames(clientId, gameIds, now)
      this.db
        .prepare("UPDATE managed_clients SET updated_at=? WHERE id=?")
        .run(now, clientId)

      return this.get(ownerId, clientId)
    })

    accessChanged()

    return result
  }

  rotate(ownerId: string, clientId: string): ManagedClientCodeResponse {
    const result = this.transaction(() => {
      const prior = this.owned(ownerId, clientId)
      const issued = this.unusedCode(prior.code_digest)
      this.db
        .prepare(
          "UPDATE managed_clients SET code_digest=?,enabled=1,updated_at=? WHERE id=? AND owner_id=?",
        )
        .run(issued.digest, this.now(), clientId, ownerId)
      this.revokeClientSessions(clientId)

      return { client: this.get(ownerId, clientId), code: issued.code }
    })

    accessChanged()

    return result
  }

  private revokeClientSessions(clientId: string) {
    this.db
      .prepare("DELETE FROM managed_client_sessions WHERE client_id=?")
      .run(clientId)
  }

  revokeSession(sessionId: string): void {
    this.db
      .prepare("DELETE FROM managed_client_sessions WHERE digest=?")
      .run(sessionDigest(sessionId))
    accessChanged()
  }

  private consumeLimit(key: string, maximum: number, durationMs: number) {
    const now = this.now()
    const row = this.db
      .prepare("SELECT period_at,attempts FROM limits WHERE key=?")
      .get(key) as { period_at: number; attempts: number } | undefined

    if (!row || now - row.period_at >= durationMs) {
      this.db
        .prepare(
          `INSERT INTO limits(key,period_at,attempts) VALUES(?,?,1)
          ON CONFLICT(key) DO UPDATE SET period_at=excluded.period_at,attempts=1`,
        )
        .run(key, now)

      return 0
    }

    if (row.attempts >= maximum) {
      return Math.max(1, Math.ceil((row.period_at + durationMs - now) / 1000))
    }

    this.db
      .prepare("UPDATE limits SET attempts=attempts+1 WHERE key=?")
      .run(key)

    return 0
  }

  /** Budget is committed even for invalid codes; no caller controls the key. */
  consumeLoginBudget(remoteAddress: string): void {
    const retry = this.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM limits WHERE key LIKE 'managed-client:%' AND period_at<?",
        )
        .run(this.now() - 86_400_000)
      const global = this.consumeLimit("managed-client:global", 300, 3_600_000)
      const remote = this.consumeLimit(
        `managed-client:remote:${this.keyedDigest("address", remoteAddress)}`,
        30,
        900_000,
      )

      return Math.max(global, remote)
    })

    if (retry) {
      throw new ManagedClientFailure("client-code-rate-limited", 429, {
        retryAfterSeconds: retry,
      })
    }
  }

  exchange(code: unknown): ManagedClientPrincipal {
    if (typeof code !== "string" || !/^[0-9]{6}$/u.test(code)) {
      throw new ManagedClientFailure("invalid-client-code", 401)
    }

    return this.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT c.* FROM managed_clients c JOIN accounts a ON a.id=c.owner_id
          WHERE c.code_digest=? AND c.enabled=1 AND a.disabled=0 AND a.verified_at IS NOT NULL`,
        )
        .get(this.keyedDigest("code", code)) as ClientRow | undefined

      if (!row) {
        throw new ManagedClientFailure("invalid-client-code", 401)
      }

      const now = this.now()
      const expiresAt = Math.floor(now / 1000) + MANAGED_CLIENT_TTL_SECONDS
      const sessionId = randomUUID()
      this.db
        .prepare("DELETE FROM managed_client_sessions WHERE expires_at<=?")
        .run(now)
      this.db
        .prepare(
          "INSERT INTO managed_client_sessions(digest,client_id,expires_at,created_at) VALUES(?,?,?,?)",
        )
        .run(sessionDigest(sessionId), row.id, expiresAt * 1000, now)

      return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        sessionId,
        expiresAt,
      }
    })
  }

  session(clientId: string, sessionId?: string): ManagedClientPrincipal | null {
    if (!sessionId) {
      return null
    }

    const row = this.db
      .prepare(
        `SELECT c.id,c.owner_id,c.name,s.expires_at FROM managed_client_sessions s
        JOIN managed_clients c ON c.id=s.client_id JOIN accounts a ON a.id=c.owner_id
        WHERE s.digest=? AND c.id=? AND s.expires_at>? AND c.enabled=1
        AND a.disabled=0 AND a.verified_at IS NOT NULL`,
      )
      .get(sessionDigest(sessionId), clientId, this.now()) as
      | { id: string; owner_id: string; name: string; expires_at: number }
      | undefined

    return row
      ? {
          id: row.id,
          name: row.name,
          ownerId: row.owner_id,
          sessionId,
          expiresAt: Math.floor(row.expires_at / 1000),
        }
      : null
  }

  assigned(clientId: string, ownerId: string, quizId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 FROM managed_client_games g JOIN managed_clients c ON c.id=g.client_id
          JOIN accounts a ON a.id=c.owner_id WHERE c.id=? AND c.owner_id=? AND g.quiz_id=?
          AND c.enabled=1 AND a.disabled=0 AND a.verified_at IS NOT NULL`,
        )
        .get(clientId, ownerId, quizId),
    )
  }
}
