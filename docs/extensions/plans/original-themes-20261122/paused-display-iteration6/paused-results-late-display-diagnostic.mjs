/**
 * Diagnostic only. Run on the isolated Oracle preflight source, never production.
 * This module does not mint a release receipt and changes no product source.
 *
 * node /cleanup/extensions/node_modules/tsx/dist/cli.mjs \
 *   --tsconfig /source/tsconfig.json \
 *   /diagnostics/paused-results-late-display-diagnostic.mjs
 *
 * Standalone execution creates its own disposable two-question host. The
 * exported probe advances to Q2; do not inject it into the four-question suite.
 */
import assert from "node:assert/strict"
import { randomBytes, randomUUID, createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const sourceRoot = resolve(process.env.TADAZZ_DIAGNOSTIC_SOURCE_ROOT ?? "/source")
const evidenceRoot = resolve(process.env.TADAZZ_PAUSED_DISPLAY_EVIDENCE ?? "/evidence/paused-display")
const playwright = () => createRequire("/cleanup/extensions/package.json")("@playwright/test")
const write = (directory, name, data) => {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), JSON.stringify(data, null, 2) + "\n")
}

// Pure observer: it never seeks, pauses, finishes, or replaces any animation.
function observePausedDisplay(expected) {
  const identities = new WeakMap()
  const lastTimes = new Map()
  const pausedTimes = new Map()
  const finiteIds = new Set()
  const violations = []
  const seenViolations = new Set()
  const samples = []
  const transitions = []
  const firstFrames = []
  let nextId = 1
  let stopped = false
  let pausedFrames = 0
  let observedFrames = 0
  let firstSampleAt = null
  let lastSampleAt = null
  let committedAt = null
  let contentAtCommit = null
  let transitionKey = null
  let unpausedFiniteAdvanceCount = 0
  const unpausedQuestionMotion = []
  let latest = null

  const violation = (kind, detail) => {
    const key = `${kind}:${detail.id ?? detail.problem ?? ""}`
    if (!seenViolations.has(key)) {
      seenViolations.add(key)
      violations.push({ kind, ...detail })
    }
  }
  const visible = (element, stage) => {
    if (!element) return false
    const box = element.getBoundingClientRect()
    const stageBox = stage.getBoundingClientRect()
    if (box.width <= 0.5 || box.height <= 0.5 ||
        box.right <= stageBox.left || box.left >= stageBox.right ||
        box.bottom <= stageBox.top || box.top >= stageBox.bottom) return false
    let opacity = 1
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === "none" || style.visibility !== "visible") return false
      opacity *= Number(style.opacity)
    }
    return opacity >= 0.95
  }
  const snapshotContent = (stage) => {
    const heading = stage.querySelector(".q-text")
    const cards = [...stage.querySelectorAll("[data-v4-choice]")]
    return {
      heading: heading?.textContent?.trim() ?? null,
      headingVisible: visible(heading, stage),
      cards: cards.map((card) => {
        const percentage = card.querySelector(".result-percentage")
        const title = card.querySelector(".answer-title")
        return {
          index: card.getAttribute("data-v4-choice"),
          title: title?.textContent?.trim() ?? null,
          titleVisible: visible(title, stage),
          percentage: percentage?.textContent?.trim() ?? null,
          target: percentage?.getAttribute("data-target-percentage") ?? null,
          percentageVisible: visible(percentage, stage),
          correct: card.classList.contains("is-correct"),
        }
      }),
    }
  }
  const contentProblems = (content) => {
    const problems = []
    if (content.heading !== expected.questionText) problems.push("wrong question heading")
    if (!content.headingVisible) problems.push("question heading is not fully visible")
    if (content.cards.length !== expected.percentages.length) problems.push("wrong card count")
    expected.percentages.forEach((value, index) => {
      const card = content.cards.find((item) => item.index === String(index))
      if (!card) {
        problems.push(`missing card ${index}`)
        return
      }
      if (card.title !== expected.answers[index] || !card.titleVisible) problems.push(`card ${index} title`)
      if (card.target !== String(value) || card.percentage !== `${value}%` || !card.percentageVisible) {
        problems.push(`card ${index} final percentage`)
      }
      if (card.correct !== (index === expected.correctIndex)) problems.push(`card ${index} correctness`)
    })
    return problems
  }
  const frame = () => {
    if (stopped) return
    const host = document.querySelector('[data-testid="tadazz-show"]')
    const stage = host?.querySelector(".tzv4-stage")
    if (host && stage) {
      const paused = host.getAttribute("data-game-paused") === "true"
      const phase = host.getAttribute("data-show-scene")
      const scene = stage.getAttribute("data-v4-scene")
      const isNextQuestion = !paused &&
        ["question", "picture-answers", "question-image"].includes(scene) &&
        stage.querySelector(".q-text")?.textContent?.trim() === expected.nextQuestionText
      const key = `${paused}:${phase}:${scene}`
      if (key !== transitionKey && transitions.length < 80) {
        transitions.push({ at: performance.now(), paused, phase, scene })
        transitionKey = key
      }
      const finite = []
      for (const animation of stage.getAnimations({ subtree: true })) {
        const effect = animation.effect
        const timing = effect?.getTiming()
        const computed = effect?.getComputedTiming()
        const target = effect?.target
        if (!(target instanceof Element) || !stage.contains(target) ||
            !computed || !Number.isFinite(computed.endTime) || timing.iterations === Infinity) continue
        let id = identities.get(animation)
        if (id === undefined) {
          id = nextId++
          identities.set(animation, id)
        }
        finiteIds.add(id)
        const currentTime = typeof animation.currentTime === "number" ? animation.currentTime : null
        const previous = lastTimes.get(id)
        const isQuestionDecoration = target.matches(".q-frame,.q-text,.eyebrow,.choice-slot") &&
          !target.closest(".countdown-floater")
        if (isNextQuestion && isQuestionDecoration && currentTime !== null &&
            typeof previous === "number" && currentTime > previous + 2 &&
            animation.playState === "running") {
          unpausedFiniteAdvanceCount += 1
          if (unpausedQuestionMotion.length < 20) {
            unpausedQuestionMotion.push({
              id, scene, phase, heading: expected.nextQuestionText,
              target: target.getAttribute("class"), previousTime: previous, currentTime,
            })
          }
        }
        lastTimes.set(id, currentTime)
        finite.push({
          id,
          target: (target.getAttribute("data-testid") ?? target.getAttribute("class") ?? target.tagName).slice(0, 180),
          currentTime,
          playState: animation.playState,
          pending: animation.pending,
          endTime: computed.endTime,
        })
      }
      latest = { at: performance.now(), paused, phase, scene, finite }
      if (paused && phase === "results" && scene === "survey-results") {
        pausedFrames += 1
        const content = snapshotContent(stage)
        if (committedAt === null) {
          committedAt = performance.now()
          contentAtCommit = content
        }
        if (pausedFrames <= 2) {
          firstFrames.push({ ...latest, content })
        } else {
          firstSampleAt ??= performance.now()
          lastSampleAt = performance.now()
          observedFrames += 1
          const problems = contentProblems(content)
          for (const problem of problems) violation("incomplete-authoritative-results", { problem })
          for (const item of finite) {
            if (item.playState === "running" || item.pending) {
              violation("finite-animation-running-while-paused", item)
            }
            const previous = pausedTimes.get(item.id)
            if (typeof previous === "number" && item.currentTime !== null &&
                Math.abs(item.currentTime - previous) > 2) {
              violation("finite-animation-time-advanced-while-paused", { ...item, previousTime: previous })
            }
            pausedTimes.set(item.id, item.currentTime)
          }
          if (samples.length < 180) samples.push({ ...latest, content, contentProblems: problems })
        }
      }
    }
    requestAnimationFrame(frame)
  }
  globalThis.__pausedDisplayDiagnostic = {
    read: () => ({
      reducedMotionPreference: matchMedia("(prefers-reduced-motion: reduce)").matches,
      committedAt,
      contentAtCommit,
      firstFrames,
      observedFrames,
      observedWindowMs: firstSampleAt === null || lastSampleAt === null ? 0 : lastSampleAt - firstSampleAt,
      finiteAnimationCount: finiteIds.size,
      unpausedFiniteAdvanceCount,
      unpausedQuestionMotion,
      violations,
      transitions,
      samples,
      latest,
    }),
    stop: () => { stopped = true },
  }
  requestAnimationFrame(frame)
}

