import { describe, expect, it } from "vitest"
import { createHmac } from "node:crypto"
import {
  service,
  intent,
  event,
  deliver,
  completed,
  plan,
  config,
  subId,
  customerId,
  txnId,
} from "../test-fixture"
import { verifyPaddleSignature } from "./signature"

describe("Paddle payment effects", () => {
  it("verifies raw bytes, all signatures, and bounded clock skew", () => {
    const raw = '{"event":"test"}',
      now = Date.now(),
      ts = Math.floor(now / 1000)
    const signature = createHmac("sha256", "secret")
      .update(`${ts}:${raw}`)
      .digest("hex")
    expect(() =>
      verifyPaddleSignature(
        raw,
        `ts=${ts};h1=${"0".repeat(64)};h1=${signature}`,
        "secret",
        now,
      ),
    ).not.toThrow()
    expect(() =>
      verifyPaddleSignature(
        `${raw} `,
        `ts=${ts};h1=${signature}`,
        "secret",
        now,
      ),
    ).toThrow("signature")
    expect(() =>
      verifyPaddleSignature(
        raw,
        `ts=${ts};h1=${signature}`,
        "secret",
        now + 6000,
      ),
    ).toThrow("signature")
    expect(() =>
      verifyPaddleSignature(
        raw,
        `ts=${ts};ts=${ts};h1=${signature}`,
        "secret",
        now,
      ),
    ).toThrow("signature")
  })
  it("fulfills exactly once even with distinct duplicate event IDs", () => {
    const s = service()

    try {
      intent(s)
      const paid = event("transaction.completed", completed())
      deliver(s, paid)
      deliver(s, paid)
      deliver(s, event("transaction.completed", completed()))
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
      expect(s.snapshot("tenant-b").grants).toHaveLength(0)
    } finally {
      s.close()
    }
  })
  it("does not trust a forged checkout intent or currency", () => {
    const s = service()

    try {
      intent(s)
      deliver(
        s,
        event(
          "transaction.completed",
          completed({
            id: `txn_${"b".repeat(26)}`,
            custom_data: { tadazz_intent_id: `intent-${txnId}` },
          }),
        ),
      )
      deliver(
        s,
        event("transaction.completed", completed({ currency_code: "USD" })),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(0)
    } finally {
      s.close()
    }
  })
  it("resolves refund before payment and strips customer PII", () => {
    const s = service()

    try {
      intent(s)
      deliver(
        s,
        event("adjustment.created", {
          id: "adjustment",
          transaction_id: txnId,
          action: "refund",
          status: "approved",
          type: "full",
          items: [{ item_id: "x" }],
        }),
      )
      deliver(
        s,
        event(
          "transaction.completed",
          completed({ customer: { email: "private@example.invalid" } }),
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(0)
      const rows = s.database.sql
        .prepare("SELECT payload FROM billing_events")
        .all()
      expect(JSON.stringify(rows)).not.toContain("private@example.invalid")
    } finally {
      s.close()
    }
  })
  it("keeps access on partial refund and scheduled cancellation", () => {
    const s = service()

    try {
      const monthly = { ...plan, kind: "monthly" as const }
      intent(s, monthly)
      const start = Date.now() - 1000,
        end = Date.now() + 100000
      deliver(
        s,
        event(
          "transaction.completed",
          completed({
            subscription_id: subId,
            billing_period: {
              starts_at: new Date(start).toISOString(),
              ends_at: new Date(end).toISOString(),
            },
          }),
        ),
      )
      deliver(
        s,
        event("subscription.updated", {
          id: subId,
          customer_id: customerId,
          status: "active",
          scheduled_change: { action: "cancel" },
        }),
      )
      deliver(
        s,
        event("adjustment.created", {
          id: "adjustment",
          transaction_id: txnId,
          action: "refund",
          status: "approved",
          type: "partial",
        }),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
      expect(s.snapshot("tenant-a").subscriptions[0].scheduledChange).toBe(
        "cancel",
      )
    } finally {
      s.close()
    }
  })
  it("ignores old subscription state and bounds grace to the last paid period", () => {
    const s = service()

    try {
      intent(s, { ...plan, kind: "monthly" })
      const start = Date.now() - 10000,
        end = Date.now() + 100000
      deliver(
        s,
        event(
          "transaction.completed",
          completed({
            subscription_id: subId,
            billing_period: {
              starts_at: new Date(start).toISOString(),
              ends_at: new Date(end).toISOString(),
            },
          }),
        ),
      )
      const update = {
        id: subId,
        customer_id: customerId,
        status: "past_due",
        current_billing_period: {
          starts_at: new Date(end).toISOString(),
          ends_at: new Date(end + 30 * 86400000).toISOString(),
        },
      }
      deliver(s, event("subscription.past_due", update))
      deliver(
        s,
        event("subscription.updated", { ...update, status: "active" }, start),
      )
      expect(s.snapshot("tenant-a").subscriptions[0].status).toBe("past_due")
      expect(s.snapshot("tenant-a").grants[0].expiresAt).toBe(
        end + config.graceMs,
      )
    } finally {
      s.close()
    }
  })
})
