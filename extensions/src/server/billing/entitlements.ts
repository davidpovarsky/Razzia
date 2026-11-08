import { createHash } from "node:crypto"
import type { BillingUsage } from "../../core/billing"
import type { BillingDatabase } from "./database"
import { BillingError } from "./errors"
import { activeGrants, remainingGames } from "./grants"
import { phoneSeconds } from "./phone-meter"
import { JoinRejected } from "./join-rejected"

interface GameRow {
  game_id: string
  tenant_id: string
  grant_id: string
  participants: number
  started_at: number | null
  phone_minutes: number
}

export class Entitlements {
  private readonly db: BillingDatabase
  constructor(db: BillingDatabase) {
    this.db = db
  }
  private game(tenantId: string, gameId: string): GameRow | undefined {
    const row = this.db.sql
      .prepare("SELECT * FROM billing_games WHERE game_id=?")
      .get(gameId) as GameRow | undefined

    if (row && row.tenant_id !== tenantId) {
      throw new BillingError("notFound", 404)
    }

    return row
  }
  // oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
  private bind(
    tenantId: string,
    gameId: string,
    now: number,
    minimum = 0,
  ): GameRow {
    const existing = this.game(tenantId, gameId)

    if (existing?.started_at !== null && existing) {
      return existing
    }

    const grants = activeGrants(this.db, tenantId, now)
    const upgrades = grants.filter((g) =>
      this.db.sql
        .prepare("SELECT 1 FROM billing_grants WHERE id=? AND target_game=?")
        .get(g.id, gameId),
    )
    const extraParticipants = Math.max(
      0,
      ...upgrades.map((g) => g.participants),
    )
    const extraPhoneMinutes = Math.max(
      0,
      ...upgrades.map((g) => g.phoneMinutes),
    )
    const grant = grants.find(
      (g) =>
        Math.max(g.participants, extraParticipants) >= minimum &&
        remainingGames(this.db, g) > 0 &&
        !this.db.sql
          .prepare(
            "SELECT 1 FROM billing_grants WHERE id=? AND target_game IS NOT NULL",
          )
          .get(g.id),
    )

    if (!grant) {
      throw new BillingError("noGames")
    }

    this.db.sql
      .prepare(
        `INSERT INTO billing_games (game_id,tenant_id,grant_id,participants,phone_minutes)
      VALUES (?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET grant_id=excluded.grant_id,
      participants=excluded.participants,phone_minutes=excluded.phone_minutes`,
      )
      .run(
        gameId,
        tenantId,
        grant.id,
        Math.max(grant.participants, extraParticipants),
        Math.max(grant.phoneMinutes, extraPhoneMinutes),
      )

    const bound = this.game(tenantId, gameId)

    if (!bound) {
      throw new BillingError("unavailable", 503)
    }

    return bound
  }
  reserve(tenantId: string, gameId: string, now = Date.now()) {
    this.db.transaction(() => {
      this.bind(tenantId, gameId, now)
    })
  }
  start(tenantId: string, gameId: string, now = Date.now()) {
    this.db.transaction(() => {
      const existing = this.game(tenantId, gameId)

      if (existing && existing.started_at !== null) {
        return
      }

      const count = this.count(gameId)
      this.bind(tenantId, gameId, now, count)
      this.db.sql
        .prepare("UPDATE billing_games SET started_at=? WHERE game_id=?")
        .run(now, gameId)
    })
  }
  count(gameId: string): number {
    return (
      this.db.sql
        .prepare(
          "SELECT COUNT(*) AS n FROM billing_participants WHERE game_id=?",
        )
        .get(gameId) as { n: number }
    ).n
  }
  // oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
  admit(
    tenantId: string,
    gameId: string,
    identity: string,
    action: () => string | null,
  ): string | null {
    const key = createHash("sha256").update(identity).digest("hex")

    try {
      this.db.transaction(() => {
        const game =
          this.game(tenantId, gameId) ?? this.bind(tenantId, gameId, Date.now())
        const known = this.db.sql
          .prepare(
            "SELECT 1 FROM billing_participants WHERE game_id=? AND identity=?",
          )
          .get(gameId, key)

        if (!known) {
          if (this.count(gameId) >= game.participants) {
            throw new BillingError("participantLimit")
          }

          this.db.sql
            .prepare("INSERT INTO billing_participants VALUES (?,?)")
            .run(gameId, key)
        }

        const result = action()

        if (result) {
          throw new JoinRejected(result)
        }
      })

      return null
    } catch (error) {
      if (error instanceof JoinRejected) {
        return error.reason
      }

      if (error instanceof BillingError) {
        return error.message
      }

      throw error
    }
  }
  // oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
  upgrade(
    tenantId: string,
    gameId: string,
    participants: number,
    phoneMinutes: number,
  ) {
    if (!this.game(tenantId, gameId)) {
      throw new BillingError("notFound", 404)
    }

    this.db.sql
      .prepare(
        `UPDATE billing_games SET participants=MAX(participants,?),
      phone_minutes=MAX(phone_minutes,?) WHERE game_id=?`,
      )
      .run(participants, phoneMinutes, gameId)
  }
  // Cumulative server/provider duration per call, not additive per webhook retry.
  // oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
  recordPhoneUsage(
    tenantId: string,
    gameId: string,
    callId: string,
    seconds: number,
  ) {
    if (
      !Number.isSafeInteger(seconds) ||
      seconds < 0 ||
      seconds > 86400 ||
      !callId ||
      callId.length > 128
    ) {
      throw new BillingError("invalidRequest", 400)
    }

    this.db.transaction(() => {
      if (!this.game(tenantId, gameId)) {
        throw new BillingError("notFound", 404)
      }

      const key = createHash("sha256").update(callId).digest("hex")
      this.db.sql
        .prepare(
          `INSERT INTO billing_phone_usage VALUES (?,?,?)
        ON CONFLICT(game_id,call_id) DO UPDATE SET seconds=MAX(seconds,excluded.seconds)`,
        )
        .run(gameId, key, seconds)
    })
  }
  assertOwned(tenantId: string, gameId: string) {
    if (!this.game(tenantId, gameId)) {
      throw new BillingError("notFound", 404)
    }
  }
  usage(tenantId: string): BillingUsage[] {
    return (
      this.db.sql
        .prepare(
          "SELECT * FROM billing_games WHERE tenant_id=? ORDER BY rowid DESC LIMIT 100",
        )
        .all(tenantId) as unknown as GameRow[]
    ).map((game) => ({
      gameId: game.game_id,
      participantLimit: game.participants,
      participants: this.count(game.game_id),
      started: game.started_at !== null,
      phoneMinutes: game.phone_minutes,
      phoneSeconds: phoneSeconds(this.db, game.game_id),
    }))
  }
}
