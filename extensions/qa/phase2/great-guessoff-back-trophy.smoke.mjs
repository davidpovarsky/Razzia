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
const scene = (page, value, key) =>
  page
    .locator(
      `[data-v4-scene="${value}"]${key ? `[data-question-key="${key}"]` : ""}`,
    )
    .waitFor({ timeout: 30000 })
const back = (page) => page.getByTestId("ggo-back-action").click()
const next = (page) => page.getByTestId("ggo-main-action").click()
const choose = async (page, index, key) => {
  await page.getByTestId(`tadazz-card-${index}`).click()
  await scene(page, "survey-results", key)
}

try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.getByTestId("great-guessoff-demo").waitFor()
  assert.equal(
    await page.getByTestId("ggo-back-action").count(),
    0,
    "No Back before game starts",
  )
  assert.equal(
    await page.locator('[aria-label="Restart the demo"]').count(),
    0,
    "No Restart",
  )
  await next(page)
  await scene(page, "countdown", "family-fun")
  const badges = page.locator(
    '[data-v4-scene="countdown"] .choice-slot .answer-index',
  )
  assert.equal(await badges.count(), 4)
  const sizes = await badges.first().evaluate((el) => ({
    font: parseFloat(getComputedStyle(el).fontSize),
    width: el.getBoundingClientRect().width,
  }))
  assert.ok(
    sizes.font >= 50 && sizes.width >= 55,
    "Vote numbers large and legible",
  )
  assert.equal(
    (await page
      .locator('[data-v4-scene="countdown"] .answer-title')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontWeight))) < 900,
    true,
    "Answer weight not heavier than main question",
  )
  const positions = await Promise.all(
    ["ggo-back-action", "ggo-main-action"].map((id) =>
      page.getByTestId(id).boundingBox(),
    ),
  )
  assert.ok(
    positions[0] && positions[1] && positions[0].x !== positions[1].x,
    "Back and Next in separate slots",
  )
  await choose(page, 0, "family-fun")
  await next(page)
  await scene(page, "top-pick")
  assert.equal(
    await page
      .locator(".spotlight-portrait")
      .evaluate((el) => getComputedStyle(el).display),
    "none",
  )
  const winnerText = page.getByTestId("tadazz-top-pick-name")
  const bounds = await winnerText.boundingBox()
  assert.ok(
    bounds && bounds.width > 480 && bounds.height > 95,
    "Long horizontal winner card",
  )
  assert.ok((await winnerText.innerText()).includes("Getting everyone ready"))
  await page.screenshot({
    path: resolve("qa/phase2/ggo-new-text-top-pick.png"),
    fullPage: true,
  })
  await back(page)
  await scene(page, "survey-results", "family-fun")
  await back(page)
  await scene(page, "countdown", "family-fun")
  await back(page)
  await page
    .getByTestId("ggo-main-action")
    .getByText("Start", { exact: true })
    .waitFor()
  // Return to Q2, then go Back to the Q1 top pick.
  await next(page)
  await scene(page, "countdown", "family-fun")
  await choose(page, 0, "family-fun")
  await next(page)
  await scene(page, "top-pick")
  await next(page)
  await scene(page, "countdown", "picture-trivia")
  await back(page)
  await scene(page, "top-pick")
  await next(page)
  await scene(page, "countdown", "picture-trivia")
  await choose(page, 0, "picture-trivia")
  await back(page)
  await scene(page, "countdown", "picture-trivia")
  await choose(page, 0, "picture-trivia")
  const imgBadge = page.getByTestId("tadazz-card-0").locator(".answer-index")
  assert.ok(
    (await imgBadge.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    )) >= 55,
  )
  await next(page)
  await scene(page, "countdown", "at-work")
  await choose(page, 0, "at-work")
  await next(page)
  await scene(page, "top-pick")
  await next(page)
  await scene(page, "leaderboard")
  await back(page)
  await scene(page, "top-pick")
  await next(page)
  await scene(page, "leaderboard")
  await next(page)
  await scene(page, "countdown", "quick-trivia")
  const textBadge = page.getByTestId("tadazz-card-2").locator(".answer-index")
  assert.ok(
    (await textBadge.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    )) >= 50,
  )
  await choose(page, 2, "quick-trivia")
  assert.equal(
    await page
      .locator('[data-v4-scene="survey-results"] .answers')
      .evaluate(
        (el) =>
          getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean)
            .length,
      ),
    2,
  )
  await next(page)
  await scene(page, "countdown", "party-personality")
  await choose(page, 3, "party-personality")
  await next(page)
  await scene(page, "top-pick")
  await next(page)
  await page.getByTestId("tadazz-finale-screen").waitFor()
  const trophy = page.getByTestId("ggo-winner-trophy")
  await trophy.waitFor()
  assert.ok(
    await trophy.locator(".ggo-winner-trophy-icon").count(),
    "Trophy on winner",
  )
  assert.equal(
    await page.locator(".ggo-native").getAttribute("data-ggo-phase"),
    "winner",
  )
  const background = await page
    .locator(".tzv4-stage .stage-bg")
    .evaluate((el) => getComputedStyle(el).backgroundImage)
  assert.ok(
    background.includes("show-stage.webp"),
    "Winner uses original illuminated Z stage",
  )
  await page.screenshot({
    path: resolve("qa/phase2/ggo-new-stage-trophy-winner.png"),
    fullPage: true,
  })
  await back(page)
  await scene(page, "top-pick")
  await next(page)
  await page.getByTestId("ggo-winner-trophy").waitFor()
  await next(page)
  await scene(page, "grand-finale")
  await page
    .getByTestId("ggo-main-action")
    .getByText("Play again", { exact: true })
    .waitFor({ timeout: 26000 })
  await back(page)
  await page.getByTestId("ggo-winner-trophy").waitFor()
  await page.screenshot({
    path: resolve("qa/phase2/ggo-stage-winner-back.png"),
    fullPage: true,
  })
  assert.deepEqual(
    errors.filter((e) => e !== "errors:auth.sessionFailed"),
    [],
  )
  console.log(
    "BACK_TROPHY_PASS",
    JSON.stringify({
      largeVotingNumbers: sizes,
      backWorks: true,
      longTopPick: true,
      quizLayout: true,
      stageBackground: true,
      trophy: true,
      errors: errors.length,
    }),
  )
} finally {
  await browser.close()
}
