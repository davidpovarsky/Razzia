// Browser regression against the actual Tadazz site bundle/dev entry.
// Only the HTTP data is synthetic: no real account, message or game is created.
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const require = createRequire(
  new URL("../../packages/e2e/package.json", import.meta.url),
)
const { chromium, expect } = require("@playwright/test")
const baseURL = process.env.TADAZZ_UX_BASE_URL ?? "http://127.0.0.1:4371"
const evidence = resolve(
  process.env.TADAZZ_UX_EVIDENCE ?? "extensions/qa/.ux-site-evidence",
)
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  channel:
    process.env.TADAZZ_BROWSER_CHANNEL ??
    (process.platform === "win32" ? "msedge" : undefined),
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
  id: "ux-site-account",
  email: "ux-site@example.invalid",
  verified: true,
}
const token = `test.${Buffer.from(JSON.stringify({ sub: account.id, role: "manager", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`
const games = [
  { id: "ux-alpha", subject: "Alpha synthetic game" },
  { id: "ux-zebra", subject: "Zebra synthetic game" },
]
let createMode = "success"
let createCount = 0
let forgotCount = 0
let releasePending = () => {
  /* The held synthetic request installs its release callback before it is used. */
}
let pendingReached = () => {
  /* The pending-request observer is installed before the held scenario begins. */
}
let listFailure = false

await page.addInitScript(
  ({ token: receivedToken }) => {
    localStorage.setItem("token", receivedToken)
    localStorage.setItem("i18nextLng", "en")
    window.__uxPageShows = []
    addEventListener("pageshow", (event) => {
      window.__uxPageShows.push({ persisted: event.persisted, at: Date.now() })
    })
  },
  { token },
)
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url())
  const body = (json, status = 200) => route.fulfill({ status, json })

  if (url.pathname === "/api/auth/mode") {
    return body({ accountsEnabled: true })
  }

  if (url.pathname === "/api/accounts/me") {
    return body(account)
  }

  if (url.pathname === "/api/auth/session") {
    return body({
      token,
      clientId: account.id,
      role: "manager",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
  }

  if (url.pathname === "/api/quizz") {
    return body(
      listFailure ? { error: "synthetic-unavailable" } : { quizz: games },
      listFailure ? 503 : 200,
    )
  }

  if (url.pathname === "/api/results") {
    return body({ results: [] })
  }

  if (url.pathname === "/api/billing/config") {
    return body({ enabled: false })
  }

  if (url.pathname === "/api/accounts/forgot") {
    forgotCount += 1
    expect(route.request().postDataJSON().email).toBe(account.email)

    return body({})
  }

  if (url.pathname === "/api/games" && route.request().method() === "POST") {
    createCount += 1

    if (createMode === "held") {
      pendingReached()
      await new Promise((resolvePending) => {
        releasePending = resolvePending
      })

      return body({ gameId: "ux-stale-room", inviteCode: "123456" }).catch(
        () => {
          /* The stale-request scenario may close its page before this delayed reply. */
        },
      )
    }

    if (createMode === "fail") {
      return body({ error: "synthetic-capacity-unavailable" }, 503)
    }

    return body({ gameId: "ux-acknowledged-room", inviteCode: "123456" })
  }

  return body({ error: "synthetic-unsupported" }, 404)
})
await page.route("**/party/manager/ux-acknowledged-room", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html><head><title>QA host destination</title></head><body><h1>QA host destination</h1></body></html>",
  }),
)

async function check(name, run) {
  await run()
  cases.push({ name, passed: true })
  console.log(`PASS ${name}`)
}

