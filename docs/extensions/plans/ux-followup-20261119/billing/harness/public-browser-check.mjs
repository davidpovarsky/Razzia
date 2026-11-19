import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
const root = process.cwd()
const requireE2e = createRequire(path.join(root, "packages/e2e/package.json"))
const { chromium, expect, request } = requireE2e("@playwright/test")
const out = path.join(root, "docs/extensions/plans/ux-followup-20261119/billing/browser-final")
fs.mkdirSync(out, { recursive: true })
const proof = { kind: "isolated-billing-public-browser", startedAt: new Date().toISOString(), status: "RUNNING",
  externalProviderNetworkBlocked: true, productionChanged: false, realPaymentsMade: false, fixturePricesOnly: true,
  frontend: "actual Vite site composition", backend: "actual application and billing routes with isolated synthetic configuration", cases: [] }
const persist = () => fs.writeFileSync(path.join(out, "receipt.json"), JSON.stringify(proof, null, 2) + "\n")
const api = await request.newContext({ baseURL: "http://127.0.0.1:4393", extraHTTPHeaders: { "X-QA-Key": process.env.TADAZZ_PUBLIC_BILLING_QA_SECRET } })
const mode = async (value) => { const response = await api.post("/__qa/billing/mode", { data: { mode: value } }); expect(response.status()).toBe(200) }
let browser
try {
 browser = await chromium.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true })
 for (const spec of [
   { id: "disabled-desktop", mode: "disabled", width: 1440, locale: "en" },
   { id: "sandbox-mobile", mode: "sandbox", width: 390, locale: "en" },
   { id: "missing-token", mode: "missing-token", width: 768, locale: "en" },
   { id: "live-catalog-currency", mode: "live", width: 1440, locale: "en" },
   { id: "live-catalog-hebrew", mode: "live", width: 390, locale: "he" },
   { id: "error-retry", mode: "error", width: 390, locale: "en" },
 ]) {
  await mode(spec.mode)
  const context = await browser.newContext({ viewport: { width: spec.width, height: 900 }, locale: spec.locale, serviceWorkers: "block" })
  await context.addInitScript((language) => localStorage.setItem("i18nextLng", language), spec.locale)
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  const record = { ...spec, status: "RUNNING", pageErrors: [], consoleErrors: [], billingResponses: [], failedResponses: [] }
  proof.cases.push(record)
  page.on("pageerror", (error) => record.pageErrors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") record.consoleErrors.push({ text: message.text(), location: message.location() }) })
  page.on("response", (response) => { if (new URL(response.url()).pathname === "/api/billing/catalog") record.billingResponses.push(response.status()); if (response.status() >= 400) record.failedResponses.push({ url: response.url(), status: response.status() }) })
  try {
   await page.goto("http://127.0.0.1:4392/?view=pricing", { waitUntil: "domcontentloaded", timeout: 45000 })
   await expect(page.getByRole("heading", { level: 1, name: spec.locale === "he" ? "בחרו רישיון למופע שלכם." : "Choose a licence for your show." })).toBeVisible()
   await expect(page.locator("#site-capacity")).toHaveCount(0)
   await expect(page.locator("#site-tier")).toHaveCount(0)
   if (["disabled", "sandbox", "missing-token"].includes(spec.mode)) {
     await expect(page.getByRole("heading", { name: "New licences are not available yet." })).toBeVisible()
     await expect(page.locator("[data-billing-plan]")).toHaveCount(0)
     await expect(page.getByRole("link", { name: "Account & licences", exact: true })).toHaveAttribute("href", "/studio/account")
   } else {
     if (spec.mode === "error") {
       await expect(page.getByRole("alert")).toHaveText("We could not load the available licences. Please try again.")
       await mode("live")
       await page.getByRole("button", { name: "Try again", exact: true }).click()
     }
     await expect(page.locator("[data-billing-plan]")).toHaveCount(2)
     await expect(page.locator('[data-billing-plan="synthetic-upgrade"]')).toHaveCount(0)
     await expect(page.locator('[data-billing-plan="synthetic-single"]')).toContainText("45.99")
     await expect(page.locator('[data-billing-plan="synthetic-monthly"]')).toContainText("12.99")
     const currency = page.getByRole("combobox", { name: spec.locale === "he" ? "מטבע" : "Currency", exact: true })
     await expect(currency).toHaveClass(/tds-select/u)
     await expect(currency.locator("option")).toHaveCount(2)
     await currency.selectOption("USD")
     await expect(page.locator('[data-billing-plan="synthetic-single"]')).toContainText("50.99")
     await expect(page.locator('[data-billing-plan="synthetic-monthly"]')).toContainText("14.99")
     await expect(page.getByRole("link", { name: spec.locale === "he" ? "מעבר לחשבון ולרישיונות" : "Continue to account & licences", exact: true })).toHaveAttribute("href", "/studio/account")
     record.currencyChangeVerified = true
   }
   record.layout = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, direction: getComputedStyle(document.body).direction }))
   expect(record.layout.documentWidth).toBeLessThanOrEqual(spec.width + 1)
   expect(record.layout.bodyWidth).toBeLessThanOrEqual(spec.width + 1)
   if (spec.locale === "he") expect(await page.locator('[data-tadazz-site="marketing"]').evaluate((root) => getComputedStyle(root).direction)).toBe("rtl")
   await page.evaluate(() => document.fonts.ready)
   record.fonts = await page.evaluate(() => Array.from(document.fonts).filter((font) => font.status === "loaded").map((font) => font.family))
   expect(record.fonts.some((family) => family.includes("Rubik"))).toBe(true)
   expect(record.pageErrors).toEqual([])
   // Expected fixture service-error console is retained for the explicit retry case.
   const unexpected = record.consoleErrors.filter((message) => !(spec.mode === "error" && message.text.includes("503")))
   expect(unexpected).toEqual([])
   await page.screenshot({ path: path.join(out, spec.id + ".png"), fullPage: true })
   record.status = "PASS"
  } catch (error) {
   record.status = "FAIL"; record.error = error.message
   try { await page.screenshot({ path: path.join(out, spec.id + "-failure.png"), fullPage: true }) } catch {}
  } finally { await context.close(); persist() }
 }
} catch (error) { proof.error = error.message }
finally { if (browser) await browser.close(); await api.dispose(); proof.finishedAt = new Date().toISOString(); proof.status = !proof.error && proof.cases.length === 6 && proof.cases.every((item) => item.status === "PASS") ? "PASS" : "FAIL"; persist() }
console.log(JSON.stringify(proof))
process.exitCode = proof.status === "PASS" ? 0 : 1
