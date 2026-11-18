import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview/recap-cap",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(15000)
const checks = [],
  errors = []
let result = {}
page.on("pageerror", (e) => errors.push(e.message))
async function theme(id) {
  await page.getByTestId("studio-tab-settings").click()
  const button = page.getByTestId("show-theme-" + id).getByRole("button")
  if (await button.isEnabled()) await button.click()
  if (await page.getByRole("alertdialog").isVisible())
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Use this theme", exact: true })
      .click()
  await page.getByTestId("studio-tab-questions").click()
}
async function cap(id, max, value, name) {
  await theme(id)
  const input = page.getByTestId("recap-max-items-input")
  await expect(input).toHaveAttribute("max", String(max))
  await expect(input).toHaveValue(String(value))
  await expect(
    page.getByText("Questions Per Stage Page (1–" + max + ")", { exact: true }),
  ).toBeVisible()
  checks.push({ name, theme: id, max, value })
  await input.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true })
}
try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  await page.goto("http://127.0.0.1:3180/manager?lng=en")
  await page.locator("input[type=password]").fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await page.waitForURL("**/manager/config")
  await page.goto(
    "http://127.0.0.1:3180/manager/quizz/VgCunRFT_E04gIAMbv8CU?lng=en",
  )
  await page.getByTestId("editor-save-btn").waitFor()
  await theme("razzia-original")
  await page.getByTestId("studio-card-kind-select").click()
  await page.getByRole("option", { name: "Answer Recap", exact: true }).click()
  await page.getByTestId("studio-add-card-btn").click()
  await page.getByTestId("recap-max-items-input").fill("8")
  await cap("razzia-original", 8, 8, "original-eight")
  await cap("tadazz-classic", 6, 6, "classic-six-effective")
  await cap("razzia-original", 8, 8, "original-eight-preserved")
  await cap("tadazz-classic", 6, 6, "classic-limit")
  await page.getByTestId("recap-max-items-input").fill("8")
  await expect(page.getByTestId("recap-max-items-input")).toHaveValue("6")
  await cap("razzia-original", 8, 6, "explicit-edit-persists-six")
  expect(errors).toEqual([])
  result = { ok: true, checks, errors }
} catch (e) {
  result = { ok: false, error: String(e), checks, errors }
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {})
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  await browser.close()
}
