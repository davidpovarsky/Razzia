import { test, expect } from "@playwright/test"
import type { BillingSnapshot } from "../src/core"
import { registerSynthetic } from "./tds-site-fixture"

test("account config stays authoritative over cached capacity and exposes genuine unavailable status", async ({
  page,
}) => {
  await registerSynthetic(page)
  let enabled = true,
    unavailable = false
  const snapshot: BillingSnapshot = {
    enabled: true,
    configured: true,
    environment: "sandbox",
    currencies: [],
    plans: [],
    grants: [],
    games: [],
    hasCustomer: false,
    subscriptions: [],
  }
  // Explicit synthetic response states; no provider/account/billing mutation.
  await page.route("**/api/billing/config", async (route) => {
    if (unavailable) {
      await route.fulfill({
        status: 503,
        json: { error: "synthetic-config-unavailable" },
      })
    } else {
      await route.fulfill({ status: 200, json: { enabled } })
    }
  })
  await page.route("**/api/billing", (route) =>
    route.fulfill({ status: 200, json: snapshot }),
  )
  await page.goto("/studio/account")
  const management = page.getByRole("link", {
    name: "Existing account management",
    exact: true,
  })
  await expect(management).toBeVisible()
  await expect(
    page.getByText("Manage your existing licences and capacity below.", {
      exact: true,
    }),
  ).toBeVisible()
  enabled = false
  await page.locator('a[href="/studio/games"]').first().click()
  await expect(
    page.getByRole("heading", { name: "My Games", exact: true }),
  ).toBeVisible()
  await page.locator('a[href="/studio/account"]').first().click()
  await expect(
    page.getByText("Purchases are currently unavailable.", { exact: true }),
  ).toBeVisible()
  await expect(management).toHaveCount(0)
  unavailable = true
  await page.locator('a[href="/studio/games"]').first().click()
  await expect(
    page.getByRole("heading", { name: "My Games", exact: true }),
  ).toBeVisible()
  await page.locator('a[href="/studio/account"]').first().click()
  await expect(page.getByRole("alert")).toHaveText(
    "Capacity information is unavailable.",
  )
  await expect(management).toHaveCount(0)
  await page.screenshot({
    path: `/evidence/phase-06-account-unavailable-${test.info().project.name}.png`,
    fullPage: true,
  })
})
