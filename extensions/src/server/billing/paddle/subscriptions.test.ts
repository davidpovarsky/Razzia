import { describe, expect, it } from "vitest"
import {
  service,
  intent,
  plan,
  completed,
  event,
  deliver,
  subId,
  customerId,
  txnId,
} from "../test-fixture"

describe("subscription period accounting", () => {
  it("upgrades a paid period without resetting already-spent games", () => {
    const s = service()

    try {
      const now = Date.now(),
        end = now + 86400000
      const period = {
        starts_at: new Date(now - 1000).toISOString(),
        ends_at: new Date(end).toISOString(),
      }
      const monthly = { ...plan, kind: "monthly" as const }
      intent(s, monthly)
      deliver(
        s,
        event(
          "transaction.completed",
          completed({ subscription_id: subId, billing_period: period }),
        ),
      )
      s.entitlements.start("tenant-a", "spent-game")
      const secondTxn = `txn_${"b".repeat(26)}`
      intent(s, { ...monthly, participants: 100 }, secondTxn)
      deliver(
        s,
        event(
          "transaction.completed",
          completed({
            id: secondTxn,
            subscription_id: subId,
            billing_period: {
              ...period,
              starts_at: new Date(now).toISOString(),
            },
          }),
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
      expect(s.snapshot("tenant-a").grants[0].participants).toBe(100)
      expect(s.snapshot("tenant-a").grants[0].remainingGames).toBe(0)
      expect(() => s.entitlements.start("tenant-a", "another-game")).toThrow(
        "noGames",
      )
      deliver(
        s,
        event("adjustment.created", {
          id: "refund-upgrade",
          transaction_id: secondTxn,
          status: "approved",
          action: "refund",
          type: "full",
        }),
      )
      expect(s.snapshot("tenant-a").grants[0].participants).toBe(2)
    } finally {
      s.close()
    }
  })
  it("restores a paused subscription without restoring a refunded purchase", () => {
    const s = service()

    try {
      const now = Date.now(),
        end = now + 86400000
      intent(s, { ...plan, kind: "monthly" })
      deliver(
        s,
        event(
          "transaction.completed",
          completed({
            subscription_id: subId,
            billing_period: {
              starts_at: new Date(now - 1000).toISOString(),
              ends_at: new Date(end).toISOString(),
            },
          }),
        ),
      )
      deliver(
        s,
        event(
          "subscription.updated",
          { id: subId, status: "paused", customer_id: customerId },
          now,
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(0)
      deliver(
        s,
        event(
          "subscription.updated",
          { id: subId, status: "active", customer_id: customerId },
          now + 1000,
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
      deliver(
        s,
        event("adjustment.created", {
          id: "refund",
          transaction_id: txnId,
          status: "approved",
          action: "refund",
          type: "full",
        }),
      )
      deliver(
        s,
        event(
          "subscription.updated",
          { id: subId, status: "active", customer_id: customerId },
          now + 2000,
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(0)
    } finally {
      s.close()
    }
  })
  it("recovers an uncertain checkout only from Paddle's signed API origin", () => {
    const s = service()

    try {
      intent(s)
      s.database.sql.exec("UPDATE billing_intents SET transaction_id=NULL")
      const custom_data = { tadazz_intent_id: `intent-${txnId}` }
      deliver(
        s,
        event(
          "transaction.completed",
          completed({ custom_data, origin: "web" }),
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(0)
      deliver(
        s,
        event(
          "transaction.completed",
          completed({ custom_data, origin: "api" }),
        ),
      )
      expect(s.snapshot("tenant-a").grants).toHaveLength(1)
    } finally {
      s.close()
    }
  })
})
