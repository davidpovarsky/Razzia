// Actual site components with synthetic HTTP replies; no account or mail is mutated.
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"

const require = createRequire(
  new URL("../../packages/e2e/package.json", import.meta.url),
)
const { chromium, expect } = require("@playwright/test")
const baseURL = process.env.TADAZZ_UX_BASE_URL ?? "http://127.0.0.1:4390"
const evidence = resolvePath(
  process.env.TADAZZ_UX_EVIDENCE ??
    "docs/extensions/plans/ux-followup-20261119/site-browser",
)
mkdirSync(evidence, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  channel: "msedge",
  ignoreDefaultArgs: ["--disable-back-forward-cache"],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()
const errors = []
const cases = []
page.on("pageerror", (error) => errors.push(error.message))
const account = {
  id: "followup-site-account",
  email: "followup-site@example.invalid",
  verified: true,
}
const token = `test.${Buffer.from(JSON.stringify({ sub: account.id, role: "manager", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`
const games = [
  { id: "followup-alpha", subject: "Alpha synthetic game" },
  { id: "followup-zebra", subject: "Zebra synthetic game" },
]
let mode = "success"
let listFailure = false
let contactAvailable = true
let contactMode = "success"
const creations = []
const messages = []
let releasePending = () => undefined
let pendingReached = () => undefined

await page.addInitScript(
  ({ token: sessionToken }) => {
    localStorage.setItem("token", sessionToken)

    if (!localStorage.getItem("i18nextLng")) {
      localStorage.setItem("i18nextLng", "en")
    }
  },
  { token },
)
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url())
  const reply = (json, status = 200) => route.fulfill({ status, json })

  if (url.pathname === "/api/auth/mode") {
    return reply({ accountsEnabled: true })
  }

  if (url.pathname === "/api/accounts/me") {
    return reply(account)
  }

  if (url.pathname === "/api/auth/session") {
    return reply({
      token,
      clientId: account.id,
      role: "manager",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
  }

  if (url.pathname === "/api/quizz") {
    return reply(
      listFailure ? { error: "synthetic-unavailable" } : { quizz: games },
      listFailure ? 503 : 200,
    )
  }

  if (url.pathname === "/api/results") {
    return reply({ results: [] })
  }

  if (url.pathname === "/api/billing/config") {
    return reply({ enabled: false })
  }

  if (url.pathname === "/api/billing/catalog") {
    return reply({
      enabled: false,
      configured: false,
      environment: "sandbox",
      currencies: [],
      plans: [],
    })
  }

  if (url.pathname === "/api/contact/config") {
    return reply({ available: contactAvailable })
  }

  if (url.pathname === "/api/contact") {
    messages.push(route.request().postDataJSON())

    return reply(
      contactMode === "success"
        ? { status: "accepted" }
        : { error: "contact-send-failed" },
      contactMode === "success" ? 202 : 503,
    )
  }

  if (url.pathname === "/api/games" && route.request().method() === "POST") {
    const data = route.request().postDataJSON()
    creations.push(data)

    if (mode === "held") {
      pendingReached()
      await new Promise((resolve) => {
        releasePending = resolve
      })

      return reply({ gameId: "followup-stale", inviteCode: "123456" }).catch(
        () => undefined,
      )
    }

    if (mode === "fail") {
      return reply({ error: "synthetic-capacity-unavailable" }, 503)
    }

    return reply({
      gameId: `followup-room-${data.quizzId}`,
      inviteCode: "123456",
    })
  }

  return reply({ error: "synthetic-unsupported" }, 404)
})
await page.route("**/party/manager/followup-room-*", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html><head><title>QA host</title></head><body><h1>QA host destination</h1></body></html>",
  }),
)
const check = async (name, fn) => {
  await fn()
  cases.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
const noHorizontalOverflow = async () =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)

