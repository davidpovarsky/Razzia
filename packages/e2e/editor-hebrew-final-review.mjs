import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-he-final",
)
fs.mkdirSync(out, { recursive: true })
const common = JSON.parse(
  fs.readFileSync("../../packages/web/src/locales/he/common.json", "utf8"),
)
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "he-IL",
})
const checks = [],
  snapshots = [],
  errors = []
page.on("pageerror", (e) => errors.push(e.message))
async function shot(name, focus) {
  if (focus) {
    await focus.scrollIntoViewIfNeeded()
  }

  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r))
    })
  })
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  })
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    text: document.body.innerText,
    controls: [...document.querySelectorAll("input,[data-testid]")]
      .filter((e) => e.getClientRects().length)
      .map((e) => ({
        id: e.getAttribute("data-testid"),
        type: e.getAttribute("type"),
        dir: getComputedStyle(e).direction,
        value: e.value ?? null,
      })),
  }))
  snapshots.push({ name, ...state })
  expect(state.lang).toBe("he")
  expect(state.dir).toBe("rtl")
  expect(state.scrollWidth).toBeLessThanOrEqual(state.width + 1)
  expect(state.text).not.toMatch(/\b(?:extensions|quizz|common|manager):[a-z]/u)
}
async function addScene(label) {
  await page.getByTestId("studio-card-kind-select").click()
  await page.getByRole("option", { name: label, exact: true }).click()
  await page.getByTestId("studio-add-card-btn").click()
  await expect(page.getByTestId("studio-scene-preview-stage")).toBeVisible()
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
    .fill("סקירת עברית סופית QA 18.11")
  await page
    .getByPlaceholder("הקלידו את השאלה…")
    .fill("מה התשובה הנכונה לשאלה QA מספר 12?")
  await page.getByTestId("answer-text-0").fill("עברית English 123")
  await page.getByTestId("answer-text-1").fill("English עברית 456")
  await expect(
    page.getByTestId("question-preview-native-stage"),
  ).not.toContainText(/\b(?:ROUND|QUESTION)\b/u)
  await page.setViewportSize({ width: 390, height: 1000 })
  await shot(
    "classic-question-preview-390",
    page.getByTestId("question-live-preview"),
  )
  await page.getByTestId("question-preview-aspect-16-9").focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByTestId("question-preview-aspect-4-3")).toBeFocused()
  await page.keyboard.press("ArrowLeft")
  await expect(page.getByTestId("question-preview-aspect-16-9")).toBeFocused()
  checks.push(
    "Exact Classic stage localized; numeric aspect keyboard direction matches LTR group within RTL editor",
  )

  await page.getByTestId("studio-tab-settings").click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await shot(
      `theme-settings-${width}`,
      page.getByTestId("show-theme-tadazz-classic"),
    )
  }
  await page
    .getByTestId("show-theme-razzia-original")
    .getByRole("button", { name: "שימוש בערכה הזו", exact: true })
    .click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await shot("theme-change-dialog-320", page.getByRole("alertdialog"))
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "שימוש בערכה הזו", exact: true })
    .click()
  await expect(page.getByRole("alertdialog")).not.toBeVisible()
  await page.getByTestId("studio-tab-questions").click()
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await shot(
      `razzia-question-preview-${width}`,
      page.getByTestId("question-live-preview"),
    )
  }
  checks.push(
    "Original Razzia theme selection renders actual Hebrew native preview; responsive theme cards reviewed",
  )

  await addScene("פתיחה")
  await expect(page.getByTestId("studio-preview-time-readout")).toHaveAttribute(
    "dir",
    "ltr",
  )
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await shot(
      `scene-opening-${width}`,
      page.getByTestId("studio-scene-preview-stage"),
    )
  }
  expect(await page.locator("body").innerText()).not.toContain("OPENING")
  expect(await page.locator("body").innerText()).not.toMatch(/\b[0-9]+s\b/u)
  checks.push(
    "Scene settings heading and duration localized; elapsed/total transport isolated LTR",
  )

  await addScene("תוצאות ביניים")
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await shot(
      `scene-interim-results-${width}`,
      page.getByTestId("studio-scene-preview-stage"),
    )
  }
  expect(await page.locator("body").innerText()).not.toContain("No votes yet")
  expect(await page.locator("body").innerText()).not.toContain("INTERIMRESULTS")
  checks.push(
    "Interim result empty state and scene title have no English leakage",
  )

  await page.getByTestId("editor-question-card-0").click()
  await page.getByTestId("answer-type-estimation").click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "שינוי מצב", exact: true })
    .click()
  const minimum = page.getByLabel("ערך מזערי", { exact: true })
  await minimum.fill("-20")
  await minimum.press("Tab")
  await expect(minimum).toHaveValue("-20")
  expect(await minimum.evaluate((e) => getComputedStyle(e).direction)).toBe(
    "ltr",
  )
  await shot("negative-estimation-320", minimum)
  checks.push(
    "Negative numeric input keeps -20 value and LTR sign/digit direction in Hebrew form",
  )

  await page.getByTestId("editor-exit-btn").click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await expect(page.getByRole("alertdialog")).toContainText("לצאת בלי לשמור?")
  expect(
    await page
      .getByRole("alertdialog")
      .evaluate((e) => getComputedStyle(e).direction),
  ).toBe("rtl")
  await shot("unsaved-exit-dialog-320", page.getByRole("alertdialog"))
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: common.cancel, exact: true })
    .click()
  await expect(page.getByTestId("editor-save-btn")).toBeVisible()
  await expect(minimum).toHaveValue("-20")
  checks.push(
    "Hebrew RTL unsaved-exit dialog fits320; cancel preserves edited numeric draft",
  )
  expect(errors).toEqual([])
  console.log(
    JSON.stringify(
      { ok: true, checks, screenshots: snapshots.length, errors },
      null,
      2,
    ),
  )
} catch (error) {
  await shot("failure").catch(() => {
    /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
  })
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
    JSON.stringify({ checks, errors, snapshots }, null, 2),
  )
  await browser.close()
}
