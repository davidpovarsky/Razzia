import { z } from "zod"

export const billingCurrencies = ["ILS", "GBP", "USD", "EUR"] as const

export const billingCurrencySchema = z.enum(billingCurrencies)

export type BillingCurrency = z.infer<typeof billingCurrencySchema>

export const billingPriceSchema = z.strictObject({
  currency: billingCurrencySchema,
  priceId: z.string().regex(/^pri_[a-z0-9]{26}$/u),
  amountMinor: z.number().int().positive().max(100_000_000),
})

export const billingPlanSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    version: z.number().int().positive(),
    kind: z.enum(["single", "monthly", "upgrade"]),
    participants: z.number().int().min(1).max(10_000),
    games: z.number().int().min(1).max(10_000),
    phoneMinutes: z.number().int().min(0).max(1_000_000).default(0),
    prices: z.array(billingPriceSchema).min(1).max(4),
  })
  .superRefine((plan, ctx) => {
    if (
      new Set(plan.prices.map((p) => p.currency)).size !== plan.prices.length
    ) {
      ctx.addIssue({ code: "custom", message: "Duplicate currency" })
    }
  })

export type BillingPlan = z.infer<typeof billingPlanSchema>

export const billingCatalogSchema = z
  .array(billingPlanSchema)
  .max(100)
  .superRefine((plans, ctx) => {
    const ids = plans.map((p) => p.id)
    const prices = plans.flatMap((p) => p.prices.map((price) => price.priceId))

    if (
      new Set(ids).size !== ids.length ||
      new Set(prices).size !== prices.length
    ) {
      ctx.addIssue({ code: "custom", message: "Duplicate plan or price" })
    }
  })

export interface BillingGrant {
  id: string
  tenantId: string
  planId: string
  participants: number
  games: number
  phoneMinutes: number
  startsAt: number
  expiresAt: number | null
  revoked: number
  targetGame: string | null
}

export interface BillingUsage {
  gameId: string
  participants: number
  participantLimit: number
  started: boolean
  phoneSeconds: number
  phoneMinutes: number
}

export interface BillingSnapshot {
  enabled: boolean
  configured: boolean
  environment: "sandbox" | "live"
  currencies: readonly BillingCurrency[]
  plans: BillingPlan[]
  grants: Array<BillingGrant & { remainingGames: number }>
  games: BillingUsage[]
  hasCustomer: boolean
  subscriptions: Array<{
    id: string
    status: string
    scheduledChange: string | null
    periodEnd: number | null
  }>
}
