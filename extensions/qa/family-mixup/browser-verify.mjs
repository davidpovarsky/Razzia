/** Exercise the real family gallery player and capture reviewable stage evidence. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(new URL("../../package.json", import.meta.url))
const { chromium, expect } = require("@playwright/test")
const repository = fileURLToPath(new URL("../../../", import.meta.url))
const output = path.resolve(
  process.env.FAMILY_QA_OUTPUT ||
    path.join(repository, "../family-browser-evidence"),
)
const origin = process.env.FAMILY_QA_ORIGIN || "http://127.0.0.1:4319"
const report = {
  startedAt: new Date().toISOString(),
  origin,
  screenshots: [],
  questions: [],
  issues: [],
  pageErrors: [],
  failedAssets: [],
  fontResponses: [],
  apiResponses: [],
  authBootstrapAttempts: [],
  writes: [],
}
const correct = {
  2: 2,
  3: 3,
  4: 3,
  5: 2,
  6: 4,
  7: 3,
  9: 3,
  10: 2,
  11: 2,
  13: 2,
  14: 4,
  15: 4,
  18: 2,
  19: 3,
  20: 3,
  21: 2,
  22: 3,
  23: 1,
  26: 1,
  27: 4,
  28: 4,
  29: 1,
  30: 2,
  31: 1,
  34: 2,
  35: 4,
  36: 1,
  37: 1,
  38: 3,
  39: 4,
  42: 1,
  43: 4,
  44: 1,
  45: 2,
  46: 4,
  48: 1,
}
const captures = new Map([
  [1, "survey"],
  [2, "text"],
  [3, "macro"],
  [6, "duck-shadow"],
  [9, "animal-pictures"],
  [10, "three-hearts"],
  [14, "polar-bear"],
  [23, "rotation"],
  [28, "logic-boxes"],
  [36, "pattern"],
  [39, "jigsaw"],
  [46, "square-grid"],
  [48, "vault-finale"],
])
let server
let browser
let currentPage
let serverLog = ""
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))
const persist = () =>
  writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2))
function check(condition, message, evidence) {
  if (!condition) report.issues.push({ message, evidence })
}

async function startServer() {
  if (process.env.FAMILY_QA_EXTERNAL_SERVER === "1") return
  const address = new URL(origin)
  server = spawn(
    process.execPath,
    [
      "packages/web/node_modules/vite/bin/vite.js",
      "--config",
      "extensions/site.vite.config.ts",
      "--host",
      address.hostname,
      "--port",
      address.port || "4319",
      "--strictPort",
    ],
    {
      cwd: repository,
      env: {
        ...process.env,
        TADAZZ_SITE_ENABLED: "true",
        VITE_TADAZZ_INLINE_GAME_PREVIEW: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const collect = (data) => {
    serverLog = (serverLog + data).slice(-20000)
  }
  server.stdout.on("data", collect)
  server.stderr.on("data", collect)
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverLog}`)
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      /* The child is still starting. */
    }
    await pause(500)
  }
  throw new Error(`Vite did not become ready: ${serverLog}`)
}

async function observeGallery(page) {
  await page.getByTestId("catalogue-game-demo").evaluate((root) => {
    window.__familyQa = { phases: [], media: [] }
    const record = () => {
      const entry = {
        phase: root.getAttribute("data-game-phase"),
        scene: root.getAttribute("data-authored-scene"),
        question: Number(root.getAttribute("data-question-index")) + 1,
        at: performance.now(),
      }
      const previous = window.__familyQa.phases.at(-1)
      if (
        !previous ||
        previous.phase !== entry.phase ||
        previous.scene !== entry.scene ||
        previous.question !== entry.question
      )
        window.__familyQa.phases.push(entry)
    }
    new MutationObserver(record).observe(root, {
      attributes: true,
      attributeFilter: [
        "data-game-phase",
        "data-authored-scene",
        "data-question-index",
      ],
    })
    record()
    for (const name of ["loadedmetadata", "playing", "ended", "error"]) {
      root.addEventListener(
        name,
        (event) => {
          if (!(event.target instanceof HTMLVideoElement)) return
          const video = event.target
          window.__familyQa.media.push({
            event: name,
            url: video.currentSrc || video.src,
            duration: video.duration,
            time: video.currentTime,
            paused: video.paused,
            loop: video.loop,
            scene: root?.getAttribute("data-authored-scene"),
            nextDisabled: root.querySelector('[data-testid="catalogue-next"]')
              ?.disabled,
            at: performance.now(),
          })
        },
        true,
      )
    }
  })
}

