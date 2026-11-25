import { test, expect } from "@playwright/test"

test("keeps the site disabled and preserves original authentication", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/manager\/?$/u)
  await expect(page.locator("input[type=password]")).toBeVisible()
  await expect(page.locator("[data-tadazz-site]")).toHaveCount(0)
  expect(await (await page.request.get("/api/auth/mode")).json()).toEqual({
    accountsEnabled: false,
  })
})
