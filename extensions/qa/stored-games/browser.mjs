/** Observe the production editor and game clients against an owned native host. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import {
  readQuestionSequence,
  stopQuestionSequence,
  watchQuestionSequence,
} from "../public-gallery/question-sequence-verify.mjs"

const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex")

export async function verifyStoredGameBrowser(options) {
  assert.equal(process.platform, "linux")
  assert.equal(new URL(options.origin).hostname, "127.0.0.1")
  const { fixture, context, browser, origin, token, registry } = options
  const quizId = fixture.quizz.id
  const headers = { Authorization: "Bearer " + token }
  const host = await context.newPage()
  let playerContext
  let room
  let traceTimer
  let stage
  let checkpoint = "editor-load"
  const checks = []
  const faults = []
  const assetFailures = new Set()
  const trace = []
  const starts = []
  const accepted = []
  const sceneVisits = []
  const sequences = []
  const safeTrace = () => trace.map(({ id, sceneId, questionId, ...entry }) => ({
    ...entry,
    stepDigest: id ? digest(id) : null,
    sceneDigest: sceneId ? digest(sceneId) : null,
    questionDigest: questionId ? digest(questionId) : null,
  }))
  const safeSceneVisits = () => sceneVisits.map(({ id, ...visit }) => ({
    ...visit, sceneDigest: digest(id),
  }))
  const record = (name, details = {}) => checks.push({ name, passed: true, ...details })
  const track = (page) => {
    page.on("pageerror", (error) => faults.push(digest(error.message)))
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "unknown"
      if (reason !== "net::ERR_ABORTED" &&
          ["image", "media", "font", "script", "stylesheet"].includes(request.resourceType())) {
        assetFailures.add(digest({ path: new URL(request.url()).pathname, reason }))
      }
    })
    page.on("response", (response) => {
      if (response.status() >= 400 &&
          ["image", "media", "font", "script", "stylesheet"].includes(response.request().resourceType())) {
        assetFailures.add(digest({ path: new URL(response.url()).pathname, status: response.status() }))
      }
    })
  }
  track(host)
  const read = async (path) => {
    const response = await context.request.get(origin + path, { headers })
    assert.equal(response.status(), 200, "Owned fixture API read")
    return response.json()
  }
  const openEditor = async () => {
    await host.goto(origin + "/manager/quizz/" + quizId + "?lng=en")
    await expect(host.getByTestId("editor-save-btn")).toBeEnabled({ timeout: 30_000 })
    assert.equal(digest(await host.locator('input[name="subject"]').inputValue()), digest(fixture.quizz.subject), "Stored title renders unchanged")
  }
  const openTimeline = async () => {
    if (!(await host.getByTestId("editor-panel-timeline").isVisible())) {
      await host.getByTestId("editor-panel-toggle-timeline").click()
    }
    await expect(host.getByTestId("editor-panel-timeline")).toBeVisible()
  }
  const controlsReady = async () => {
    const unlock = host.getByTestId("host-enable-audio")
    if (await unlock.isVisible()) await unlock.click()
  }
  try {
    const beforeBase = await read("/api/quizz/" + quizId)
    const beforeExtras = (await read("/api/extensions/quizzes/" + quizId)).extras
    await openEditor()
    await openTimeline()
    const timeline = host.getByTestId("editor-timeline")
    await expect(timeline.locator('[data-testid^="editor-question-card-"]')).toHaveCount(beforeBase.questions.length)
    if (beforeExtras?.timeline) {
      await expect(timeline.getByTestId("editor-scene-card")).toHaveCount(
        beforeExtras.timeline.filter((item) => item.kind !== "question").length,
      )
    }
    checkpoint = "editor-save"
    const save = host.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/extensions/quizzes/" + quizId &&
      response.request().method() === "PUT",
    )
    await host.getByTestId("editor-save-btn").click()
    assert.equal((await save).status(), 200, "Stored game saves through native editor")
    await host.waitForURL(/\/(studio\/games|manager\/config)$/)
    const savedBase = await read("/api/quizz/" + quizId)
    const savedExtras = (await read("/api/extensions/quizzes/" + quizId)).extras
    assert.equal(digest(savedBase.questions), digest(beforeBase.questions), "Editor save preserves every authored question field")
    assert.equal(savedBase.id, quizId, "Editor save retains original identity")
    if (beforeExtras?.schemaVersion === 2) {
      for (const key of ["questionIds", "timeline", "scenes", "defaults", "perQuestion", "audio"]) {
        assert.equal(digest(savedExtras[key]), digest(beforeExtras[key]), "Editor preserves authored " + key)
      }
    }
    record("native-editor-displays-saves-and-preserves-authored-game", {
      questions: savedBase.questions.length,
      cards: savedExtras?.timeline?.length ?? savedBase.questions.length,
    })
    await openEditor()
    checkpoint = "saved-game-launch"
    await host.getByTestId("studio-tab-launch").click()
    await expect(host.getByTestId("studio-launch-btn")).toBeEnabled()
    let roomReply
    const captureLaunch = async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      const response = await route.fetch()
      assert([200, 201].includes(response.status()), "Native editor launch")
      roomReply = { quizId: route.request().postDataJSON().quizzId, body: await response.json() }
      await route.fulfill({ response })
    }
    await host.route(origin + "/api/games", captureLaunch)
    await host.getByTestId("studio-launch-btn").click()
    await expect.poll(() => Boolean(roomReply)).toBe(true)
    room = roomReply.body
    assert.equal(roomReply.quizId, quizId, "Launch uses the saved original identity")
    await host.unroute(origin + "/api/games", captureLaunch)
    await expect(host).toHaveURL(origin + "/party/manager/" + room.gameId)
    const game = registry.getGameById(room.gameId)
    assert(game, "Actual native engine instance exists")
    assert.equal(game.sourceQuizId, quizId)
    const snapshot = () => {
      const step = game.showCoordinator?.getAuthoritativeStepEnvelope("manager")
      return {
        phase: game.showCoordinator?.currentPhase ?? "legacy",
        id: step?.id ?? null,
        kind: step?.kind ?? null,
        sceneId: step?.sceneId ?? null,
        questionId: step?.questionId ?? null,
        stepIndex: step?.stepIndex ?? null,
        questionIndex: game.round.currentQuestionIndex,
        status: game.managerStatus?.name ?? null,
      }
    }
    let previousTrace = ""
    const observe = () => {
      const value = snapshot()
      const key = JSON.stringify(value)
      if (key !== previousTrace) {
        trace.push(value)
        previousTrace = key
      }
    }
    traceTimer = setInterval(observe, 16)
    checkpoint = "platform-opening"
    await expect(host.getByTestId("platform-opening-start")).toBeEnabled({ timeout: 30_000 })
    await host.getByTestId("platform-opening-start").click()
    await expect(host.getByTestId("platform-opening-skip")).toBeEnabled()
    await host.getByTestId("platform-opening-skip").click()
    await expect(host.getByTestId("platform-game-opening")).toBeHidden({ timeout: 30_000 })
    stage = host.getByTestId("tadazz-show")
    await expect(stage).toBeVisible()
    await controlsReady()
    await watchQuestionSequence(stage, { phaseAttribute: "data-show-scene", votingPhase: "voting" })
    checkpoint = "native-player-join"
    const guestPolicy = await context.request.patch(
      origin + "/api/games/" + room.gameId + "/roster/settings",
      { headers, data: { allowUnregisteredPlayers: true } },
    )
    assert.equal(guestPolicy.status(), 200, "Owner enables one synthetic QA participant")
    playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: "en-GB", ignoreHTTPSErrors: true,
    })
    await playerContext.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    const player = await playerContext.newPage()
    track(player)
    await player.goto(origin + "/game?pin=" + encodeURIComponent(room.inviteCode))
    await player.getByPlaceholder("Username here").fill("Stored game QA participant")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(player).toHaveURL(origin + "/party/" + room.gameId)
    const toolbar = host.getByTestId("manager-control-toolbar")
    await toolbar.getByRole("button", { name: "Start", exact: true }).click()
    const nativeTimeline = savedExtras?.timeline ?? []
    const allowedSceneIds = new Set(nativeTimeline.filter((item) => item.kind !== "question").map((item) => item.sceneId))
    const seenSteps = new Set()
    const seenQuestions = new Set()
    const next = async (expected) => {
      const button = host.getByTestId("host-next-screen-btn")
      const advanced = () => snapshot().id !== expected.id || snapshot().questionIndex !== expected.questionIndex
      await expect.poll(async () => advanced() || Boolean(await button.count()) && await button.isEnabled(), { timeout: 30_000 }).toBe(true)
      if (!advanced() && await button.isVisible() && await button.isEnabled()) {
        await button.click()
      }
    }
    for (let guard = 0; guard < Math.max(100, nativeTimeline.length * 5); guard++) {
      observe()
      const active = snapshot()
      checkpoint = "playback-" + active.phase + "-" + active.questionIndex
      if (active.phase === "finished" || active.status === "FINISHED") break
      if (active.id && !seenSteps.has(active.id)) {
        seenSteps.add(active.id)
        if (active.sceneId) {
          assert(allowedSceneIds.has(active.sceneId), "Only an authored timeline scene can become active")
          sceneVisits.push({ id: active.sceneId, afterQuestion: starts.length, kind: active.kind })
        }
      }
      if (active.phase === "scene") {
        await expect(stage).toBeVisible()
        await next(active)
        await expect.poll(() => snapshot().id !== active.id || snapshot().phase === "finished", { timeout: 30_000 }).toBe(true)
        continue
      }
      const index = active.questionIndex
      if (index < 0 || index >= savedBase.questions.length || !["question", "legacy"].includes(active.phase)) {
        await expect.poll(() => snapshot().phase === "scene" || snapshot().phase === "question" || snapshot().status === "SELECT_ANSWER", { timeout: 30_000 }).toBe(true)
        continue
      }
      if (!seenQuestions.has(index)) {
        const question = savedBase.questions[index]
        await expect.poll(() => game.round.isCurrentlyAcceptingAnswers, { timeout: 30_000 }).toBe(true)
        assert.equal(index, starts.length, "All native questions start once in authored order")
        starts.push(index)
        seenQuestions.add(index)
        await expect(host.getByTestId("host-question-counter")).toHaveText(`${index + 1} / ${savedBase.questions.length}`)
        await controlsReady()
        const answer = async (answerIndex) => {
          const pad = player.getByTestId("tadazz-pad-option-" + answerIndex)
          if (await pad.isVisible()) {
            await expect(pad).toBeEnabled()
            await pad.click()
          } else {
            const native = player.locator("button").filter({ has: player.getByTestId("answer-badge-" + answerIndex) })
            await expect(native).toHaveCount(1)
            await expect(native).toBeEnabled()
            await native.click()
          }
        }
        if (question.type === "estimation") {
          const slider = player.locator('input[type="range"]:visible')
          if (await slider.count()) {
            await slider.first().focus()
            await slider.first().press("Home")
          } else {
            const input = player.locator('input[inputmode="decimal"]:visible, input[type="number"]:visible').first()
            await expect(input).toBeEditable()
            await input.fill(String(question.solutions?.[0] ?? question.options.min))
          }
          await player.getByRole("button", { name: "Confirm", exact: true }).click()
        } else {
          const choices = question.type === "multi" && question.solutions?.length
            ? question.solutions
            : [question.solutions?.[0] ?? 0]
          for (const choice of choices) await answer(choice)
          if (question.type === "multi") {
            const submit = player.getByTestId("tadazz-pad-submit")
            if (await submit.isVisible()) await submit.click()
            else await player.getByRole("button", { name: "Confirm", exact: true }).click()
          }
        }
        await expect.poll(() =>
          game.round.getAnsweredPlayerIds().size > 0 || Boolean(game.round.getQuestionLedgerEntry(index)?.answers?.length),
        ).toBe(true)
        accepted.push(index)
        if (game.round.isCurrentlyAcceptingAnswers) {
          const end = host.getByTestId("host-end-timer-btn")
          await expect(end).toBeEnabled()
          await end.click()
        }
        await expect.poll(() => Boolean(game.round.getQuestionLedgerEntry(index)), { timeout: 30_000 }).toBe(true)
        if (question.type !== "estimation") {
          const throughResults = (await stage.getAttribute("data-show-scene")) === "results"
          const sequence = await readQuestionSequence(stage, index, { throughResults })
          sequences.push({ index, throughResults, leadMs: sequence.leadMs, retainedPanel: sequence.retainedPanel, retainedHeading: sequence.retainedHeading, duplicateHeadings: sequence.duplicateHeadings, newQuestionAnimations: sequence.newQuestionAnimations })
        }
        console.log(JSON.stringify({ storedGameProgress: fixture.fixtureId, questionsCompleted: accepted.length, total: savedBase.questions.length }))
      }
      const current = snapshot()
      if (current.phase === "finished" || current.status === "FINISHED") break
      if (current.phase === "scene") continue
      if (current.questionIndex === index) await next(current)
    }
    checkpoint = "completed-game-assertions"
    observe()
    assert.equal(starts.length, savedBase.questions.length, "Every authored question was displayed")
    assert.equal(accepted.length, savedBase.questions.length, "Every question accepted a real client answer")
    assert(snapshot().phase === "finished" || snapshot().status === "FINISHED", "Game reaches terminal state")
    await expect(stage).toHaveAttribute("data-show-scene", "finale", { timeout: 30_000 })
    const unused = new Set(fixture.expected.unusedSceneIds ?? [])
    assert(sceneVisits.every((visit) => !unused.has(visit.id)), "Unused scene definitions never appear")
    const actualBoards = sceneVisits.filter((visit) => visit.kind === "leaderboard").map((visit) => visit.afterQuestion)
    assert.equal(digest(actualBoards), digest(fixture.expected.leaderboardAfterQuestions ?? []), "Authored leaderboards occur at the exact question boundaries")
    if (savedExtras?.defaults?.leaderboardPolicy === "cardOnly") {
      assert(!trace.some((entry) => entry.phase === "question" && entry.status === "SHOW_LEADERBOARD"), "No automatic duplicate leaderboards")
    }
    const audio = await host.evaluate(() => {
      const states = [...document.querySelectorAll('[data-testid="audio-cue-player-state"]')]
      return { owners: states.length, failed: states.some((state) => state.dataset.audioError === "true") }
    })
    assert.equal(audio.owners, 1, "One shared audio owner")
    assert.equal(audio.failed, false, "Native audio has no failed active track")
    assert.equal(faults.length, 0, "No browser JavaScript failures")
    assert.equal(assetFailures.size, 0, "No asset HTTP failures")
    record("saved-game-full-native-playback", { questions: starts.length, accepted: accepted.length, scenes: sceneVisits.length, leaderboards: actualBoards, unusedSceneDefinitions: unused.size, questionContinuity: sequences.length })
    return { fixtureId: fixture.fixtureId, passed: true, checks, trace: safeTrace(), sequences, audio, assetFailures: [...assetFailures], faults }
  } catch (error) {
    // Detailed Playwright errors can contain authored text. The controller keeps
    // stderr private on Linux and retrieves only this opaque diagnostic receipt.
    console.error("Stored game failed", fixture.fixtureId, checkpoint, error)
    return { fixtureId: fixture.fixtureId, passed: false, checks, trace: safeTrace(), starts: starts.length, accepted: accepted.length, sceneVisits: safeSceneVisits(), sequences, assetFailures: [...assetFailures], faults, error: checkpoint + ": " + (error?.name ?? "Error"), errorDigest: digest(String(error?.message ?? error)) }
  } finally {
    clearInterval(traceTimer)
    if (stage) await stopQuestionSequence(stage).catch(() => {})
    if (playerContext) await playerContext.close()
    await host.close()
    if (room?.gameId) registry.removeGame(room.gameId)
  }
}