async function installObservations(page) {
  page.on("pageerror", (error) => report.pageErrors.push(String(error)))
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/")) {
      report.apiResponses.push({
        url: response.url(),
        status: response.status(),
      })
    }
    if (/rubik.*\.woff2?(\?|$)/.test(response.url())) {
      report.fontResponses.push({
        url: response.url(),
        status: response.status(),
      })
    }
    if (
      response.status() >= 400 &&
      /\.(png|webp|mp4|mp3|woff2?|css|m?js)(\?|$)/.test(response.url())
    )
      report.failedAssets.push({
        url: response.url(),
        status: response.status(),
      })
  })
  await page.route("**/api/**", (route) => {
    const request = route.request()
    const url = new URL(request.url())
    // The root SocketProvider calls ensureSession() for a fresh browser. Keep
    // its exact anonymous bootstrap blocked and visible in the report; this is
    // not a game mutation or permission to allow any authentication request.
    if (
      request.method() === "POST" &&
      url.origin === new URL(origin).origin &&
      url.pathname === "/api/auth/session" &&
      url.search === "" &&
      request.postData() === "{}" &&
      !request.headers().authorization
    ) {
      report.authBootstrapAttempts.push({
        url: request.url(),
        method: request.method(),
        bodyShape: "empty-object",
        action: "aborted",
      })
      return route.abort()
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      report.writes.push({ url: request.url(), method: request.method() })
      return route.abort()
    }
    return route.continue()
  })
}

async function capture(
  page,
  name,
  locator = page.getByTestId("catalogue-native-stage"),
) {
  const filename = `${name}.png`
  // Observe short entrance animations to completion. Never finish, pause or seek
  // the native countdown: a screenshot must not change the game's clock.
  await locator.evaluate(async (element) => {
    const entrances = element
      .getAnimations({ subtree: true })
      .filter((animation) => {
        const end = animation.effect?.getComputedTiming().endTime
        return (
          animation.playState === "running" &&
          typeof end === "number" &&
          end > 0 &&
          end < 5000
        )
      })
    await Promise.allSettled(entrances.map((animation) => animation.finished))
  })
  await locator.screenshot({
    path: path.join(output, filename),
    animations: "allow",
  })
  report.screenshots.push(filename)
  console.log(`Captured ${filename}`)
}

