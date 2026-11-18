import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const evidenceName = process.env.TADAZZ_EDITOR_AUDIT_EVIDENCE ?? "visual"
if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(evidenceName)) {
  throw new Error("Invalid editor audit evidence basename")
}
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118",
  evidenceName,
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: "msedge" })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
})
const errors = [],
  httpErrors = [],
  checks = [],
  metrics = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("response", (r) => {
  if (r.status() >= 400)
    httpErrors.push({ status: r.status(), path: new URL(r.url()).pathname })
})
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    )
  })
try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  await page.goto("http://127.0.0.1:3180/manager?lng=en")
  await page.locator('input[type="password"]').fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await page.waitForURL("**/manager/config")
  await page.goto("http://127.0.0.1:3180/manager/quizz?lng=en")
  await page
    .locator('input[name="subject"]')
    .fill("Editor acceptance - 18 November")
  await page
    .locator('input[name$=".question"]')
    .fill("Which colour is the sky?")
  await page.getByTestId("answer-text-0").fill("Blue")
  await page.getByTestId("answer-text-1").fill("Green")
  await expect(page.getByTestId("answer-pick-image-0")).toHaveCount(0)
  await expect(page.getByTestId("question-live-preview")).toBeVisible()
  checks.push("Text-only hides image picker; live preview visible")
  await settle()
  await page.screenshot({
    path: path.join(out, "editor-en-desktop.png"),
    fullPage: true,
  })
  await page.getByTestId("answer-mode-0-image").click()
  await expect(page.getByTestId("answer-pick-image-0")).toBeVisible()
  checks.push("Image mode reveals image picker")
  await page.screenshot({
    path: path.join(out, "answer-image-mode.png"),
    fullPage: true,
  })
  await page.getByTestId("answer-mode-0-text").click()
  for (const tab of ["participants", "settings", "launch"]) {
    await page.getByTestId("studio-tab-" + tab).click()
    await expect(page.getByTestId("studio-card-type-bar")).toHaveCount(0)
    checks.push(tab + " hides unrelated card-kind bar")
  }
  for (const [width, height] of [
    [1920, 1080],
    [1280, 800],
    [1024, 768],
    [844, 768],
    [768, 768],
    [390, 844],
    [320, 640],
  ]) {
    await page.setViewportSize({ width, height })
    await settle()
    const navigation = await page
      .locator('[data-testid^="studio-tab-"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect()
          return {
            id: n.getAttribute("data-testid"),
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
          }
        }),
      )
    expect(navigation).toHaveLength(4)
    expect(
      navigation.every(
        (n) =>
          n.width > 50 &&
          n.left >= 0 &&
          n.right <= width + 1 &&
          n.top >= 0 &&
          n.bottom < height,
      ),
    ).toBeTruthy()
    metrics.push({ width, height, navigation })
    for (const tab of ["questions", "participants", "settings", "launch"]) {
      await page.getByTestId("studio-tab-" + tab).click()
      await settle()
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
        font: getComputedStyle(document.body).fontFamily,
        dir: document.documentElement.dir,
      }))
      if (m.scroll > m.width + 1)
        throw Error("Overflow " + tab + " " + JSON.stringify(m))
      await page.screenshot({
        path: path.join(out, tab + "-en-" + width + "x" + height + ".png"),
        fullPage: true,
      })
      metrics.push({ tab, width, height, ...m })
    }
    checks.push("Four tabs fit " + width + "x" + height)
  }
  await page.getByTestId("studio-tab-settings").click()
  const themeCards = page
    .getByTestId("show-theme-settings")
    .locator('[data-testid^="show-theme-"]')
    .filter({ has: page.locator("img") })
  const themeWidths = await themeCards
    .locator("p")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().width))
  expect(themeWidths.every((w) => w >= 150)).toBeTruthy()
  checks.push("Theme copy retains readable width at320")
  await page.getByTestId("studio-tab-questions").click()
  await page.getByTestId("answer-mode-0-image").click()
  await page.getByTestId("answer-pick-image-0").click()
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(0)
  checks.push("Image-only media picker omits irrelevant type filter")
  await page.screenshot({
    path: path.join(out, "image-picker-320x640.png"),
    fullPage: true,
  })
  expect(errors).toEqual([])
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify({ ok: true, checks, errors, httpErrors, metrics }, null, 2),
  )
  console.log(JSON.stringify({ ok: true, checks, errors, httpErrors }))
} catch (error) {
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {})
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(
      { ok: false, checks, errors, httpErrors, metrics, error: String(error) },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({ ok: false, checks, errors, error: String(error) }),
  )
  process.exitCode = 1
} finally {
  await browser.close()
}
