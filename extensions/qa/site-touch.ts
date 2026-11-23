import { expect, type Page } from "@playwright/test"

/** Trusted input through Chromium's compositor, not an artificial DOM scroll. */
export async function swipePage(page: Page) {
  const viewport = page.viewportSize()

  if (!viewport) {
    throw new Error("Touch regression needs a defined device viewport")
  }

  const session = await page.context().newCDPSession(page)
  const x = Math.round(viewport.width * 0.8)
  const start = Math.round(viewport.height * 0.75)
  const distance = Math.min(450, start - 100)
  const before = await page.evaluate(() => window.scrollY)
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: start, id: 1 }],
  })

  for (let step = 1; step <= 15; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: start - (distance * step) / 15, id: 1 }],
    })
    await page.waitForTimeout(20)
  }

  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await session.detach()
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
    .toBeGreaterThan(before + 100)
}
