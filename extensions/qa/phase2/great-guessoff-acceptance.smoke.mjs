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
const url = new URL("/?view=demo&game=great-guessoff", origin).href
const errors = []
async function waitScene(page, scene, key) {
  await page
    .locator(
      `[data-v4-scene="${scene}"]${key ? `[data-question-key="${key}"]` : ""}`,
    )
    .waitFor({ timeout: 26000 })
}
async function next(page) {
  const button = page.getByTestId("ggo-main-action")
  assert.equal((await button.innerText()).trim(), "Next")
  await button.click()
}
async function choose(page, index, scene) {
  await page.getByTestId(`tadazz-card-${index}`).click()
  await waitScene(page, scene)
}

try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.getByTestId("great-guessoff-demo").waitFor()
  const stage = page.getByTestId("tadazz-stage")
  assert.equal((await page.locator(".tz-intro-caption").innerText()).trim(), "")
  assert.equal(
    (await page.getByTestId("ggo-main-action").innerText()).trim(),
    "Start",
  )
  await stage.evaluate((node) => {
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
  await waitScene(page, "countdown", "family-fun")
  const grid = await page
    .locator('[data-v4-scene="countdown"] .answers')
    .evaluate((node) => ({
      columns: getComputedStyle(node)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length,
      rows: getComputedStyle(node).gridTemplateRows.split(" ").filter(Boolean)
        .length,
    }))
  assert.deepEqual(grid, { columns: 2, rows: 2 }, "2-by-2 text layout")
  const slots = page.locator('[data-v4-scene="countdown"] .choice-slot')
  assert.equal(await slots.count(), 4)
  assert.equal(
    await slots
      .first()
      .locator(".tz-photo-frame")
      .evaluate((node) => getComputedStyle(node).display),
    "none",
  )
  const texts = await slots.locator(".answer-title").allTextContents()
  assert.deepEqual(
    texts.map((x) => x.trim()),
    [
      "Getting everyone ready",
      "Finding missing things",
      "Last-minute changes",
      "Actually getting out the door",
    ],
  )
  const boxes = await Promise.all(
    Array.from({ length: 4 }, (_, i) => slots.nth(i).boundingBox()),
  )
  assert.ok(boxes.every(Boolean))
  assert.ok(
    Math.abs(boxes[0].y - boxes[1].y) < 5 &&
      Math.abs(boxes[2].y - boxes[3].y) < 5,
  )
  assert.ok(boxes[2].y > boxes[0].y + boxes[0].height - 5)
  await page.screenshot({
    path: resolve("qa/phase2/ggo-accept-text.png"),
    fullPage: true,
  })
  const timer = Number(
    (await page.locator(".countdown-value").innerText()).trim(),
  )
  assert.ok(timer > 0)
  // Click auto-advances before 20 sec

  await choose(page, 0, "survey-results")
  assert.equal(await stage.getAttribute("data-question-key"), "family-fun")
  await next(page)
  await waitScene(page, "top-pick")
  await next(page)
  await waitScene(page, "countdown", "picture-trivia")
  assert.ok(
    await page
      .locator('img[src$="/banana.webp"]')
      .first()
      .evaluate(async (img) => {
        await img.decode()

        return img.naturalWidth > 0
      }),
  )
  await choose(page, 0, "survey-results")
  assert.equal(
    await page
      .getByTestId("tadazz-card-0")
      .locator(".result-percentage")
      .evaluate((el) => getComputedStyle(el).display),
    "none",
  )
  assert.ok(
    await page
      .getByTestId("tadazz-card-0")
      .evaluate((el) => el.classList.contains("is-correct")),
  )
  assert.equal(
    await page.locator(".q-frame .eyebrow").innerText(),
    "CORRECT ANSWER",
  )
  assert.ok(
    !(
      await page.locator('[data-v4-scene="survey-results"]').innerText()
    ).includes("MOST CHOSEN"),
  )
  await page.screenshot({
    path: resolve("qa/phase2/ggo-accept-correct.png"),
    fullPage: true,
  })
  await next(page)
  await waitScene(page, "countdown", "at-work")
  await choose(page, 1, "survey-results")
  await next(page)
  await waitScene(page, "top-pick")
  await next(page)
  await waitScene(page, "leaderboard")
  await page.screenshot({
    path: resolve("qa/phase2/ggo-accept-leaderboard.png"),
    fullPage: true,
  })
  await next(page)
  await waitScene(page, "countdown", "quick-trivia")
  await choose(page, 2, "survey-results")
  assert.equal(
    await page.locator(".q-frame .eyebrow").innerText(),
    "CORRECT ANSWER",
  )
  await next(page)
  await waitScene(page, "countdown", "party-personality")
  await choose(page, 3, "survey-results")
  await next(page)
  await waitScene(page, "top-pick")
  await next(page)
  await page.getByTestId("tadazz-finale-screen").waitFor({ timeout: 25000 })
  assert.equal(
    (await page.getByTestId("tadazz-winner-name").innerText()).trim(),
    "You",
  )
  assert.ok((await page.locator(".tz-confetti-bit").count()) > 10)
  const trace = await page.evaluate(() => window.ggoTrace)
  assert.equal(
    trace.filter((scene) => scene === "leaderboard").length,
    1,
    "leaderboard exactly once",
  )
  assert.ok(!trace.includes("grand-finale"), "no curtain before winner")
  await page.screenshot({
    path: resolve("qa/phase2/ggo-accept-winner.png"),
    fullPage: true,
  })
  await next(page)
  await waitScene(page, "grand-finale")
  await page.locator(".full-curtain").first().waitFor()
  assert.equal(
    (await page.getByTestId("ggo-main-action").innerText()).trim(),
    "Play again",
  )
  await page.screenshot({
    path: resolve("qa/phase2/ggo-accept-curtain.png"),
    fullPage: true,
  })
  await page.getByTestId("ggo-main-action").click()
  await page
    .getByTestId("ggo-main-action")
    .getByText("Start", { exact: true })
    .waitFor()
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  mobile.on("pageerror", (e) => errors.push(e.message))
  await mobile.goto(url, { waitUntil: "networkidle" })
  await mobile.getByTestId("ggo-main-action").click()
  await waitScene(mobile, "countdown", "family-fun")
  const mobileSlots = mobile.locator('[data-v4-scene="countdown"] .choice-slot')
  const mb = await Promise.all(
    Array.from({ length: 4 }, (_, i) => mobileSlots.nth(i).boundingBox()),
  )
  assert.ok(
    mb.every((b) => b && b.width > 44 && b.x >= -1 && b.x + b.width <= 391),
  )
  await mobileSlots.nth(1).click()
  await waitScene(mobile, "survey-results")
  await mobile.screenshot({
    path: resolve("qa/phase2/ggo-accept-mobile.png"),
    fullPage: true,
  })
  assert.deepEqual(
    errors.filter((e) => e !== "errors:auth.sessionFailed"),
    [],
  )
  console.log(
    "GGO_ACCEPTANCE_PASS",
    JSON.stringify({
      questions: 5,
      grid,
      selectedBeforeTimerExpired: true,
      singleLeaderboard: true,
      winnerBeforeCurtains: true,
      mobile: true,
      errors: errors.length,
    }),
  )
} finally {
  await browser.close()
}
