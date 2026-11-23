import assert from "node:assert/strict"
import { chromium } from "@playwright/test"
import { resolve } from "node:path"

const browser = await chromium.launch({
  headless: true,
  ...(process.env.GGO_CHROME_PATH
    ? { executablePath: process.env.GGO_CHROME_PATH }
    : {}),
})
const url = new URL(
  "/?view=demo&game=great-guessoff",
  process.env.GGO_PREVIEW_ORIGIN || "http://127.0.0.1:3007",
).href
const errors = []
async function scene(page, name, key) {
  const selector = `[data-v4-scene="${name}"]${
    key ? `[data-question-key="${key}"]` : ""
  }`

  await page.locator(selector).waitFor({ timeout: 30000 })
}
async function results(page, key, choice, kind) {
  await page.getByTestId(`tadazz-card-${choice}`).click()
  await scene(page, "survey-results", key)
  await page.locator('[data-ggo-phase="results"]').waitFor({ timeout: 30000 })
  const label = await page.locator(".q-frame .eyebrow").innerText()
  assert.equal(label, kind === "quiz" ? "CORRECT ANSWER" : "AUDIENCE FAVOURITE")
  const size = await page
    .locator(".q-frame .eyebrow")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  assert.ok(size >= 36, "Result headline must be large and prominent")

  if (kind === "quiz") {
    assert.equal(
      await page
        .locator(".choice-slot .result-percentage")
        .first()
        .evaluate((el) => getComputedStyle(el).display),
      "none",
    )
    assert.ok(
      await page
        .getByTestId(`tadazz-card-${key === "picture-trivia" ? 0 : 2}`)
        .evaluate((el) => el.classList.contains("is-correct")),
    )
  }
}
async function next(page) {
  const button = page.getByTestId("ggo-main-action")
  assert.equal((await button.innerText()).trim(), "Next")
  await button.click()
}

