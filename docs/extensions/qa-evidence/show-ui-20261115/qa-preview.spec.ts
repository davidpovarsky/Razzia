import playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import { request as httpRequest } from "node:http"
import { writeFile } from "node:fs/promises"
const { expect, test } = playwright as unknown as typeof Playwright

const events = new WeakMap<object, Array<Record<string, unknown>>>()
test.beforeEach(async ({ page }) => {
  const log: Array<Record<string, unknown>> = []
  events.set(page, log)
  page.on("console", (message) => { if (log.length < 2000) log.push({ type: "console", level: message.type(), text: message.text() }) })
  page.on("pageerror", (error) => { if (log.length < 2000) log.push({ type: "pageerror", message: error.message, stack: error.stack }) })
  page.on("request", (request) => { if (log.length < 2000) log.push({ type: "request", url: request.url(), resourceType: request.resourceType() }) })
  page.on("requestfailed", (request) => { if (log.length < 2000) log.push({ type: "requestfailed", url: request.url(), error: request.failure()?.errorText }) })
  await page.addInitScript(() => {
    ;(window as any).__qaCsp = []
    window.addEventListener("securitypolicyviolation", (event) => { if ((window as any).__qaCsp.length < 2000) (window as any).__qaCsp.push({ directive: event.effectiveDirective, blocked: event.blockedURI }) })
  })
})
test.afterEach(async ({ page }, info) => {
  const csp = await page.evaluate(() => (window as any).__qaCsp ?? []).catch(() => [])
  const requests = await page.evaluate(async () => (await fetch("/qa/requests")).json()).catch(() => [])
  const path = info.outputPath("qa-browser-events.json")
  await writeFile(path, JSON.stringify({ events: events.get(page) ?? [], csp, requests }, null, 2))
  await info.attach("qa-browser-events.json", { path, contentType: "application/json" })
})

const locales = ["en", "fr", "de", "es", "it", "ja", "tr", "vi"] as const
for (const role of ["manager", "spectator"] as const) {
  for (const locale of locales) {
    test(`paused question and results: ${role}/${locale}`, async ({ page }) => {
      await page.goto("/")
      await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
      for (const phase of ["question", "results"] as const) {
        await page.evaluate(({ role, locale, phase }) => (window as any).__showPreviewQa.show({ role, locale, phase, paused: true, elapsed: phase === "results" ? 20000 : 5000 }), { role, locale, phase })
        await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 1")
        if (phase === "results") await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
      }
      expect(await page.evaluate(() => (window as any).__showPreviewQa.failures())).toBe(0)
    })
  }
}

test("paused voting remains stable, resumes, and reuses the stage for q2", async ({ page }) => {
  test.setTimeout(60000)
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "voting", paused: true, elapsed: 5000 }))
  const timer = page.getByTestId("tadazz-timer").first()
  await expect(timer).toBeVisible()
  const before = await timer.textContent()
  await page.waitForTimeout(1200)
  expect(await timer.textContent()).toBe(before)
  await page.evaluate(() => {
    ;(window as any).__initialPreviewStage = (window as any).__showPreviewQa.stage()
    return (window as any).__showPreviewQa.show({ phase: "voting", paused: false, elapsed: 5000 })
  })
  await expect.poll(async () => timer.textContent(), { timeout: 5000 }).not.toBe(before)
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "question", question: 1, paused: false, elapsed: 6000 }))
  await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 2", { timeout: 15000 })
  expect(await page.evaluate(() => (window as any).__initialPreviewStage === (window as any).__showPreviewQa.stage())).toBe(true)
  expect(await page.evaluate(() => (window as any).__showPreviewQa.failures())).toBe(0)
})

test("the five current-card phases render with zero synthetic voters", async ({ page }, info) => {
  test.setTimeout(60000)
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  await page.evaluate(() => { (window as any).__qaSfx = 0; window.addEventListener("tadazz:sfx", () => { (window as any).__qaSfx += 1 }) })
  const decoded = await page.evaluate(async () => {
    const paths = ["/tadazz-show/motion/backdrop.webp", "/tadazz-show/v4/question-bg.webp", "/tadazz-show/v4/show-stage.webp", "/tadazz-show/story/84acdb923677d591.webp", "/tadazz-show/v4/tadazz-brand-logo.png", "/tadazz-show/second-library/teaser-screen-source.jpg"]
    return Promise.all(paths.map(async (path) => {
      const response = await fetch(path)
      if (!response.ok) throw new Error(`decode fetch ${response.status}: ${path}`)
      const blob = await response.blob(), image = await createImageBitmap(blob)
      const result = { path, mime: blob.type, bytes: blob.size, width: image.width, height: image.height }
      image.close()
      return result
    }))
  })
  expect(decoded.map((image) => [image.width, image.height])).toEqual([[1920,1080],[1920,1080],[1920,1080],[1920,1080],[1983,793],[2048,1152]])
  await info.attach("qa-decoded-images.json", { body: Buffer.from(JSON.stringify(decoded, null, 2)), contentType: "application/json" })
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "question", paused: false }))
  await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 1")
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "answerCards", paused: false }))
  await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "voting", paused: false }))
  await expect(page.getByTestId("tadazz-timer").first()).toBeVisible()
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "voteLocked", paused: false, elapsed: 20000 }))
  await expect(page.getByTestId("tadazz-status").first()).toContainText(/locked/i)
  await page.evaluate(() => (window as any).__showPreviewQa.show({ phase: "results", paused: false, elapsed: 20000 }))
  await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  expect(await page.evaluate(() => (window as any).__showPreviewQa.failures())).toBe(0)
  expect(await page.evaluate(() => (window as any).__qaSfx)).toBe(0)
  const requests = await page.evaluate(async () => (await fetch("/qa/requests")).json())
  expect(requests.filter((entry: { status: number }) => entry.status !== 200)).toEqual([])
})

