import assert from "node:assert/strict"
import { chromium } from "@playwright/test"
import { resolve } from "node:path"

const browser = await chromium.launch({
  headless: true,
  ...(process.env.GGO_CHROME_PATH
    ? { executablePath: process.env.GGO_CHROME_PATH }
    : {}),
})
const errors = []
const demoUrl = new URL(
  "/?view=demo&game=great-guessoff",
  process.env.GGO_PREVIEW_ORIGIN || "http://127.0.0.1:3000",
).href
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  })
  page.on("pageerror", (error) => errors.push(error.message))
  const soundRequests = new Set()
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/sounds/")) {
      soundRequests.add(new URL(request.url()).pathname)
    }
  })
  await page.goto(demoUrl, {
    waitUntil: "networkidle",
  })
  await page.getByTestId("great-guessoff-demo").waitFor()
  const native = page.getByTestId("tadazz-stage")
  await native.waitFor()
  const frame = page.getByTestId("great-guessoff-native-stage")
  assert.ok((await frame.boundingBox()).width > 500, "Native projector visible")
  assert.ok(
    await page.locator(".tzv4-stage").count(),
    "Native V4 source stage renders",
  )
  await page.screenshot({ path: resolve("qa/phase2/ggo-native-intro.png") })
  await page.getByTestId("ggo-main-action").click()
  await page
    .getByRole("button", { name: /Start round 1/i })
    .waitFor({ timeout: 20000 })
  assert.equal(
    await native.getAttribute("data-v4-scene"),
    "round-one",
    "Original round launch scene",
  )
  await page.getByTestId("ggo-main-action").click()
  await page.locator('[data-v4-scene="countdown"]').waitFor({ timeout: 20000 })
  await page
    .getByText(
      "What causes the biggest delay when the whole family is going out?",
    )
    .waitFor()
  const clock = page.locator(".countdown-value").first()
  await clock.waitFor()
  const initial = Number((await clock.textContent())?.trim())
  assert.ok(
    initial >= 18 && initial <= 20,
    "Original countdown starts at twenty seconds",
  )
  await page.waitForTimeout(1400)
  const later = Number((await clock.textContent())?.trim())
  assert.ok(later < initial, "Real 20-second WAAPI clock advances")
  await page.getByTestId("ggo-answer-0").click()
  assert.equal(
    await page.getByTestId("ggo-answer-0").getAttribute("aria-pressed"),
    "true",
  )
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="survey-results"]')
    .waitFor({ timeout: 20000 })
  await page.screenshot({ path: resolve("qa/phase2/ggo-native-survey.png") })
  assert.ok(await page.locator(".tzv4-stage").count())
  await page.getByTestId("ggo-main-action").click() // top pick
  await page.locator('[data-v4-scene="top-pick"]').waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // Q2
  await page
    .locator('[data-v4-scene="countdown"][data-question-key="picture-trivia"]')
    .waitFor({ timeout: 25000 })
  await page.locator('img[src$="/banana.webp"]').first().waitFor()
  assert.ok(
    await page
      .locator('img[src$="/banana.webp"]')
      .first()
      .evaluate(async (img) => {
        await img.decode()
        return img.naturalWidth > 0
      }),
  )
  await page.getByTestId("ggo-answer-0").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator(
      '[data-v4-scene="survey-results"][data-question-key="picture-trivia"]',
    )
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // Q3
  await page
    .locator('[data-v4-scene="countdown"][data-question-key="at-work"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-answer-1").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="survey-results"][data-question-key="at-work"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // top pick
  await page.locator('[data-v4-scene="top-pick"]').waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // Q4
  await page
    .locator('[data-v4-scene="countdown"][data-question-key="quick-trivia"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-answer-2").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator(
      '[data-v4-scene="survey-results"][data-question-key="quick-trivia"]',
    )
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // leaderboard
  await page
    .locator('[data-v4-scene="leaderboard"]')
    .waitFor({ timeout: 25000 })
  await page.screenshot({
    path: resolve("qa/phase2/ggo-native-leaderboard.png"),
    fullPage: true,
  })
  await page.getByTestId("ggo-main-action").click() // grand finale scene
  await page
    .locator('[data-v4-scene="grand-finale"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // Q5
  await page
    .locator(
      '[data-v4-scene="countdown"][data-question-key="party-personality"]',
    )
    .waitFor({ timeout: 25000 })
  const pictureUrls = [
    "organiser.webp",
    "entertainer.webp",
    "photographer.webp",
    "snack-hunter.webp",
  ]
  for (const item of pictureUrls) {
    assert.ok(
      await page
        .locator('img[src$="/' + item + '"]')
        .first()
        .evaluate(async (img) => {
          await img.decode()
          return img.naturalWidth > 0
        }),
      item,
    )
  }
  await page.getByTestId("ggo-answer-3").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator(
      '[data-v4-scene="survey-results"][data-question-key="party-personality"]',
    )
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // top pick
  await page.locator('[data-v4-scene="top-pick"]').waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // final leaderboard
  await page
    .locator('[data-v4-scene="leaderboard"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("ggo-main-action").click() // winner
  await page.getByTestId("tadazz-finale-screen").waitFor({ timeout: 25000 })
  assert.equal(
    (await page.getByTestId("tadazz-winner-name").textContent())?.trim(),
    "You",
  )
  await page.screenshot({
    path: resolve("qa/phase2/ggo-native-winner.png"),
    fullPage: true,
  })
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  mobile.on("pageerror", (error) => errors.push(error.message))
  await mobile.goto(demoUrl, {
    waitUntil: "networkidle",
  })
  await mobile.getByTestId("ggo-main-action").click()
  await mobile
    .getByRole("button", { name: /Start round 1/i })
    .waitFor({ timeout: 25000 })
  await mobile.getByTestId("ggo-main-action").click()
  await mobile
    .locator('[data-v4-scene="countdown"]')
    .waitFor({ timeout: 25000 })
  await mobile.getByTestId("ggo-answer-0").click()
  const padBounds = await mobile.getByTestId("ggo-answer-0").boundingBox()
  assert.ok(
    padBounds &&
      padBounds.width > 100 &&
      padBounds.x >= 0 &&
      padBounds.x + padBounds.width <= 390,
    "Mobile answer pad fits",
  )
  await mobile.screenshot({
    path: resolve("qa/phase2/ggo-native-mobile.png"),
    fullPage: true,
  })
  assert.deepEqual(
    errors.filter((x) => x !== "errors:auth.sessionFailed"),
    [],
  )
  console.log("NATIVE_SOUND_ASSETS_REQUESTED", [...soundRequests].sort())
  console.log(
    "NATIVE_FULL_SHOW_PASS",
    JSON.stringify({
      questions: 5,
      countdownStart: initial,
      countdownAfter: later,
      desktop: true,
      mobile: true,
      winner: "You",
      errorCount: errors.length,
    }),
  )
} finally {
  await browser.close()
}
