/** Real browser acceptance against a Linux-hosted candidate or the deployed site. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  verifyPublicViewers,
  verifyViewerGeometry,
} from "./viewer-controls-verify.mjs"
import {
  watchQuestionSequence,
  readQuestionSequence,
  stopQuestionSequence,
} from "./question-sequence-verify.mjs"
import {
  verifyNativePalette,
  verifyCatalogueCovers,
} from "./palette-verify.mjs"

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
  checkFailures: [],
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
        /\/api\/(?:quizz|games|rooms|results)(?:\/|$)/.test(pathname))
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
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(evidence, name + ".png"), fullPage: true })
}
const imageDecode = async (page, preloadCatalogue = false) => {
  if (preloadCatalogue) {
    const position = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }))
    // Gallery covers are stable elements; preload lazy artwork without live nth locators.
    const covers = await page
      .locator("[data-catalogue-cover] img")
      .elementHandles()
    for (const cover of covers) {
      await cover.scrollIntoViewIfNeeded()
      await expect
        .poll(
          () =>
            cover.evaluate((image) => image.complete && image.naturalWidth > 0),
          {
            timeout: 15_000,
          },
        )
        .toBe(true)
    }
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), position)
  }
  const preview = page.locator("[data-native-application-preview]").first()
  const images = (await preview.count())
    ? preview.locator("img")
    : page.locator("img")
  // Native frames may replace images while a chapter settles. Inspect one current DOM
  // snapshot per poll and keep the mounted preview in place while it decodes.
  await expect
    .poll(
      () =>
        images.evaluateAll((mounted) =>
          mounted
            .filter((image) => {
              const bounds = image.getBoundingClientRect()
              const style = getComputedStyle(image)
              return (
                bounds.width > 0 &&
                bounds.height > 0 &&
                bounds.bottom > 0 &&
                bounds.top < innerHeight &&
                bounds.right > 0 &&
                bounds.left < innerWidth &&
                style.display !== "none" &&
                style.visibility !== "hidden"
              )
            })
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src),
        ),
      { timeout: 15_000 },
    )
    .toEqual([])
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
const attempt = async (name, operation) => {
  try {
    await operation()
  } catch (error) {
    const detail = { name, passed: false, error: String(error?.stack ?? error) }
    results.push(detail)
    observations.checkFailures.push(detail)
    checkpoint()
    console.error(name + ": " + String(error))
    if (activePage)
      await screenshot(activePage, "failure-" + name).catch(() => {
        // The original assertion remains the recorded failure if capture is unavailable.
      })
  }
}

const chooseNative = async (page, index) => {
  const mobile = page
    .getByTestId("catalogue-mobile-question")
    .getByTestId("tadazz-pad-option-" + index)
  if (await mobile.isVisible()) await mobile.click()
  else
    await page
      .getByTestId("tadazz-card-" + index)
      .first()
      .click()
}

// Inspect the real native answer pad while voting is open. Capturing only this
// stable element avoids spending the short voting window decoding the whole page.
const verifyActiveMobileQuestion = async (page, question, id, mode, index) => {
  const companion = page.getByTestId("catalogue-mobile-question")
  const heading = companion.getByTestId("catalogue-mobile-question-heading")
  const frame = page.getByTestId(
    id === "great-guessoff"
      ? "great-guessoff-native-stage"
      : "catalogue-native-stage",
  )
  await expect(companion).toBeVisible()
  await expect(companion).toHaveAttribute("data-question-key", question.key)
  await expect(companion).toHaveAttribute("data-question-type", question.kind)
  await expect(companion).toHaveAttribute("data-phase", "voting")
  await expect(heading).toHaveText(question.question)
  await expect(frame).toHaveAttribute("aria-hidden", "true")
  const outsideStage = await companion.evaluate(
    (element) => !element.closest(".catalogue-player-frame, .ggo-native-frame"),
  )
  assert(
    outsideStage,
    "Readable question and controls must be outside the scaled stage",
  )
  const questionBounds = await heading.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      width: bounds.width,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      renderedTextHeight: range.getBoundingClientRect().height,
      clipped:
        element.scrollWidth > element.clientWidth + 1 ||
        element.scrollHeight > element.clientHeight + 1,
    }
  })
  assert(
    questionBounds.fontSize >= 18,
    "Mobile question must use readable typography",
  )
  assert(
    questionBounds.renderedTextHeight >= 18,
    "Question must not inherit the scaled host transform",
  )
  assert(
    questionBounds.width > 200 && !questionBounds.clipped,
    "Full authored question must fit",
  )
  const pad = companion.getByTestId("tadazz-answer-pad")
  await expect(pad.getByRole("button")).toHaveCount(question.answers.length)
  const optionMetrics = []
  for (
    let answerIndex = 0;
    answerIndex < question.answers.length;
    answerIndex++
  ) {
    const answer = question.answers[answerIndex]
    const option = pad.getByTestId("tadazz-pad-option-" + answerIndex)
    await expect(option).toBeVisible()
    await expect(option).toBeEnabled()
    await expect(option).toHaveAttribute("aria-pressed", "false")
    await expect(option.locator("p")).toHaveText(answer.text)
    await expect(frame.getByTestId("tadazz-card-" + answerIndex)).toBeDisabled()
    const metrics = await option.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const text = element.querySelector("p")
      const range = document.createRange()
      range.selectNodeContents(text)
      return {
        width: bounds.width,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        viewportWidth: innerWidth,
        fontSize: Number.parseFloat(getComputedStyle(text).fontSize),
        renderedTextHeight: range.getBoundingClientRect().height,
        clipped:
          text.scrollWidth > text.clientWidth + 1 ||
          text.scrollHeight > text.clientHeight + 1,
      }
    })
    assert(
      metrics.height >= 56,
      "Native mobile option needs a usable touch target",
    )
    assert(
      metrics.width >= 120,
      "Native mobile option must retain readable width",
    )
    assert(
      metrics.fontSize >= 16 && metrics.renderedTextHeight >= 16,
      "Actual answer text must be readable",
    )
    assert(!metrics.clipped, "Complete answer text must remain visible")
    assert(
      metrics.left >= -1 && metrics.right <= metrics.viewportWidth + 1,
      "Native choice must fit the phone width",
    )
    const image = option.getByTestId("answer-visual-image")
    if (answer.imageUrl) {
      await expect(image).toHaveCount(1)
      await expect(image).toBeVisible()
      await expect
        .poll(
          () =>
            image.evaluate((element) => ({
              loaded: element.complete && element.naturalWidth > 0,
              source: new URL(element.currentSrc || element.src).pathname,
            })),
          { timeout: 5_000 },
        )
        .toEqual({
          loaded: true,
          source: new URL(answer.imageUrl, origin).pathname,
        })
      const imageBounds = await image.boundingBox()
      assert(
        imageBounds && imageBounds.width >= 64 && imageBounds.height >= 64,
        "Authored answer image must be recognisable on a phone",
      )
    } else {
      await expect(image).toHaveCount(0)
    }
    optionMetrics.push({
      index: answerIndex,
      image: Boolean(answer.imageUrl),
      ...metrics,
    })
  }
  const questionImage = companion.getByTestId("catalogue-mobile-question-image")
  if (question.media?.type === "image") {
    await expect(questionImage).toBeVisible()
    await expect
      .poll(
        () =>
          questionImage.evaluate((element) => ({
            loaded: element.complete && element.naturalWidth > 0,
            source: new URL(element.currentSrc || element.src).pathname,
          })),
        { timeout: 5_000 },
      )
      .toEqual({
        loaded: true,
        source: new URL(question.media.url, origin).pathname,
      })
    const imageBounds = await questionImage.boundingBox()
    assert(
      imageBounds && imageBounds.width >= 200 && imageBounds.height >= 64,
      "Authored question image must remain readable",
    )
  } else {
    await expect(questionImage).toHaveCount(0)
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  )
  assert(overflow <= 1, "No active mobile game horizontal overflow")
  await companion.screenshot({
    path: join(evidence, "active-" + mode + "-" + id + "-" + index + ".png"),
    timeout: 5_000,
  })
  await expect(companion).toHaveAttribute("data-phase", "voting")
  return { questionBounds, options: optionMetrics }
}

const verifyMobileResult = async (page, question, selected) => {
  const companion = page.getByTestId("catalogue-mobile-question")
  await expect(companion).toHaveAttribute("data-phase", "results")
  await expect(
    companion.getByTestId("catalogue-mobile-question-heading"),
  ).toHaveText(question.question)
  const pad = companion.getByTestId("tadazz-answer-pad")
  await expect(pad.getByRole("button")).toHaveCount(question.answers.length)
  for (let index = 0; index < question.answers.length; index++) {
    const option = pad.getByTestId("tadazz-pad-option-" + index)
    await expect(option).toBeDisabled()
    await expect(option).toHaveAttribute(
      "aria-pressed",
      String(index === selected),
    )
  }
  await expect(
    companion.getByTestId("catalogue-mobile-selected-answer"),
  ).toContainText(question.answers[selected].text)
  const correct = companion.getByTestId("catalogue-mobile-correct-answer")
  if (question.kind === "quiz") {
    await expect(correct).toBeVisible()
    for (const answer of question.correctAnswers)
      await expect(correct).toContainText(question.answers[answer - 1].text)
  } else {
    await expect(correct).toHaveCount(0)
  }
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
  await imageDecode(page, true)
  await verifyCatalogueCovers(page, "public-desktop", evidence)
  await screenshot(page, "gallery-desktop")
  record("desktop-gallery-all-ten-cards")

  for (const game of games) {
    await attempt("preview-" + game.id, async () => {
      await goto(page, "/?view=store")
      await page.locator('[data-catalogue-preview="' + game.id + '"]').click()
      await expect
        .poll(() => new URL(page.url()).searchParams.get("game"))
        .toBe(game.id)
      await readyPreview(page)
      await verifyViewerGeometry(page, { label: "preview-" + game.id })
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
      await slider.focus()
      await page.keyboard.press("ArrowRight")
      await readyPreview(page)
      const firstQuestion = previews
        .get(game.id)
        .show.cards.find((card) => ["quiz", "survey"].includes(card.kind))
      await expect(
        page.getByTestId("tadazz-question-panel").first(),
      ).toContainText(firstQuestion.question)
      await page.keyboard.press("ArrowRight")
      await expect(slider).toHaveValue("2")
      await readyPreview(page)
      await verifyNativePalette(page, game.themeId, "preview", evidence)
      await page.keyboard.press("Home")
      await expect(slider).toHaveValue("0")
      await readyPreview(page)
      await imageDecode(page)
      await page.screenshot({
        path: join(evidence, "preview-" + game.id + ".png"),
        fullPage: false,
      })
      record("preview-" + game.id, { chapters: Number(last) + 1 })
    })
    await attempt("play-" + game.id, async () => {
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
        await watchQuestionSequence(gameRoot, {
          phaseAttribute: "data-ggo-phase",
        })
        const questionSequences = []
        let votingRounds = 0
        for (let step = 0; step < 20; step++) {
          await expect(next).toBeEnabled({ timeout: 30_000 })
          const phase = await gameRoot.getAttribute("data-ggo-phase")
          if (phase === "closing") break
          if (phase === "voting") {
            await expect(
              page.getByTestId("catalogue-mobile-question"),
            ).toBeHidden()
            await expect(
              page.getByTestId("great-guessoff-native-stage"),
            ).not.toHaveAttribute("aria-hidden", "true")
            if (votingRounds === 0)
              await verifyNativePalette(
                page,
                "tadazz-classic",
                "solo",
                evidence,
                false,
              )
            await chooseNative(page, 0)
            await expect(gameRoot).toHaveAttribute("data-ggo-phase", "results")
            questionSequences.push(
              await readQuestionSequence(gameRoot, votingRounds),
            )
            votingRounds += 1
          }
          await next.click()
          await expect(next).toBeEnabled({ timeout: 30_000 })
        }
        await expect(gameRoot).toHaveAttribute("data-ggo-phase", "closing")
        assert.equal(votingRounds, 5)
        await stopQuestionSequence(gameRoot)
        writeFileSync(
          join(evidence, "question-sequence-" + game.id + ".json"),
          JSON.stringify(questionSequences, null, 2) + "\n",
        )
        await screenshot(page, "complete-" + game.id)
        await next.click()
        await expect(gameRoot).toHaveAttribute("data-ggo-phase", "intro")
        record("play-complete-" + game.id, {
          rounds: votingRounds,
          replay: true,
          questionSequences: questionSequences.length,
        })
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
        await watchQuestionSequence(gameRoot)
        const questionSequences = []
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
            page.getByTestId("catalogue-mobile-question"),
          ).toBeHidden()
          await expect(
            page.getByTestId("catalogue-native-stage"),
          ).not.toHaveAttribute("aria-hidden", "true")
          await expect(
            page.getByTestId("tadazz-question-panel").first(),
          ).toContainText(questions[index].question)

          const answer = questions[index].correctAnswers[0]
            ? questions[index].correctAnswers[0] - 1
            : 0
          await chooseNative(page, answer)
          await expect(gameRoot).toHaveAttribute("data-game-phase", "results")
          await expect(next).toBeEnabled({ timeout: 30_000 })
          questionSequences.push(await readQuestionSequence(gameRoot, index))
          if (index === 0) {
            await verifyNativePalette(page, game.themeId, "solo", evidence)
            await imageDecode(page)
            await screenshot(page, "play-" + game.id)
          }
          await next.click()
        }
        await expect(gameRoot).toHaveAttribute("data-game-phase", "finish")
        await stopQuestionSequence(gameRoot)
        writeFileSync(
          join(evidence, "question-sequence-" + game.id + ".json"),
          JSON.stringify(questionSequences, null, 2) + "\n",
        )
        await expect(next).toBeEnabled({ timeout: 30_000 })
        await screenshot(page, "complete-" + game.id)
        await next.click()
        await expect(gameRoot).toHaveAttribute("data-game-phase", "intro")
        record("play-complete-" + game.id, {
          rounds: questions.length,
          replay: true,
          questionSequences: questionSequences.length,
        })
      }
    })
  }

  for (const mode of ["mobile", "hebrew"]) {
    await attempt("responsive-" + mode, async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: mode === "hebrew" ? "he-IL" : "en-GB",
        reducedMotion: "reduce",
        ignoreHTTPSErrors: url.hostname !== "tadazz.com",
      })
      const page = await context.newPage()
      activePage = page
      inspect(page)
      try {
        const languageQuery = mode === "hebrew" ? "&lng=he" : ""
        await goto(page, "/?view=store" + languageQuery)
        await expect(page.locator("[data-catalogue-card]")).toHaveCount(10)
        if (mode === "hebrew")
          await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        assert(overflow <= 1, "No horizontal overflow: " + mode)
        await imageDecode(page, true)
        await verifyCatalogueCovers(page, "public-" + mode, evidence)
        await screenshot(page, "gallery-" + mode)
        const priorFailures = observations.checkFailures.length
        for (const id of ["family", "picture", "great-guessoff"]) {
          await attempt("active-" + mode + "-" + id, async () => {
            await goto(page, "/?view=store" + languageQuery)
            await page.locator('[data-catalogue-open="' + id + '"]').click()
            await page.getByTestId("catalogue-play-sample").click()
            if (mode === "hebrew")
              await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
            const isGuessoff = id === "great-guessoff"
            const gameRoot = page.getByTestId(
              isGuessoff ? "great-guessoff-demo" : "catalogue-game-demo",
            )
            const phaseAttribute = isGuessoff
              ? "data-ggo-phase"
              : "data-game-phase"
            const next = page.getByTestId(
              isGuessoff ? "ggo-main-action" : "catalogue-next",
            )
            const questions = previews
              .get(id)
              .show.cards.filter((card) =>
                ["quiz", "survey"].includes(card.kind),
              )
              .slice(0, isGuessoff ? 2 : 1)
            await expect(gameRoot).toHaveAttribute(phaseAttribute, "intro")
            await next.click()
            for (let index = 0; index < questions.length; index++) {
              const question = questions[index]
              await expect(gameRoot).toHaveAttribute(phaseAttribute, "voting", {
                timeout: 30_000,
              })
              const metrics = await verifyActiveMobileQuestion(
                page,
                question,
                id,
                mode,
                index,
              )
              const selected = question.correctAnswers[0]
                ? question.correctAnswers[0] - 1
                : 0
              await chooseNative(page, selected)
              await expect(gameRoot).toHaveAttribute(phaseAttribute, "results")
              await verifyMobileResult(page, question, selected)
              record("active-" + mode + "-" + id + "-" + index, {
                questionKey: question.key,
                chosenAnswer: selected,
                realChoice: true,
                ...metrics,
              })
              if (index + 1 < questions.length) {
                await expect(next).toBeEnabled({ timeout: 30_000 })
                await next.click()
              }
            }
            await screenshot(page, "play-" + mode + "-" + id)
            if (
              (mode === "mobile" && id === "picture") ||
              (mode === "hebrew" && id === "family")
            )
              await screenshot(page, "play-" + mode)
          })
        }
        assert.equal(
          observations.checkFailures.length,
          priorFailures,
          "Every active mobile game must pass",
        )
        record(mode + "-gallery-and-real-vote", { games: 3, rounds: 4 })
      } finally {
        await context.close()
      }
    })
  }
  await verifyPublicViewers({
    browser,
    origin,
    ids,
    previews,
    evidence,
    inspect,
    record,
    onPage: (page) => {
      activePage = page
    },
  })

  assert.deepEqual(
    observations.checkFailures,
    [],
    "Every preview, game and responsive scenario must pass",
  )
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
