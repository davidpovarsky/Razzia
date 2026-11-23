import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview/native-scenes",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(15000)
const errors = [],
  checks = []
page.on("pageerror", (e) => errors.push(e.message))
let result = {}

try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  await page.goto("http://127.0.0.1:3180/manager?lng=en")
  await page.locator("input[type=password]").fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await page.waitForURL("**/manager/config")
  await page.goto(
    "http://127.0.0.1:3180/manager/quizz/VgCunRFT_E04gIAMbv8CU?lng=he",
  )
  await page.getByTestId("editor-save-btn").waitFor()
  await page.getByTestId("studio-tab-settings").click()
  const choose = page
    .getByTestId("show-theme-tadazz-classic")
    .getByRole("button")

  if (await choose.isEnabled()) {
    await choose.click()
  }

  if (await page.getByRole("alertdialog").isVisible()) {
    await page.getByRole("alertdialog").getByRole("button").last().click()
  }

  await page.getByTestId("studio-tab-questions").click()
  const lng = await page.locator("html").getAttribute("lang")
  const he = lng?.startsWith("he")
  for (const [kind, en, heName, test] of [
    ["countdown", "Countdown", "ספירה לאחור", "tadazz-screen-countdown"],
    ["answerRecap", "Answer Recap", "סיכום תשובות", "tadazz-screen-recap"],
  ]) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", { name: he ? heName : en, exact: true })
      .click()
    await page.getByTestId("studio-add-card-btn").click()
    await page
      .getByTestId("scene-title-input")
      .fill(
        kind === "countdown"
          ? "ספירה לאחור — בדיקה חיה"
          : "סיכום תשובות — בדיקה חיה",
      )
    const preview = page.getByTestId("studio-scene-preview-stage")
    await expect(
      preview.locator(
        "[data-native-application-preview][data-preview-ready=true]",
      ),
    ).toBeVisible()
    const inner = preview.getByTestId(test)
    await expect(inner).toBeVisible()

    if (kind === "countdown") {
      await page.getByTestId("studio-preview-scrub-slider").fill("7000")
      await expect(inner.locator(".tz-x-big")).toHaveText("3")
    }

    if (kind === "answerRecap") {
      for (const title of [
        "Which colour is the sky?",
        "Choose the primary colours",
        "Estimate the number",
      ]) {
        await expect(inner).toContainText(title)
      }
    }

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(async () => {
        await document.fonts.ready
        await new Promise((r) => {
          requestAnimationFrame(() => requestAnimationFrame(r))
        })
      })
      const b = await inner.boundingBox(),
        s = await preview.locator(".tzv4-stage").boundingBox()
      for (const k of ["x", "y", "width", "height"]) {
        expect(Math.abs(b[k] - s[k])).toBeLessThan(2)
      }
      await preview.screenshot({
        path: path.join(out, `${kind}-${width}.png`),
      })
      checks.push({
        kind,
        width,
        language: lng,
        dir: await preview
          .locator("[data-editor-preview-renderer]")
          .getAttribute("dir"),
        native: test,
        inner: b,
        stage: s,
      })
    }
  }
  expect(errors).toEqual([])
  result = { ok: true, checks, errors }
} catch (e) {
  result = { ok: false, error: String(e), checks, errors }
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {
      /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
    })
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  await browser.close()
}
