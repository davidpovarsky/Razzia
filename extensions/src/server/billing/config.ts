import { readFileSync } from "node:fs"
import { billingCatalogSchema, type BillingPlan } from "../../core/billing"
import { BillingError } from "./errors"

export interface BillingConfig {
  enabled: boolean
  publishPricing?: boolean
  environment: "sandbox" | "live"
  apiKey: string
  clientToken: string
  webhookSecret: string
  catalog: BillingPlan[]
  graceMs: number
}

export function readBillingConfig(env = process.env): BillingConfig {
  const enabled = env.TADAZZ_BILLING_ENABLED === "true"
  const environment = env.PADDLE_ENVIRONMENT ?? "sandbox"

  if (environment !== "sandbox" && environment !== "live") {
    throw new BillingError("configuration", 503)
  }

  if (enabled && env.TADAZZ_ACCOUNTS_ENABLED !== "true") {
    throw new BillingError("configuration", 503)
  }

  let catalog: BillingPlan[] = []

  const publishPricing = env.TADAZZ_PRICING_PUBLISHED === "true"

  if ((enabled || publishPricing) && env.TADAZZ_BILLING_CATALOG_PATH) {
    catalog = billingCatalogSchema.parse(
      JSON.parse(readFileSync(env.TADAZZ_BILLING_CATALOG_PATH, "utf8")),
    )
  }

  const graceHours = Number(env.TADAZZ_BILLING_GRACE_HOURS ?? 72)

  if (!Number.isFinite(graceHours) || graceHours < 0 || graceHours > 168) {
    throw new BillingError("configuration", 503)
  }

  return {
    enabled,
    publishPricing,
    environment,
    catalog,
    graceMs: graceHours * 3_600_000,
    apiKey: env.PADDLE_API_KEY ?? "",
    clientToken: env.PADDLE_CLIENT_TOKEN ?? "",
    webhookSecret: env.PADDLE_WEBHOOK_SECRET ?? "",
  }
}

export function hasBillingClientToken(config: BillingConfig): boolean {
  const prefix = config.environment === "live" ? "live" : "test"

  return new RegExp(`^${prefix}_[a-zA-Z0-9]{27}$`, "u").test(config.clientToken)
}

/** Local readiness only; provider prices are still verified at checkout. */
export function isBillingCheckoutConfigured(config: BillingConfig): boolean {
  return Boolean(
    config.enabled &&
    config.apiKey.trim() &&
    config.webhookSecret.trim() &&
    config.catalog.length &&
    hasBillingClientToken(config),
  )
}
