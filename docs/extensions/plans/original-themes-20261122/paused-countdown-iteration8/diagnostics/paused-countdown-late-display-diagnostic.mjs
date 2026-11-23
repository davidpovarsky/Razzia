/**
 * Diagnostic only. Run on the isolated Oracle preflight source, never production.
 * This module does not mint a release receipt and changes no product source.
 *
 * node /cleanup/extensions/node_modules/tsx/dist/cli.mjs \
 *   --tsconfig /source/tsconfig.json \
 *   /diagnostics/paused-countdown-late-display-diagnostic.mjs
 *
 * Standalone execution creates its own disposable two-question host. The
 * exported probe pauses Q1, opens a fresh display, and resumes the same clock.
 */
import assert from "node:assert/strict"
import { randomBytes, randomUUID, createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const sourceRoot = resolve(process.env.TADAZZ_DIAGNOSTIC_SOURCE_ROOT ?? "/source")
const evidenceRoot = resolve(process.env.TADAZZ_PAUSED_COUNTDOWN_EVIDENCE ?? "/evidence/paused-countdown")
const playwright = () => createRequire("/cleanup/extensions/package.json")("@playwright/test")
const write = (directory, name, data) => {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), JSON.stringify(data, null, 2) + "\n")
}

function observeCountdown(expected) {
  const identities = new WeakMap()
  const frozenTimes = new Map()
  const violations = []
  const seen = new Set()
  const firstFrames = []
  const samples = []
  const resumed = []
  let identity = 1
  let pausedFrames = 0
  let observedFrames = 0
  let started = null
  let ended = null
  let frozenClock = null
  let latest = null
  let stopped = false
  const fail = (kind, detail) => {
    const key = `${kind}:${detail.id ?? detail.problem ?? ""}`
    if (!seen.has(key)) {
      seen.add(key)
      violations.push({ kind, ...detail })
    }
  }
  const visible = (element, stage) => {
    if (!element) return false
    const box = element.getBoundingClientRect()
    const bounds = stage.getBoundingClientRect()
    if (box.width <= 0.5 || box.height <= 0.5 || box.right <= bounds.left ||
        box.left >= bounds.right || box.bottom <= bounds.top || box.top >= bounds.bottom) return false
    let opacity = 1
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === "none" || style.visibility !== "visible") return false
      opacity *= Number(style.opacity)
    }
    return opacity >= 0.95
  }
  const frame = () => {
    if (stopped) return
    const host = document.querySelector('[data-testid="tadazz-show"]')
    const stage = host?.querySelector(".tzv4-stage")
    if (stage && host?.getAttribute("data-show-scene") === "voting" &&
        stage.getAttribute("data-v4-scene") === "countdown") {
      const heading = stage.querySelector(".q-text")
      const timer = stage.querySelector('[data-testid="tadazz-timer"]')
      const finite = []
      for (const animation of stage.getAnimations({ subtree: true })) {
        const effect = animation.effect
        const timing = effect?.getTiming()
        const computed = effect?.getComputedTiming()
        const target = effect?.target
        if (!(target instanceof Element) || !stage.contains(target) || !computed ||
            !Number.isFinite(computed.endTime) || timing.iterations === Infinity) continue
        let id = identities.get(animation)
        if (id === undefined) { id = identity++; identities.set(animation, id) }
        const duration = Number(timing.duration)
        const currentTime = typeof animation.currentTime === "number" ? animation.currentTime : null
        finite.push({
          id, target: (target.getAttribute("data-testid") ?? target.getAttribute("class") ?? target.tagName).slice(0, 180),
          clock: target.matches(".timer-progress"), currentTime, duration,
          remainingMs: currentTime === null ? null : Math.max(0, duration - currentTime),
          playState: animation.playState, pending: animation.pending,
        })
      }
      const content = {
        heading: heading?.textContent?.trim() ?? null,
        headingVisible: visible(heading, stage),
        timer: timer?.textContent?.trim() ?? null,
        timerVisible: visible(timer, stage),
        cards: [...stage.querySelectorAll("[data-v4-choice]")].map((card) => {
          const title = card.querySelector(".answer-title")
          const image = card.querySelector("img")
          return {
            index: card.getAttribute("data-v4-choice"),
            title: title?.textContent?.trim() ?? null,
            titleVisible: visible(title, stage),
            imagePresent: Boolean(image), imageVisible: visible(image, stage),
            imageDecoded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          }
        }),
      }
      const paused = host.getAttribute("data-game-paused") === "true"
      latest = { at: performance.now(), paused, content, finite }
      if (paused) {
        pausedFrames += 1
        if (pausedFrames <= 2) firstFrames.push(latest)
        else {
          started ??= performance.now()
          ended = performance.now()
          observedFrames += 1
          if (content.heading !== expected.questionText || !content.headingVisible) fail("incomplete-paused-countdown", { problem: "question heading" })
          if (content.timer !== expected.timerText || !content.timerVisible) fail("incomplete-paused-countdown", { problem: "visible frozen timer" })
          if (content.cards.length !== expected.answers.length) fail("incomplete-paused-countdown", { problem: "answer count" })
          expected.answers.forEach((title, index) => {
            const card = content.cards.find((value) => value.index === String(index))
            if (!card || card.title !== title || !card.titleVisible || !card.imagePresent || !card.imageVisible) {
              fail("incomplete-paused-countdown", { problem: `visible answer ${index}` })
            }
          })
          const clocks = finite.filter((value) => value.clock)
          if (clocks.length !== 1) fail("countdown-clock", { problem: "exactly one real countdown animation" })
          for (const clock of clocks) {
            frozenClock ??= clock
            if (clock.remainingMs === null || Math.abs(clock.remainingMs - expected.remainingMs) > 2) fail("countdown-clock", { problem: "authoritative millisecond remainder", ...clock })
            if (clock.playState !== "paused") fail("countdown-clock", { problem: "clock is not paused", ...clock })
          }
          for (const animation of finite) {
            if (animation.playState === "running" || animation.pending) fail("finite-animation-running-while-paused", animation)
            const previousTime = frozenTimes.get(animation.id)
            if (typeof previousTime === "number" && animation.currentTime !== null && Math.abs(animation.currentTime - previousTime) > 2) fail("finite-animation-time-advanced-while-paused", { ...animation, previousTime })
            frozenTimes.set(animation.id, animation.currentTime)
          }
          if (samples.length < 180) samples.push(latest)
        }
      } else if (frozenClock && content.heading === expected.questionText) {
        const clock = finite.find((value) => value.clock && value.id === frozenClock.id)
        if (clock?.playState === "running" && clock.currentTime > frozenClock.currentTime + 400) {
          if (resumed.length < 30) resumed.push({ at: performance.now(), content, clock, frozenClock })
        }
      }
    }
    requestAnimationFrame(frame)
  }
  globalThis.__pausedCountdownDiagnostic = {
    read: () => ({ normalMotion: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      firstFrames, observedFrames, observedWindowMs: started === null || ended === null ? 0 : ended - started,
      samples, violations, resumed, latest }),
    stop: () => { stopped = true },
  }
  requestAnimationFrame(frame)
}