export async function probePausedResultsLateDisplay({
  browser, hostPage, origin, gameId, questionText, answers,
  percentages = [100, 0], correctIndex = 1,
  nextQuestionText, nextQuestionCounter = "2 / 2", evidence = evidenceRoot,
}) {
  const { expect } = playwright()
  mkdirSync(evidence, { recursive: true })
  const report = {
    format: "tadazz-paused-results-late-display-diagnostic",
    version: 1,
    preparationOnly: true,
    releaseQualified: false,
    productionChanged: false,
    customerMountUsed: false,
    family: "royal-quiz",
    checks: [],
    browserErrors: [],
  }
  const check = (name, passed, detail) => report.checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) })
  const host = hostPage.getByTestId("tadazz-show")
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB", reducedMotion: "no-preference", ignoreHTTPSErrors: true,
  })
  await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  await context.addInitScript(observePausedDisplay, { questionText, nextQuestionText, answers, percentages, correctIndex })
  const display = await context.newPage()
  display.on("pageerror", (error) => report.browserErrors.push(String(error)))
  let ownsPause = false
  try {
    await expect(host).toHaveAttribute("data-show-scene", "results", { timeout: 30000 })
    await expect(host).toHaveAttribute("data-game-paused", "false")
    await expect(host.locator(".q-text")).toHaveText(questionText)
    for (const [index, percentage] of percentages.entries()) {
      await expect(host.getByTestId(`tadazz-card-${index}`).locator(".result-percentage")).toHaveText(`${percentage}%`)
    }
    await hostPage.getByTestId("host-pause-resume-btn").click()
    ownsPause = true
    await expect(host).toHaveAttribute("data-game-paused", "true")
    await expect(hostPage.getByTestId("host-pause-resume-btn")).toHaveAttribute("aria-label", /resume/iu)

    await display.goto(`${origin}/display/${gameId}?lng=en`, { waitUntil: "domcontentloaded" })
    const late = display.getByTestId("tadazz-show")
    await expect(late).toHaveAttribute("data-game-paused", "true", { timeout: 30000 })
    await expect(late).toHaveAttribute("data-show-scene", "results")
    await expect(late).toHaveAttribute("data-show-theme", "royal-quiz")
    await expect(late.locator(".tzv4-stage")).toHaveAttribute("data-original-family", "royal-quiz")
    await display.waitForFunction(() => {
      const value = globalThis.__pausedDisplayDiagnostic?.read()
      return value?.observedFrames >= 8 && value.observedWindowMs >= 800
    }, undefined, { timeout: 15000, polling: 50 })
    report.pausedWindow = await display.evaluate(() => globalThis.__pausedDisplayDiagnostic.read())
    check("normal-motion-display-preference", report.pausedWindow.reducedMotionPreference === false)
    check("final-results-committed-and-observed-after-two-frames", report.pausedWindow.observedFrames >= 8 && report.pausedWindow.observedWindowMs >= 800)
    check("paused-final-results-and-finite-scene-time-stable", report.pausedWindow.violations.length === 0, report.pausedWindow.violations)
    await display.screenshot({ path: join(evidence, "paused-results-late-display.png"), fullPage: true })

    // Even a failed pause observation must record whether ordinary resume works.
    await hostPage.getByTestId("host-pause-resume-btn").click()
    ownsPause = false
    await expect(host).toHaveAttribute("data-game-paused", "false")
    await expect(late).toHaveAttribute("data-game-paused", "false")
    await expect(hostPage.getByTestId("host-next-screen-btn")).toBeEnabled()
    await hostPage.getByTestId("host-next-screen-btn").click()
    await expect(host).toHaveAttribute("data-show-scene", "voting", { timeout: 30000 })
    await expect(hostPage.getByTestId("host-question-counter")).toHaveText(nextQuestionCounter)
    await expect(late).toHaveAttribute("data-show-scene", "voting", { timeout: 30000 })
    await expect(late.locator(".q-text")).toHaveText(nextQuestionText)
    await display.waitForFunction(() => globalThis.__pausedDisplayDiagnostic?.read().unpausedFiniteAdvanceCount > 0,
      undefined, { timeout: 10000, polling: 50 })
    report.afterResume = await display.evaluate(() => globalThis.__pausedDisplayDiagnostic.read())
    check("resume-and-next-question-progress-with-normal-motion", report.afterResume.unpausedFiniteAdvanceCount > 0)
    check("no-browser-errors", report.browserErrors.length === 0)
    await display.screenshot({ path: join(evidence, "paused-results-resumed-question2.png"), fullPage: true })
  } catch (error) {
    report.error = String(error?.stack ?? error)
    report.partialObservation = await display.evaluate(() => globalThis.__pausedDisplayDiagnostic?.read()).catch(() => null)
    await display.screenshot({ path: join(evidence, "paused-results-failure.png"), fullPage: true }).catch(() => undefined)
  } finally {
    if (ownsPause && await host.getAttribute("data-game-paused").catch(() => null) === "true") {
      await hostPage.getByTestId("host-pause-resume-btn").click().catch(() => undefined)
    }
    await display.evaluate(() => globalThis.__pausedDisplayDiagnostic?.stop()).catch(() => undefined)
    await context.close()
    report.passed = !report.error && report.checks.length === 5 && report.checks.every((item) => item.passed)
    write(evidence, "paused-results-diagnostic.json", report)
  }
  return report
}

