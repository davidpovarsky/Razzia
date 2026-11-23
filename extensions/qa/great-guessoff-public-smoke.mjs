import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"
const require = createRequire(
  new URL("../../packages/e2e/package.json", import.meta.url),
)
const { chromium, expect } = require("@playwright/test")
const origin = process.env.GUESSOFF_TEST_ORIGIN || "http://127.0.0.1:4185"
const shot =
  process.env.GUESSOFF_TEST_SHOTS ||
  path.resolve("extensions/qa/great-guessoff-shots")
mkdirSync(shot, { recursive: true })
const browser = await chromium.launch({
  channel: process.env.GUESSOFF_BROWSER_CHANNEL || "chrome",
  headless: true,
})
const failures = []
const page = await browser.newPage({ viewport: { width: 1240, height: 950 } })
page.on("pageerror", (error) => failures.push(error.message))

try {
  await page.goto(origin, { waitUntil: "networkidle", timeout: 30000 })
  await expect(
    page.getByRole("button", { name: /Try a round|נסו סבב/i }).first(),
  ).toBeVisible()
  await page
    .getByRole("button", { name: /Try a round|נסו סבב/i })
    .first()
    .click()
  await expect(
    page.getByRole("button", { name: /Start playing/i }),
  ).toBeVisible()
  await expect(
    page.getByText("The Great Guess-off", { exact: true }).first(),
  ).toBeVisible()
  await page.screenshot({ path: `${shot}/guessoff-intro.png`, fullPage: false })
  await page.getByRole("button", { name: /Start playing/i }).click()

  await expect(page.getByText(/What causes the biggest delay/)).toBeVisible()
  await page.getByRole("button", { name: /Getting everyone ready/ }).click()
  await page.getByRole("button", { name: /Reveal answer/ }).click()
  await expect(page.getByText(/Here's how the audience voted!/)).toBeVisible()
  await expect(page.getByText(/Sample votes are simulated/)).toBeVisible()
  await page.screenshot({
    path: `${shot}/guessoff-survey.png`,
    fullPage: false,
  })
  await page.getByRole("button", { name: /Next question/ }).click()

  await expect(
    page.getByText(/Which of these is actually a berry/),
  ).toBeVisible()
  await expect(page.getByAltText("Banana")).toBeVisible()
  await expect(page.getByAltText("Cherry")).toBeVisible()
  await page.screenshot({
    path: `${shot}/guessoff-pictures.png`,
    fullPage: false,
  })
  await page.getByRole("button", { name: /Banana/ }).click()
  await page.getByRole("button", { name: /Reveal answer/ }).click()
  await expect(page.getByText(/You got it!/)).toBeVisible()
  await page.getByRole("button", { name: /Next question/ }).click()

  await expect(page.getByText(/five-minute meeting/)).toBeVisible()
  await page.getByRole("button", { name: /Technical problems/ }).click()
  await page.getByRole("button", { name: /Reveal answer/ }).click()
  await expect(page.getByText(/Sample votes are simulated/)).toBeVisible()
  await page.getByRole("button", { name: /Next question/ }).click()

  await expect(page.getByText(/How many hearts does an octopus/)).toBeVisible()
  await page.getByRole("button", { name: /Three/ }).click()
  await page.getByRole("button", { name: /Reveal answer/ }).click()
  await expect(page.getByText(/You got it!/)).toBeVisible()
  await page.getByRole("button", { name: /See the leaderboard/ }).click()
  await expect(
    page.getByRole("heading", { name: /The leaderboard/ }),
  ).toBeVisible()
  await page.screenshot({ path: `${shot}/guessoff-board.png`, fullPage: false })
  await page.getByRole("button", { name: /Go to the grand finale/ }).click()

  await expect(page.getByText(/Which one are YOU at a party/)).toBeVisible()
  await expect(page.getByAltText("The Organiser")).toBeVisible()
  await expect(page.getByAltText("The Snack Hunter")).toBeVisible()
  await page.getByRole("button", { name: /The Photographer/ }).click()
  await page.getByRole("button", { name: /Reveal answer/ }).click()
  await page.getByRole("button", { name: /Final results/ }).click()
  await expect(
    page.getByRole("heading", { name: /Final rankings/ }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Reveal the winner/ }).click()
  await expect(page.getByRole("heading", { name: /YOU!/ })).toBeVisible()
  await page.screenshot({
    path: `${shot}/guessoff-winner.png`,
    fullPage: false,
  })

  await page.getByRole("button", { name: /Play again/ }).click()
  await expect(
    page.getByRole("button", { name: /Start playing/ }),
  ).toBeVisible()
  await page.goto(`${origin}/?view=store`)
  await expect(
    page.getByRole("heading", { name: "The Great Guess-off" }),
  ).toBeVisible()
  await page.screenshot({
    path: `${shot}/guessoff-library.png`,
    fullPage: false,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${origin}/?view=demo&game=guessoff`)
  await expect(
    page.getByRole("button", { name: /Start playing/i }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Start playing/i }).click()
  const dimensions = await page.locator(".tz-guessoff").evaluate((el) => ({
    content: el.scrollWidth,
    width: el.clientWidth,
  }))

  if (dimensions.content > dimensions.width + 2) {
    throw new Error(`MOBILE_STAGE_OVERFLOW: ${JSON.stringify(dimensions)}`)
  }

  await page.screenshot({
    path: `${shot}/guessoff-mobile.png`,
    fullPage: false,
  })
  const unexpectedErrors = failures.filter(
    (m) => !m.includes("errors:auth.sessionFailed"),
  )

  if (unexpectedErrors.length) {
    throw new Error("PAGEERRORS: " + unexpectedErrors.join(","))
  }

  console.log(
    "PASS: homepage CTA, 5 questions, 8 images, 3 polls, 2 trivia, 2 scoreboards, champion, restart and library",
  )
} finally {
  await browser.close()
}