export async function probePausedCountdownLateDisplay({ browser, hostPage, origin, gameId, questionText, answers, pauseStates, evidence }) {
  const { expect } = createRequire("/cleanup/extensions/package.json")("@playwright/test")
  mkdirSync(evidence, { recursive: true })
  const report = { format: "tadazz-paused-countdown-late-display-diagnostic", version: 1,
    preparationOnly: true, releaseQualified: false, productionChanged: false, customerMountUsed: false,
    family: "royal-quiz", checks: [], browserErrors: [] }
  const check = (name, passed, detail) => report.checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) })
  const host = hostPage.getByTestId("tadazz-show")
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-GB", reducedMotion: "no-preference", ignoreHTTPSErrors: true })
  let display, ownsPause = false
  try {
    await expect(host).toHaveAttribute("data-show-scene", "voting")
    await expect(host.locator(".tzv4-stage")).toHaveAttribute("data-v4-scene", "countdown", { timeout: 15000 })
    await expect(host.getByTestId("tadazz-timer")).toBeVisible()
    await hostPage.getByTestId("host-pause-resume-btn").click()
    ownsPause = true
    await expect(host).toHaveAttribute("data-game-paused", "true")
    await expect.poll(() => pauseStates.at(-1)?.paused).toBe(true)
    const authoritative = pauseStates.at(-1)
    assert.equal(authoritative.phase, "voting")
    assert(Number.isFinite(authoritative.remainingMs) && authoritative.remainingMs > 5000)
    report.authoritativePause = authoritative
    const timerText = String(Math.ceil(authoritative.remainingMs / 1000)).padStart(2, "0")
    await expect(host.getByTestId("tadazz-timer")).toHaveText(timerText)
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    await context.addInitScript(observeCountdown, { questionText, answers, timerText, remainingMs: authoritative.remainingMs })
    display = await context.newPage()
    display.on("pageerror", (error) => report.browserErrors.push(String(error)))
    await display.goto(`${origin}/display/${gameId}?lng=en`, { waitUntil: "domcontentloaded" })
    const late = display.getByTestId("tadazz-show")
    await expect(late).toHaveAttribute("data-game-paused", "true", { timeout: 30000 })
    await expect(late).toHaveAttribute("data-show-theme", "royal-quiz")
    await expect(late.locator(".tzv4-stage")).toHaveAttribute("data-original-family", "royal-quiz")
    await display.waitForFunction(() => {
      const value = globalThis.__pausedCountdownDiagnostic?.read()
      return value?.observedFrames >= 8 && value.observedWindowMs >= 1200
    }, undefined, { timeout: 15000, polling: 50 })
    report.pausedWindow = await display.evaluate(() => globalThis.__pausedCountdownDiagnostic.read())
    check("normal-motion-display-preference", report.pausedWindow.normalMotion)
    check("paused-countdown-observed-after-two-frames", report.pausedWindow.observedFrames >= 8 && report.pausedWindow.observedWindowMs >= 1200)
    check("visible-authoritative-countdown-and-cards-stable", report.pausedWindow.violations.length === 0, report.pausedWindow.violations)
    await expect(host.getByTestId("tadazz-timer")).toHaveText(timerText)
    await expect(late.getByTestId("tadazz-timer")).toHaveText(timerText)
    await expect.poll(() => display.evaluate(() => globalThis.__pausedCountdownDiagnostic.read().latest.content.cards.every((card) => card.imageDecoded))).toBe(true)
    check("host-and-late-display-have-identical-frozen-remainder", true)
    await display.screenshot({ path: join(evidence, "paused-countdown-late-display.png"), fullPage: true })

    await hostPage.getByTestId("host-pause-resume-btn").click()
    ownsPause = false
    await expect(host).toHaveAttribute("data-game-paused", "false")
    await expect(late).toHaveAttribute("data-game-paused", "false")
    await display.waitForFunction(() => {
      const observation = globalThis.__pausedCountdownDiagnostic?.read()
      return observation?.resumed.some((sample) => sample.content.timerVisible &&
        Number(sample.content.timer) < Number(observation.samples[0].content.timer))
    }, undefined, { timeout: 5000, polling: 50 })
    report.afterResume = await display.evaluate(() => globalThis.__pausedCountdownDiagnostic.read())
    check("same-real-countdown-resumes-without-reset", report.afterResume.resumed.length > 0)
    check("no-browser-errors", report.browserErrors.length === 0)
    await display.screenshot({ path: join(evidence, "paused-countdown-resumed.png"), fullPage: true })
  } catch (error) {
    report.error = String(error?.stack ?? error)
    report.partialObservation = await display?.evaluate(() => globalThis.__pausedCountdownDiagnostic?.read()).catch(() => null)
    await display?.screenshot({ path: join(evidence, "paused-countdown-failure.png"), fullPage: true }).catch(() => undefined)
  } finally {
    if (ownsPause && await host.getAttribute("data-game-paused").catch(() => null) === "true") await hostPage.getByTestId("host-pause-resume-btn").click().catch(() => undefined)
    await display?.evaluate(() => globalThis.__pausedCountdownDiagnostic?.stop()).catch(() => undefined)
    await context.close()
    report.passed = !report.error && report.checks.length === 6 && report.checks.every((value) => value.passed)
    writeFileSync(join(evidence, "paused-countdown-diagnostic.json"), JSON.stringify(report, null, 2) + "\n")
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
      subject: "Diagnostic Royal paused countdown",
      gameMode: "quiz",
      questions: [2, 3].map((count, index) => ({
        type: "single", playMode: "quiz",
        question: `Royal diagnostic question ${index + 1}`,
        answers: Array.from({ length: count }, (_, answer) => `Choice ${answer + 1}`),
        solutions: [count - 1], cooldown: 2, time: 45,
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
    const pauseStates = []
    page.on("websocket", (connection) => {
      connection.on("framereceived", ({ payload }) => {
        const text = String(payload)
        const bracket = text.indexOf("[")
        if (!text.startsWith("42") || bracket < 0) return
        let event
        try { event = JSON.parse(text.slice(bracket)) } catch { return }
        if (event?.[0] !== "extensions:state" || !event[1]?.pause) return
        const state = event[1]
        pauseStates.push({ epoch: state.epoch, phase: state.phase,
          paused: state.pause.paused, remainingMs: state.pause.remainingMs,
          deadline: state.pause.deadline })
      })
    })
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
    await expect(players[0].getByTestId("photo-card-choice-0")).toBeEnabled({ timeout: 15000 })
    await expect(page.getByTestId("tadazz-live-answered")).toHaveAttribute("data-count", "0")

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
    const report = await probePausedCountdownLateDisplay({
      browser, hostPage: page, origin, gameId: room.gameId,
      questionText: quizz.questions[0].question, answers: quizz.questions[0].answers,
      pauseStates, evidence: evidenceRoot,
    })
    console.log(JSON.stringify({ diagnostic: "paused-countdown-late-display", passed: report.passed, releaseQualified: false, evidence: evidenceRoot }))
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

