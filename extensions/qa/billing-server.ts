/* oxlint-disable no-await-in-loop -- Provider reads and test-account setup are deliberately ordered. */
// Private browser-test fixture only. Never used by the production entrypoint.
import { createAdaptorServer } from "@hono/node-server"
import { app, createSocketServer } from "@razzia/socket/app"
import { registerAccount } from "@razzia/socket/services/account-auth"
import {
  getAccountDb,
  closeAccountDb,
} from "@razzia/socket/services/account-db"
import { ensureAccountStorage } from "@razzia/socket/services/account-directory"
import { requireBilling, closeBilling } from "@razzia/socket/services/billing"
import { insertGrant } from "../src/server/billing/grants"
import { billingCurrencies, type BillingPlan } from "../src/core/billing"
import Registry from "@razzia/socket/services/registry"

if (
  process.env.TADAZZ_BILLING_BROWSER_FIXTURE !== "isolated-test-only" ||
  !process.env.CONFIG_PATH?.includes("tadazz-billing-browser-")
) {
  throw new Error("Isolated test path required")
}

const plan: BillingPlan = {
  id: "browser-test-single",
  version: 1,
  kind: "single",
  participants: 50,
  games: 1,
  phoneMinutes: 30,
  prices: billingCurrencies.map((currency, index) => ({
    currency,
    amountMinor: 1000 + index * 100,
    priceId: `pri_${String(index + 1).repeat(26)}`,
  })),
}
let transaction = 0
const nativeFetch = globalThis.fetch
globalThis.fetch = (url, options) => {
  const value = url instanceof Request ? url.url : String(url)

  if (!value.startsWith("https://sandbox-api.paddle.com/")) {
    return nativeFetch(url, options)
  }

  let data: unknown = undefined

  if (value.includes("/prices/")) {
    const price = plan.prices.find((item) => value.endsWith(item.priceId))

    if (!price) {
      throw new Error("Unknown test price")
    }

    data = {
      id: price.priceId,
      status: "active",
      unit_price: {
        currency_code: price.currency,
        amount: String(price.amountMinor),
      },
      billing_cycle: null,
    }
  } else if (value.endsWith("/transactions") && options?.method === "POST") {
    transaction += 1
    data = { id: `txn_${String(transaction).padStart(26, "0")}` }
  } else {
    throw new Error("Unexpected sandbox fixture request")
  }

  return Promise.resolve(Response.json({ data }))
}
for (const email of [
  "billing-a@example.invalid",
  "billing-b@example.invalid",
]) {
  const account = await registerAccount(email, "billing-test-password")
  getAccountDb()
    .prepare("UPDATE accounts SET verified_at=? WHERE id=?")
    .run(Date.now(), account.id)
  ensureAccountStorage(account.id)

  if (email.startsWith("billing-a")) {
    const billing = requireBilling()
    billing.config.catalog.push(plan)
    insertGrant(billing.database, {
      id: "fixture-grant",
      tenantId: account.id,
      plan,
      startsAt: 0,
      expiresAt: null,
      transactionId: "fixture-purchase",
    })
  }
}
const server = createAdaptorServer({ fetch: app.fetch })
const io = createSocketServer(server)
server.listen(Number(process.env.SOCKET_PORT), "127.0.0.1")
const shutdown = () => {
  Registry.getInstance().cleanup()
  io.close(() => {
    closeBilling()
    closeAccountDb()
    process.exit(0)
  })
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
