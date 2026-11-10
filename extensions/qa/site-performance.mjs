// Read-only public lab audit; no login, signup, checkout or game mutations.
import { chromium, devices } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const phase = process.argv[2] ?? "before"

if (!/^[a-z-]+$/u.test(phase)) {
  throw new Error("Invalid phase")
}

const origin = process.env.TADAZZ_PERF_ORIGIN ?? "https://tadazz.com"
const out = fileURLToPath(
  new URL(
    "../../docs/extensions/qa-evidence/unified-site-20261110/performance/",
    import.meta.url,
  ),
)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge" })
const samples = []

try {
  for (const limited of [false, true]) {
    for (const route of ["/", "/login", "/studio/games"]) {
      const context = await browser.newContext({
        ...(limited
          ? devices["iPad Pro 11"]
          : { viewport: { width: 1440, height: 900 } }),
      })
      const page = await context.newPage()
      const session = await context.newCDPSession(page)
      await session.send("Network.enable")
      await session.send("Network.setCacheDisabled", { cacheDisabled: true })
      await session.send("Performance.enable")

      if (limited) {
        await session.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 1_600_000 / 8,
          uploadThroughput: 750_000 / 8,
        })
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      }

      const responses = []
      page.on("response", (response) => {
        responses.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
          headers: Object.fromEntries(
            Object.entries(response.headers()).filter(([key]) =>
              [
                "content-encoding",
                "cache-control",
                "content-type",
                "content-length",
              ].includes(key),
            ),
          ),
        })
      })
      await page.addInitScript(() => {
        window.__sitePerf = { lcp: null, cls: 0, longTasks: [] }
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__sitePerf.lcp = entry.startTime
          }
        }).observe({ type: "largest-contentful-paint", buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__sitePerf.cls += entry.value
            }
          }
        }).observe({ type: "layout-shift", buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__sitePerf.longTasks.push(entry.duration)
          }
        }).observe({ type: "longtask", buffered: true })
      })
      const started = Date.now()
      await page.goto(origin + route, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      })
      await page
        .locator(route === "/" ? "h1" : "input[type=email]")
        .first()
        .waitFor({ timeout: 90000 })
      const readyMs = Date.now() - started
      await page.waitForTimeout(2000)
      const metrics = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType("navigation")
        const resources = performance
          .getEntriesByType("resource")
          .map((entry) => ({
            path: new URL(entry.name).pathname,
            type: entry.initiatorType,
            duration: entry.duration,
            transferBytes: entry.transferSize,
            encodedBytes: entry.encodedBodySize,
            decodedBytes: entry.decodedBodySize,
          }))

        return {
          ...window.__sitePerf,
          ttfbMs: nav.responseStart - nav.startTime,
          domContentLoadedMs: nav.domContentLoadedEventEnd,
          fcpMs:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? null,
          totalBlockingMs: window.__sitePerf.longTasks.reduce(
            (sum, duration) => sum + Math.max(0, duration - 50),
            0,
          ),
          resources,
        }
      })
      const cdp = await session.send("Performance.getMetrics")
      const sample = {
        route,
        profile: limited
          ? "iPad 1.6Mbps/150ms RTT/4x CPU"
          : "desktop unthrottled",
        readyMs,
        finalPath: new URL(page.url()).pathname,
        ...metrics,
        transferBytes: metrics.resources.reduce(
          (sum, resource) => sum + resource.transferBytes,
          0,
        ),
        scriptDecodedBytes: metrics.resources
          .filter((resource) => /\.m?js$/u.test(resource.path))
          .reduce((sum, resource) => sum + resource.decodedBytes, 0),
        taskDurationSeconds: cdp.metrics.find(
          (metric) => metric.name === "TaskDuration",
        )?.value,
        responses,
      }
      samples.push(sample)
      writeFileSync(
        join(out, `${phase}.json`),
        `${JSON.stringify(
          { origin, phase, labOnly: true, fieldInpMeasured: false, samples },
          null,
          2,
        )}\n`,
      )
      console.log(
        JSON.stringify({
          route,
          profile: sample.profile,
          readyMs,
          fcpMs: sample.fcpMs,
          lcpMs: sample.lcp,
          ttfbMs: sample.ttfbMs,
          cls: sample.cls,
          blockingMs: sample.totalBlockingMs,
          scriptDecodedBytes: sample.scriptDecodedBytes,
          transferBytes: sample.transferBytes,
        }),
      )
      await context.close()
    }
  }
} finally {
  await browser.close()
}