async function layout(page, label) {
  const evidence = await page
    .getByTestId("catalogue-native-stage")
    .evaluate((element) => {
      const world = [...element.querySelectorAll(".fm-world")].find((node) => {
        const bounds = node.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0
      })
      if (!world) return { error: "Family world is missing" }
      const stage = world.closest(".tzv4-stage")
      const bounds = world.getBoundingClientRect()
      const selectors =
        ".fm-question-text,.fm-choice,.fm-answer-title,.fm-round-pill,.fm-clock,.fm-status,.fm-result-note,.fm-event-title,.fm-board-heading,.fm-team"
      const issues = []
      for (const node of world.querySelectorAll(selectors)) {
        const box = node.getBoundingClientRect()
        if (!box.width || !box.height) continue
        const text = node.textContent.trim().slice(0, 130)
        if (
          box.left < bounds.left - 2 ||
          box.right > bounds.right + 2 ||
          box.top < bounds.top - 2 ||
          box.bottom > bounds.bottom + 2
        )
          issues.push({
            reason: "outside-stage",
            selector: node.className,
            text,
          })
        if (
          node.matches(".fm-question-text,.fm-answer-title,.fm-result-note") &&
          (node.scrollWidth > node.clientWidth + 2 ||
            node.scrollHeight > node.clientHeight + 2)
        )
          issues.push({
            reason: "text-overflow",
            selector: node.className,
            text,
            client: [node.clientWidth, node.clientHeight],
            scroll: [node.scrollWidth, node.scrollHeight],
          })
        if (node.matches(".fm-answer-title")) {
          const body = node.closest(".fm-choice-body").getBoundingClientRect()
          if (
            box.left < body.left - 2 ||
            box.right > body.right + 2 ||
            box.top < body.top - 2 ||
            box.bottom > body.bottom + 2
          )
            issues.push({ reason: "answer-clipped", text })
        }
      }
      const images = [...world.querySelectorAll("img")].map((image) => ({
        url: image.currentSrc || image.src,
        loaded: image.complete && image.naturalWidth > 0,
        fit: getComputedStyle(image).objectFit,
      }))
      const heading = world.querySelector(".fm-question-text")
      const clock = world.querySelector(".fm-clock")
      const clockBounds = clock?.getBoundingClientRect()
      return {
        family: stage?.getAttribute("data-original-family"),
        aspect: bounds.width / bounds.height,
        font: getComputedStyle(world).fontFamily,
        headingColor: heading ? getComputedStyle(heading).color : null,
        clockVisible: Boolean(clockBounds?.width && clockBounds?.height),
        issues,
        images,
      }
    })
  check(!evidence.error, `${label}: family renderer exists`, evidence)
  if (evidence.error) return evidence
  check(
    evidence.family === "family-mixup",
    `${label}: family theme is active`,
    evidence.family,
  )
  check(
    Math.abs(evidence.aspect - 16 / 9) < 0.015,
    `${label}: stage is 16:9`,
    evidence.aspect,
  )
  check(
    evidence.font.includes("Rubik"),
    `${label}: modern theme typography is active`,
    evidence.font,
  )
  check(
    evidence.issues.length === 0,
    `${label}: content fits the stage and cards`,
    evidence.issues,
  )
  check(
    evidence.images.every((image) => image.loaded),
    `${label}: images loaded`,
    evidence.images.filter((image) => !image.loaded),
  )
  return evidence
}

async function questionIdentity(page, phase) {
  const evidence = await page
    .getByTestId("catalogue-native-stage")
    .evaluate((element, phase) => {
      const panel = element.querySelector(".fm-question")
      const heading = element.querySelector(".fm-question-text")
      const text = heading?.textContent
      if (phase === "question") {
        element.__identity = { panel, heading, text }
        return {
          phase,
          text,
          panel: Boolean(panel),
          heading: Boolean(heading),
          count: element.querySelectorAll(".fm-question-text").length,
        }
      }
      const baseline = element.__identity
      return {
        phase,
        text,
        panel: baseline?.panel === panel,
        heading: baseline?.heading === heading,
        sameText: baseline?.text === text,
        count: element.querySelectorAll(".fm-question-text").length,
      }
    }, phase)
  check(
    evidence.panel &&
      evidence.heading &&
      evidence.count === 1 &&
      evidence.sameText !== false,
    `${phase}: question panel and heading retain their identity`,
    evidence,
  )
  return evidence
}

