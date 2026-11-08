import { describe, expect, it, vi } from "vitest"
import {
  service,
  plan,
  priceId,
  txnId,
  intent,
  config,
  deliver,
  event,
  completed,
  grant,
} from "./test-fixture"
import { BillingService } from "./service"
import { readBillingConfig } from "./config"
import { billingCatalogSchema } from "../../core/billing"
import { beginPhoneCall, endPhoneCall } from "./phone-meter"

const response = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
  })
describe("checkout and catalog boundaries", () => {
  it("uses sandbox API, verifies the exact price and reuses an intent", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          status: "active",
          unit_price: { currency_code: "GBP", amount: "100" },
          billing_cycle: null,
        }),
      )
      .mockResolvedValueOnce(response({ id: txnId }))
    const s = service(":memory:", request)

    try {
      const input = {
        planId: plan.id,
        currency: "GBP" as const,
        requestId: crypto.randomUUID(),
      }
      const first = await s.checkout.create("tenant-a", input)
      expect(await s.checkout.create("tenant-a", input)).toEqual(first)
      expect(request).toHaveBeenCalledTimes(2)
      expect(request.mock.calls[1][0]).toBe(
        "https://sandbox-api.paddle.com/transactions",
      )
      const body = JSON.parse(
        (request.mock.calls.at(1)?.[1]?.body ?? "") as string,
      ) as { items: unknown; custom_data: unknown }
      expect(body.items).toEqual([{ price_id: priceId, quantity: 1 }])
      expect(body.custom_data).not.toHaveProperty("tenant_id")
      expect(s.snapshot("tenant-a").grants).toEqual([])
    } finally {
      s.close()
    }
  })
  it("rejects currency and amount drift before creating a checkout", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        status: "active",
        unit_price: { currency_code: "GBP", amount: "200" },
        billing_cycle: null,
      }),
    )
    const s = service(":memory:", request)

    try {
      await expect(
        s.checkout.create("tenant-a", {
          planId: plan.id,
          currency: "USD",
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toThrow("notConfigured")
      await expect(
        s.checkout.create("tenant-a", {
          planId: plan.id,
          currency: "GBP",
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toThrow("configuration")
      expect(request).toHaveBeenCalledTimes(1)
    } finally {
      s.close()
    }
  })
  it("leaves an uncertain provider call pending without creating a duplicate transaction", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          status: "active",
          unit_price: { currency_code: "GBP", amount: "100" },
          billing_cycle: null,
        }),
      )
      .mockRejectedValueOnce(new Error("network timeout"))
    const s = service(":memory:", request)

    try {
      const input = {
        planId: plan.id,
        currency: "GBP" as const,
        requestId: crypto.randomUUID(),
      }
      await expect(s.checkout.create("tenant-a", input)).rejects.toThrow(
        "providerUnavailable",
      )
      await expect(s.checkout.create("tenant-a", input)).rejects.toThrow(
        "checkoutPending",
      )
      expect(request).toHaveBeenCalledTimes(2)
    } finally {
      s.close()
    }
  })
  it("reconciles a lost completion notification from the canonical transaction", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ ...completed(), updated_at: new Date().toISOString() }),
      )
    const s = service(":memory:", request)

    try {
      intent(s)
      await s.reconcile("tenant-a")
      await s.reconcile("tenant-a")
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
    } finally {
      s.close()
    }
  })
  it("supports four explicit currencies without silently converting prices", () => {
    expect(
      billingCatalogSchema.parse([
        {
          ...plan,
          prices: ["ILS", "GBP", "USD", "EUR"].map((currency, index) => ({
            currency,
            priceId: `pri_${String(index).repeat(26)}`,
            amountMinor: 100 + index,
          })),
        },
      ]),
    ).toHaveLength(1)
    expect(() => billingCatalogSchema.parse([plan, plan])).toThrow()
    expect(readBillingConfig({}).enabled).toBe(false)
    expect(() => readBillingConfig({ TADAZZ_BILLING_ENABLED: "true" })).toThrow(
      "configuration",
    )
  })
  it("applies a paid upgrade to a live game's cap", () => {
    const s = service()

    try {
      grant(s)
      s.entitlements.start("tenant-a", "game")
      intent(
        s,
        { ...plan, id: "upgrade", kind: "upgrade", participants: 5 },
        txnId,
        "game",
      )
      deliver(s, event("transaction.completed", completed()))
      expect(s.entitlements.usage("tenant-a")[0].participantLimit).toBe(5)
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
      expect(s.snapshot("tenant-a").grants[0].remainingGames).toBe(0)
    } finally {
      s.close()
    }
  })
  it("meters server call time and rejects new calls after the allowance", () => {
    const s = new BillingService(config, ":memory:")

    try {
      grant(s)
      s.entitlements.reserve("tenant-a", "game")
      expect(beginPhoneCall(s.database, "tenant-a", "game", "call", 1000)).toBe(
        true,
      )
      expect(
        beginPhoneCall(s.database, "tenant-a", "game", "call", 61000),
      ).toBe(false)
      expect(s.entitlements.usage("tenant-a")[0].phoneSeconds).toBe(60)
      expect(() =>
        beginPhoneCall(s.database, "tenant-a", "game", "new-call", 61000),
      ).toThrow("phoneLimit")
      endPhoneCall(s.database, "game", "call", 62000)
      expect(s.entitlements.usage("tenant-a")[0].phoneSeconds).toBe(61)
      s.entitlements.recordPhoneUsage("tenant-a", "game", "call", 65)
      expect(s.entitlements.usage("tenant-a")[0].phoneSeconds).toBe(65)
    } finally {
      s.close()
    }
  })
})
