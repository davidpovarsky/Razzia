/* oxlint-disable no-await-in-loop -- Bound concurrency and measure ordered server transitions under load. */
import { test, expect, type Page } from "@playwright/test"
import {
  installRuntimeFixture,
  joinIdleRuntimePlayer,
} from "../utils/package-install"

async function waitForPhase(page: Page, phase: string) {
  await expect(
    page.frameLocator("[data-testid=package-runtime-frame]").locator("main"),
  ).toHaveAttribute("data-phase", phase)
}

test("concurrent package displays keep authoritative pause, results and reconnect", async ({
  page,
  request,
  browser,
  browserName,
}, info) => {
  test.setTimeout(420_000)
  const style = `${browserName}-load-${Date.now()}`
  const installed = await installRuntimeFixture(request, style)
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    installed.token,
  )
  await page.goto(`/party/manager/${installed.gameId}`)
  // Forty real Chromium clients qualify fanout. Forty WPE tabs exceed this
  // shared host's 8 GiB cap even at 400x300; retain that failed capacity probe
  // in evidence and qualify twenty WebKit clients at full 800x600 instead.
  const target = browserName === "webkit" ? 20 : 40
  const viewport = { width: 800, height: 600 }
  const viewers = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  })
  const displays: Page[] = []
  const loadMs: number[] = []
  const participant = await joinIdleRuntimePlayer(browser, installed.inviteCode)

  try {
    // Four concurrent navigations avoid a startup burst that measures the test
    // harness rather than steady-state renderer/socket fanout. All clients remain open.
    for (let batch = 0; batch < target / 4; batch += 1) {
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          const display = await viewers.newPage()
          displays.push(display)
          const started = Date.now()
          await display.goto(`/display/${installed.gameId}`)
          await expect(
            display.frameLocator("iframe").locator("main"),
          ).toHaveAttribute("data-theme-layout", style)
          loadMs.push(Date.now() - started)
        }),
      )
    }
    expect(displays).toHaveLength(target)
    expect(viewers.pages()).toHaveLength(target)
    const health = await Promise.all(
      [page, ...displays].map((surface) =>
        surface.evaluate(() => ({
          visibility: document.visibilityState,
          failure:
            document
              .querySelector("[data-runtime-error]")
              ?.getAttribute("data-runtime-error") ?? null,
        })),
      ),
    )
    await info.attach("runtime-pre-start-health", {
      body: JSON.stringify(health),
      contentType: "application/json",
    })
    expect(health.map((surface) => surface.failure)).toEqual(
      Array.from({ length: target + 1 }, () => null),
    )
    await page.bringToFront()
    await page.getByRole("button", { name: "Start", exact: true }).click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
      { timeout: 40_000 },
    )
    await page.getByTestId("host-pause-resume-btn").click()
    await Promise.all(
      displays.map(async (display) => {
        await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
          "data-game-paused",
          "true",
        )
        await waitForPhase(display, "voting")
        await expect(
          display.frameLocator("iframe").locator(".answers img"),
        ).toHaveCount(5)
      }),
    )
    const paused = await Promise.all(
      displays.map((display) =>
        display.frameLocator("iframe").locator("aside strong").innerText(),
      ),
    )
    expect(new Set(paused).size).toBe(1)
    await page.waitForTimeout(10_000)
    expect(
      await Promise.all(
        displays.map((display) =>
          display.frameLocator("iframe").locator("aside strong").innerText(),
        ),
      ),
    ).toEqual(paused)
    await page.getByTestId("host-pause-resume-btn").click()
    const transitionStarted = Date.now()
    await page.getByTestId("host-end-timer-btn").click()
    await Promise.all(
      displays.map((display) => waitForPhase(display, "results")),
    )
    const resultFanoutMs = Date.now() - transitionStarted
    await Promise.all(
      displays.map(async (display) => {
        await expect(
          display.frameLocator("iframe").locator(".answers strong"),
        ).toHaveText(["0%", "0%", "0%", "0%", "0%"])
        await expect(
          display.getByTestId("package-runtime-fallback"),
        ).toHaveCount(0)
      }),
    )
    const first = displays.at(0)

    if (!first) {
      throw new Error("No display")
    }

    await first.reload()
    await waitForPhase(first, "results")
    await first.screenshot({
      path: info.outputPath("concurrent-live-displays.png"),
    })
    const sorted = loadMs.toSorted((a, b) => a - b)
    const metrics = {
      browserName,
      simultaneousDisplays: target,
      viewport,
      pausedSoakMs: 10_000,
      successfulDisplays: loadMs.length,
      failures: 0,
      loadP50Ms: sorted[Math.ceil(target * 0.5) - 1],
      loadP95Ms: sorted[Math.ceil(target * 0.95) - 1],
      resultFanoutMs,
      scope:
        "One browser, real display pages and sandbox renderers; synthetic content, no physical devices/PSTN or 400-client claim. Forty WebKit tabs exceed this host's tested 8 GiB budget.",
    }
    await info.attach("runtime-load-metrics", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    })
  } finally {
    await viewers.close()
    await participant.close()
  }
})

