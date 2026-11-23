import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { service, grant } from "./test-fixture"
import type { BillingService } from "./service"

const opened: BillingService[] = []
const open = (path?: string) => {
  const s = service(path)
  opened.push(s)

  return s
}
afterEach(() => {
  for (const s of opened.splice(0)) {
    s.close()
  }
})
describe("authoritative billing allowances", () => {
  it("admits exactly the cap and counts a stable identity once", () => {
    const s = open()
    grant(s)
    for (let i = 0; i < 50; i += 1) {
      expect(
        s.entitlements.admit("tenant-a", "game", "same-roster", () => null),
      ).toBeNull()
    }
    expect(
      s.entitlements.admit("tenant-a", "game", "second", () => null),
    ).toBeNull()
    expect(
      s.entitlements.admit("tenant-a", "game", "third", () => null),
    ).toContain("participantLimit")
    expect(s.entitlements.count("game")).toBe(2)
  })
  it("rolls back a rejected join", () => {
    const s = open()
    grant(s)
    expect(
      s.entitlements.admit("tenant-a", "game", "invalid", () => "bad-name"),
    ).toBe("bad-name")
    expect(s.entitlements.count("game")).toBe(0)
  })
  it("consumes a game once at start and denies another start", () => {
    const s = open()
    grant(s)
    s.entitlements.reserve("tenant-a", "one")
    s.entitlements.reserve("tenant-a", "two")
    s.entitlements.start("tenant-a", "one")
    s.entitlements.start("tenant-a", "one")
    expect(() => s.entitlements.start("tenant-a", "two")).toThrow("noGames")
  })
  it("keeps a started game running after refund, denying a future game", () => {
    const s = open()
    grant(s)
    s.entitlements.start("tenant-a", "game")
    s.database.sql.exec("UPDATE billing_grants SET revoked=1")
    expect(
      s.entitlements.admit("tenant-a", "game", "late", () => null),
    ).toBeNull()
    s.entitlements.start("tenant-a", "game")
    expect(() => s.entitlements.reserve("tenant-a", "new")).toThrow("noGames")
  })
  it("blocks tenant substitution and cross-account upgrades", () => {
    const s = open()
    grant(s)
    s.entitlements.reserve("tenant-a", "game")
    expect(() => s.entitlements.start("tenant-b", "game")).toThrow("notFound")
    expect(() => s.entitlements.upgrade("tenant-b", "game", 100, 20)).toThrow(
      "notFound",
    )
    expect(s.snapshot("tenant-b").games).toEqual([])
  })
  it("persists credits, dedupe and usage through restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "tadazz-billing-"))
    const path = join(dir, "billing.sqlite")
    const s = service(path)
    grant(s)
    s.entitlements.start("tenant-a", "game")
    s.entitlements.admit("tenant-a", "game", "roster", () => null)
    s.close()
    const restored = service(path)

    try {
      restored.entitlements.start("tenant-a", "game")
      restored.entitlements.admit("tenant-a", "game", "roster", () => null)
      expect(restored.entitlements.count("game")).toBe(1)
      expect(() => restored.entitlements.start("tenant-a", "second")).toThrow(
        "noGames",
      )
    } finally {
      restored.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it("meters cumulative phone time without counting retries twice", () => {
    const s = open()
    grant(s)
    s.entitlements.reserve("tenant-a", "game")
    s.entitlements.recordPhoneUsage("tenant-a", "game", "call", 50)
    s.entitlements.recordPhoneUsage("tenant-a", "game", "call", 20)
    s.entitlements.recordPhoneUsage("tenant-a", "game", "call", 50)
    expect(s.entitlements.usage("tenant-a")[0].phoneSeconds).toBe(50)
    expect(() =>
      s.entitlements.recordPhoneUsage("tenant-b", "game", "call", 1),
    ).toThrow("notFound")
  })
})
