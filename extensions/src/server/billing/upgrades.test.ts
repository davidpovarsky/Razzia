import { describe, expect, it } from "vitest"
import {
  service,
  grant,
  intent,
  plan,
  txnId,
  completed,
  event,
  deliver,
} from "./test-fixture"

describe("game upgrade reservations", () => {
  it("preserves a paid lobby upgrade when starting with more participants", () => {
    const s = service()

    try {
      grant(s)
      s.entitlements.reserve("tenant-a", "lobby")
      intent(s, { ...plan, kind: "upgrade", participants: 5 }, txnId, "lobby")
      deliver(s, event("transaction.completed", completed()))
      for (const identity of ["one", "two", "three"]) {
        expect(
          s.entitlements.admit("tenant-a", "lobby", identity, () => null),
        ).toBeNull()
      }
      s.entitlements.start("tenant-a", "lobby")
      expect(s.entitlements.usage("tenant-a")[0].participantLimit).toBe(5)
    } finally {
      s.close()
    }
  })
})