try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "no-preference",
  })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.getByTestId("great-guessoff-demo").waitFor()
  await scene(page, "grand-opening")
  const introAsset = await page
    .locator(".full-opening-event")
    .getAttribute("src")
  assert.ok(
    introAsset.endsWith("/tadazz-show/v4/show-stage.webp"),
    "No Creating Worlds artwork",
  )
  const openingLogo = page.locator(".full-opening-logo")
  assert.ok(await openingLogo.count(), "Native brand logo exists")
  const left = await openingLogo.evaluate(
    (el) => getComputedStyle(el, "::before").animationName,
  )
  const right = await openingLogo.evaluate(
    (el) => getComputedStyle(el, "::after").animationName,
  )
  assert.ok(
    left.includes("ggo-interlock-left") &&
      right.includes("ggo-interlock-right"),
    "Logo halves interlock",
  )
  await page.screenshot({
    path: resolve("qa/phase2/ggo-portal-logo.png"),
    fullPage: true,
  })
  await page.getByTestId("tadazz-stage").evaluate((node) => {
    window.ggoTrace = []
    window.ggoObserver = new MutationObserver(() =>
      window.ggoTrace.push(node.getAttribute("data-v4-scene")),
    )
    window.ggoObserver.observe(node, {
      attributes: true,
      attributeFilter: ["data-v4-scene"],
    })
  })
  await page.getByTestId("ggo-main-action").click()
  await scene(page, "countdown", "family-fun")
  const textGrid = await page.locator(".answers").evaluate((el) => ({
    columns: getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean)
      .length,
    rows: getComputedStyle(el).gridTemplateRows.split(" ").filter(Boolean)
      .length,
  }))
  assert.deepEqual(textGrid, { columns: 2, rows: 2 })
  await results(page, "family-fun", 0, "survey")
  await page.screenshot({
    path: resolve("qa/phase2/ggo-one-survey-reveal.png"),
    fullPage: true,
  })
  await next(page)
  await scene(page, "countdown", "picture-trivia")
  await results(page, "picture-trivia", 0, "quiz")
  await page.screenshot({
    path: resolve("qa/phase2/ggo-one-trivia-reveal.png"),
    fullPage: true,
  })
  await next(page)
  await scene(page, "countdown", "at-work")
  await results(page, "at-work", 1, "survey")
  await next(page)
  await scene(page, "leaderboard")
  await next(page)
  await scene(page, "countdown", "quick-trivia")
  await results(page, "quick-trivia", 2, "quiz")
  await next(page)
  await scene(page, "countdown", "party-personality")
  await results(page, "party-personality", 3, "survey")
  await next(page)
  await page.getByTestId("tadazz-finale-screen").waitFor({ timeout: 30000 })
  await page.locator('[data-ggo-phase="winner"]').waitFor({ timeout: 30000 })
  assert.equal(
    await page.getByTestId("ggo-winner-trophy").count(),
    0,
    "Trophy removed",
  )
  assert.equal(
    await page.locator(".ggo-winner-trophy").count(),
    0,
    "Trophy CSS/markup removed",
  )
  assert.equal(
    (await page.getByTestId("tadazz-winner-name").innerText()).trim(),
    "You",
  )
  assert.ok(
    (await page.locator(".tz-confetti-bit").count()) > 25,
    "Native confetti on single stage winner",
  )
  const backdrop = await page
    .locator(".tzv4-stage .stage-bg")
    .evaluate((el) => getComputedStyle(el).backgroundImage)
  assert.ok(
    backdrop.includes("show-stage.webp"),
    "Confetti winner on the original Z stage",
  )
  const trace = await page
    .getByTestId("tadazz-stage")
    .evaluate((el) => window.ggoTrace || [])
  assert.equal(
    trace.filter((x) => x === "leaderboard").length,
    1,
    "One leaderboard",
  )
  assert.ok(!trace.includes("top-pick"), "No duplicate result spotlight scene")
  assert.ok(!trace.includes("round-recap"), "No duplicate recap screen")
  assert.ok(!trace.includes("grand-finale"), "Curtains not before winner")
  // Wait until the single stage winner is visibly complete.
  await page.waitForTimeout(1700)
  await page.screenshot({
    path: resolve("qa/phase2/ggo-single-stage-winner.png"),
    fullPage: true,
  })
  await next(page)
  await scene(page, "grand-finale")
  await page
    .getByTestId("ggo-main-action")
    .getByText("Play again", { exact: true })
    .waitFor()
  await page.screenshot({
    path: resolve("qa/phase2/ggo-only-final-curtain.png"),
    fullPage: true,
  })
  await page.getByTestId("ggo-back-action").click()
  await page.locator('[data-ggo-phase="winner"]').waitFor()
  await page.getByTestId("ggo-main-action").click()
  await scene(page, "grand-finale")
  await page
    .getByTestId("ggo-main-action")
    .getByText("Play again", { exact: true })
    .waitFor()
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  mobile.on("pageerror", (e) => errors.push(e.message))
  await mobile.goto(url, { waitUntil: "networkidle" })
  await mobile.getByTestId("great-guessoff-demo").waitFor()
  await mobile.locator(".full-opening-logo").waitFor()
  await mobile.getByTestId("ggo-main-action").click()
  await scene(mobile, "countdown", "family-fun")
  await results(mobile, "family-fun", 0, "survey")
  assert.deepEqual(
    errors.filter((e) => e !== "errors:auth.sessionFailed"),
    [],
  )
  console.log(
    "ONE_REVEAL_PASS",
    JSON.stringify({
      openingInterlock: true,
      fiveQuestions: true,
      oneRevealPerQuestion: true,
      correctVsFavouriteLabels: true,
      noTopPick: true,
      noTrophy: true,
      stageConfetti: true,
      finalCurtainsOnly: true,
      mobile: true,
      errors: errors.length,
    }),
  )
} finally {
  await browser.close()
}