async function gallery(page) {
  await page.goto(`${origin}/?view=demo&game=family-mixup`, {
    waitUntil: "networkidle",
  })
  const root = page.getByTestId("catalogue-game-demo")
  await expect(root).toHaveAttribute("data-question-count", "48")
  await expect(root).toHaveAttribute("data-theme-id", "family-mixup")
  await expect(root).toHaveAttribute("data-game-phase", "intro")
  await observeGallery(page)
  await capture(page, "00-opening")
  report.opening = await layout(page, "Opening")
  const next = page.getByTestId("catalogue-next")
  await next.click()

  for (let number = 1; number <= 48; number += 1) {
    await page
      .locator(
        `[data-testid="catalogue-game-demo"][data-question-index="${number - 1}"][data-game-phase="question"]`,
      )
      .waitFor({ state: "attached", timeout: 35000 })
    const identity = [await questionIdentity(page, "question")]
    await expect(root).toHaveAttribute("data-game-phase", "voting", {
      timeout: 10000,
    })
    await expect(page.locator(".fm-choice").first()).toBeEnabled()
    identity.push(await questionIdentity(page, "voting"))
    if (number === 2) {
      const clock = page.locator(".fm-clock .countdown-value")
      const before = Number(await clock.textContent())
      check(
        before > 0,
        "Q2 voting starts with a positive live countdown",
        before,
      )
      await expect
        .poll(async () => Number(await clock.textContent()), { timeout: 3500 })
        .toBeLessThan(before)
      const after = Number(await clock.textContent())
      check(
        after > 0 && after < before,
        "Q2 countdown decreases naturally while voting stays open",
        { before, after },
      )
      await expect(root).toHaveAttribute("data-game-phase", "voting")
      report.liveClock = { before, after }
    }
    await expect
      .poll(
        () =>
          page
            .getByTestId("catalogue-native-stage")
            .locator(".fm-world img")
            .evaluateAll((images) =>
              images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        { timeout: 10000 },
      )
      .toBe(true)
    const votingLayout = await layout(page, `Q${number} voting`)
    check(
      votingLayout.clockVisible,
      `Q${number}: voting clock is visible`,
      votingLayout,
    )
    if (captures.has(number))
      await capture(
        page,
        `q${String(number).padStart(2, "0")}-${captures.get(number)}-voting`,
      )
    if (number === 6) {
      report.duck = await page
        .locator(".fm-shadow-puzzle")
        .evaluate((element) => ({
          source: element.querySelector(".fm-question-image")?.src,
          choices: [...element.querySelectorAll(".fm-answer-image")].map(
            (image) => ({
              src: image.src,
              filter: getComputedStyle(image).filter,
            }),
          ),
        }))
      check(
        report.duck.source === report.duck.choices[3]?.src &&
          report.duck.choices.every(
            (image) => image.filter === "brightness(0)",
          ),
        "Q6 uses the exact approved duck alpha for the correct silhouette",
        report.duck,
      )
    }
    const choice = (correct[number] ?? 1) - 1
    await page.locator(`.fm-choice[data-v4-choice="${choice}"]`).click()
    await expect(root).toHaveAttribute("data-game-phase", "results")
    await expect(next).toBeEnabled({ timeout: 15000 })
    identity.push(await questionIdentity(page, "results"))
    if (correct[number]) {
      await expect(
        page.locator(`.fm-choice[data-v4-choice="${choice}"]`),
      ).toHaveClass(/is-correct/)
    }
    const resultLayout = await layout(page, `Q${number} results`)
    if ([1, 2, 3, 6, 10, 14, 36, 39, 48].includes(number))
      await capture(page, `q${String(number).padStart(2, "0")}-results`)
    report.questions.push({
      number,
      kind: correct[number] ? "quiz" : "survey",
      chosen: choice + 1,
      identity,
      votingLayout,
      resultLayout,
    })
    await persist()
    console.log(
      `Verified Q${String(number).padStart(2, "0")}/48 (${correct[number] ? "quiz" : "survey"})`,
    )
    await next.click()
    if ([16, 32, 48].includes(number)) {
      await expect(root).toHaveAttribute("data-game-phase", "checkpoint")
      await expect(page.getByTestId("tadazz-leaderboard-screen")).toBeVisible()
      await expect(next).toBeEnabled()
      await capture(page, `after-q${number}-leaderboard`)
      await layout(page, `Leaderboard after Q${number}`)
      if (number === 48) {
        report.finalScore = await page
          .locator(".fm-team .team-score")
          .textContent()
        check(
          /36[,. ]?000/.test(report.finalScore),
          "All 36 correct answers score 36,000 points",
          report.finalScore,
        )
      }
      await next.click()
    }
  }
  await expect(root).toHaveAttribute("data-game-phase", "finish")
  await capture(page, "closing")
  report.browser = await page.evaluate(() => window.__familyQa)
  const ended = report.browser.media.filter((event) => event.event === "ended")
  check(
    ended.length === 9,
    "All nine observation/reveal videos reach their natural end",
    ended,
  )
  check(
    ended.every((event) => !event.loop && event.nextDisabled),
    "Clips are finite and cannot be bypassed with Next",
    ended,
  )
  check(
    !report.browser.media.some((event) => event.event === "error"),
    "Media has no playback error",
    report.browser.media.filter((event) => event.event === "error"),
  )
  const introKeys = new Set(
    report.browser.phases
      .filter(
        (event) =>
          event.phase === "interlude" &&
          /^family-round-[1-6]$/.test(event.scene ?? ""),
      )
      .map((event) => event.scene),
  )
  check(introKeys.size === 6, "All six round introductions are presented", [
    ...introKeys,
  ])
  await page.setViewportSize({ width: 390, height: 844 })
  await next.click()
  await next.click()
  await expect(root).toHaveAttribute("data-game-phase", "voting", {
    timeout: 15000,
  })
  await expect(page.getByTestId("catalogue-mobile-question")).toBeVisible()
  report.mobile = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }))
  check(
    report.mobile.documentWidth <= report.mobile.width + 1,
    "Portrait controls have no horizontal page overflow",
    report.mobile,
  )
  await capture(page, "mobile-survey", page.locator(".game-viewer-dialog"))
  console.log(
    "Completed all 48 questions, media, checkpoints and portrait smoke check",
  )
}

