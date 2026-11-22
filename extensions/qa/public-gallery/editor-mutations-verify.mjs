/** Real editor -> persistence -> native host regression on a disposable account. */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")

export async function verifyEditorMutations(options) {
  assert.equal(process.platform, "linux")
  assert.equal(new URL(options.origin).hostname, "127.0.0.1")
  assert(options.token, "Disposable account authentication is required")
  const { computeCanonicalBaseDigest } =
    await import("../../src/core/digest.ts")
  const { createDefaultQuizExtrasV2 } =
    await import("../../src/core/studio-timeline-schema.ts")
  const evidence = join(options.evidence, "editor-mutations")
  mkdirSync(evidence, { recursive: true })
  const page = await options.context.newPage()
  const editPanel = page.getByTestId("editor-panel-edit")
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  const headers = { Authorization: "Bearer " + options.token }
  const questionIds = [randomUUID(), randomUUID()]
  const sceneId = randomUUID()
  const quizz = {
    subject: "Editor mutation acceptance " + randomUUID(),
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        playMode: "quiz",
        question: "First authored question",
        answers: ["Wrong", "Authored correct answer"],
        solutions: [1],
        cooldown: 2,
        time: 30,
      },
      {
        type: "estimation",
        playMode: "survey",
        question: "Last authored estimate",
        answers: [],
        solutions: [],
        options: { inputMode: "input", min: 10, max: 20, step: 1, margin: 0 },
        cooldown: 2,
        time: 30,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "temp-new",
    questionIds,
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.advanceMode = "manual"
  extras.defaults.leaderboardPolicy = "cardOnly"
  extras.defaults.showTheme = { id: "tadazz-classic", version: "1.0.0" }
  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "transition",
    title: "Middle converted question",
    durationMs: 5000,
    advance: "manual",
  }
  extras.timeline.splice(1, 0, {
    id: randomUUID(),
    kind: "transition",
    sceneId,
  })
  const results = []
  let quizId
  let playerContext
  const record = (name, details = {}) =>
    results.push({ name, passed: true, ...details })
  const read = async (path) => {
    const response = await page.request.get(options.origin + path, { headers })
    assert.equal(response.status(), 200, path)
    return response.json()
  }
  const openPanel = async (name) => {
    const panel = page.getByTestId("editor-panel-" + name)
    if (!(await panel.isVisible())) {
      await page.getByTestId("editor-panel-toggle-" + name).click()
    }
    await expect(panel).toBeVisible()
  }
  const openEditor = async () => {
    await page.goto(options.origin + "/manager/quizz/" + quizId + "?lng=en")
    await expect(page.getByTestId("editor-save-btn")).toBeEnabled({
      timeout: 30_000,
    })
    await expect(page.locator('input[name="subject"]')).toHaveValue(
      quizz.subject,
    )
  }
  const save = async () => {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/extensions/quizzes/" + quizId &&
        response.request().method() === "PUT",
    )
    await page.getByTestId("editor-save-btn").click()
    assert.equal((await saved).status(), 200, "Editor composite save")
    await page.waitForURL(/\/(studio\/games|manager\/config)$/)
  }
  const saveWithPendingCheck = async (overwrite = false) => {
    const apiUrl = options.origin + "/api/extensions/quizzes/" + quizId
    let requestArrived = false
    let release
    const released = new Promise((resolve) => {
      release = resolve
    })
    const field = editPanel.locator('input[name$=".question"]')
    await expect(field).toHaveCount(1)
    const previousQuestion = await field.inputValue()
    const previousTitle = await page
      .locator('input[name="subject"]')
      .inputValue()
    const delayedSave = async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue()
        return
      }
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      requestArrived = true
      await released
      await route.fulfill({ response })
    }
    await page.route(apiUrl, delayedSave)
    try {
      await page
        .getByTestId(
          overwrite ? "conflict-confirm-overwrite-button" : "editor-save-btn",
        )
        .click({ noWaitAfter: true })
      await expect.poll(() => requestArrived, { timeout: 30_000 }).toBe(true)
      await expect(page.getByTestId("editor-save-btn")).toHaveAttribute(
        "aria-busy",
        "true",
      )
      await expect(page.locator("#studio-content")).toHaveAttribute("inert", "")
      await expect(page.locator('input[name="subject"]')).toBeDisabled()
      if (overwrite) {
        await expect(
          page.getByTestId("conflict-confirm-overwrite-button"),
        ).toBeDisabled()
        await page.keyboard.press("Escape")
        await expect(page.getByTestId("conflict-modal")).toBeVisible()
      } else {
        await page.keyboard.type("Must not become an unsaved edit")
        await expect(field).toHaveValue(previousQuestion)
        await expect(page.locator('input[name="subject"]')).toHaveValue(
          previousTitle,
        )
      }
      release()
      await page.waitForURL(/\/(studio\/games|manager\/config)$/)
    } finally {
      release()
      await page.unroute(apiUrl, delayedSave)
    }
    record(
      overwrite
        ? "pending-conflict-overwrite-locks-editor-and-resolution-actions"
        : "pending-save-locks-editor-and-preserves-submitted-content",
    )
  }
  try {
    const created = await page.request.post(
      options.origin + "/api/extensions/quizzes",
      { headers, data: { quizz, extras } },
    )
    assert([200, 201].includes(created.status()), "Create disposable quiz")
    quizId = (await created.json()).quizId
    assert(quizId)
    await openEditor()
    await openPanel("edit")
    await page.getByTestId("editor-mode-advanced").click()
    await openPanel("timeline")
    await page
      .getByTestId("editor-scene-card")
      .filter({ hasText: "Middle converted question" })
      .getByTestId("editor-scene-select")
      .click()
    await openPanel("edit")
    await editPanel.getByTestId("toggle-kind-quiz").click()
    await expect(
      editPanel.locator('input[name="questions.1.question"]'),
    ).toHaveValue("Middle converted question")
    await editPanel.getByTestId("answer-text-0").fill("Middle first answer")
    await editPanel.getByTestId("answer-text-1").fill("Middle second answer")
    await saveWithPendingCheck()

    let stored = await read("/api/quizz/" + quizId)
    let storedExtras = (await read("/api/extensions/quizzes/" + quizId)).extras
    assert.deepEqual(
      stored.questions.map((question) => question.question),
      [
        "First authored question",
        "Middle converted question",
        "Last authored estimate",
      ],
    )
    assert.deepEqual(
      storedExtras.timeline.map((item) => item.questionId),
      storedExtras.questionIds,
      "Native question order must match the authored timeline",
    )
    assert.equal(
      stored.questions[1].options,
      undefined,
      "Converted choice must not inherit estimation-only registered options",
    )
    assert.deepEqual(
      stored.questions[2],
      quizz.questions[1],
      "Following estimation question must retain its complete authored values",
    )
    assert.deepEqual(Object.keys(storedExtras.scenes), [])
    assert.equal(storedExtras.questionIds[0], questionIds[0])
    assert.equal(storedExtras.questionIds[2], questionIds[1])
    record("convert-middle-scene-saves-canonical-question-order-and-identities")

    await openEditor()
    await openPanel("timeline")
    await page.getByTestId("editor-question-card-1").click()
    await openPanel("edit")
    await expect(
      editPanel.locator('input[name="questions.1.question"]'),
    ).toHaveValue("Middle converted question")
    await page.getByTestId("studio-tab-settings").click()
    await page.getByRole("button", { name: "Convert All", exact: true }).click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Convert All", exact: true })
      .click()
    await save()
    stored = await read("/api/quizz/" + quizId)
    storedExtras = (await read("/api/extensions/quizzes/" + quizId)).extras
    assert.deepEqual(
      stored.questions.map((question) => question.playMode),
      ["quiz", "quiz", "quiz"],
    )
    assert.deepEqual(
      stored.questions.map((question) => question.solutions),
      [[1], [0], [10]],
    )
    assert.deepEqual(stored.questions[0], quizz.questions[0])
    assert.deepEqual(stored.questions[2].options, quizz.questions[1].options)
    record(
      "bulk-conversion-saves-valid-choice-and-estimation-with-authored-key",
    )

    await openEditor()
    await openPanel("edit")
    const failedSaveUrl = options.origin + "/api/extensions/quizzes/" + quizId
    const failSave = async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"temporary QA failure"}',
        })
      } else {
        await route.continue()
      }
    }
    await page.route(failedSaveUrl, failSave)
    try {
      const failedResponse = page.waitForResponse(
        (response) =>
          response.url() === failedSaveUrl &&
          response.request().method() === "PUT",
      )
      await page.getByTestId("editor-save-btn").click()
      assert.equal((await failedResponse).status(), 503)
      await expect(page.getByTestId("editor-save-btn")).toBeEnabled()
      await expect(page.locator('input[name="subject"]')).toBeEnabled()
      await expect(page.locator("#studio-content")).not.toHaveAttribute(
        "inert",
        "",
      )
      await expect(
        editPanel.locator('input[name="questions.0.question"]'),
      ).toHaveValue("First authored question")
    } finally {
      await page.unroute(failedSaveUrl, failSave)
    }
    record("failed-save-unlocks-editing-and-retains-form-content")

    const { id: _id, ...cleanQuiz } = stored
    const newerRevision = await page.request.put(failedSaveUrl, {
      headers,
      data: {
        expectedRevision: storedExtras.revision,
        quizz: cleanQuiz,
        extras: storedExtras,
      },
    })
    assert.equal(newerRevision.status(), 200)
    await page.getByTestId("editor-save-btn").click()
    await expect(page.getByTestId("conflict-modal")).toBeVisible()
    await page.getByTestId("conflict-overwrite-button").click()
    await saveWithPendingCheck(true)
    stored = await read("/api/quizz/" + quizId)
    assert.deepEqual(
      stored.questions.map((question) => question.solutions),
      [[1], [0], [10]],
    )

    await openEditor()
    await page.getByTestId("studio-tab-launch").click()
    await expect(page.getByTestId("studio-launch-btn")).toBeEnabled()
    const launch = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/games" &&
        response.request().method() === "POST",
    )
    await page.getByTestId("studio-launch-btn").click()
    const launchResponse = await launch
    assert([200, 201].includes(launchResponse.status()))
    const room = await launchResponse.json()
    await expect(page).toHaveURL(
      options.origin + "/party/manager/" + room.gameId,
    )
    await expect(page.getByTestId("platform-opening-start")).toBeEnabled({
      timeout: 30_000,
    })
    await page.getByTestId("platform-opening-start").click()
    await expect(page.getByTestId("platform-opening-skip")).toBeEnabled()
    await page.getByTestId("platform-opening-skip").click()
    await expect(page.getByTestId("platform-game-opening")).toBeHidden({
      timeout: 30_000,
    })
    const toolbar = page.getByTestId("manager-control-toolbar")
    await expect(toolbar).toHaveAttribute("data-host-lobby", "true")
    playerContext = await options.browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "en-GB",
      ignoreHTTPSErrors: true,
    })
    await playerContext.addInitScript(() =>
      localStorage.setItem("i18nextLng", "en"),
    )
    const player = await playerContext.newPage()
    player.on("pageerror", (error) => errors.push("player: " + error.message))
    const pin =
      room.inviteCode ??
      (
        await page
          .getByText(/^\d{6}$/)
          .first()
          .textContent()
      ).trim()
    await player.goto(options.origin + "/game?pin=" + encodeURIComponent(pin))
    await player
      .getByPlaceholder("Username here")
      .fill("Editor mutation player")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(player).toHaveURL(options.origin + "/party/" + room.gameId)
    await toolbar.getByRole("button", { name: "Start", exact: true }).click()
    const stage = page.getByTestId("tadazz-show")
    for (const [index, question] of stored.questions.entries()) {
      await expect(page.getByTestId("host-question-counter")).toHaveText(
        `${index + 1} / 3`,
        { timeout: 30_000 },
      )
      await expect(stage).toContainText(question.question)
      await expect(stage).toHaveAttribute("data-show-scene", "voting", {
        timeout: 30_000,
      })
      await expect(page.getByTestId("host-end-timer-btn")).toBeEnabled()
      await page.getByTestId("host-end-timer-btn").click()
      await expect(page.getByTestId("host-next-screen-btn")).toBeEnabled({
        timeout: 30_000,
      })
      await page.screenshot({
        path: join(evidence, `native-question-${index + 1}.png`),
      })
      await page.getByTestId("host-next-screen-btn").click()
    }
    await expect(stage).toHaveAttribute("data-show-scene", "finale", {
      timeout: 30_000,
    })
    assert.deepEqual(errors, [], "No editor or native host JavaScript errors")
    record(
      "saved-converted-game-plays-native-questions-one-two-three-through-finale",
    )
    const receipt = { passed: true, results, errors }
    writeFileSync(
      join(evidence, "receipt.json"),
      JSON.stringify(receipt, null, 2) + "\n",
    )
    return receipt
  } catch (error) {
    writeFileSync(
      join(evidence, "partial-receipt.json"),
      JSON.stringify(
        {
          passed: false,
          results,
          errors,
          error: String(error?.stack ?? error),
        },
        null,
        2,
      ) + "\n",
    )
    await page
      .screenshot({ path: join(evidence, "failure.png"), fullPage: true })
      .catch(() => {})
    throw error
  } finally {
    if (playerContext) await playerContext.close()
    if (quizId) {
      const removed = await page.request.delete(
        options.origin + "/api/extensions/quizzes/" + quizId,
        { headers },
      )
      assert([200, 204, 404].includes(removed.status()), "Remove owned QA quiz")
    }
    await page.close()
  }
}