for (const phase of ["answerCards", "voteLocked"] as const) {
  test(`initial paused ${phase} renders current card`, async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
    await page.evaluate((phase) => (window as any).__showPreviewQa.show({ phase, paused: true }), phase)
    await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 1")
    await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  })
}

test("pause during voting entry and supersede a lock with q2", async ({ page }) => {
  test.setTimeout(60000)
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  await page.evaluate(async () => {
    await (window as any).__showPreviewQa.show({ phase: "voting", paused: false, elapsed: 5000 })
    await (window as any).__showPreviewQa.show({ phase: "voting", paused: true, elapsed: 5000 })
  })
  const timer = page.getByTestId("tadazz-timer").first()
  await expect(timer).toBeVisible()
  const stopped = await timer.textContent()
  await page.waitForTimeout(1200)
  expect(await timer.textContent()).toBe(stopped)
  await page.evaluate(async () => {
    await (window as any).__showPreviewQa.show({ phase: "voteLocked", paused: false, elapsed: 20000 })
    await (window as any).__showPreviewQa.show({ phase: "question", question: 1, paused: false, elapsed: 6000 })
  })
  await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 2", { timeout: 15000 })
  await page.waitForTimeout(500)
  await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 2")
  expect(await page.evaluate(() => (window as any).__showPreviewQa.failures())).toBe(0)
})

test("browser rejects mismatched script and style integrity", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  const result = await page.evaluate(async () => {
    const config = await (await fetch("/qa/config")).json()
    const check = (element: HTMLScriptElement | HTMLLinkElement, parent: HTMLElement | ShadowRoot) => new Promise<boolean>((resolve) => {
      element.onload = () => resolve(false)
      element.onerror = () => resolve(true)
      parent.append(element)
    })
    const script = document.createElement("script")
    script.type = "module"; script.src = "/qa/integrity-decoy.js"; script.integrity = config.jsIntegrity; script.crossOrigin = "anonymous"
    const link = document.createElement("link")
    link.rel = "stylesheet"; link.href = "/qa/integrity-decoy.css"; link.integrity = config.cssIntegrity; link.crossOrigin = "anonymous"
    return Promise.all([check(script, document.head), check(link, (window as any).__showPreviewQa.shadow())])
  })
  expect(result).toEqual([true, true])
})

test("fixture denies normalized or encoded native paths", async () => {
  const address = new URL(process.env.TADAZZ_QA_BASE ?? "")
  const get = (path: string) => new Promise<number>((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: Number(address.port), path, method: "GET" }, (res) => { res.resume(); resolve(res.statusCode ?? 0) })
    req.on("error", reject)
    req.end()
  })
  expect(await get("/tadazz-show/v4/../v4/question-bg.webp")).toBe(400)
  expect(await get("/tadazz-show/v4/%71uestion-bg.webp")).toBe(400)
  expect(await get("/tadazz-show/v4/question-bg.webp?alternate=1")).toBe(404)
})

test("diagnostic: disposal stops the mounted stage and emits no global SFX", async ({ page }, info) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  await page.evaluate(async () => {
    ;(window as any).__qaSfxCount = 0
    window.addEventListener("tadazz:sfx", () => { (window as any).__qaSfxCount += 1 })
    await (window as any).__showPreviewQa.show({ phase: "voting", paused: false, elapsed: 5000 })
  })
  await expect(page.getByTestId("tadazz-timer").first()).toBeVisible()
  const screenshot = info.outputPath("before-disposal.png")
  await page.screenshot({ path: screenshot })
  await info.attach("before-disposal.png", { path: screenshot, contentType: "image/png" })
  await page.evaluate(() => (window as any).__showPreviewQa.dispose())
  await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as any).__qaSfxCount)).toBe(0)
  await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
})

test("diagnostic: CSP blocks a data image", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  await page.evaluate(() => {
    const img = document.createElement("img")
    img.src = "data:image/png;base64,iVBORw0KGgo="
    document.body.append(img)
  })
  await expect.poll(() => page.evaluate(() => (window as any).__qaCsp.some((e: { directive: string; blocked: string }) => e.directive.startsWith("img-src") && e.blocked === "data"))).toBe(true)
})

test("diagnostic: native rendered font evidence for Japanese UI", async ({ page }, info) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  await page.evaluate(() => (window as any).__showPreviewQa.show({ locale: "ja", phase: "question", paused: true }))
  await expect(page.getByTestId("tadazz-question-panel")).toContainText("Synthetic question 1")
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const document = await cdp.send("DOM.getFlattenedDocument", { depth: -1, pierce: true })
  const node = document.nodes.find((n) => n.attributes?.some((v, i, a) => v === "data-testid" && a[i + 1] === "tadazz-question-panel"))
  if (!node) throw new Error("qa:font-node-not-found")
  const fonts = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId })
  const computed = await page.getByTestId("tadazz-question-panel").evaluate((el) => ({ family: getComputedStyle(el).fontFamily, text: el.textContent }))
  const report = info.outputPath("native-font-evidence.json")
  await writeFile(report, JSON.stringify({ computed, fonts, locale: "ja", fixtureLanguage: "en", userAgent: await page.evaluate(() => navigator.userAgent) }, null, 2))
  await info.attach("native-font-evidence.json", { path: report, contentType: "application/json" })
  expect(fonts.fonts.length).toBeGreaterThan(0)
})
