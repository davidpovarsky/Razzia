import { createAdaptorServer } from "@hono/node-server"
import { Hono } from "hono"
import { writeFileSync } from "node:fs"
import { app } from "../../packages/socket/src/app"

if (
  process.env.TADAZZ_PUBLIC_BILLING_FIXTURE !== "isolated-test-only" ||
  !process.env.CONFIG_PATH?.includes("tadazz-billing-public-browser-") ||
  !process.env.TADAZZ_BILLING_CATALOG_PATH ||
  !process.env.TADAZZ_PUBLIC_BILLING_QA_SECRET
) {
  throw new Error("Isolated billing fixture required")
}

// No provider call or email can leave this synthetic local process.
globalThis.fetch = () =>
  Promise.reject(
    new Error("Provider network is disabled in this billing fixture"),
  )
const catalog = [
  {
    id: "synthetic-single",
    version: 1,
    kind: "single",
    participants: 50,
    games: 1,
    phoneMinutes: 30,
    prices: [
      { currency: "GBP", priceId: `pri_${"a".repeat(26)}`, amountMinor: 4599 },
      { currency: "USD", priceId: `pri_${"b".repeat(26)}`, amountMinor: 5099 },
    ],
  },
  {
    id: "synthetic-monthly",
    version: 1,
    kind: "monthly",
    participants: 100,
    games: 5,
    phoneMinutes: 60,
    prices: [
      { currency: "GBP", priceId: `pri_${"c".repeat(26)}`, amountMinor: 1299 },
      { currency: "USD", priceId: `pri_${"d".repeat(26)}`, amountMinor: 1499 },
    ],
  },
  {
    id: "synthetic-upgrade",
    version: 1,
    kind: "upgrade",
    participants: 200,
    games: 1,
    phoneMinutes: 60,
    prices: [
      { currency: "GBP", priceId: `pri_${"e".repeat(26)}`, amountMinor: 1999 },
    ],
  },
]
writeFileSync(process.env.TADAZZ_BILLING_CATALOG_PATH, JSON.stringify(catalog))
let mode = "disabled"
const setMode = (value: string) => {
  mode = value
  process.env.TADAZZ_BILLING_ENABLED = value === "disabled" ? "false" : "true"
  process.env.PADDLE_ENVIRONMENT = value === "sandbox" ? "sandbox" : "live"
  process.env.PADDLE_CLIENT_TOKEN =
    value === "missing-token"
      ? ""
      : `${value === "sandbox" ? "test" : "live"}_${"a".repeat(27)}`
}
setMode(mode)
const fixture = new Hono()
  .post("/__qa/billing/mode", async (c) => {
    if (
      c.req.header("X-QA-Key") !== process.env.TADAZZ_PUBLIC_BILLING_QA_SECRET
    ) {
      return c.json({ error: "denied" }, 403)
    }

    const { mode: value } = await c.req.json<{ mode: string }>()

    if (
      !["disabled", "sandbox", "live", "missing-token", "error"].includes(value)
    ) {
      return c.json({ error: "invalid" }, 400)
    }

    setMode(value)

    return c.json({ mode })
  })
  .use("/api/billing/catalog", async (c, next) => {
    if (mode === "error") {
      return c.json({ error: "synthetic-unavailable" }, 503)
    }

    await next()
  })
  .route("/", app)
const server = createAdaptorServer({ fetch: fixture.fetch })
server.listen(4393, "127.0.0.1")
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
