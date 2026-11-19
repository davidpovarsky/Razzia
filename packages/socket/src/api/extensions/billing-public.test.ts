import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import type { BillingPublicCatalog } from "@razzia/extensions/core"
import { billingRoutes } from "./billing-routes"
import { plan } from "../../../../../extensions/src/server/billing/test-fixture"

const root = mkdtempSync(join(tmpdir(), "tadazz-public-billing-"))
const catalogPath = join(root, "catalog.json")
writeFileSync(catalogPath, JSON.stringify([plan]))
const app = new Hono().route("/api/billing", billingRoutes)
const request = (path: string) => app.request(`/api/billing${path}`)

beforeEach(() => {
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
  vi.stubEnv("TADAZZ_BILLING_ENABLED", "true")
  vi.stubEnv("TADAZZ_BILLING_CATALOG_PATH", catalogPath)
  vi.stubEnv("PADDLE_ENVIRONMENT", "live")
  vi.stubEnv("PADDLE_API_KEY", "synthetic-private-api-key")
  vi.stubEnv("PADDLE_WEBHOOK_SECRET", "synthetic-private-webhook-secret")
  vi.stubEnv("PADDLE_CLIENT_TOKEN", `live_${"a".repeat(27)}`)
})
afterEach(() => vi.unstubAllEnvs())
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("public billing discovery routes", () => {
  it("serves a live catalog anonymously without provider IDs or account data", async () => {
    const response = await request("/catalog")
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const text = await response.text()
    const body = JSON.parse(text) as BillingPublicCatalog
    expect(body.plans).toHaveLength(1)
    expect(body.plans[0].prices).toEqual([
      { currency: "GBP", amountMinor: 100 },
    ])
    for (const secret of [
      "synthetic-private",
      "live_",
      "pri_",
      "grants",
      "tenantId",
      "subscriptions",
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(readdirSync(root)).toEqual(["catalog.json"])
    expect((await request("/")).status).toBe(401)
  })

  it("reports missing client configuration without publishing purchasable plans", async () => {
    vi.stubEnv("PADDLE_CLIENT_TOKEN", "")
    const config = await request("/config")
    expect(config.headers.get("cache-control")).toBe("no-store")
    expect(await config.json()).toEqual({
      enabled: true,
      configured: false,
      environment: "live",
      catalogAvailable: false,
    })
    expect(await (await request("/catalog")).json()).toMatchObject({
      configured: false,
      plans: [],
      currencies: [],
    })
  })

  it("does not publish sandbox prices even when sandbox checkout is configured", async () => {
    vi.stubEnv("PADDLE_ENVIRONMENT", "sandbox")
    vi.stubEnv("PADDLE_CLIENT_TOKEN", `test_${"a".repeat(27)}`)
    expect(await (await request("/config")).json()).toMatchObject({
      enabled: true,
      configured: true,
      environment: "sandbox",
      catalogAvailable: false,
    })
    expect(await (await request("/catalog")).json()).toMatchObject({
      configured: true,
      plans: [],
      currencies: [],
    })
  })

  it("keeps the public unavailable state honest when billing is switched off", async () => {
    vi.stubEnv("TADAZZ_BILLING_ENABLED", "false")
    expect(await (await request("/config")).json()).toMatchObject({
      enabled: false,
      configured: false,
      catalogAvailable: false,
    })
    expect(await (await request("/catalog")).json()).toMatchObject({
      enabled: false,
      plans: [],
      currencies: [],
    })
  })
})
