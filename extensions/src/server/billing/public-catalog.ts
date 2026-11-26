import {
  billingCurrencies,
  type BillingPublicCatalog,
} from "../../core/billing"
import { isBillingCheckoutConfigured, type BillingConfig } from "./config"

/** Only explicitly configured live catalog offers are published publicly. */
export function publicBillingCatalog(
  config: BillingConfig,
): BillingPublicCatalog {
  const configured = isBillingCheckoutConfigured(config)
  const pricingPublished =
    config.publishPricing === true &&
    config.environment === "live" &&
    config.catalog.length > 0
  const plans: BillingPublicCatalog["plans"] =
    (configured || pricingPublished) && config.environment === "live"
      ? config.catalog
          .filter((plan) => plan.kind !== "upgrade")
          .map((plan) => ({
            id: plan.id,
            version: plan.version,
            kind: plan.kind as "single" | "monthly",
            games: plan.games,
            participants: plan.participants,
            phoneMinutes: plan.phoneMinutes,
            prices: plan.prices.map(({ currency, amountMinor }) => ({
              currency,
              amountMinor,
            })),
          }))
      : []

  return {
    enabled: config.enabled,
    configured,
    ...(pricingPublished ? { pricingPublished: true as const } : {}),
    environment: config.environment,
    currencies: billingCurrencies.filter((currency) =>
      plans.some((plan) =>
        plan.prices.some((price) => price.currency === currency),
      ),
    ),
    plans,
  }
}
