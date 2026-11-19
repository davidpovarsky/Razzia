import { describe, expect, it } from "vitest"
import { billingPublicCatalogSchema } from "../../core/billing"
import {
  hasBillingClientToken,
  isBillingCheckoutConfigured,
  readBillingConfig,
  type BillingConfig,
} from "./config"
import { publicBillingCatalog } from "./public-catalog"
import { BillingService } from "./service"
import { config, plan } from "./test-fixture"

const live = {
  ...config,
  environment: "live" as const,
  clientToken: `live_${"b".repeat(27)}`,
}

describe("billing readiness and public offers", () => {
  it("loads the client token and keeps billing off by default", () => {
    const disabled = readBillingConfig({
      PADDLE_CLIENT_TOKEN: config.clientToken,
    })
    expect(disabled.clientToken).toBe(config.clientToken)
    expect(isBillingCheckoutConfigured(disabled)).toBe(false)
    expect(publicBillingCatalog(disabled).plans).toEqual([])
  })

  it.each<[string, Partial<BillingConfig>]>([
    ["disabled", { enabled: false }],
    ["API key missing", { apiKey: "" }],
    ["webhook missing", { webhookSecret: " " }],
    ["catalog missing", { catalog: [] }],
    ["client token missing", { clientToken: "" }],
    ["wrong environment token", { clientToken: config.clientToken }],
    ["prefix only", { clientToken: "live_" }],
    ["malformed token", { clientToken: `live_${"b".repeat(26)}` }],
  ])("does not advertise checkout readiness with %s", (_name, overrides) => {
    const current = { ...live, ...overrides }
    expect(isBillingCheckoutConfigured(current)).toBe(false)
    expect(publicBillingCatalog(current)).toMatchObject({
      configured: false,
      plans: [],
      currencies: [],
    })
    const service = new BillingService(current, ":memory:")

    try {
      expect(service.snapshot("synthetic-tenant").configured).toBe(false)
    } finally {
      service.close()
    }
  })

  it("retains functional sandbox account checkout without publishing test prices", () => {
    expect(hasBillingClientToken(config)).toBe(true)
    expect(isBillingCheckoutConfigured(config)).toBe(true)
    expect(publicBillingCatalog(config)).toEqual({
      enabled: true,
      configured: true,
      environment: "sandbox",
      currencies: [],
      plans: [],
    })
    expect(
      hasBillingClientToken({ ...config, clientToken: live.clientToken }),
    ).toBe(false)
  })

  it("publishes only exact live offers and their available currencies", () => {
    const monthly = {
      ...plan,
      id: "monthly-fixture",
      kind: "monthly" as const,
      games: 5,
      prices: [
        {
          currency: "USD" as const,
          priceId: `pri_${"c".repeat(26)}`,
          amountMinor: 1700,
        },
      ],
    }
    const upgrade = {
      ...plan,
      id: "upgrade-fixture",
      kind: "upgrade" as const,
      prices: [
        {
          currency: "ILS" as const,
          priceId: `pri_${"d".repeat(26)}`,
          amountMinor: 500,
        },
      ],
    }
    const current = { ...live, catalog: [plan, monthly, upgrade] }
    const before = JSON.stringify(current)
    const published = publicBillingCatalog(current)
    expect(published.currencies).toEqual(["GBP", "USD"])
    expect(published.plans.map((item) => item.kind)).toEqual([
      "single",
      "monthly",
    ])
    expect(published.plans[1]).toMatchObject({
      games: 5,
      prices: [{ currency: "USD", amountMinor: 1700 }],
    })
    expect(billingPublicCatalogSchema.parse(published)).toEqual(published)
    const serialized = JSON.stringify(published)
    for (const excluded of [
      current.apiKey,
      current.webhookSecret,
      current.clientToken,
      "priceId",
      "pri_",
      "tenantId",
      "grants",
      "subscriptions",
      "upgrade-fixture",
    ]) {
      expect(serialized).not.toContain(excluded)
    }
    expect(JSON.stringify(current)).toBe(before)
  })

  it("rejects provider IDs and sandbox offers at the browser contract boundary", () => {
    const published = publicBillingCatalog(live)
    expect(() =>
      billingPublicCatalogSchema.parse({
        ...published,
        environment: "sandbox",
      }),
    ).toThrow()
    expect(() =>
      billingPublicCatalogSchema.parse({ ...published, plans: [plan] }),
    ).toThrow()
  })
})