async function nativePreview(page) {
  await page.setViewportSize({ width: 1920, height: 1200 })
  await page.goto(`${origin}/?view=preview&game=family-mixup`, {
    waitUntil: "networkidle",
  })
  const slider = page
    .locator('.game-preview-timeline input[type="range"]')
    .first()
  const stage = page
    .locator('[data-native-application-preview][data-preview-ready="true"]')
    .first()
  await expect(slider).toBeEnabled({ timeout: 30000 })
  await expect(slider).toHaveAttribute("aria-busy", "false")
  await expect(stage).toBeVisible({ timeout: 30000 })
  await expect(
    page.locator('[data-preview-theme="family-mixup"]').first(),
  ).toBeVisible()
  const last = Number(await slider.getAttribute("max"))
  // 48 question voting/locked/result stops plus 21 native authored scene stops.
  check(
    last === 164,
    "Native preview exposes every authored scene and question result",
    last + 1,
  )
  await capture(page, "native-preview-opening", stage)
  await slider.focus()
  await slider.press("End")
  await expect(slider).toHaveValue(String(last))
  await expect(slider).toHaveAttribute("aria-busy", "false", { timeout: 30000 })
  await expect(stage).toHaveAttribute("data-preview-chapter-index", "260", {
    timeout: 30000,
  })
  await expect(stage).toContainText("Thanks for playing together!")
  await capture(page, "native-preview-closing", stage)
  await slider.press("Home")
  await expect(slider).toHaveValue("0")
  await expect(slider).toHaveAttribute("aria-busy", "false", { timeout: 30000 })
  await slider.press("ArrowRight")
  await slider.press("ArrowRight")
  await expect(slider).toHaveValue("2")
  await expect(slider).toHaveAttribute("aria-busy", "false", { timeout: 30000 })
  await expect(stage).toHaveAttribute("data-preview-phase", "voting", {
    timeout: 30000,
  })
  await expect(stage.locator(".fm-choice")).toHaveCount(4)
  await capture(page, "native-preview-survey", stage)
  report.nativePreview = {
    navigationStops: last + 1,
    finalRawChapter: 260,
    survey: await stage.locator(".fm-question-text").textContent(),
  }
  await persist()
  console.log(
    "Verified full native preview timeline and rendered family survey",
  )
}

