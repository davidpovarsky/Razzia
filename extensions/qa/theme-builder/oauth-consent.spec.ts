import playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
const { test, expect } = playwright as unknown as typeof Playwright
const callback =
  "https://consent-callback.example.invalid/callback?code=synthetic-code&state=original"
const newTicket = (prefix = "test-") =>
  prefix + "synthetic-ticket-".repeat(4) + Math.random().toString(36).slice(2)
const open = async (page: Playwright.Page, ticket: string, locale = "en") => {
  await page.goto(
    `/studio/oauth-consent?${new URLSearchParams({ oauth_request: ticket, locale })}`,
  )
  await expect(page.getByTestId("oauth-client-id")).toHaveText(
    "synthetic-registered-client",
  )
}
const stats = async (request: Playwright.APIRequestContext, ticket: string) =>
  (
    await request.get(`/qa/oauth-stats?${new URLSearchParams({ ticket })}`)
  ).json()
test("cancel during inspection ignores its late response", async ({
  page,
  request,
}) => {
  await page.route("**/api/qa/oauth/inspect", async (route) => {
    await page.waitForTimeout(700)
    await route.continue().catch(() => undefined)
  })
  const ticket = newTicket()
  const inspecting = page.waitForRequest("**/api/qa/oauth/inspect")
  await page.goto(`/studio/oauth-consent?oauth_request=${ticket}`)
  await inspecting
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.waitForTimeout(900)
  await expect(page.getByRole("alert")).toHaveText("Connection canceled.")
  await expect(
    page.getByRole("button", {
      name: "Allow access",
      exact: true,
    }),
  ).toBeDisabled()
  expect((await stats(request, ticket)).approve).toBe(0)
})
for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"])
  test(`actual consent component locale ${locale}, no automatic approval`, async ({
    page,
    request,
  }, info) => {
    const ticket = newTicket()
    await open(page, ticket, locale)
    await expect(page.getByTestId("oauth-native-account")).toContainText(
      "synthetic-author@example.invalid",
    )
    await expect(page.getByRole("list")).toContainText("tadazz.catalog.read")
    await expect(page.getByRole("list")).toContainText("tadazz.drafts.read")
    expect(await stats(request, ticket)).toEqual({ inspect: 1, approve: 0 })
    await expect(page.getByRole("button").first()).toBeEnabled()
    if (locale === "ja")
      await page.screenshot({ path: info.outputPath("native-consent-ja.png") })
  })
test("trusted native click approves once and navigates only to exact issuer response", async ({
  page,
  request,
}) => {
  await page.route("https://consent-callback.example.invalid/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Synthetic callback</title>",
    }),
  )
  const ticket = newTicket()
  await open(page, ticket)
  expect(await stats(request, ticket)).toEqual({ inspect: 1, approve: 0 })
  await page
    .getByRole("button", { name: "Allow access", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
  expect(await stats(request, ticket)).toEqual({ inspect: 1, approve: 0 })
  await page.getByRole("button", { name: "Allow access", exact: true }).click()
  await expect(page).toHaveURL(callback)
  expect(await stats(request, ticket)).toEqual({ inspect: 1, approve: 1 })
})
test("cancel discards proof and does not submit approval", async ({
  page,
  request,
}) => {
  const ticket = newTicket()
  await open(page, ticket)
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("Connection canceled.")
  await expect(
    page.getByRole("button", { name: "Allow access", exact: true }),
  ).toBeDisabled()
  expect(await stats(request, ticket)).toEqual({ inspect: 1, approve: 0 })
  expect(new URL(page.url()).search).toBe("")
})
test("native session change invalidates inspected proof before approval", async ({
  page,
  request,
}) => {
  const ticket = newTicket()
  await open(page, ticket)
  await page.evaluate(() => (window as any).__qaOAuth.changeSession())
  await expect(
    page.getByRole("button", { name: "Allow access", exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole("alert")).toContainText("session has expired")
  expect(await stats(request, ticket)).toEqual({ inspect: 1, approve: 0 })
})
test("expired ticket and missing actual page headers fail closed", async ({
  page,
  request,
}) => {
  const short = newTicket("short-")
  await open(page, short)
  await page.waitForTimeout(5500)
  await expect(page.getByRole("alert")).toContainText("session has expired")
  await expect(
    page.getByRole("button", { name: "Allow access", exact: true }),
  ).toBeDisabled()
  expect(await stats(request, short)).toEqual({ inspect: 1, approve: 0 })
  await page.route("**/studio/oauth-consent", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({
          status: 200,
          headers: { "referrer-policy": "no-referrer" },
          body: "",
        })
      : route.continue(),
  )
  const blocked = newTicket()
  await page.goto(`/studio/oauth-consent?oauth_request=${blocked}`)
  await expect(page.getByRole("alert")).toContainText("could not be completed")
  await expect(
    page.getByRole("button", { name: "Allow access", exact: true }),
  ).toBeDisabled()
  expect(await stats(request, blocked)).toEqual({ inspect: 0, approve: 0 })
})
