import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview/lottie",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.setDefaultTimeout(20000)
const responses = [],
  errors = [],
  checks = []
page.on("response", (r) => {
  if (/lottie|overlay|wasm|Opening-4/.test(r.url())) {
    responses.push({ url: r.url(), status: r.status() })
  }
})
page.on("pageerror", (e) => errors.push(e.message))
let result = {}

try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  await page.goto("http://127.0.0.1:3180/manager?lng=en")
  await page.locator("input[type=password]").fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await page.waitForURL("**/manager/config")
  await page.goto("http://127.0.0.1:3180/manager/quizz?lng=en")
  await page.getByTestId("editor-save-btn").waitFor()
  await page.getByTestId("studio-card-kind-select").click()
  await page.getByRole("option", { name: "Opening", exact: true }).click()
  await page.getByTestId("studio-add-card-btn").click()
  await page.getByTestId("scene-preview-mode-layers").click()
  await page.getByTestId("studio-overlay-add-btn").click()

  if (
    (await page.locator('[data-testid^="studio-overlay-asset-"]').count()) === 0
  ) {
    await expect(page.getByTestId("studio-lottie-catalog-panel")).toBeVisible()
    checks.push("No catalog asset opens actual library/upload picker")
    await page
      .getByTestId("studio-overlay-file-input")
      .setInputFiles(
        path.resolve(
          "../web/public/tadazz-show/opening/TADAZZ-Opening-4-5s.json",
        ),
      )
  }

  const asset = page.locator('[data-testid^="studio-overlay-asset-"]').last()
  await asset.waitFor()
  const id = (await asset.getAttribute("data-testid")).replace(
    "studio-overlay-asset-",
    "",
  )
  const initial = await asset.inputValue()
  const player = page.getByTestId("cinematic-overlay-player-" + id)
  await expect(player).toHaveAttribute("data-lottie-ready", "true", {
    timeout: 25000,
  })
  checks.push("Selected animation loads actual WASM engine")
  const slider = page.getByTestId("studio-preview-scrub-slider")
  await slider.fill("1000")
  await expect
    .poll(async () => Number(await player.getAttribute("data-lottie-frame")))
    .toBeGreaterThan(0)
  const frame1 = Number(await player.getAttribute("data-lottie-frame"))
  await slider.fill("2000")
  await expect
    .poll(async () => Number(await player.getAttribute("data-lottie-frame")))
    .toBeGreaterThan(frame1)
  const frame2 = Number(await player.getAttribute("data-lottie-frame"))
  checks.push("Controlled scrub advances actual rendered frames")
  await asset.fill("/media/deliberately-missing-editor-lottie.json")
  const err = page
    .getByTestId("cinematic-overlay-" + id)
    .locator("[data-lottie-error]")
  await expect(err).toHaveAttribute("data-lottie-error", /deliberately-missing/)
  const before = await err.getAttribute("data-lottie-error")
  await asset.fill("/tadazz-show/opening/TADAZZ-Opening-4-5s.json")
  await expect(player).toHaveAttribute("data-lottie-ready", "true", {
    timeout: 25000,
  })
  await expect(err).toHaveCount(0)
  checks.push("Bad source recovers immediately after valid source correction")
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r))
    })
  })
  await page
    .getByTestId("studio-scene-preview-stage")
    .screenshot({ path: path.join(out, "after-fix.png") })
  result = {
    ok: true,
    initial,
    frame1,
    frame2,
    before,
    recovered: true,
    checks,
    responses,
    errors,
  }
  expect(errors).toEqual([])
} catch (e) {
  result = { ok: false, error: String(e), checks, responses, errors }
  await page
    .screenshot({
      path: path.join(out, "after-fix-failure.png"),
      fullPage: true,
    })
    .catch(() => {
      /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
    })
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, "after-fix.json"),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  await browser.close()
}
