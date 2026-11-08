import { billingCurrencies, type BillingSnapshot } from "../../core/billing"
import type { BillingConfig } from "./config"
import { BillingDatabase } from "./database"
import { Entitlements } from "./entitlements"
import { activeGrants, remainingGames } from "./grants"
import { BillingCheckout } from "./checkout"
import { PaddleClient } from "./paddle/client"
import { PaddleInbox } from "./paddle/inbox"
import { reconcileBilling } from "./reconcile"

export class BillingService {
  readonly database: BillingDatabase
  readonly entitlements: Entitlements
  readonly checkout: BillingCheckout
  readonly inbox: PaddleInbox
  private readonly provider: PaddleClient
  readonly config: BillingConfig
  constructor(
    config: BillingConfig,
    path: string,
    request: typeof fetch = fetch,
  ) {
    this.config = config
    this.database = new BillingDatabase(path)
    this.entitlements = new Entitlements(this.database)
    this.provider = new PaddleClient(config, request)
    this.checkout = new BillingCheckout(
      this.database,
      config,
      this.provider,
      this.entitlements,
    )
    this.inbox = new PaddleInbox(this.database, this.entitlements, config)
  }
  snapshot(tenantId: string): BillingSnapshot {
    return {
      enabled: this.config.enabled,
      configured: Boolean(
        this.config.apiKey &&
        this.config.webhookSecret &&
        this.config.catalog.length,
      ),
      environment: this.config.environment,
      currencies: billingCurrencies,
      plans: this.config.catalog,
      hasCustomer: Boolean(
        this.database.sql
          .prepare("SELECT 1 FROM billing_customers WHERE tenant_id=?")
          .get(tenantId),
      ),
      grants: activeGrants(this.database, tenantId, Date.now())
        .filter((grant) => grant.targetGame === null)
        .map((g) => ({
          ...g,
          remainingGames: remainingGames(this.database, g),
        })),
      games: this.entitlements.usage(tenantId),
      subscriptions: this.database.sql
        .prepare(
          `SELECT id,status,scheduled_change AS scheduledChange,period_end AS periodEnd
        FROM billing_subscriptions WHERE tenant_id=?`,
        )
        .all(tenantId) as unknown as BillingSnapshot["subscriptions"],
    }
  }
  async reconcile(tenantId: string) {
    await reconcileBilling(this.database, this.provider, this.inbox, tenantId)
  }
  close() {
    this.database.close()
  }
}
