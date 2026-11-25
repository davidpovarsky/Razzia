import { createHash } from "node:crypto"
import type { BillingCurrency } from "../../core/billing"
import type { BillingConfig } from "./config"
import type { BillingDatabase } from "./database"
import type { Entitlements } from "./entitlements"
import { BillingError } from "./errors"
import type { PaddleClient } from "./paddle/client"
import type { IntentRow } from "./paddle/transactions"

export interface CheckoutRequest {
  planId: string
  currency: BillingCurrency
  requestId: string
  gameId?: string
}

export class BillingCheckout {
  private readonly db: BillingDatabase
  private readonly config: BillingConfig
  private readonly provider: PaddleClient
  private readonly entitlements: Entitlements
  // oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
  constructor(
    db: BillingDatabase,
    config: BillingConfig,
    provider: PaddleClient,
    entitlements: Entitlements,
  ) {
    this.db = db
    this.config = config
    this.provider = provider
    this.entitlements = entitlements
  }
  async create(tenantId: string, request: CheckoutRequest) {
    const id = createHash("sha256")
      .update(`${tenantId}:${request.requestId}`)
      .digest("hex")
    const prior = this.db.sql
      .prepare("SELECT * FROM billing_intents WHERE id=?")
      .get(id) as IntentRow | undefined

    if (prior) {
      const priorPlan = JSON.parse(prior.plan_json) as { id: string }

      if (
        prior.tenant_id !== tenantId ||
        priorPlan.id !== request.planId ||
        prior.currency !== request.currency ||
        prior.game_id !== (request.gameId ?? null)
      ) {
        throw new BillingError("invalidRequest", 400)
      }

      if (!prior.transaction_id) {
        throw new BillingError("checkoutPending")
      }

      return {
        transactionId: prior.transaction_id,
        completed: prior.completed === 1,
      }
    }

    const plan = this.config.catalog.find((p) => p.id === request.planId)
    const price = plan?.prices.find((p) => p.currency === request.currency)

    if (!plan || !price) {
      throw new BillingError("notConfigured", 503)
    }

    if (plan.kind === "upgrade") {
      if (!request.gameId) {
        throw new BillingError("invalidRequest", 400)
      }

      this.entitlements.assertOwned(tenantId, request.gameId)
    } else if (request.gameId) {
      throw new BillingError("invalidRequest", 400)
    }

    const now = Date.now()
    const recent = this.db.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM billing_intents WHERE tenant_id=? AND created_at>?",
      )
      .get(tenantId, now - 60000) as { n: number }

    if (recent.n >= 10) {
      throw new BillingError("tooManyRequests", 429)
    }

    if (
      plan.kind === "monthly" &&
      this.db.sql
        .prepare(
          "SELECT 1 FROM billing_subscriptions WHERE tenant_id=? AND status!='canceled'",
        )
        .get(tenantId)
    ) {
      throw new BillingError("usePortal")
    }

    const remotePrice = await this.provider.call<{
      status: string
      unit_price: { amount: string; currency_code: string }
      billing_cycle: { interval: string; frequency: number } | null
    }>(`/prices/${price.priceId}`)
    const monthly =
      remotePrice.billing_cycle?.interval === "month" &&
      remotePrice.billing_cycle.frequency === 1

    if (
      remotePrice.status !== "active" ||
      remotePrice.unit_price.currency_code !== price.currency ||
      remotePrice.unit_price.amount !== String(price.amountMinor) ||
      (plan.kind === "monthly" ? !monthly : remotePrice.billing_cycle !== null)
    ) {
      throw new BillingError("configuration", 503)
    }

    // Persist before the network call. An uncertain response is never retried as a new charge.
    this.db.transaction(() => {
      if (
        this.db.sql.prepare("SELECT 1 FROM billing_intents WHERE id=?").get(id)
      ) {
        throw new BillingError("checkoutPending")
      }

      this.db.sql
        .prepare(
          `INSERT INTO billing_intents (id,tenant_id,plan_json,price_id,currency,game_id,created_at)
        VALUES (?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          tenantId,
          JSON.stringify(plan),
          price.priceId,
          request.currency,
          request.gameId ?? null,
          now,
        )
    })
    const customer = this.db.sql
      .prepare("SELECT customer_id FROM billing_customers WHERE tenant_id=?")
      .get(tenantId) as { customer_id: string } | undefined
    const transaction = await this.provider.checkout(
      price.priceId,
      id,
      customer?.customer_id,
    )

    if (!/^txn_[a-z0-9]{26}$/u.test(transaction.id)) {
      throw new BillingError("providerUnavailable", 502)
    }

    this.db.sql
      .prepare("UPDATE billing_intents SET transaction_id=? WHERE id=?")
      .run(transaction.id, id)

    return { transactionId: transaction.id, completed: false }
  }
  async portal(tenantId: string) {
    const customer = this.db.sql
      .prepare("SELECT customer_id FROM billing_customers WHERE tenant_id=?")
      .get(tenantId) as { customer_id: string } | undefined

    if (!customer) {
      throw new BillingError("notFound", 404)
    }

    return { url: await this.provider.portal(customer.customer_id) }
  }
}
