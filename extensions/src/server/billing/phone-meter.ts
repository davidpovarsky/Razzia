import { createHash } from "node:crypto"
import type { BillingDatabase } from "./database"
import { BillingError } from "./errors"

const callKey = (callId: string) =>
  createHash("sha256").update(callId).digest("hex")

export function phoneSeconds(db: BillingDatabase, gameId: string): number {
  const totals = db.sql
    .prepare(
      `SELECT COALESCE(SUM(seconds),0) AS n FROM (
        SELECT call_id,MAX(seconds) AS seconds FROM (
          SELECT call_id,MAX(0,MIN(86400,(COALESCE(ended_at,last_seen_at)-started_at)/1000)) AS seconds
            FROM billing_phone_calls WHERE game_id=?
          UNION ALL SELECT call_id,seconds FROM billing_phone_usage WHERE game_id=?
        ) GROUP BY call_id
      )`,
    )
    .get(gameId, gameId) as { n: number }

  return Math.floor(totals.n)
}

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function beginPhoneCall(
  db: BillingDatabase,
  tenantId: string,
  gameId: string,
  callId: string,
  now = Date.now(),
): boolean {
  return db.transaction(() => {
    const game = db.sql
      .prepare(
        "SELECT tenant_id,phone_minutes FROM billing_games WHERE game_id=?",
      )
      .get(gameId) as { tenant_id: string; phone_minutes: number } | undefined

    if (!game || game.tenant_id !== tenantId) {
      throw new BillingError("notFound", 404)
    }

    const known = db.sql
      .prepare(
        "SELECT ended_at FROM billing_phone_calls WHERE game_id=? AND call_id=?",
      )
      .get(gameId, callKey(callId)) as { ended_at: number | null } | undefined

    if (known) {
      if (known.ended_at !== null) {
        throw new BillingError("invalidRequest", 400)
      }

      db.sql
        .prepare(
          "UPDATE billing_phone_calls SET last_seen_at=MAX(last_seen_at,?) WHERE game_id=? AND call_id=?",
        )
        .run(now, gameId, callKey(callId))

      return false
    }

    if (phoneSeconds(db, gameId) >= game.phone_minutes * 60) {
      throw new BillingError("phoneLimit")
    }

    db.sql
      .prepare("INSERT INTO billing_phone_calls VALUES (?,?,?,NULL,?)")
      .run(gameId, callKey(callId), now, now)

    return true
  })
}

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function endPhoneCall(
  db: BillingDatabase,
  gameId: string,
  callId: string,
  now = Date.now(),
) {
  db.sql
    .prepare(
      "UPDATE billing_phone_calls SET ended_at=? WHERE game_id=? AND call_id=? AND ended_at IS NULL",
    )
    .run(now, gameId, callKey(callId))
}
