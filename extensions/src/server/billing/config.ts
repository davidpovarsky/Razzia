import { readFileSync } from "node:fs"
import { billingCatalogSchema, type BillingPlan } from "../../core/billing"
import { BillingError } from "./errors"

export interface BillingConfig {
  enabled: boolean
  environment: "sandbox" | "live"
  apiKey: string
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

  if (enabled && env.TADAZZ_BILLING_CATALOG_PATH) {
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
    environment,
    catalog,
    graceMs: graceHours * 3_600_000,
    apiKey: env.PADDLE_API_KEY ?? "",
    webhookSecret: env.PADDLE_WEBHOOK_SECRET ?? "",
  }
}
