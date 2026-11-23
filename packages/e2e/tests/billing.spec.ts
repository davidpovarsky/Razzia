/* oxlint-disable no-await-in-loop -- Language and currency changes must run serially in the same page. */
import type { BillingSnapshot } from "../../../extensions/src/core/billing"
import { test, expect, type Page } from "@playwright/test"
import { createHmac } from "node:crypto"
import { join } from "node:path"
import translations from "../../../extensions/src/locales/billing.json" with { type: "json" }

async function login(
  page: Page,
  email = "billing-a@example.invalid",
  locale = "en",
) {
  const response = await page.request.post("/api/accounts/login", {
    data: { email, password: "billing-test-password" },
  })
  expect(response.ok()).toBe(true)
  const { token } = (await response.json()) as { token: string }
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await page.goto(`/manager/config?lng=${locale}`)
  await page
    .getByRole("button", {
      name: translations[locale as keyof typeof translations].tab,
      exact: true,
    })
    .click()
  await expect(page.getByTestId("billing-panel")).toBeVisible()

  return token
}
test("original manager UI, all locales, narrow and desktop layouts", async ({
  page,
}, testInfo) => {
  await login(page)
  for (const locale of Object.keys(translations)) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/manager/config?lng=${locale}`)
    await page
      .getByRole("button", {
        name: translations[locale as keyof typeof translations].tab,
        exact: true,
      })
      .click()
    const text = translations[locale as keyof typeof translations]
    await expect(page.getByRole("heading", { name: text.title })).toBeVisible()
    await expect(page.getByTestId("billing-panel")).not.toContainText(
      "extensions:",
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto("/manager/config?lng=en")
  await page
    .getByRole("button", { name: translations.en.tab, exact: true })
    .click()
  await expect(
    page.getByRole("combobox", { name: "Currency", exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: join(testInfo.outputDir, "billing-desktop.png"),
    fullPage: true,
  })
  const font = await page
    .getByRole("heading", { name: "Plan and billing" })
    .evaluate((element) => getComputedStyle(element).fontFamily)
  expect(font).toContain("Rubik")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: join(testInfo.outputDir, "billing-narrow.png"),
    fullPage: true,
  })
})
test("four currencies and access granted only after signed server notification", async ({
  page,
}) => {
  const token = await login(page)
  const headers = { Authorization: `Bearer ${token}` }
  const snapshot = async () =>
    (
      await page.request.get("/api/billing", { headers })
    ).json() as Promise<BillingSnapshot>
  const original = await snapshot()
  for (const name of [
    "Israeli shekel (ILS)",
    "Pound sterling (GBP)",
    "US dollar (USD)",
    "Euro (EUR)",
  ]) {
    await page.getByRole("combobox", { name: "Currency", exact: true }).click()
    await page.getByRole("option", { name, exact: true }).click()
    await expect(
      page.getByRole("button", { name: /Choose plan/ }),
    ).toBeEnabled()
  }
  await page.route("https://cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    let callback; window.Paddle={Environment:{set(){}},Initialize(o){callback=o.eventCallback},Checkout:{open(o){window.testCheckout=o; callback({name:'checkout.completed'})}}};`,
    }),
  )
  const checkoutResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/billing/checkout"),
  )
  await page.getByRole("button", { name: /Choose plan/ }).click()
  const response = await checkoutResponse
  expect(response.ok()).toBe(true)
  const checkout = (await response.json()) as { transactionId: string }
  await expect(page.getByRole("status")).toContainText(
    "Waiting for payment confirmation",
  )
  expect((await snapshot()).grants.length).toBe(original.grants.length)
  const [plan] = original.plans
  const euroPrice = plan.prices.find((price) => price.currency === "EUR")

  if (!euroPrice) {
    throw new Error("Missing fixture euro price")
  }

  const raw = JSON.stringify({
    event_id: `evt_${crypto.randomUUID().replaceAll("-", "").slice(0, 26)}`,
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    data: {
      id: checkout.transactionId,
      status: "completed",
      customer_id: `ctm_${"1".repeat(26)}`,
      currency_code: "EUR",
      items: [
        {
          price: {
            id: euroPrice.priceId,
          },
          quantity: 1,
        },
      ],
    },
  })
  const ts = Math.floor(Date.now() / 1000)
  const signature = createHmac("sha256", "browser-fixture-signing-secret")
    .update(`${ts}:${raw}`)
    .digest("hex")
  const webhook = await page.request.post("/api/billing/webhooks/paddle", {
    data: raw,
    headers: {
      "Content-Type": "application/json",
      "Paddle-Signature": `ts=${ts};h1=${signature}`,
    },
  })
  expect(webhook.ok()).toBe(true)
  await expect
    .poll(async () => (await snapshot()).grants.length)
    .toBe(original.grants.length + 1)
  await expect(
    page.getByText("Waiting for payment confirmation", { exact: false }),
  ).not.toBeVisible()
})
test("a second authenticated account sees no other account's allowance", async ({
  page,
}) => {
  await login(page, "billing-b@example.invalid")
  await expect(
    page.getByText("No purchased allowance yet.", { exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId("billing-panel")).not.toContainText(
    "1 games remaining",
  )
})
