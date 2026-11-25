import type { BillingGrant, BillingPlan } from "../../core/billing"
import type { BillingDatabase } from "./database"

export const grantColumns = `id, tenant_id AS tenantId, plan_id AS planId,
  participants, games, phone_minutes AS phoneMinutes, starts_at AS startsAt,
  expires_at AS expiresAt, revoked, target_game AS targetGame`

export function activeGrants(
  db: BillingDatabase,
  tenantId: string,
  now: number,
): BillingGrant[] {
  return db.sql
    .prepare(
      `SELECT ${grantColumns} FROM billing_grants
    WHERE tenant_id=? AND revoked=0 AND starts_at<=? AND (expires_at IS NULL OR expires_at>?)
    AND (subscription_id IS NULL OR EXISTS (SELECT 1 FROM billing_subscriptions s
      WHERE s.id=billing_grants.subscription_id AND s.status IN ('active','trialing','past_due')))
    ORDER BY expires_at IS NULL, expires_at, id`,
    )
    .all(tenantId, now, now) as unknown as BillingGrant[]
}

export function insertGrant(
  db: BillingDatabase,
  args: {
    id: string
    tenantId: string
    plan: BillingPlan
    startsAt: number
    expiresAt: number | null
    subscriptionId?: string | null
    transactionId: string
    targetGame?: string | null
  },
) {
  db.sql
    .prepare(
      `INSERT OR IGNORE INTO billing_grants
    (id,tenant_id,plan_id,participants,games,phone_minutes,starts_at,expires_at,subscription_id,transaction_id,target_game,paid_ends_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      args.id,
      args.tenantId,
      args.plan.id,
      args.plan.participants,
      args.plan.games,
      args.plan.phoneMinutes,
      args.startsAt,
      args.expiresAt,
      args.subscriptionId ?? null,
      args.transactionId,
      args.targetGame ?? null,
      args.expiresAt,
    )
}

export function remainingGames(
  db: BillingDatabase,
  grant: BillingGrant,
): number {
  const row = db.sql
    .prepare(
      "SELECT COUNT(*) AS n FROM billing_games WHERE grant_id=? AND started_at IS NOT NULL",
    )
    .get(grant.id) as { n: number }

  return Math.max(0, grant.games - row.n)
}
