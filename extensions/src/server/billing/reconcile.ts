/* oxlint-disable no-await-in-loop -- Provider reads and test-account setup are deliberately ordered. */
import type { BillingDatabase } from "./database"
import type { PaddleClient } from "./paddle/client"
import type { PaddleInbox } from "./paddle/inbox"
import { paddleEventSchema } from "./paddle/event"

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export async function reconcileBilling(
  db: BillingDatabase,
  provider: PaddleClient,
  inbox: PaddleInbox,
  tenantId: string,
) {
  const store = (type: string, data: Record<string, unknown>) => {
    const payload = paddleEventSchema.parse({
      event_id: `evt_${"0".repeat(26)}`,
      event_type: type,
      occurred_at: data.updated_at,
      data,
    })
    payload.event_id = `reconcile:${type}:${String(data.id)}:${String(data.updated_at)}`
    db.sql
      .prepare(
        "INSERT OR IGNORE INTO billing_events (id,payload,received_at) VALUES (?,?,?)",
      )
      .run(payload.event_id, JSON.stringify(payload), Date.now())
  }
  const rows = db.sql
    .prepare(
      `SELECT transaction_id FROM billing_intents
    WHERE tenant_id=? AND completed=0 AND transaction_id IS NOT NULL ORDER BY created_at DESC LIMIT 20`,
    )
    .all(tenantId) as unknown as Array<{ transaction_id: string }>
  for (const row of rows) {
    const data = await provider.call<Record<string, unknown>>(
      `/transactions/${encodeURIComponent(row.transaction_id)}`,
    )

    if (data.id === row.transaction_id && data.status === "completed") {
      store("transaction.completed", data)
    }
  }
  const subscriptions = db.sql
    .prepare(
      "SELECT id,customer_id FROM billing_subscriptions WHERE tenant_id=? AND status!='canceled' LIMIT 20",
    )
    .all(tenantId) as unknown as Array<{ id: string; customer_id: string }>
  for (const subscription of subscriptions) {
    const data = await provider.call<Record<string, unknown>>(
      `/subscriptions/${encodeURIComponent(subscription.id)}`,
    )

    if (
      data.id !== subscription.id ||
      data.customer_id !== subscription.customer_id
    ) {
      continue
    }

    store("subscription.updated", data)
    const transactions = await provider.call<Array<Record<string, unknown>>>(
      `/transactions?subscription_id=${encodeURIComponent(subscription.id)}&status=completed&per_page=30&order_by=created_at[DESC]`,
    )
    for (const transaction of transactions) {
      if (
        transaction.subscription_id === subscription.id &&
        transaction.customer_id === subscription.customer_id &&
        transaction.status === "completed"
      ) {
        store("transaction.completed", transaction)
      }
    }
  }
  inbox.drain()
}