try {
  await check(
    "Selecting a game launches exactly that game once, without another selector",
    async () => {
      await page.goto(`${baseURL}/studio/games`)
      const before = creations.length
      await page
        .locator('[data-game-id="followup-zebra"]')
        .getByRole("link", { name: "Prepare show", exact: true })
        .click()
      await expect(page).toHaveURL(/followup-room-followup-zebra$/u)
      expect(creations.slice(before)).toEqual([
        { quizzId: "followup-zebra", requestId: expect.any(String) },
      ])
      await page.goBack()
      await expect(page).toHaveURL(/\/studio\/games$/u)
      await expect(
        page.locator('[data-game-id="followup-zebra"]'),
      ).toBeVisible()
      expect(creations.length).toBe(before + 1)
    },
  )
  await check(
    "General Prepare retains explicit selection and makes no automatic request",
    async () => {
      const before = creations.length
      await page.goto(`${baseURL}/studio/prepare`)
      const selection = page.getByRole("combobox", {
        name: "My Games",
        exact: true,
      })
      await expect(selection).toHaveValue("")
      await expect(
        page.getByRole("button", { name: "Open show room", exact: true }),
      ).toBeDisabled()
      expect(creations.length).toBe(before)
      await selection.selectOption("followup-alpha")
      await page
        .getByRole("button", { name: "Open show room", exact: true })
        .click()
      await expect(page).toHaveURL(/followup-room-followup-alpha$/u)
      expect(creations.slice(before)).toEqual([
        { quizzId: "followup-alpha", requestId: expect.any(String) },
      ])
    },
  )
  await check(
    "An unavailable requested game is never replaced silently with another game",
    async () => {
      const before = creations.length
      await page.goto(`${baseURL}/studio/prepare?quiz=does-not-exist`)
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveValue("")
      await expect(
        page.getByRole("button", { name: "Open show room", exact: true }),
      ).toBeDisabled()
      expect(creations.length).toBe(before)
    },
  )
  await check(
    "Failed direct launch shows one working retry and no second selection",
    async () => {
      mode = "fail"
      const before = creations.length
      await page.goto(`${baseURL}/studio/prepare?quiz=followup-zebra`)
      await expect(page.getByRole("alert")).toContainText("Unable to start")
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveCount(0)
      expect(creations.length).toBe(before + 1)
      await page.screenshot({
        path: resolvePath(evidence, "prepare-retry.png"),
        fullPage: true,
      })
      mode = "success"
      await page
        .getByRole("button", { name: "Open show room", exact: true })
        .click()
      await expect(page).toHaveURL(/followup-room-followup-zebra$/u)
      expect(
        creations
          .slice(before)
          .every((item) => item.quizzId === "followup-zebra"),
      ).toBe(true)
      expect(creations.length).toBe(before + 2)
      expect(creations[before].requestId).toBe(creations[before + 1].requestId)
    },
  )
  await check(
    "History restoration aborts a pending launch and ignores its late reply",
    async () => {
      mode = "held"
      const before = creations.length
      const reached = new Promise((resolve) => {
        pendingReached = resolve
      })
      await page.goto(`${baseURL}/studio/prepare?quiz=followup-alpha`)
      await reached
      await expect(
        page.getByText("Opening your show…", { exact: true }),
      ).toBeVisible()
      expect(creations.length).toBe(before + 1)
      await page.evaluate(() => {
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        )
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        )
      })
      await expect(
        page.getByRole("button", { name: "Open show room", exact: true }),
      ).toBeEnabled()
      releasePending()
      await expect(page.getByRole("alert")).toContainText("Unable to start")
      await expect(page).toHaveURL(/\/studio\/prepare\?quiz=followup-alpha$/u)
      expect(creations.length).toBe(before + 1)
      mode = "success"
      await page
        .getByRole("button", { name: "Open show room", exact: true })
        .click()
      await expect(page).toHaveURL(/followup-room-followup-alpha$/u)
      expect(creations.length).toBe(before + 2)
      expect(creations[before].requestId).toBe(creations[before + 1].requestId)
    },
  )
  await check(
    "Game-list retry preserves the originally requested game",
    async () => {
      const before = creations.length
      listFailure = true
      await page.goto(`${baseURL}/studio/prepare?quiz=followup-zebra`)
      await expect(page.getByRole("alert")).toContainText(
        "Could not load your games",
        { timeout: 15000 },
      )
      expect(creations.length).toBe(before)
      listFailure = false
      await page.getByRole("button", { name: "Retry", exact: true }).click()
      await expect(page).toHaveURL(/followup-room-followup-zebra$/u)
      expect(creations.slice(before)).toEqual([
        { quizzId: "followup-zebra", requestId: expect.any(String) },
      ])
    },
  )
  await check(
    "Contact uses real form submission state and preserves content and key on retry",
    async () => {
      await page.goto(`${baseURL}/?view=custom`)
      await page
        .getByRole("textbox", { name: "Event type", exact: true })
        .fill("Synthetic community event")
      await page
        .getByRole("textbox", { name: "Email address", exact: true })
        .fill(account.email)
      await page
        .getByRole("textbox", { name: "About your event", exact: true })
        .fill("Synthetic message for the form verification.")
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await noHorizontalOverflow()
        await expect(
          page.getByRole("textbox", { name: "Email address", exact: true }),
        ).toHaveClass(/tds-input/u)
        await expect(
          page.getByRole("textbox", { name: "About your event", exact: true }),
        ).toHaveClass(/tds-textarea/u)
        await page.screenshot({
          path: resolvePath(evidence, `contact-${width}.png`),
          fullPage: true,
        })
      }
      contactMode = "fail"
      await page
        .getByRole("button", { name: "Send enquiry", exact: true })
        .click()
      await expect(page.getByRole("alert")).toContainText("could not be sent")
      await expect(
        page.getByRole("textbox", { name: "About your event", exact: true }),
      ).toHaveValue("Synthetic message for the form verification.")
      contactMode = "success"
      await page
        .getByRole("button", { name: "Send enquiry", exact: true })
        .click()
      await expect(page.getByRole("status")).toContainText(
        "Your enquiry has been sent",
      )
      expect(messages.length).toBe(2)
      expect(messages[0].requestId).toBe(messages[1].requestId)
      await expect(
        page.getByRole("textbox", { name: "About your event", exact: true }),
      ).toHaveValue("")
    },
  )
  await check(
    "Unavailable contact service disables sending without a fake success",
    async () => {
      contactAvailable = false
      const before = messages.length
      await page.reload()
      await expect(
        page.getByRole("button", { name: "Send enquiry", exact: true }),
      ).toBeDisabled()
      await expect(page.getByRole("status")).toContainText(
        "temporarily unavailable",
      )
      expect(messages.length).toBe(before)
      contactAvailable = true
    },
  )
  await check(
    "Hebrew contact layout stays bounded and uses translated canonical fields",
    async () => {
      await page.evaluate(() => localStorage.setItem("i18nextLng", "he"))
      await page.reload()
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(
        page.getByRole("button", { name: "שליחת פנייה", exact: true }),
      ).toBeEnabled()
      await noHorizontalOverflow()
      await page.screenshot({
        path: resolvePath(evidence, "contact-he-390.png"),
        fullPage: true,
      })
    },
  )
  for (const creation of creations) {
    expect(creation.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  }
  expect(errors).toEqual([])
  writeFileSync(
    resolvePath(evidence, "receipt.json"),
    JSON.stringify(
      {
        passed: true,
        scope:
          "actual components with synthetic HTTP; provider transport separately verified by route tests; no real email or account mutation",
        cases,
        errors,
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page
    .screenshot({ path: resolvePath(evidence, "failure.png"), fullPage: true })
    .catch(() => undefined)
  writeFileSync(
    resolvePath(evidence, "receipt.json"),
    JSON.stringify(
      { passed: false, cases, errors, failure: String(error) },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser.close()
}