async function main() {
  assert.equal(process.platform, "linux")
  assert.equal(process.env.TADAZZ_REMOTE_QA, "1", "Use only the isolated Oracle diagnostic container")
  assert(process.env.TADAZZ_SITE_DIST_DIR, "Completed preflight site output is required")
  mkdirSync(evidenceRoot, { recursive: true })
  const load = (relative) => import(pathToFileURL(join(sourceRoot, relative)).href)
  const harness = await load("extensions/qa/phase3-native-consent/harness.ts")
  const { registerAndLoginAccount } = await load("extensions/qa/phase3-native-consent/oauth-flow.ts")
  const { computeCanonicalBaseDigest } = await load("extensions/src/core/digest.ts")
  const { createDefaultQuizExtrasV2 } = await load("extensions/src/core/studio-timeline-schema.ts")
  const configRoot = realpathSync(mkdtempSync(join(tmpdir(), "tadazz-paused-display-")))
  const originalEnvironment = { ...process.env }
  Object.assign(process.env, {
    CONFIG_PATH: configRoot,
    TADAZZ_ACCOUNTS_ENABLED: "true",
    TADAZZ_INLINE_GAME_PREVIEW_ENABLED: "true",
    TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED: "true",
    JWT_SECRET: randomBytes(48).toString("hex"),
    RESEND_API_KEY: "paused-display-isolated-mail-trap",
    TADAZZ_AUTH_EMAIL_FROM: "Pause Diagnostic <auth@example.invalid>",
  })
  const trap = harness.installResendVerificationTrap()
  const contexts = []
  let browser, host, server
  try {
    const native = await load("extensions/src/mcp-app/native-host/index.ts")
    const tls = harness.createLoopbackTlsCertificate()
    const fetchImpl = harness.createPinnedCaFetch(tls.cert)
    const port = await harness.reserveLoopbackPort()
    const origin = `https://127.0.0.1:${port}`
    host = await native.createNativeConsentHost({
      enabled: true, configRoot, initializeNativeRuntime: true,
      siteDistDir: process.env.TADAZZ_SITE_DIST_DIR,
      mcp: harness.buildMcpOptions({ origin, keys: harness.createEphemeralOAuthKeys() }),
    })
    server = await native.listenNativeConsentHost(host, { host: "127.0.0.1", port, tls, attachSocketServer: true })
    const owner = await registerAndLoginAccount({
      origin, fetchImpl, email: "paused-display-owner@example.invalid",
      password: `${randomBytes(24).toString("base64url")}Aa1!`, codes: trap.codes,
    })
    const quizz = {
      subject: "Diagnostic Royal paused late display",
      gameMode: "quiz",
      questions: [2, 3].map((count, index) => ({
        type: "single", playMode: "quiz",
        question: `Royal diagnostic question ${index + 1}`,
        answers: Array.from({ length: count }, (_, answer) => `Choice ${answer + 1}`),
        solutions: [count - 1], cooldown: 2, time: 30,
      })),
    }
    const questionIds = quizz.questions.map(() => randomUUID())
    const extras = createDefaultQuizExtrasV2("temp-new", questionIds, computeCanonicalBaseDigest(quizz))
    extras.defaults.advanceMode = "manual"
    extras.defaults.leaderboardPolicy = "disabled"
    extras.defaults.showTheme = { id: "royal-quiz", version: "1.0.0", overrides: {} }
    for (const [index, questionId] of questionIds.entries()) {
      extras.perQuestion[questionId] = {
        answerVisuals: quizz.questions[index].answers.map((_, answerIndex) => {
          const shape = ["circle", "square", "triangle"][answerIndex]
          return {
            answerIndex, display: "both", alt: shape,
            url: `${origin}/tadazz-show/gallery/picture-${shape}.png`,
          }
        }),
      }
    }
    const saved = await fetchImpl(origin + "/api/extensions/quizzes", {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ quizz, extras }),
    })
    assert([200, 201].includes(saved.status), `Save failed: ${saved.status}`)
    const { quizId } = await saved.json()
    const { chromium, expect } = playwright()
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    const manager = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", ignoreHTTPSErrors: true })
    contexts.push(manager)
    await manager.addInitScript((token) => {
      localStorage.setItem("token", token)
      localStorage.setItem("i18nextLng", "en")
    }, owner.token)
    const page = await manager.newPage()
    await page.goto(`${origin}/manager/quizz/${quizId}?lng=en`)
    await expect(page.getByTestId("editor-save-btn")).toBeEnabled({ timeout: 30000 })
    await page.getByTestId("studio-tab-launch").click()
    const launched = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/games" && response.request().method() === "POST")
    await page.getByTestId("studio-launch-btn").click()
    const response = await launched
    assert([200, 201].includes(response.status()))
    const room = await response.json()
    await expect(page.getByTestId("platform-opening-start")).toBeEnabled({ timeout: 30000 })
    await page.getByTestId("platform-opening-start").click()
    await expect(page.getByTestId("platform-opening-skip")).toBeEnabled()
    await page.getByTestId("platform-opening-skip").click()
    await expect(page.getByTestId("platform-game-opening")).toBeHidden({ timeout: 30000 })
    const pin = room.inviteCode ?? (await page.getByText(/^\d{6}$/u).first().textContent()).trim()
    const players = []
    for (let index = 0; index < 2; index += 1) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true })
      contexts.push(context)
      await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
      const player = await context.newPage()
      players.push(player)
      await player.goto(`${origin}/game?pin=${encodeURIComponent(pin)}`)
      await player.getByPlaceholder("Username here").fill(`Pause Diagnostic ${index + 1}`)
      await player.getByRole("button", { name: "Submit", exact: true }).click()
      await expect(player).toHaveURL(`${origin}/party/${room.gameId}`)
    }
    await expect(page.getByRole("status").filter({ hasText: /CONNECTED:\s*2\b/iu }).first()).toBeVisible({ timeout: 30000 })
    await page.getByTestId("manager-control-toolbar").getByRole("button", { name: "Start", exact: true }).click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute("data-show-scene", "voting", { timeout: 30000 })
    await expect(players[0].getByTestId("photo-card-grid")).toBeVisible({ timeout: 15000 })
    await expect(players[0].getByTestId(/^photo-card-choice-[01]$/u)).toHaveCount(2)
    const choice = players[0].getByTestId("photo-card-choice-0")
    await expect(choice).toBeVisible()
    await expect(choice).toBeEnabled({ timeout: 15000 })
    await choice.click()
    await expect(players[0].getByRole("heading", { name: "Thanks, that's noted", exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("host-end-timer-btn")).toBeEnabled()
    await page.getByTestId("host-end-timer-btn").click()

    const sourceFiles = [
      "packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx",
      "extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx",
      "extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx",
      "extensions/src/presentation/tadazz-v4/motion.ts",
    ]
    write(evidenceRoot, "diagnostic-source.json", {
      preparationOnly: true, releaseQualified: false, productionChanged: false,
      sourceRoot, family: "royal-quiz", backendExecution: "source-native-host-via-tsx",
      sourceHashes: Object.fromEntries(sourceFiles.map((relative) => [relative, createHash("sha256").update(readFileSync(join(sourceRoot, relative))).digest("hex")])),
    })
    const report = await probePausedResultsLateDisplay({
      browser, hostPage: page, origin, gameId: room.gameId,
      questionText: quizz.questions[0].question, answers: quizz.questions[0].answers,
      nextQuestionText: quizz.questions[1].question,
    })
    console.log(JSON.stringify({ diagnostic: "paused-results-late-display", passed: report.passed, releaseQualified: false, evidence: evidenceRoot }))
    if (!report.passed) process.exitCode = 1
  } catch (error) {
    write(evidenceRoot, "diagnostic-setup-failure.json", {
      preparationOnly: true, releaseQualified: false, passed: false,
      error: String(error?.stack ?? error),
    })
    console.error(error)
    process.exitCode = 1
  } finally {
    for (const context of contexts.reverse()) await context.close().catch(() => undefined)
    await browser?.close()
    await server?.close()
    if (!server) await host?.close()
    trap.restore()
    for (const name of Object.keys(process.env)) {
      if (!(name in originalEnvironment)) delete process.env[name]
    }
    Object.assign(process.env, originalEnvironment)
    rmSync(configRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
