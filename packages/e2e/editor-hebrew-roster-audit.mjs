import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-he-roster",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "he-IL",
})
const checks = [],
  screens = [],
  errors = []
page.on("pageerror", (e) => errors.push(e.message))
async function snap(name, focus) {
  if (focus) await focus.scrollIntoViewIfNeeded()
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    )
  })
  await page.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
    animations: "disabled",
  })
  const data = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    text: document.body.innerText,
  }))
  screens.push({ name, ...data })
  expect(data.dir).toBe("rtl")
  expect(data.lang).toBe("he")
  expect(data.scrollWidth).toBeLessThanOrEqual(data.width + 1)
  expect(data.text).not.toMatch(
    /Participants & Phone|Player Name|Phone Number|Add Participant|errors:|roster\./u,
  )
}
async function hebrewError(id) {
  const e = page.getByTestId(id)
  await expect(e).toBeVisible()
  expect(await e.innerText()).toMatch(/[א-ת]/u)
  expect(await e.innerText()).not.toMatch(/\b(?:errors|roster)[.:]/u)
  return e
}
try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "he"))
  await page.goto("http://127.0.0.1:3180/manager?lng=he")
  await page.locator('input[type="password"]').waitFor({ timeout: 45000 })
  await page.locator('input[type="password"]').fill("e2e-password")
  await page.getByRole("button", { name: "שליחה", exact: true }).click()
  await page.waitForURL("**/manager/config", { timeout: 30000 })
  await page.goto("http://127.0.0.1:3180/manager/quizz?lng=he")
  await page.getByTestId("editor-save-btn").waitFor({ timeout: 45000 })
  await page
    .getByPlaceholder("כותרת החידון…")
    .fill("בדיקת רשימת QA — 18.11.2026")
  await page.getByTestId("studio-tab-participants").click()
  await expect(page.getByTestId("panel-roster")).toBeVisible()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await snap("roster-empty-" + width)
  }
  await page.getByTestId("roster-save-participant-btn").click()
  await snap("roster-name-error", await hebrewError("roster-form-error"))
  checks.push("Empty-name error is translated Hebrew")
  await page.getByTestId("roster-name-input").fill("משתתפת QA 18")
  await page.getByTestId("roster-phone-input").fill("broken")
  await page.getByTestId("roster-save-participant-btn").click()
  await snap("roster-phone-error", await hebrewError("roster-form-error"))
  checks.push("Invalid-phone error is translated Hebrew")
  await page.getByTestId("roster-phone-input").fill("+972500000001")
  expect(
    await page
      .getByTestId("roster-phone-input")
      .evaluate((e) => getComputedStyle(e).direction),
  ).toBe("ltr")
  expect(
    await page
      .getByTestId("roster-name-input")
      .evaluate((e) => getComputedStyle(e).direction),
  ).toBe("rtl")
  await page.getByTestId("roster-save-participant-btn").click()
  await expect(
    page.getByTestId("panel-roster").locator("tbody tr"),
  ).toHaveCount(1)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await snap(
      "roster-one-" + width,
      page.getByTestId("panel-roster").locator("table"),
    )
  }
  await page.getByTestId("roster-name-input").fill("משתתף כפול QA")
  await page.getByTestId("roster-phone-input").fill("+972500000001")
  await page.getByTestId("roster-save-participant-btn").click()
  await snap("roster-duplicate-error", await hebrewError("roster-form-error"))
  await expect(
    page.getByTestId("panel-roster").locator("tbody tr"),
  ).toHaveCount(1)
  checks.push(
    "Duplicate-phone error is translated; original row retained; phone LTR and names bidi-isolated",
  )
  await page.getByTestId("roster-search-input").fill("QA-NO-MATCH")
  await snap("roster-search-empty", page.getByTestId("roster-empty-state"))
  checks.push("No-match search shows translated empty state")
  await page.getByTestId("roster-search-input").fill("")
  await page.getByTestId("roster-file-input").setInputFiles({
    name: "hebrew-qa-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,phone\nדנה QA,broken\n", "utf8"),
  })
  await snap("roster-import-row-error", await hebrewError("import-row-error-2"))
  checks.push("CSV row diagnostic translated Hebrew")
  await page.getByTestId("roster-import-cancel-btn").click()
  await page.getByTestId("roster-file-input").setInputFiles({
    name: "hebrew-qa-header.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,other\nדנה QA,123\n", "utf8"),
  })
  await snap(
    "roster-import-fatal",
    await hebrewError("roster-import-fatal-error"),
  )
  checks.push("CSV fatal header diagnostic translated Hebrew")
  await page.getByTestId("roster-import-cancel-btn").click()
  await page.getByTestId("roster-file-input").setInputFiles({
    name: "hebrew-qa-valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,phone\nדנה QA,+972500000002\n", "utf8"),
  })
  await expect(page.getByTestId("roster-import-approve-btn")).toBeVisible()
  await snap("roster-import-valid", page.getByTestId("roster-import-preview"))
  await page.getByTestId("roster-import-approve-btn").click()
  await expect(
    page.getByTestId("panel-roster").locator("tbody tr"),
  ).toHaveCount(2)
  checks.push(
    "Valid Hebrew CSV preview and in-memory approval add second isolated QA row",
  )
  for (const tab of ["settings", "launch", "questions", "participants"]) {
    await page.getByTestId("studio-tab-" + tab).click()
    await expect(page.getByTestId("studio-tab-" + tab)).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  }
  await expect(page.getByTestId("panel-roster")).toBeVisible()
  await expect(
    page.getByTestId("panel-roster").locator("tbody tr"),
  ).toHaveCount(2)
  expect(errors).toEqual([])
  console.log(
    JSON.stringify(
      { ok: true, checks, errors, screens: screens.length },
      null,
      2,
    ),
  )
} catch (error) {
  await snap("failure").catch(() => {})
  console.log(
    JSON.stringify(
      {
        ok: false,
        error: String(error),
        checks,
        errors,
        body: (await page.locator("body").innerText()).slice(0, 5000),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify({ checks, errors, screens }, null, 2),
  )
  await browser.close()
}
