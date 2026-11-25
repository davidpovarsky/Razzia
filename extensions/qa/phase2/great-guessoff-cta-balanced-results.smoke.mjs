import assert from "node:assert/strict"
import { chromium } from "@playwright/test"
import { resolve } from "node:path"

const browser = await chromium.launch({
  headless: true,
  ...(process.env.GGO_CHROME_PATH
    ? { executablePath: process.env.GGO_CHROME_PATH }
    : {}),
})
const origin = process.env.GGO_PREVIEW_ORIGIN || "http://127.0.0.1:3007"
const url = new URL("/", origin).href
const errors = []
const resultLabel = (kind) =>
  kind === "quiz" ? "CORRECT ANSWER" : "AUDIENCE FAVOURITE"
const names = [
  "family-fun",
  "picture-trivia",
  "at-work",
  "quick-trivia",
  "party-personality",
]
const kinds = ["survey", "quiz", "survey", "quiz", "survey"]
const picks = [0, 0, 1, 2, 3]
let page = undefined

async function waitForGame() {
  await page.getByTestId("great-guessoff-demo").waitFor({ timeout: 30000 })
}
async function intro() {
  await waitForGame()
  assert.equal(
    await page
      .locator(".site-header")
      .evaluate((el) => getComputedStyle(el).position),
    "relative",
    "Demo header should not cover the game",
  )
  assert.equal(
    await page
      .locator(".ggo-native-frame")
      .evaluate((el) => getComputedStyle(el).direction),
    "ltr",
    "English game in LTR layout",
  )
  assert.match(page.url(), /view=demo/)
  assert.match(page.url(), /game=great-guessoff/)
  await page.getByTestId("tadazz-intro-screen").waitFor()
}
async function voteAndCheck(index) {
  await page
    .locator(`[data-v4-scene="countdown"][data-question-key="${names[index]}"]`)
    .waitFor({ timeout: 30000 })
  await page.getByTestId(`tadazz-card-${picks[index]}`).click()
  await page.locator('[data-ggo-phase="results"]').waitFor()
  await page
    .locator(
      `[data-v4-scene="survey-results"][data-question-key="${names[index]}"]`,
    )
    .waitFor()
  const heading = page.locator(".q-frame .eyebrow")
  assert.equal((await heading.innerText()).trim(), resultLabel(kinds[index]))
  const stage = page.getByTestId("tadazz-stage")
  const geometry = await stage.evaluate((el) => {
    const root = el.querySelector(".tzv4-scene-root")
    const frame = root.querySelector(".q-frame")
    const title = frame.querySelector(".eyebrow")
    const question = frame.querySelector(".q-text")
    const results = [...root.querySelectorAll(".choice-slot")]
    const tags = results.filter(
      (c) =>
        getComputedStyle(c.querySelector(".winner-tag")).display !== "none",
    )
    const f = frame.getBoundingClientRect(),
      t = title.getBoundingClientRect(),
      q = question.getBoundingClientRect(),
      cards = results.map((c) => c.getBoundingClientRect())
    const fs = getComputedStyle(title),
      qs = getComputedStyle(question)

    return {
      labelFont: parseFloat(fs.fontSize),
      questionFont: parseFloat(qs.fontSize),
      headingVisible:
        fs.display !== "none" &&
        fs.visibility === "visible" &&
        fs.opacity !== "0",
      headingInside: t.top >= f.top - 1 && t.bottom <= f.bottom + 1,
      textInside: q.top >= f.top - 1 && q.bottom <= f.bottom + 1,
      noQuestionOverlap: t.bottom + 5 <= q.top,
      cardsStartAfterPanel: cards.every((c) => c.top >= f.bottom + 3),
      winnerTagsVisible: tags.length,
      visibleQuestion: q.height >= 16,
      cardCount: cards.length,
    }
  })
  assert.ok(
    geometry.headingVisible &&
      geometry.headingInside &&
      geometry.textInside &&
      geometry.noQuestionOverlap,
    JSON.stringify({ index, geometry }),
  )
  assert.ok(geometry.cardsStartAfterPanel, JSON.stringify({ index, geometry }))
  assert.equal(
    geometry.winnerTagsVisible,
    0,
    "Audience favourite or correct answer must NOT be repeated on card",
  )
  assert.ok(
    geometry.labelFont >= 28 && geometry.labelFont <= 34,
    "Heading must be prominent but not oversized",
  )
  assert.ok(
    geometry.questionFont >= 50 && geometry.questionFont <= 58,
    "Question should be full sized but fit gracefully",
  )
  assert.equal(geometry.cardCount, 4)

  if (index === 0 || index === 1) {
    await page.screenshot({
      path: resolve(`qa/phase2/ggo-balanced-result-${index}.png`),
      fullPage: true,
    })
  }

  return geometry
}

try {
  page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  })
  page.on("pageerror", (err) => errors.push(err.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.locator(".header-demo").click()
  await intro()
  await page.getByTestId("ggo-main-action").click()
  const geometry = []
  for (let i = 0; i < 5; i += 1) {
    geometry.push(await voteAndCheck(i))
    await page.getByTestId("ggo-main-action").click()

    if (i === 2) {
      await page.locator('[data-v4-scene="leaderboard"]').waitFor()
      await page.getByTestId("ggo-main-action").click()
    }
  }
  await page.getByTestId("tadazz-finale-screen").waitFor()
  // Verify all entry points lead to the EXACT SAME demo route, not a poster.
  await page.goto(url, { waitUntil: "networkidle" })
  await page.locator(".cinema-buttons .btn-primary").first().click()
  await intro()
  await page.goto(new URL("/?view=store", origin).href, {
    waitUntil: "networkidle",
  })
  await page.locator(".store-grid").waitFor()
  const catalogueCover = page
    .locator(".store-grid .ggo-catalogue-cover")
    .first()
  assert.ok(
    await catalogueCover.isVisible(),
    "Catalogue must display the public sample card",
  )
  await catalogueCover.click()
  await intro()
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  mobile.on("pageerror", (err) => errors.push(err.message))
  await mobile.goto(url, { waitUntil: "networkidle" })
  await mobile.locator(".site-header .mobile-menu").click()
  await mobile.locator(".mobile-nav button.text-btn").last().click()
  await mobile.getByTestId("great-guessoff-demo").waitFor()
  assert.match(mobile.url(), /game=great-guessoff/)
  await mobile.getByTestId("ggo-main-action").click()
  await mobile.getByTestId("tadazz-card-0").click()
  const mtitle = mobile.locator(".q-frame .eyebrow")
  assert.equal((await mtitle.innerText()).trim(), "AUDIENCE FAVOURITE")
  assert.equal(
    await mobile
      .locator(".winner-tag")
      .first()
      .evaluate((el) => getComputedStyle(el).display),
    "none",
  )
  await mobile.screenshot({
    path: resolve("qa/phase2/ggo-balanced-result-mobile.png"),
    fullPage: true,
  })
  assert.deepEqual(
    errors.filter((e) => e !== "errors:auth.sessionFailed"),
    [],
  )
  console.log(
    "CTA_BALANCED_RESULTS_PASS",
    JSON.stringify({
      origin,
      hero: true,
      header: true,
      catalogue: true,
      mobile: true,
      results: geometry,
      errors,
    }),
  )
} finally {
  await browser.close()
}
