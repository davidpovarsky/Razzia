import type { BillingDatabase } from "./database"
import { insertGrant } from "./grants"

type GrantArgs = Parameters<typeof insertGrant>[1]

export function recordPurchase(db: BillingDatabase, args: GrantArgs) {
  // An upgrade invoice in the same paid subscription period increases its
  // allowance; it never resets the number of games already spent in that period.
  const overlapping =
    args.subscriptionId && args.expiresAt !== null
      ? (db.sql
          .prepare(
            `SELECT id FROM billing_grants WHERE subscription_id=?
      AND starts_at<? AND paid_ends_at>? ORDER BY starts_at DESC LIMIT 1`,
          )
          .get(args.subscriptionId, args.expiresAt, args.startsAt) as
          { id: string } | undefined)
      : undefined
  const grantId = overlapping?.id ?? args.id
  insertGrant(db, { ...args, id: grantId })
  db.sql
    .prepare(
      `INSERT OR IGNORE INTO billing_purchases
    (transaction_id,grant_id,participants,games,phone_minutes) VALUES (?,?,?,?,?)`,
    )
    .run(
      args.transactionId,
      grantId,
      args.plan.participants,
      args.plan.games,
      args.plan.phoneMinutes,
    )
  recomputePurchaseGrant(db, grantId)
}

export function recomputePurchaseGrant(db: BillingDatabase, grantId: string) {
  const available = db.sql
    .prepare(
      `SELECT COUNT(*) AS n,MAX(participants) AS participants,
    MAX(games) AS games,MAX(phone_minutes) AS phoneMinutes FROM billing_purchases WHERE grant_id=? AND revoked=0`,
    )
    .get(grantId) as {
    n: number
    participants: number
    games: number
    phoneMinutes: number
  }

  if (available.n === 0) {
    db.sql
      .prepare("UPDATE billing_grants SET revoked=1 WHERE id=?")
      .run(grantId)
  } else {
    db.sql
      .prepare(
        "UPDATE billing_grants SET participants=?,games=?,phone_minutes=?,revoked=0 WHERE id=?",
      )
      .run(
        available.participants,
        available.games,
        available.phoneMinutes,
        grantId,
      )
  }
}
