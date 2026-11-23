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
  assert.equal(
    (await page.getByTestId("ggo-main-action").innerText()).trim(),
    "Start",
  )
  await page.getByTestId("ggo-main-action").click()
  await page
    .getByTestId("ggo-main-action")
    .getByText("Start", { exact: true })
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
  const textCard = page.getByTestId("tadazz-card-0")
  await textCard.waitFor()
  assert.equal(
    await page
      .locator('[data-question-key="family-fun"] .tz-photo-frame')
      .first()
      .evaluate((el) => getComputedStyle(el).display),
    "none",
    "Text-only questions have no image placeholder",
  )
  assert.ok(
    (await textCard.locator(".answer-card").boundingBox()).height < 310,
    "Text cards fit content",
  )
  await textCard.click()
  assert.equal(
    await textCard.getAttribute("aria-pressed"),
    "true",
    "Choose directly on the native card",
  )
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="survey-results"]')
    .waitFor({ timeout: 20000 })
  await page.screenshot({ path: resolve("qa/phase2/ggo-native-survey.png") })
  assert.ok(await page.locator(".tzv4-stage").count())
  // Top pick

  await page.getByTestId("ggo-main-action").click()
  await page.locator('[data-v4-scene="top-pick"]').waitFor({ timeout: 25000 })
  // Q2

  await page.getByTestId("ggo-main-action").click()
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
  const imageCard = page.getByTestId("tadazz-card-0")
  const caption = await imageCard.locator(".answer-title").boundingBox()
  const number = await imageCard.locator(".answer-index").boundingBox()
  assert.ok(
    caption &&
      number &&
      Math.abs(caption.y - number.y) < 30 &&
      (caption.x + caption.width <= number.x + 5 ||
        number.x + number.width <= caption.x + 5),
    "Caption and answer number sit side by side below the image, without overlap",
  )
  assert.equal(await page.getByTestId("ggo-main-action").innerText(), "Next")
  await page.evaluate(() => {
    window.__ggoSceneTrace = []
    const stage = document.querySelector(
      '[data-question-key="picture-trivia"].tzv4-stage',
    )
    window.__ggoObserver = new MutationObserver(() =>
      window.__ggoSceneTrace.push(stage?.getAttribute("data-v4-scene")),
    )

    if (stage) {
      window.__ggoObserver.observe(stage, {
        attributes: true,
        attributeFilter: ["data-v4-scene"],
      })
    }
  })
  await imageCard.click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator(
      '[data-v4-scene="survey-results"][data-question-key="picture-trivia"]',
    )
    .waitFor({ timeout: 25000 })
  assert.ok(
    await page
      .getByTestId("tadazz-card-0")
      .evaluate((el) => el.classList.contains("is-correct")),
    "Correct banana card highlighted",
  )
  assert.equal(
    await page
      .getByTestId("tadazz-card-0")
      .locator(".result-percentage")
      .evaluate((el) => getComputedStyle(el).display),
    "none",
    "No trivia percentages",
  )
  assert.equal(
    await page
      .getByTestId("tadazz-card-0")
      .locator(".result-track")
      .evaluate((el) => getComputedStyle(el).display),
    "none",
    "No trivia bar",
  )
  assert.ok(
    !(await page.evaluate(() => window.__ggoSceneTrace)).includes(
      "vote-locked",
    ),
    "No Votes Locked scene for trivia",
  )
  await page.evaluate(() => window.__ggoObserver?.disconnect())
  // Q3

  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="countdown"][data-question-key="at-work"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("tadazz-card-1").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="survey-results"][data-question-key="at-work"]')
    .waitFor({ timeout: 25000 })
  // Top pick

  await page.getByTestId("ggo-main-action").click()
  await page.locator('[data-v4-scene="top-pick"]').waitFor({ timeout: 25000 })
  // Q4

  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="countdown"][data-question-key="quick-trivia"]')
    .waitFor({ timeout: 25000 })
  await page.getByTestId("tadazz-card-2").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator(
      '[data-v4-scene="survey-results"][data-question-key="quick-trivia"]',
    )
    .waitFor({ timeout: 25000 })
  assert.equal(
    await page
      .getByTestId("tadazz-card-2")
      .locator(".result-track")
      .evaluate((el) => getComputedStyle(el).display),
    "none",
    "Text trivia: no vote percentages",
  )
  // Leaderboard

  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="leaderboard"]')
    .waitFor({ timeout: 25000 })
  await page.screenshot({
    path: resolve("qa/phase2/ggo-native-leaderboard.png"),
    fullPage: true,
  })
  // Grand finale scene

  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="grand-finale"]')
    .waitFor({ timeout: 25000 })
  // Q5

  await page.getByTestId("ggo-main-action").click()
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
        .locator(`img[src$="/${item}"]`)
        .first()
        .evaluate(async (img) => {
          await img.decode()

          return img.naturalWidth > 0
        }),
      item,
    )
  }
  await page.getByTestId("tadazz-card-3").click()
  await page.getByTestId("ggo-main-action").click()
  await page
    .locator(
      '[data-v4-scene="survey-results"][data-question-key="party-personality"]',
    )
    .waitFor({ timeout: 25000 })
  // Top pick

  await page.getByTestId("ggo-main-action").click()
  await page.locator('[data-v4-scene="top-pick"]').waitFor({ timeout: 25000 })
  // Final leaderboard

  await page.getByTestId("ggo-main-action").click()
  await page
    .locator('[data-v4-scene="leaderboard"]')
    .waitFor({ timeout: 25000 })
  // Winner

  await page.getByTestId("ggo-main-action").click()
  await page.getByTestId("tadazz-finale-screen").waitFor({ timeout: 25000 })
  assert.equal(
    (await page.getByTestId("tadazz-winner-name").textContent())?.trim(),
    "You",
  )
  assert.ok(
    (await page.locator(".tz-confetti-bit").count()) > 10,
    "Native confetti on winner screen",
  )
  assert.equal(await page.getByTestId("ggo-main-action").innerText(), "Next")
  await page.screenshot({
    path: resolve("qa/phase2/ggo-native-winner.png"),
    fullPage: true,
  })
  // Closing

  await page.getByTestId("ggo-main-action").click()
  await page.locator('[data-v4-scene="interlude"]').waitFor({ timeout: 25000 })
  await page.getByText("THANKS FOR PLAYING!").waitFor()
  assert.equal(
    await page.getByTestId("ggo-main-action").innerText(),
    "Play again",
  )
  await page.getByTestId("ggo-main-action").click()
  await page
    .getByTestId("ggo-main-action")
    .getByText("Start", { exact: true })
    .waitFor()
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
    .getByTestId("ggo-main-action")
    .getByText("Start", { exact: true })
    .waitFor({ timeout: 25000 })
  await mobile.getByTestId("ggo-main-action").click()
  await mobile
    .locator('[data-v4-scene="countdown"]')
    .waitFor({ timeout: 25000 })
  await mobile.getByTestId("tadazz-card-0").click()
  const padBounds = await mobile.getByTestId("tadazz-card-0").boundingBox()
  assert.ok(
    padBounds &&
      padBounds.width >= 44 &&
      padBounds.x >= 0 &&
      padBounds.x + padBounds.width <= 390,
    "Mobile native answer card fits",
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
