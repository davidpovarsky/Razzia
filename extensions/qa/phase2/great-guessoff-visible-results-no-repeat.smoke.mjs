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

async function phase(name) {
  await page.locator(`[data-ggo-phase="${name}"]`).waitFor({ timeout: 25000 })
}
async function scene(name, key) {
  await page
    .locator(
      `[data-v4-scene="${name}"]${
        key ? '[data-question-key="' + key + '"]' : ""
      }`,
    )
    .waitFor({ timeout: 25000 })
}
async function assertResult(index) {
  await phase("results")
  await scene("survey-results", names[index])
  const txt = kinds[index] === "quiz" ? "CORRECT ANSWER" : "AUDIENCE FAVOURITE"
  const heading = page.locator(".q-frame .eyebrow")
  assert.equal(
    (await heading.innerText()).trim(),
    txt,
    "Expected result wording",
  )
  const metrics = await heading.evaluate((el) => {
    const s = getComputedStyle(el),
      rect = el.getBoundingClientRect(),
      panel = el.closest(".q-frame").getBoundingClientRect()
    const answer = el.parentElement
      ?.querySelector(".q-text")
      ?.getBoundingClientRect()

    return {
      display: s.display,
      visibility: s.visibility,
      opacity: parseFloat(s.opacity),
      fontSize: parseFloat(s.fontSize),
      height: rect.height,
      insidePanel: rect.top >= panel.top - 1 && rect.bottom <= panel.bottom + 1,
      noOverlap: !answer || rect.bottom <= answer.top + 4,
    }
  })
  assert.ok(
    metrics.display !== "none" &&
      metrics.visibility === "visible" &&
      metrics.opacity >= 0.99 &&
      metrics.height > 16,
    "Result label must be visible",
  )
  assert.ok(
    metrics.fontSize >= 32 && metrics.insidePanel && metrics.noOverlap,
    "Result label must be large and not clipped or overlap the question",
  )

  if (kinds[index] === "quiz") {
    const answer = page.getByTestId(`tadazz-card-${picks[index]}`)
    assert.ok(
      await answer.evaluate((el) => el.classList.contains("is-correct")),
    )
    assert.equal(
      await answer
        .locator(".result-percentage")
        .evaluate((el) => getComputedStyle(el).display),
      "none",
    )
    assert.ok(
      await answer.locator(".answer-index").isVisible(),
      "Quiz answer number stays visible",
    )
  } else {
    const badge = page.locator(".choice-slot.is-favourite .winner-tag").first()
    assert.ok(
      await badge.isVisible(),
      "Audience Favourite tag on the winning answer",
    )
  }

  const cards = page.locator(".choice-slot")
  const cardMetrics = await cards.first().evaluate((el) => ({
    opacity: parseFloat(getComputedStyle(el).opacity),
    transform: getComputedStyle(el).transform,
    incorrect: el.classList.contains("is-incorrect"),
  }))
  const expectedOpacity = cardMetrics.incorrect ? 0.4 : 0.97
  assert.ok(
    cardMetrics.opacity >= expectedOpacity && cardMetrics.transform === "none",
    "Result cards must NOT disappear and re-enter; intentionally dim incorrect quiz answers",
  )

  if (index === 0 || index === 1) {
    await page.screenshot({
      path: resolve(`qa/phase2/ggo-visible-${index}.png`),
      fullPage: true,
    })
  }

  return { index, txt, metrics }
}
async function assertNextQuestion(index) {
  await page.getByTestId("ggo-main-action").click()

  if (index === 2) {
    await scene("leaderboard")
    await page.getByTestId("ggo-main-action").click()
  }

  await phase("question-transition")
  const transition = await page.getByTestId("tadazz-stage").evaluate((el) => {
    const root = el.querySelector(".tzv4-scene-root")

    return {
      visibility: getComputedStyle(root).visibility,
      cards: root.querySelectorAll(".choice-slot").length,
    }
  })
  assert.equal(
    transition.visibility,
    "hidden",
    "Previous/repeated cards must be invisible during transition",
  )
  await scene("countdown", names[index + 1])
  await phase("voting")
  assert.equal(
    await page
      .locator(".tzv4-scene-root")
      .evaluate((el) => getComputedStyle(el).visibility),
    "visible",
    "New question cards return when voting starts",
  )

  return { next: index + 1, transition }
}

try {
  page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "no-preference",
  })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.getByTestId("great-guessoff-demo").waitFor()
  await page.getByTestId("tadazz-stage").evaluate((stage) => {
    window.ggoTransitions = []
    const observer = new MutationObserver(() =>
      window.ggoTransitions.push({
        scene: stage.getAttribute("data-v4-scene"),
        time: performance.now(),
      }),
    )
    observer.observe(stage, {
      attributes: true,
      attributeFilter: ["data-v4-scene"],
    })
    window.__ggoTransitionsObserver = observer
  })
  await page.getByTestId("ggo-main-action").click()
  await phase("voting")
  await scene("countdown", names[0])
  const stages = []
  for (let i = 0; i < 5; i += 1) {
    await page.getByTestId(`tadazz-card-${picks[i]}`).click()
    stages.push(await assertResult(i))

    if (i === 4) {
      break
    }

    stages.push(await assertNextQuestion(i))
  }
  await page.getByTestId("ggo-main-action").click()
  await page.getByTestId("tadazz-finale-screen").waitFor()
  const trace = await page.evaluate(() => window.ggoTransitions)
  assert.equal(trace.filter((x) => x.scene === "leaderboard").length, 1)
  assert.ok(
    !trace.some((x) =>
      ["chosen", "vote-locked", "top-pick", "round-recap"].includes(x.scene),
    ),
    "No redundant answer scene",
  )
  assert.deepEqual(
    errors.filter((e) => e !== "errors:auth.sessionFailed"),
    [],
    "No Javascript errors",
  )
  console.log(
    "VISIBLE_RESULTS_NO_REPEAT_PASS",
    JSON.stringify({
      origin,
      stageCount: 5,
      stages,
      events: trace.map((x) => x.scene),
      errors,
    }),
  )
} finally {
  await browser.close()
}