try {
  await check(
    "Sort aligns with toolbar actions, stays accessible and sorts the real cards",
    async () => {
      await page.goto(`${baseURL}/studio/games`)
      const sort = page.getByRole("combobox", { name: "Sort", exact: true })
      await expect(sort).toBeVisible()
      await expect(page.locator(".list-toolbar .tds-field-label")).toHaveCount(
        0,
      )
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 })

        if (width <= 760) {
          await expect
            .poll(() =>
              page
                .locator(".sidebar")
                .evaluate((node) => node.getBoundingClientRect().right),
            )
            .toBeLessThanOrEqual(0)
          await expect(
            page.getByRole("button", {
              name: "Toggle navigation",
              exact: true,
            }),
          ).toBeVisible()
        }

        const row = await page
          .locator(".list-toolbar .button-row")
          .evaluate((node) =>
            Array.from(node.children).map((child) => {
              const control = child.matches("button,select")
                ? child
                : child.querySelector("select")
              const rect = control.getBoundingClientRect()

              return { top: rect.top, height: rect.height, left: rect.left }
            }),
          )
        for (const control of row) {
          const peers = row.filter(
            (other) =>
              Math.abs(
                other.top +
                  other.height / 2 -
                  (control.top + control.height / 2),
              ) <
              Math.max(other.height, control.height) / 3,
          )
          expect(
            Math.max(...peers.map((peer) => peer.height)) -
              Math.min(...peers.map((peer) => peer.height)),
          ).toBeLessThanOrEqual(2)
          expect(
            Math.max(...peers.map((peer) => peer.top)) -
              Math.min(...peers.map((peer) => peer.top)),
          ).toBeLessThanOrEqual(2)
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        await page.screenshot({
          path: resolve(evidence, `sort-${width}.png`),
          fullPage: true,
          animations: "disabled",
        })
      }
      await sort.selectOption("desc")
      await expect(
        page.locator("article[data-game-id]").first(),
      ).toHaveAttribute("data-game-id", "ux-zebra")
    },
  )

  await check(
    "Contact uses canonical accessible fields without claiming to send",
    async () => {
      await page.goto(`${baseURL}/?view=custom`)
      const email = page.getByRole("textbox", {
        name: "Email address",
        exact: true,
      })
      await expect(email).toHaveClass(/tds-input/u)
      await expect(
        page.getByRole("textbox", { name: "Event type", exact: true }),
      ).toHaveClass(/tds-input/u)
      await expect(
        page.getByRole("textbox", { name: "About your event", exact: true }),
      ).toHaveClass(/tds-textarea/u)
      await expect(
        page.getByRole("button", {
          name: "Contact service unavailable",
          exact: true,
        }),
      ).toBeDisabled()
      await email.fill(account.email)
      await email.focus()
      expect(
        await email.evaluate((node) => getComputedStyle(node).outlineStyle),
      ).not.toBe("none")
      await page.screenshot({
        path: resolve(evidence, "contact-390.png"),
        fullPage: true,
        animations: "disabled",
      })
    },
  )

  await check(
    "Account email submission retains the real forgot-to-reset UI flow",
    async () => {
      await page.goto(`${baseURL}/forgot`)
      const email = page.getByRole("textbox", {
        name: "Email address",
        exact: true,
      })
      await expect(email).toHaveClass(/tds-input/u)
      await email.fill(account.email)
      await page
        .getByRole("button", { name: "Send reset code", exact: true })
        .click()
      await expect(
        page.getByRole("textbox", { name: "Six-digit code", exact: true }),
      ).toHaveClass(/tds-input/u)
      await expect(
        page.getByLabel("New password", { exact: true }),
      ).toHaveClass(/tds-input/u)
      expect(forgotCount).toBe(1)
      await page.screenshot({
        path: resolve(evidence, "account-reset-390.png"),
        fullPage: true,
        animations: "disabled",
      })
    },
  )

  await check(
    "Prepare follows browser Back/Forward and query-selected games",
    async () => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${baseURL}/studio/prepare?quiz=ux-alpha`)
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveValue("ux-alpha")
      await page.goto(`${baseURL}/studio/prepare?quiz=ux-zebra`)
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveValue("ux-zebra")
      await page.goBack({ waitUntil: "commit" })
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveValue("ux-alpha")
      await page.goForward({ waitUntil: "commit" })
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveValue("ux-zebra")
      expect(createCount).toBe(0)
    },
  )

  await check(
    "Successful room handoff returns from history without permanent busy state",
    async () => {
      await page
        .getByRole("button", { name: "Open show room", exact: true })
        .click()
      await expect(page).toHaveURL(/\/party\/manager\/ux-acknowledged-room$/u)
      expect(createCount).toBe(1)
      await page.goBack({ waitUntil: "commit" })
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toBeEnabled()
      await expect(
        page.getByRole("button", { name: /^(Open show room|Open host)$/u }),
      ).toBeEnabled()
      await expect(
        page.getByRole("button", { name: "Please wait…", exact: true }),
      ).toHaveCount(0)
      expect(createCount).toBe(1)
      cases.push({
        name: "Observed history pageshow events",
        events: await page.evaluate(() => window.__uxPageShows),
      })
    },
  )

  await check(
    "Restored page cancels pending creation, ignores stale response and never auto-reposts",
    async () => {
      await page.goto(`${baseURL}/studio/prepare?quiz=ux-alpha`)
      createMode = "held"
      const reached = new Promise((resolveReached) => {
        pendingReached = resolveReached
      })
      await page
        .getByRole("button", { name: "Open show room", exact: true })
        .evaluate((button) => {
          button.click()
          button.click()
        })
      await reached
      expect(createCount).toBe(2)
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toBeDisabled()
      await page.evaluate(() => {
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        )
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        )
      })
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toBeEnabled()
      await expect(
        page.getByRole("button", { name: "Open show room", exact: true }),
      ).toBeEnabled()
      releasePending()
      await expect(page).toHaveURL(/\/studio\/prepare\?quiz=ux-alpha$/u)
      expect(createCount).toBe(2)
      createMode = "fail"
      await page
        .getByRole("button", { name: "Open show room", exact: true })
        .click()
      await expect(page.getByRole("alert")).toContainText("Unable to start")
      await expect(
        page.getByRole("button", { name: "Open show room", exact: true }),
      ).toBeEnabled()
      expect(createCount).toBe(3)
    },
  )

  await check(
    "Missing game-list data exposes a working Retry action",
    async () => {
      listFailure = true
      await page.goto(`${baseURL}/studio/prepare?quiz=ux-alpha`)
      await expect(page.getByRole("alert")).toContainText(
        "Could not load your games",
        { timeout: 15000 },
      )
      listFailure = false
      await page.getByRole("button", { name: "Retry", exact: true }).click()
      await expect(
        page.getByRole("combobox", { name: "My Games", exact: true }),
      ).toHaveValue("ux-alpha")
      await expect(
        page.getByRole("button", { name: "Open show room", exact: true }),
      ).toBeEnabled()
    },
  )
  expect(errors).toEqual([])
  writeFileSync(
    resolve(evidence, "receipt.json"),
    JSON.stringify({ passed: true, cases, errors }, null, 2),
  )
} catch (error) {
  await page
    .screenshot({ path: resolve(evidence, "failure.png"), fullPage: true })
    .catch(() => {
      /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
    })
  writeFileSync(
    resolve(evidence, "receipt.json"),
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
