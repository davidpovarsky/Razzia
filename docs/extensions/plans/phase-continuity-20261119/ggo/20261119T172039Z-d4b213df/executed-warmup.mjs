import { chromium } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const origin = process.env.GGO_PREVIEW_ORIGIN
if (!origin || new URL(origin).hostname !== "127.0.0.1") throw new Error("Isolated local origin required")
const started = Date.now()
const deadline = started + 90000
const remaining = () => Math.max(1, deadline - Date.now())
const observations = { origin, startedUtc: new Date().toISOString(), status: "RUNNING", requestFailures: [], httpErrors: [], pageErrors: [], consoleErrors: [] }
const active = new Map()
const browser = await chromium.launch({ headless: true, executablePath: process.env.GGO_CHROME_PATH })
let page
let exitCode = 1
try {
  page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" })
  page.on("request", (request) => active.set(request, request.url()))
  page.on("requestfinished", (request) => active.delete(request))
  page.on("requestfailed", (request) => { active.delete(request); observations.requestFailures.push({ url: request.url(), failure: request.failure() }) })
  page.on("response", (response) => { if (response.status() >= 400) observations.httpErrors.push({ status: response.status(), url: response.url() }) })
  page.on("pageerror", (error) => observations.pageErrors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") observations.consoleErrors.push(message.text().slice(0, 1200)) })
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: remaining() })
  await page.locator(".header-demo").waitFor({ state: "visible", timeout: remaining() })
  observations.headerReadyMs = Date.now() - started
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: remaining() })
  observations.fontsReadyMs = Date.now() - started
  observations.status = "PASS"
  exitCode = 0
} catch (error) {
  observations.status = "FAIL"
  observations.error = String(error)
} finally {
  observations.elapsedMs = Date.now() - started
  observations.activeRequests = [...active.values()]
  if (page) {
    observations.pageUrl = page.url()
    observations.pageTitle = await page.title().catch(() => "")
    await page.screenshot({ path: resolve("qa/phase2/ggo-warmup-homepage.png"), fullPage: true, timeout: 10000 }).catch((error) => { observations.screenshotError = String(error) })
  }
  await writeFile(resolve("warmup.json"), JSON.stringify(observations, null, 2) + "\n")
  await browser.close()
}
console.log("GGO_WARMUP", JSON.stringify({ status: observations.status, elapsedMs: observations.elapsedMs, headerReadyMs: observations.headerReadyMs, requestFailures: observations.requestFailures.length, httpErrors: observations.httpErrors.length, pageErrors: observations.pageErrors.length, error: observations.error }))
process.exitCode = exitCode
