import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import {
  BillingError,
  hasBillingClientToken,
  isBillingCheckoutConfigured,
  publicBillingCatalog,
  readBillingConfig,
} from "@razzia/extensions/server"
import { billingCurrencySchema } from "@razzia/extensions/core"
import { requireManager } from "@razzia/socket/api/middleware"
import type { ApiEnv } from "@razzia/socket/api/factory"
import { getBilling, requireBilling } from "@razzia/socket/services/billing"
import { limitAction } from "@razzia/socket/services/account-auth"

const checkoutBody = z.strictObject({
  planId: z.string().max(64),
  currency: billingCurrencySchema,
  requestId: z.uuid(),
  gameId: z.string().min(1).max(128).optional(),
})

export const billingRoutes = new Hono<ApiEnv>()
  .use("*", bodyLimit({ maxSize: 262144 }))
  .onError((error, c) => {
    if (error instanceof BillingError) {
      return c.json({ error: error.message }, error.status)
    }

    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return c.json({ error: "extensions:billing.errors.invalidRequest" }, 400)
    }

    console.error("Billing request failed")

    return c.json({ error: "extensions:billing.errors.unavailable" }, 503)
  })
  .get("/config", (c) => {
    const { enabled, configured, environment, plans } =
      publicBillingCatalog(readBillingConfig())
    c.header("Cache-Control", "no-store")

    return c.json({
      enabled,
      configured,
      environment,
      catalogAvailable: plans.length > 0,
    })
  })
  .get("/catalog", (c) => {
    c.header("Cache-Control", "no-store")

    return c.json(publicBillingCatalog(readBillingConfig()))
  })
  .post("/webhooks/paddle", async (c) => {
    const billing = getBilling()

    if (!billing) {
      return c.json({ error: "extensions:billing.errors.disabled" }, 404)
    }

    billing.inbox.receive(await c.req.text(), c.req.header("Paddle-Signature"))

    return c.json({ received: true })
  })
  .use("*", requireManager)
  .use("*", async (c, next) => {
    if (!getBilling()) {
      return c.json({ error: "extensions:billing.errors.disabled" }, 404)
    }

    c.header("Cache-Control", "no-store")
    await next()
  })
  .get("/", (c) => c.json(requireBilling().snapshot(c.get("claims").sub)))
  .post("/checkout", async (c) => {
    const body = checkoutBody.parse(await c.req.json())
    const billing = requireBilling()

    if (!isBillingCheckoutConfigured(billing.config)) {
      throw new BillingError("notConfigured", 503)
    }

    return c.json({
      ...(await billing.checkout.create(c.get("claims").sub, body)),
      clientToken: billing.config.clientToken,
      environment: billing.config.environment,
    })
  })
  .post("/portal", async (c) =>
    c.json(await requireBilling().checkout.portal(c.get("claims").sub)),
  )
  .get("/checkout/:transactionId", (c) => {
    const transactionId = z
      .string()
      .regex(/^txn_[a-z0-9]{26}$/u)
      .parse(c.req.param("transactionId"))
    const billing = requireBilling()
    const row = billing.database.sql
      .prepare(
        "SELECT completed FROM billing_intents WHERE tenant_id=? AND transaction_id=?",
      )
      .get(c.get("claims").sub, transactionId) as
      { completed: number } | undefined

    if (!row) {
      throw new BillingError("notFound", 404)
    }

    if (!hasBillingClientToken(billing.config)) {
      throw new BillingError("notConfigured", 503)
    }

    return c.json({
      transactionId,
      completed: row.completed === 1,
      clientToken: billing.config.clientToken,
      environment: billing.config.environment,
    })
  })
  .post("/sync", async (c) => {
    if (!limitAction(`billing-sync:${c.get("claims").sub}`, 5, 60000)) {
      throw new BillingError("tooManyRequests", 429)
    }

    await requireBilling().reconcile(c.get("claims").sub)

    return c.json(requireBilling().snapshot(c.get("claims").sub))
  })
