// Actual site bootstrap (React StrictMode), route guards, AccountGateway login,
// native account API/profile and Studio consent mount. No synthetic router or
// automatic approval; the bounded test request is intentionally not issuer-valid.
// Run with the actual site Vite DEVELOPMENT server: production StrictMode does
// not replay effects. The first case observes AccountGateway's effect replay.
import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  CONSENT_HANDOFF_KEY,
  CONSENT_PATH,
} from "../../../components/oauth-consent/login-handoff"

function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireObservedRecord(value: unknown): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error("Expected an object in the observed JSON value")
  }

  return value
}

const password = "Local-only-consent-route-passphrase-2026"
const address = `consent-route-${Date.now()}@example.invalid`
const mail = fileURLToPath(
  new URL("../../../../.site-test-config/test-mail.json", import.meta.url),
)
const ticket = "sealed-request-".repeat(8)
const pending = (page: Page) =>
  page.evaluate((key) => sessionStorage.getItem(key), CONSENT_HANDOFF_KEY)
async function openLogin(page: Page, request = ticket) {
  await page.goto(`${CONSENT_PATH}?oauth_request=${request}`)
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fstudio%2Foauth-consent$/u)
  expect(new URL(page.url()).searchParams.has("oauth_request")).toBe(false)
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeEnabled()
}
async function login(page: Page) {
  await page.getByLabel("Email address", { exact: true }).fill(address)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Connect an application", exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId("oauth-native-account")).toContainText(address)
  await expect.poll(() => pending(page)).toBeNull()
  await expect(
    page.getByRole("button", { name: "Allow access", exact: true }),
  ).toBeDisabled()
}
test.beforeAll(async ({ request }) => {
  expect(
    (
      await request.post("/api/accounts/register", {
        data: { email: address, password },
      })
    ).ok(),
  ).toBe(true)
  const { code } = (
    JSON.parse(readFileSync(mail, "utf8")) as Record<string, { code: string }>
  )[address]
  expect(
    (
      await request.post("/api/accounts/verify", {
        data: { email: address, password, code },
      })
    ).ok(),
  ).toBe(true)
})
test("logged-out consent survives actual login and repeated guards without extending its deadline", async ({
  page,
}) => {
  const approvals: string[] = []
  let modeRequests = 0
  page.on("request", (req) => {
    if (req.url().endsWith("/approve")) {
      approvals.push(req.url())
    }

    if (new URL(req.url()).pathname === "/api/auth/mode") {
      modeRequests += 1
    }
  })
  await openLogin(page)
  await expect.poll(() => modeRequests).toBeGreaterThanOrEqual(2)
  const captured = await pending(page)
  expect(JSON.parse(captured!)).toMatchObject({ ticket })
  expect(
    Object.keys(requireObservedRecord(JSON.parse(captured!))).sort(),
  ).toEqual(["expiresAt", "ticket"])
  await page.reload()
  expect(await pending(page)).toBe(captured)
  await login(page)
  expect(new URL(page.url()).pathname).toBe(CONSENT_PATH)
  expect(new URL(page.url()).searchParams.getAll("oauth_request")).toEqual([
    ticket,
  ])
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("Connection canceled.")
  expect(new URL(page.url()).search).toBe("")
  await page.reload()
  expect(new URL(page.url()).search).toBe("")
  expect(approvals).toEqual([])
})
test("expired pending ticket is not restored by a successful native login", async ({
  page,
}) => {
  await openLogin(page)
  await page.evaluate((key) => {
    const value: unknown = JSON.parse(sessionStorage.getItem(key)!)

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Expected the pending consent handoff to be an object")
    }

    sessionStorage.setItem(
      key,
      JSON.stringify({ ...value, expiresAt: Date.now() - 1 }),
    )
  }, CONSENT_HANDOFF_KEY)
  await login(page)
  expect(new URL(page.url()).search).toBe("")
})
test("a replacement request supersedes the old ticket before native login", async ({
  page,
}) => {
  await openLogin(page)
  const replacement = "replacement-sealed-request-".repeat(5)
  await openLogin(page, replacement)
  await login(page)
  expect(new URL(page.url()).searchParams.getAll("oauth_request")).toEqual([
    replacement,
  ])
})
test("a real cross-tab native session replacement cancels the pending handoff", async ({
  page,
  context,
}) => {
  await openLogin(page)
  const other = await context.newPage()
  await other.goto("/login")
  await other.evaluate(() =>
    localStorage.setItem("token", "untrusted-replacement-must-not-resume"),
  )
  await expect.poll(() => pending(page)).toBeNull()
  await other.close()
  await login(page)
  expect(new URL(page.url()).search).toBe("")
})

test.describe("small iPhone account access", () => {
  test.use({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  })

  test("the primary login action fits the initial viewport and completes the real consent handoff", async ({
    page,
  }, testInfo) => {
    await openLogin(page)
    const submit = page.getByRole("button", { name: "Log in", exact: true })
    await expect(submit).toBeInViewport({ ratio: 1 })
    expect(
      await submit.evaluate((button) => button.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath("iphone-small-login.png"),
    })
    await login(page)
  })

  test("Hebrew login keeps its action visible without horizontal overflow", async ({
    page,
  }, testInfo) => {
    await page.goto("/login?lng=he")
    const submit = page.locator(".account-submit")
    await expect(submit).toBeEnabled()
    await expect(submit).toBeInViewport({ ratio: 1 })
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    expect(
      await page
        .locator('input[type="password"]')
        .evaluate((input) =>
          Number.parseFloat(getComputedStyle(input).fontSize),
        ),
    ).toBeGreaterThanOrEqual(16)
    await page.screenshot({
      path: testInfo.outputPath("iphone-small-login-hebrew.png"),
    })
  })

  test("focused fields and all account actions remain reachable in a keyboard-sized viewport", async ({
    page,
  }, testInfo) => {
    await openLogin(page)
    await page.getByLabel("Email address", { exact: true }).fill(address)
    await page.getByLabel("Password", { exact: true }).fill(password)
    await page.setViewportSize({ width: 320, height: 300 })
    const submit = page.getByRole("button", { name: "Log in", exact: true })
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    expect(
      await page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).touchAction),
    ).toBe("auto")
    await page.screenshot({
      path: testInfo.outputPath("iphone-keyboard-login.png"),
    })
    await submit.tap()
    await expect(
      page.getByRole("heading", {
        name: "Connect an application",
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByTestId("oauth-native-account")).toContainText(
      address,
    )

    // Longer recovery forms can scroll in either direction without hiding
    // controls in a centered fixed-height panel. This models reduced viewport
    // space, rather than pretending Playwright opens a physical iOS keyboard.
    for (const route of ["signup", "verify", "forgot", "reset"]) {
      await page.goto(`/${route}?lng=en`)
      const action = page.locator(".account-submit")
      await expect(action).toBeEnabled()
      await action.scrollIntoViewIfNeeded()
      await expect(action).toBeInViewport({ ratio: 1 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
      await page.locator(".account-card h1").scrollIntoViewIfNeeded()
      await expect(page.locator(".account-card h1")).toBeInViewport({
        ratio: 1,
      })
    }
  })
})
