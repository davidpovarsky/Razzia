import type { BillingPlan } from "../../../core/billing"
import type { BillingConfig } from "../config"
import type { BillingDatabase } from "../database"
import type { Entitlements } from "../entitlements"
import { BillingError } from "../errors"
import { recordPurchase } from "../purchases"
import type { PaddleEvent } from "./event"

export interface IntentRow {
  id: string
  tenant_id: string
  plan_json: string
  price_id: string
  currency: string
  game_id: string | null
  transaction_id: string | null
  completed: number
}

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function applyTransaction(
  db: BillingDatabase,
  entitlements: Entitlements,
  config: BillingConfig,
  event: PaddleEvent,
): boolean {
  const { data } = event

  if (data.status !== "completed" || !data.customer_id) {
    throw new BillingError("invalidEvent", 400)
  }

  let intent = db.sql
    .prepare("SELECT * FROM billing_intents WHERE transaction_id=?")
    .get(data.id) as IntentRow | undefined

  // Recovery after the API created a transaction but its response was lost.
  // Only Paddle's signed `api` origin may bind an as-yet-unbound server intent.
  if (!intent && data.origin === "api" && data.custom_data?.tadazz_intent_id) {
    intent = db.sql
      .prepare(
        "SELECT * FROM billing_intents WHERE id=? AND transaction_id IS NULL",
      )
      .get(data.custom_data.tadazz_intent_id) as IntentRow | undefined
  }

  const subscription = data.subscription_id
    ? (db.sql
        .prepare("SELECT * FROM billing_subscriptions WHERE id=?")
        .get(data.subscription_id) as
        | {
            tenant_id: string
            customer_id: string
            plan_json: string
          }
        | undefined)
    : undefined

  const source = intent ?? subscription

  if (!source) {
    return false
  }

  const tenantId = source.tenant_id

  if (subscription && subscription.customer_id !== data.customer_id) {
    throw new BillingError("invalidEvent", 400)
  }

  const boundCustomer = db.sql
    .prepare("SELECT customer_id FROM billing_customers WHERE tenant_id=?")
    .get(tenantId) as { customer_id: string } | undefined

  if (boundCustomer && boundCustomer.customer_id !== data.customer_id) {
    throw new BillingError("invalidEvent", 400)
  }

  let plan = JSON.parse(source.plan_json) as BillingPlan
  const item = data.items?.[0]

  if (data.items?.length !== 1 || item?.quantity !== 1) {
    throw new BillingError("invalidEvent", 400)
  }

  if (!intent && !plan.prices.some((p) => p.priceId === item.price.id)) {
    const updatedPlan = config.catalog.find(
      (p) =>
        p.kind === "monthly" &&
        p.prices.some((price) => price.priceId === item.price.id),
    )

    if (!updatedPlan) {
      throw new BillingError("invalidEvent", 400)
    }

    plan = updatedPlan
  }

  const price = plan.prices.find(
    (p) => p.priceId === item.price.id && p.currency === data.currency_code,
  )

  if (
    !price ||
    (intent &&
      (intent.price_id !== price.priceId || intent.currency !== price.currency))
  ) {
    throw new BillingError("invalidEvent", 400)
  }

  if ((plan.kind === "monthly") !== Boolean(data.subscription_id)) {
    throw new BillingError("invalidEvent", 400)
  }

  const period = data.billing_period

  if (plan.kind === "monthly" && !period) {
    return false
  }

  const startsAt = period
    ? Date.parse(period.starts_at)
    : Date.parse(event.occurred_at)
  const expiresAt = period ? Date.parse(period.ends_at) : null

  if (expiresAt !== null && expiresAt <= startsAt) {
    throw new BillingError("invalidEvent", 400)
  }

  db.sql
    .prepare("INSERT OR IGNORE INTO billing_customers VALUES (?,?)")
    .run(tenantId, data.customer_id)

  if (data.subscription_id) {
    db.sql
      .prepare(
        `INSERT OR IGNORE INTO billing_subscriptions
      (id,tenant_id,customer_id,plan_json,status,period_end,updated_at) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        data.subscription_id,
        tenantId,
        data.customer_id,
        JSON.stringify(plan),
        "active",
        expiresAt,
        0,
      )
    db.sql
      .prepare("UPDATE billing_subscriptions SET plan_json=? WHERE id=?")
      .run(JSON.stringify(plan), data.subscription_id)
  }

  recordPurchase(db, {
    id: data.id,
    tenantId,
    plan,
    startsAt,
    expiresAt,
    subscriptionId: data.subscription_id,
    transactionId: data.id,
    targetGame: intent?.game_id,
  })

  if (plan.kind === "upgrade") {
    if (!intent?.game_id) {
      throw new BillingError("invalidEvent", 400)
    }

    entitlements.upgrade(
      tenantId,
      intent.game_id,
      plan.participants,
      plan.phoneMinutes,
    )
  }

  if (intent) {
    db.sql
      .prepare(
        "UPDATE billing_intents SET completed=1,transaction_id=? WHERE id=?",
      )
      .run(data.id, intent.id)
  }

  return true
}
