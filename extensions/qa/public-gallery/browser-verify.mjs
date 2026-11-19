/** Real browser acceptance against a Linux-hosted candidate or the deployed site. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

assert.equal(
  process.platform,
  "linux",
  "Gallery browsers must run on the Linux server",
)
const origin = process.env.TADAZZ_GALLERY_ORIGIN ?? "https://tadazz.com"
const url = new URL(origin)
assert(["tadazz.com", "127.0.0.1", "localhost"].includes(url.hostname))
assert.equal(url.origin, origin)
const evidence = resolve(
  process.env.TADAZZ_GALLERY_EVIDENCE ?? "/evidence/public-gallery",
)
mkdirSync(evidence, { recursive: true })
const sourceSha = process.env.TADAZZ_GALLERY_SOURCE_SHA ?? "uncommitted"
const require = createRequire("/cleanup/extensions/package.json")
const { chromium, expect } = require("@playwright/test")
const ids = [
  "great-guessoff",
  "crowd",
  "quiz",
  "story",
  "picture",
  "truth",
  "finale",
  "family",
  "classroom",
  "team",
]
const observations = {
  pageErrors: [],
  failedAssets: [],
  serverErrors: [],
  unexpectedWrites: [],
}
const results = []
let browser
let activePage
const cleanUrl = (value) => {
  const target = new URL(value)
  return target.origin + target.pathname
}
const inspect = (page) => {
  page.on("pageerror", (error) => observations.pageErrors.push(error.message))
  page.on("response", (response) => {
    const kind = response.request().resourceType()
    if (
      response.status() >= 400 &&
      ["image", "script", "stylesheet", "font", "media"].includes(kind)
    ) {
      observations.failedAssets.push({
        url: cleanUrl(response.url()),
        status: response.status(),
        kind,
      })
    }
    if (response.status() >= 500)
      observations.serverErrors.push({
        url: cleanUrl(response.url()),
        status: response.status(),
      })
  })
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname
    if (
      request.method() !== "GET" &&
      request.method() !== "HEAD" &&
      (/\/catalogue\/[^/]+\/install$/.test(pathname) ||
        /\/api\/(?:quizz|rooms|results)(?:\/|$)/.test(pathname))
    ) {
      observations.unexpectedWrites.push({
        path: pathname,
        method: request.method(),
      })
    }
  })
}
const checkpoint = () => {
  const report = {
    sourceSha,
    origin,
    platform: process.platform,
    results,
    observations,
    complete: false,
  }
  writeFileSync(
    join(evidence, "progress.json"),
    JSON.stringify(report, null, 2) + "\n",
  )
}
const record = (name, detail = {}) => {
  results.push({ name, passed: true, ...detail })
  checkpoint()
  console.log(JSON.stringify({ galleryCheck: name, passed: true, ...detail }))
}
const goto = async (page, path) => {
  const response = await page.goto(origin + path, {
    waitUntil: "domcontentloaded",
  })
  assert.equal(response?.status(), 200, "Page must load: " + path)
}
const screenshot = async (page, name) => {
  await page.screenshot({ path: join(evidence, name + ".png"), fullPage: true })
}
const imageDecode = async (page) => {
  const position = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }))
  for (const image of await page.locator("img:visible").all()) {
    await image.scrollIntoViewIfNeeded()
    await expect
      .poll(
        () =>
          image.evaluate(
            (element) => element.complete && element.naturalWidth > 0,
          ),
        { timeout: 15_000 },
      )
      .toBe(true)
  }
  await page.evaluate(({ x, y }) => window.scrollTo(x, y), position)
}

const readyPreview = async (page) => {
  await expect(page.locator(".game-preview-bottom").first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    page
      .locator('[data-native-application-preview][data-preview-ready="true"]')
      .first(),
  ).toBeVisible({ timeout: 30_000 })
}
const chooseNative = async (page, index) => {
  const mobile = page.locator(".catalogue-mobile-answers button").nth(index)
  if (await mobile.isVisible()) await mobile.click()
  else
    await page
      .getByTestId("tadazz-card-" + index)
      .first()
      .click()
}

try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
    reducedMotion: "reduce",
    ignoreHTTPSErrors: url.hostname !== "tadazz.com",
  })
  const page = await context.newPage()
  activePage = page
  inspect(page)
  const response = await context.request.get(
    origin + "/api/extensions/catalogue",
  )
  assert.equal(response.status(), 200)
  const { games } = await response.json()
  assert.deepEqual(games.map((game) => game.id).sort(), [...ids].sort())
  assert.equal(new Set(games.map((game) => game.themeId)).size, 10)
  assert.equal(
    games.reduce((count, game) => count + game.questionCount, 0),
    77,
  )
  const previews = new Map()
  for (const game of games) {
    const response = await context.request.get(
      origin + "/api/extensions/preview/public/" + game.id,
    )
    assert.equal(response.status(), 200, game.id + " preview API")
    const payload = await response.json()
    assert.equal(payload.source.kind, "published-demo")
    assert.equal(payload.source.catalogueId, game.id)
    assert.match(payload.source.immutableRevision, /^[a-f0-9]{64}$/)
    assert.equal(payload.show.title, game.title)
    assert.equal(payload.show.defaults.showTheme.id, game.themeId)
    assert.equal(
      payload.show.cards.filter((card) =>
        ["quiz", "survey"].includes(card.kind),
      ).length,
      game.questionCount,
    )
    assert(!JSON.stringify(payload).includes("accountId"))
    const cover = await context.request.get(origin + game.coverUrl)
    assert.equal(cover.status(), 200, "Public cover: " + game.id)
    assert.match(cover.headers()["content-type"], /^image\//)
    previews.set(game.id, payload)
  }
  assert.equal(
    (
      await context.request.get(
        origin + "/api/extensions/preview/public/not-a-public-game",
      )
    ).status(),
    404,
  )
  record("all-public-catalogue-and-preview-bindings", {
    games: 10,
    questions: 77,
    themes: 10,
  })

  await goto(page, "/?view=store")
  await expect(page.locator("[data-catalogue-card]")).toHaveCount(10)
  await imageDecode(page)
  await screenshot(page, "gallery-desktop")
  record("desktop-gallery-all-ten-cards")

  for (const game of games) {
    await goto(page, "/?view=store")
    await page.locator('[data-catalogue-preview="' + game.id + '"]').click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("game"))
      .toBe(game.id)
    await readyPreview(page)
    const slider = page
      .locator('.game-preview-timeline input[type="range"]')
      .first()
    await expect(slider).toBeEnabled()
    const last = await slider.getAttribute("max")
    assert(
      Number(last) >= game.questionCount,
      "Actual authored chapter timeline: " + game.id,
    )
    await slider.focus()
    await page.keyboard.press("End")
    await expect(slider).toHaveValue(last)
    await readyPreview(page)
    await page.keyboard.press("Home")
    await expect(slider).toHaveValue("0")
    await readyPreview(page)
    await imageDecode(page)
    await screenshot(page, "preview-" + game.id)
    record("preview-" + game.id, { chapters: Number(last) + 1 })

    await goto(page, "/?view=store")
    await page.locator('[data-catalogue-open="' + game.id + '"]').click()
    await expect(page.getByTestId("catalogue-play-sample")).toBeVisible()
    await expect(page.getByTestId("catalogue-use-game")).toBeVisible()
    await expect(page.getByTestId("catalogue-customise")).toBeVisible()
    await page.getByTestId("catalogue-play-sample").click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("game"))
      .toBe(game.id)

    if (game.id === "great-guessoff") {
      const gameRoot = page.getByTestId("great-guessoff-demo")
      const next = page.getByTestId("ggo-main-action")
      await expect(gameRoot).toHaveAttribute("data-ggo-phase", "intro")
      let votingRounds = 0
      for (let step = 0; step < 20; step++) {
        await expect(next).toBeEnabled({ timeout: 30_000 })
        const phase = await gameRoot.getAttribute("data-ggo-phase")
        if (phase === "closing") break
        if (phase === "voting") {
          await chooseNative(page, 0)
          votingRounds += 1
        }
        await next.click()
        await expect(next).toBeEnabled({ timeout: 30_000 })
      }
      await expect(gameRoot).toHaveAttribute("data-ggo-phase", "closing")
      assert.equal(votingRounds, 5)
      await screenshot(page, "complete-" + game.id)
      await next.click()
      await expect(gameRoot).toHaveAttribute("data-ggo-phase", "intro")
      record("play-complete-" + game.id, { rounds: votingRounds, replay: true })
    } else {
      const gameRoot = page.getByTestId("catalogue-game-demo")
      const next = page.getByTestId("catalogue-next")
      await expect(gameRoot).toHaveAttribute("data-catalogue-id", game.id)
      await expect(gameRoot).toHaveAttribute("data-theme-id", game.themeId)
      await expect(gameRoot).toHaveAttribute(
        "data-question-count",
        String(game.questionCount),
      )
      await expect(gameRoot).toHaveAttribute("data-game-phase", "intro")
      await next.click()
      const questions = previews
        .get(game.id)
        .show.cards.filter((card) => ["quiz", "survey"].includes(card.kind))
      for (let index = 0; index < questions.length; index++) {
        await expect(gameRoot).toHaveAttribute("data-game-phase", "voting", {
          timeout: 30_000,
        })
        await expect(gameRoot).toHaveAttribute(
          "data-question-index",
          String(index),
        )
        await expect(next).toBeEnabled({ timeout: 30_000 })
        await expect(
          page.getByTestId("tadazz-question-panel").first(),
        ).toContainText(questions[index].question)
        const answer = questions[index].correctAnswers[0]
          ? questions[index].correctAnswers[0] - 1
          : 0
        await chooseNative(page, answer)
        await expect(gameRoot).toHaveAttribute("data-game-phase", "results")
        await expect(next).toBeEnabled({ timeout: 30_000 })
        if (index === 0) {
          await imageDecode(page)
          await screenshot(page, "play-" + game.id)
        }
        await next.click()
      }
      await expect(gameRoot).toHaveAttribute("data-game-phase", "finish")
      await expect(next).toBeEnabled({ timeout: 30_000 })
      await screenshot(page, "complete-" + game.id)
      await next.click()
      await expect(gameRoot).toHaveAttribute("data-game-phase", "intro")
      record("play-complete-" + game.id, {
        rounds: questions.length,
        replay: true,
      })
    }
  }

  for (const mode of ["mobile", "hebrew"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: mode === "hebrew" ? "he-IL" : "en-GB",
      reducedMotion: "reduce",
      ignoreHTTPSErrors: url.hostname !== "tadazz.com",
    })
    const page = await context.newPage()
    activePage = page
    inspect(page)
    await goto(page, "/?view=store" + (mode === "hebrew" ? "&lng=he" : ""))
    await expect(page.locator("[data-catalogue-card]")).toHaveCount(10)
    if (mode === "hebrew")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    assert(overflow <= 1, "No horizontal overflow: " + mode)
    await imageDecode(page)
    await screenshot(page, "gallery-" + mode)
    const id = mode === "hebrew" ? "family" : "picture"
    await page.locator('[data-catalogue-open="' + id + '"]').click()
    await page.getByTestId("catalogue-play-sample").click()
    const gameRoot = page.getByTestId("catalogue-game-demo")
    await page.getByTestId("catalogue-next").click()
    await expect(gameRoot).toHaveAttribute("data-game-phase", "voting", {
      timeout: 30_000,
    })
    await expect(page.locator(".catalogue-mobile-answers button")).toHaveCount(
      4,
    )
    await imageDecode(page)
    await screenshot(page, "play-" + mode)
    await page.locator(".catalogue-mobile-answers button").first().click()
    await expect(gameRoot).toHaveAttribute("data-game-phase", "results")
    record(mode + "-gallery-and-real-vote")
    await context.close()
  }
  assert.deepEqual(observations.pageErrors, [], "No browser JavaScript errors")
  assert.deepEqual(observations.failedAssets, [], "No failed asset requests")
  assert.deepEqual(observations.serverErrors, [], "No server HTTP errors")
  assert.deepEqual(
    observations.unexpectedWrites,
    [],
    "Anonymous preview/play must not create saved games or rooms",
  )
  record("browser-resource-and-side-effect-boundaries")
  writeFileSync(
    join(evidence, "receipt.json"),
    JSON.stringify(
      {
        complete: true,
        passed: true,
        sourceSha,
        origin,
        platform: process.platform,
        browser: "chromium",
        results,
        observations,
      },
      null,
      2,
    ) + "\n",
  )
} catch (error) {
  try {
    if (activePage) await screenshot(activePage, "failure")
  } catch {}
  writeFileSync(
    join(evidence, "receipt.json"),
    JSON.stringify(
      {
        complete: true,
        passed: false,
        sourceSha,
        origin,
        platform: process.platform,
        results,
        observations,
        error: String(error?.stack ?? error),
      },
      null,
      2,
    ) + "\n",
  )
  console.error(error)
  process.exitCode = 1
} finally {
  await browser?.close()
}