test("bounded heavy TSX stays responsive and missing renderer heartbeat falls back without losing the room", async ({
  page,
  request,
  browser,
  browserName,
}, info) => {
  const style = `${browserName}-heavy-${Date.now()}`
  const installed = await installRuntimeFixture(request, style, true)
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    installed.token,
  )
  await page.goto(`/party/manager/${installed.gameId}`)
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  })
  const participant = await joinIdleRuntimePlayer(browser, installed.inviteCode)

  try {
    const display = await context.newPage()
    await display.goto(`/display/${installed.gameId}`)
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-theme-layout", style)
    await page.getByRole("button", { name: "Start", exact: true }).click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
      { timeout: 40_000 },
    )
    await page.getByTestId("host-pause-resume-btn").click()
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    const paused = await display
      .frameLocator("iframe")
      .locator("aside strong")
      .innerText()
    await page.waitForTimeout(2500)
    expect(
      await display.frameLocator("iframe").locator("aside strong").innerText(),
    ).toBe(paused)
    const child = display
      .frames()
      .find((frame) => frame.url().includes("/render?"))

    if (!child) {
      throw new Error("Missing renderer")
    }

    // Stop only this opaque child document's timer callbacks, representing a
    // renderer that no longer emits health. Never block the host/process forever.
    await child.evaluate(() => {
      const highest = window.setInterval(() => undefined, 60_000)

      if (highest > 10_000) {
        throw new Error("Unexpected timer budget")
      }

      for (let id = 1; id <= highest; id += 1) {
        window.clearInterval(id)
      }
    })
    const started = Date.now()
    await expect(
      display.getByTestId("package-runtime-fallback"),
    ).toHaveAttribute("data-runtime-error", "HANDSHAKE_OR_HEARTBEAT_TIMEOUT", {
      timeout: 9000,
    })
    const fallbackMs = Date.now() - started
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      installed.themeId,
    )
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await expect(page.getByTestId("package-runtime-frame")).toBeVisible()
    await page.getByTestId("host-pause-resume-btn").click()
    await page.getByTestId("host-end-timer-btn").click()
    await waitForPhase(page, "results")
    await display.screenshot({
      path: info.outputPath("heartbeat-safe-fallback.png"),
    })
    await display.reload()
    await waitForPhase(display, "results")
    await info.attach("runtime-watchdog-metrics", {
      body: JSON.stringify(
        {
          browserName,
          fallbackMs,
          boundedWorkMs: 60,
          workPeriodMs: 500,
          retainedRoom: true,
          resumedAndCompleted: true,
          rendererRecoveredAfterReload: true,
          scope:
            "Bounded CPU stress and stopped health callbacks; not a hard CPU/GPU isolation claim",
        },
        null,
        2,
      ),
      contentType: "application/json",
    })
  } finally {
    await context.close()
    await participant.close()
  }
})
