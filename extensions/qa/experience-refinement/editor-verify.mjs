/** Server-only native-editor acceptance for a disposable account fixture. */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { expect } = require("@playwright/test")

/**
 * Reuses the caller's Playwright page and isolated, account-owned quiz.
 * options: page, origin (or baseURL), quizId, token (or writeComposite),
 * evidence, optional readQuiz/readExtras callbacks from the account harness.
 * The fixture is restored in finally; no account or browser is created here.
 */
export async function verifyEditorRefinements(options) {
  assert.equal(process.platform, "linux", "Run editor acceptance on the server")
  const origin = options.origin ?? options.baseURL
  assert.equal(new URL(origin).hostname, "127.0.0.1", "Disposable host only")
  const { page, quizId } = options
  const evidence = join(options.evidence, "editor-refinement")
  mkdirSync(evidence, { recursive: true })
  const apiPath = `/api/extensions/quizzes/${quizId}`
  const headers = options.token
    ? { Authorization: "Bearer " + options.token }
    : {}
  const read = async (path) => {
    const response = await page.request.get(origin + path, { headers })
    assert.equal(response.status(), 200, path)
    return response.json()
  }
  const readQuiz = options.readQuiz ?? (() => read("/api/quizz/" + quizId))
  const readExtras = options.readExtras ?? (() => read(apiPath))
  const writeComposite =
    options.writeComposite ??
    (async (body) => {
      assert(
        options.token,
        "Authenticated fixture write callback or token required",
      )
      const response = await page.request.put(origin + apiPath, {
        headers,
        data: body,
      })
      assert.equal(response.status(), 200, "Fixture composite write")
      return response.json()
    })
  const { computeCanonicalBaseDigest } =
    await import("../../src/core/digest.ts")
  const { CREATING_WORLDS_PRESETS } =
    await import("../../src/core/creating-worlds-show.ts")
  const originalQuiz = structuredClone(await readQuiz())
  const originalExtras = structuredClone((await readExtras()).extras)
  assert(
    originalExtras?.timeline && originalExtras.scenes,
    "V2 fixture required",
  )
  assert(originalQuiz.questions[0]?.answers.length >= 2)
  const originalViewport = page.viewportSize()
  const originalUrl = page.url()
  const originalLanguage = await page.evaluate(() =>
    localStorage.getItem("i18nextLng"),
  )
  const cleanQuiz = (quiz) => {
    const result = structuredClone(quiz)
    delete result.id
    return result
  }
  const fixtureQuiz = cleanQuiz(originalQuiz)
  fixtureQuiz.questions[0] = {
    ...fixtureQuiz.questions[0],
    type: "multi",
    playMode: "quiz",
    solutions: [0, 1],
    options: { scoringMode: "strict" },
    cooldown: 8,
    maxPoints: 500,
    penalty: 25,
  }
  const fixtureExtras = structuredClone(originalExtras)
  fixtureExtras.baseDigest = computeCanonicalBaseDigest(fixtureQuiz)
  const firstQuestionId = fixtureExtras.questionIds[0]
  const existingQuestionExtras =
    fixtureExtras.perQuestion[firstQuestionId] ?? {}
  fixtureExtras.perQuestion[firstQuestionId] = {
    ...existingQuestionExtras,
    audioCues: {
      ...existingQuestionExtras.audioCues,
      showQuestion: { mode: "mute" },
    },
    questionEntrance: { preset: "none", durationMs: 900 },
  }
  const titles = new Map()
  for (const preset of [...CREATING_WORLDS_PRESETS, "spotlight"]) {
    const sceneId = randomUUID()
    const title = "Semantic QA · " + preset
    titles.set(preset, title)
    fixtureExtras.scenes[sceneId] = {
      id: sceneId,
      kind: "animation",
      preset,
      title,
      durationMs: 10000,
      advance: "manual",
    }
    fixtureExtras.timeline.push({
      id: randomUUID(),
      kind: "animation",
      sceneId,
    })
  }
  const report = []
  const record = (name, detail = {}) =>
    report.push({ name, passed: true, ...detail })
  const editor = origin + "/manager/quizz/" + quizId
  let language = "en"
  const openEditor = async () => {
    await page.goto(editor + "?lng=" + language)
    await expect(page.getByTestId("editor-save-btn")).toBeVisible({
      timeout: 30_000,
    })
    const question = page.getByTestId("editor-question-card-0")
    const closeDrawer = async () => {
      const visibleClose = page.locator("[data-editor-drawer-close]:visible")
      if (await visibleClose.count()) await visibleClose.first().click()
    }
    if (!(await question.isVisible())) {
      await closeDrawer()
      await page.getByTestId("editor-panel-toggle-timeline").click()
    }
    await question.click()
    if (!(await page.getByTestId("editor-question-guide").isVisible())) {
      await closeDrawer()
      await page.getByTestId("editor-panel-toggle-edit").click()
    }
    await expect(page.getByTestId("editor-question-guide")).toBeVisible()
    await expect(page.getByTestId("editor-editing-mode")).toBeVisible()
  }
  const card = (preset) =>
    page
      .getByTestId("editor-scene-card")
      .filter({ hasText: titles.get(preset) })
  const mutationRequests = []
  const onRequest = (request) => {
    if (
      new URL(request.url()).pathname === apiPath &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
    ) {
      mutationRequests.push(request.method())
    }
  }
  let fixtureWritten = false
  try {
    await writeComposite({
      expectedRevision: originalExtras.revision,
      quizz: fixtureQuiz,
      extras: fixtureExtras,
    })
    fixtureWritten = true
    const baselineQuiz = await readQuiz()
    const baselineExtrasReply = await readExtras()
    const baselineExtras = baselineExtrasReply.extras
    await page.evaluate(() => localStorage.setItem("i18nextLng", "en"))
    await page.setViewportSize({ width: 1440, height: 1000 })
    page.on("request", onRequest)
    await openEditor()
    const mode = page.getByTestId("editor-editing-mode")
    await expect(mode).toHaveAttribute("data-mode", "simple")
    await expect(
      page
        .getByTestId("editor-question-guide")
        .getByTestId("editor-custom-settings-notice"),
    ).toBeVisible()
    const kindBar = page.locator(
      '[data-testid="studio-card-type-bar"][data-embedded="true"]',
    )
    await expect(kindBar.locator('[data-testid^="toggle-kind-"]')).toHaveCount(
      2,
    )
    await expect(kindBar.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "aria-checked",
      "true",
    )
    await expect(page.getByTestId("editor-add-more-card-types")).toBeVisible()
    await page.getByTestId("editor-panel-toggle-settings").click()
    await expect(page.getByTestId("answer-type-multi")).toHaveAttribute(
      "data-state",
      "on",
    )
    await expect(
      page.getByTestId("question-advanced-settings-toggle"),
    ).toHaveAttribute("aria-expanded", "false")
    await page.getByTestId("question-advanced-settings-toggle").click()
    await expect(
      page.getByTestId("question-advanced-settings-toggle"),
    ).toHaveAttribute("aria-expanded", "true")
    const advancedSettings = page.getByTestId("question-advanced-settings")
    await expect(advancedSettings).toBeVisible()
    await expect(
      advancedSettings.getByRole("spinbutton", {
        name: "Question display",
        exact: true,
      }),
    ).toHaveValue("8")
    await expect(
      advancedSettings.getByRole("spinbutton", {
        name: "Max points",
        exact: true,
      }),
    ).toHaveValue("500")
    await page.getByTestId("question-advanced-settings-toggle").click()
    await page.getByTestId("editor-panel-close-settings").click()
    await mode.getByTestId("editor-mode-advanced").click()
    await expect(kindBar.locator('[data-testid^="toggle-kind-"]')).toHaveCount(
      11,
    )
    await mode.getByTestId("editor-mode-simple").click()
    await expect(mode).toHaveAttribute("data-mode", "simple")
    record("simple-and-advanced-controls-preserve-existing-multi-question")

    for (const preset of CREATING_WORLDS_PRESETS) {
      const item = card(preset)
      await expect(item).toHaveCount(1)
      await expect(item).toHaveAttribute("data-scene-kind", "animation")
      await expect(item).toHaveAttribute("data-scene-role", preset)
      await expect(item.getByTestId("editor-scene-select")).toHaveAttribute(
        "aria-label",
        titles.get(preset),
      )
      await expect(item).toContainText("Host advances")
      assert(
        !(await item.locator("svg").first().getAttribute("class")).includes(
          "lucide-sparkles",
        ),
        "Semantic preset needs its own icon: " + preset,
      )
      assert(
        !(await item.textContent()).includes("extensions:"),
        "Translated semantic title and description: " + preset,
      )
      await item.getByTestId("editor-scene-select").click()
      await expect(item.getByTestId("editor-scene-select")).toHaveAttribute(
        "aria-pressed",
        "true",
      )
    }
    await expect(card("spotlight")).toHaveAttribute(
      "data-scene-role",
      "animation",
    )
    await expect(card("spotlight")).toContainText("Animation")
    record(
      "all-sixteen-semantic-presets-selectable-with-purpose-labels-icons",
      {
        presets: CREATING_WORLDS_PRESETS.length,
      },
    )
    await page.getByTestId("editor-question-card-0").click()
    await expect(mode).toHaveAttribute("data-mode", "simple")
    assert.deepEqual(
      mutationRequests,
      [],
      "View changes must not save the game",
    )
    assert.deepEqual(await readQuiz(), baselineQuiz)
    assert.deepEqual(await readExtras(), baselineExtrasReply)
    record("mode-and-selection-changes-make-no-persistence-requests")

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === apiPath &&
        response.request().method() === "PUT",
    )
    await page.getByTestId("editor-save-btn").click()
    assert.equal((await saved).status(), 200)
    await page.waitForURL(origin + "/studio/games")
    await openEditor()
    const afterQuiz = await readQuiz()
    const afterExtras = (await readExtras()).extras
    assert.deepEqual(afterQuiz.questions, baselineQuiz.questions)
    assert.deepEqual(afterExtras.perQuestion, baselineExtras.perQuestion)
    assert.deepEqual(afterExtras.scenes, baselineExtras.scenes)
    assert.deepEqual(afterExtras.timeline, baselineExtras.timeline)
    assert.deepEqual(afterExtras.defaults, baselineExtras.defaults)
    await expect(
      page
        .getByTestId("editor-question-guide")
        .getByTestId("editor-custom-settings-notice"),
    ).toBeVisible()
    record("simple-save-reload-retains-advanced-overrides-and-all-scenes")

    language = "he"
    await openEditor()
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    await page.screenshot({
      path: join(evidence, "editor-simple-he-desktop.png"),
      fullPage: true,
    })
    await card("tie-break").scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(evidence, "editor-semantic-cards-he-desktop.png"),
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await openEditor()
    await expect(page.getByTestId("editor-panel-edit")).toBeVisible()
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "RTL basic editor must not overflow the viewport",
    )
    await page.screenshot({
      path: join(evidence, "editor-simple-he-mobile.png"),
      fullPage: true,
    })
    await page.getByTestId("editor-panel-close-edit").click()
    await page.getByTestId("editor-panel-toggle-timeline").click()
    await card("tie-break").scrollIntoViewIfNeeded()
    await expect(card("tie-break")).toContainText("התקדמות בידי המנחה")
    await page.screenshot({
      path: join(evidence, "editor-semantic-cards-he-mobile.png"),
      fullPage: true,
    })
    record("native-hebrew-rtl-desktop-and-mobile-editor-screenshots")
    const receipt = {
      passed: true,
      platform: process.platform,
      results: report,
    }
    writeFileSync(
      join(evidence, "receipt.json"),
      JSON.stringify(receipt, null, 2) + "\n",
    )
    return receipt
  } catch (error) {
    const numericInputs = await page
      .locator('input[type="number"]')
      .evaluateAll((inputs) =>
        inputs.map((input) => ({
          name: input.getAttribute("name"),
          label: input.getAttribute("aria-label"),
          value: input.value,
          visible: input.getClientRects().length > 0,
        })),
      )
      .catch(() => [])
    writeFileSync(
      join(evidence, "partial-receipt.json"),
      JSON.stringify(
        {
          passed: false,
          results: report,
          error: String(error?.stack ?? error),
          numericInputs,
          mutationRequests,
        },
        null,
        2,
      ) + "\n",
    )
    await page
      .screenshot({
        path: join(evidence, "editor-refinement-failure.png"),
        fullPage: true,
      })
      .catch(() => {})
    throw error
  } finally {
    page.off("request", onRequest)
    if (fixtureWritten) {
      const latest = (await readExtras()).extras
      const restoredQuiz = cleanQuiz(originalQuiz)
      await writeComposite({
        expectedRevision: latest.revision,
        quizz: restoredQuiz,
        extras: {
          ...originalExtras,
          revision: latest.revision,
          baseDigest: computeCanonicalBaseDigest(restoredQuiz),
        },
      })
    }
    await page.evaluate((language) => {
      if (language === null) localStorage.removeItem("i18nextLng")
      else localStorage.setItem("i18nextLng", language)
    }, originalLanguage)
    if (originalViewport) await page.setViewportSize(originalViewport)
    if (originalUrl.startsWith(origin)) await page.goto(originalUrl)
  }
}
