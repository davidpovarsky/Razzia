import { createHmac } from "node:crypto"
import type { BillingPlan } from "../../core/billing"
import { BillingService } from "./service"
import type { BillingConfig } from "./config"
import { insertGrant } from "./grants"

export const priceId = `pri_${"a".repeat(26)}`

export const txnId = `txn_${"a".repeat(26)}`

export const subId = `sub_${"a".repeat(26)}`

export const customerId = `ctm_${"a".repeat(26)}`

export const plan: BillingPlan = {
  id: "single-test",
  version: 1,
  kind: "single",
  participants: 2,
  games: 1,
  phoneMinutes: 1,
  prices: [{ currency: "GBP", priceId, amountMinor: 100 }],
}

export const config: BillingConfig = {
  enabled: true,
  environment: "sandbox",
  apiKey: "test-api-key",
  webhookSecret: "test-webhook-secret",
  catalog: [plan],
  graceMs: 72 * 3600000,
}

export function service(path = ":memory:", request?: typeof fetch) {
  return new BillingService(config, path, request)
}

export function grant(
  s: BillingService,
  tenantId = "tenant-a",
  overrides: Partial<BillingPlan> = {},
) {
  insertGrant(s.database, {
    id: "test-grant",
    tenantId,
    plan: { ...plan, ...overrides },
    startsAt: 0,
    expiresAt: null,
    transactionId: "test-transaction",
  })
}

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function intent(
  s: BillingService,
  purchasePlan = plan,
  transactionId = txnId,
  gameId: string | null = null,
) {
  s.database.sql
    .prepare(
      `INSERT INTO billing_intents
    (id,tenant_id,plan_json,price_id,currency,game_id,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      `intent-${transactionId}`,
      "tenant-a",
      JSON.stringify(purchasePlan),
      purchasePlan.prices[0].priceId,
      "GBP",
      gameId,
      transactionId,
      Date.now(),
    )
}

let sequence = 0

export function event(
  type: string,
  data: Record<string, unknown>,
  time = Date.now(),
) {
  sequence += 1

  return {
    event_id: `evt_${String(sequence).padStart(26, "0")}`,
    event_type: type,
    occurred_at: new Date(time).toISOString(),
    data,
  }
}

export function deliver(
  s: BillingService,
  payload: ReturnType<typeof event>,
  now = Date.now(),
) {
  const raw = JSON.stringify(payload)
  const timestamp = Math.floor(now / 1000)
  const digest = createHmac("sha256", config.webhookSecret)
    .update(`${timestamp}:${raw}`)
    .digest("hex")
  s.inbox.receive(raw, `ts=${timestamp};h1=${digest}`, now)
}

export const completed = (extra: Record<string, unknown> = {}) => ({
  id: txnId,
  status: "completed",
  customer_id: customerId,
  currency_code: "GBP",
  items: [{ price: { id: priceId }, quantity: 1 }],
  ...extra,
})