async function failedClipReplay(context) {
  const page = await context.newPage()
  currentPage = page
  await installObservations(page)
  let allowClip = false
  let blocked = 0
  await page.route("**/cups-observe.mp4", (route) => {
    if (allowClip) return route.continue()
    blocked += 1
    return route.abort("failed")
  })
  await page.goto(`${origin}/?view=demo&game=family-mixup`, {
    waitUntil: "networkidle",
  })
  const root = page.getByTestId("catalogue-game-demo")
  const next = page.getByTestId("catalogue-next")
  await observeGallery(page)
  await next.click()
  for (let number = 1; number <= 3; number += 1) {
    await expect(root).toHaveAttribute("data-game-phase", "voting", {
      timeout: 15000,
    })
    await expect(root).toHaveAttribute(
      "data-question-index",
      String(number - 1),
    )
    await page
      .locator(`.fm-choice[data-v4-choice="${(correct[number] ?? 1) - 1}"]`)
      .click()
    await expect(next).toBeEnabled({ timeout: 15000 })
    await next.click()
  }
  await expect(root).toHaveAttribute(
    "data-authored-scene",
    "family-q04-observe",
    { timeout: 15000 },
  )
  await expect(page.getByTestId("catalogue-authored-media")).toHaveAttribute(
    "data-media-state",
    "error",
    { timeout: 15000 },
  )
  await expect(root).toHaveAttribute("data-game-phase", "media")
  await expect(page.getByRole("alert")).toContainText("Replay it to continue")
  await capture(page, "media-error-replay")
  allowClip = true
  await next.click()
  await expect(root).toHaveAttribute(
    "data-authored-scene",
    "family-q04-observe",
  )
  await expect(page.getByTestId("catalogue-authored-media")).toHaveAttribute(
    "data-media-state",
    "playing",
  )
  await expect(next).toBeDisabled()
  await expect(root).toHaveAttribute("data-game-phase", "voting", {
    timeout: 20000,
  })
  await expect(root).toHaveAttribute("data-question-index", "3")
  const media = await page.evaluate(() => window.__familyQa.media)
  check(
    blocked > 0 &&
      media.some(
        (event) =>
          event.event === "ended" && event.url.endsWith("/cups-observe.mp4"),
      ),
    "A failed observation stays blocked and replays the same clip before Q4",
    { blocked, media },
  )
  report.failedClipReplay = { blocked, recoveredQuestion: 4, media }
  await persist()
  await page.close()
  console.log(
    "Verified failed observation cannot be skipped and recovers through Replay",
  )
}

try {
  await mkdir(output, { recursive: true })
  await startServer()
  browser = await chromium.launch({
    executablePath: process.env.FAMILY_QA_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 1,
    locale: "en-US",
  })
  await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  const page = await context.newPage()
  currentPage = page
  await installObservations(page)
  await nativePreview(page)
  await gallery(page)
  await failedClipReplay(context)
  check(
    report.pageErrors.length === 0,
    "No uncaught browser errors",
    report.pageErrors,
  )
  check(
    report.failedAssets.length === 0,
    "All requested assets return successfully",
    report.failedAssets,
  )
  check(
    report.fontResponses.some((response) => response.status === 200),
    "The Rubik font is served successfully",
    report.fontResponses,
  )
  check(
    report.writes.length === 0,
    "Gallery play attempts no game-data or other non-bootstrap API writes",
    report.writes,
  )
  console.log(
    `Recorded and aborted ${report.authBootstrapAttempts.length} anonymous app session bootstrap request(s)`,
  )
  report.completedAt = new Date().toISOString()
  report.status = report.issues.length ? "failed" : "passed"
  await persist()
  assert.equal(report.issues.length, 0, JSON.stringify(report.issues, null, 2))
  console.log(`Family gallery browser verification passed. Evidence: ${output}`)
} catch (error) {
  report.status = "failed"
  report.fatalError = String(error.stack || error)
  report.serverLog = serverLog
  if (currentPage && !currentPage.isClosed()) {
    try {
      const catalogue = currentPage.getByTestId("catalogue-game-demo")
      if (await catalogue.count()) {
        report.failureState = await catalogue.evaluate((root) => ({
          phase: root.getAttribute("data-game-phase"),
          scene: root.getAttribute("data-authored-scene"),
          question: root.getAttribute("data-question-index"),
          nextDisabled: root.querySelector('[data-testid="catalogue-next"]')
            ?.disabled,
          observations: window.__familyQa,
        }))
        report.failurePage = await catalogue.innerText({ timeout: 3000 })
      } else {
        report.failurePage = await currentPage
          .locator(".game-viewer-dialog")
          .first()
          .innerText({ timeout: 3000 })
      }
      await currentPage.screenshot({
        path: path.join(output, "failure.png"),
        fullPage: true,
        timeout: 5000,
      })
    } catch {
      /* Preserve the original error when the browser itself failed. */
    }
  }
  await persist()
  console.error(report.fatalError)
  process.exitCode = 1
} finally {
  await browser?.close()
  server?.kill("SIGTERM")
}
