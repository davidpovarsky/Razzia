import type { BillingDatabase } from "../database"
import type { BillingConfig } from "../config"
import type { PaddleEvent } from "./event"
import { BillingError } from "../errors"
import { recomputePurchaseGrant } from "../purchases"

export function applySubscription(
  db: BillingDatabase,
  config: BillingConfig,
  event: PaddleEvent,
): boolean {
  const { data } = event
  const row = db.sql
    .prepare(
      "SELECT customer_id,updated_at FROM billing_subscriptions WHERE id=?",
    )
    .get(data.id) as { customer_id: string; updated_at: number } | undefined

  if (!row) {
    return false
  }

  if (data.customer_id !== row.customer_id) {
    throw new BillingError("invalidEvent", 400)
  }

  const occurred = Date.parse(event.occurred_at)

  if (occurred <= row.updated_at) {
    return true
  }

  const statuses = ["active", "trialing", "past_due", "paused", "canceled"]

  if (!data.status || !statuses.includes(data.status)) {
    throw new BillingError("invalidEvent", 400)
  }

  const periodEnd = data.current_billing_period
    ? Date.parse(data.current_billing_period.ends_at)
    : null
  db.sql
    .prepare(
      `UPDATE billing_subscriptions SET status=?,scheduled_change=?,period_end=?,updated_at=? WHERE id=?`,
    )
    .run(
      data.status,
      data.scheduled_change?.action ?? null,
      periodEnd,
      occurred,
      data.id,
    )

  if (data.status === "past_due") {
    // Extend only the last paid period, bounded by that period + configured grace.
    db.sql
      .prepare(
        `UPDATE billing_grants SET expires_at=paid_ends_at+?
      WHERE subscription_id=? AND id=(SELECT id FROM billing_grants WHERE subscription_id=? ORDER BY starts_at DESC LIMIT 1)`,
      )
      .run(config.graceMs, data.id, data.id)
  } else if (data.status === "active" || data.status === "trialing") {
    db.sql
      .prepare(
        "UPDATE billing_grants SET expires_at=paid_ends_at WHERE subscription_id=? AND paid_ends_at IS NOT NULL",
      )
      .run(data.id)
  }

  return true
}

export function applyAdjustment(
  db: BillingDatabase,
  event: PaddleEvent,
): boolean {
  const { data } = event

  if (
    data.status !== "approved" ||
    !["refund", "chargeback", "chargeback_warning"].includes(data.action ?? "")
  ) {
    return true
  }

  if (!data.transaction_id) {
    throw new BillingError("invalidEvent", 400)
  }

  const grant = db.sql
    .prepare("SELECT grant_id FROM billing_purchases WHERE transaction_id=?")
    .get(data.transaction_id) as { grant_id: string } | undefined

  if (!grant) {
    return false
  }

  // A partial refund does not mean that the entire purchased allowance was returned.
  if (data.type === "full") {
    db.sql
      .prepare("UPDATE billing_purchases SET revoked=1 WHERE transaction_id=?")
      .run(data.transaction_id)
    recomputePurchaseGrant(db, grant.grant_id)
  }

  return true
}
