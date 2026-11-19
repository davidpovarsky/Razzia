/** Native editor acceptance using only an account owned by the disposable host. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire("/cleanup/extensions/package.json")
const { chromium, expect } = require("@playwright/test")

export async function verifyGalleryEditor(options) {
  assert.equal(process.platform, "linux")
  assert.equal(new URL(options.origin).hostname, "127.0.0.1")
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
  })
  await context.addInitScript((token) => {
    localStorage.setItem("token", token)
    localStorage.setItem("i18nextLng", "en")
  }, options.token)
  const page = await context.newPage()
  const pageErrors = []
  const failedAssets = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      ["image", "script", "stylesheet", "font"].includes(
        response.request().resourceType(),
      )
    ) {
      failedAssets.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      })
    }
  })
  const report = []
  const editor = `/manager/quizz/${options.quizId}`
  const openEditor = async () => {
    await page.goto(options.origin + editor)
    await expect(page.getByTestId("editor-save-btn")).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator('input[name="subject"]')).toHaveValue(
      options.expectedTitle,
    )
  }
  const openThemes = async () => {
    await page.getByTestId("editor-panel-toggle-themes").click()
    const panel = page.getByTestId("editor-panel-themes")
    await expect(panel).toBeVisible()
    for (const theme of options.themeDefinitions) {
      await expect(panel.getByTestId("show-theme-" + theme.id)).toHaveCount(1)
    }
    return panel
  }
  try {
    await openEditor()
    await expect(page.getByTestId("editor-game-backdrop")).toHaveAttribute(
      "data-editor-theme",
      "tadazz-midnight-club",
    )
    let panel = await openThemes()
    assert.equal(options.themeDefinitions.length, 11)
    await page.screenshot({
      path: join(options.evidence, "native-editor-eleven-global-themes.png"),
      fullPage: true,
    })
    report.push({
      name: "native-editor-all-eleven-global-theme-choices",
      passed: true,
    })

    for (const themeId of ["tadazz-family-fiesta", "tadazz-discovery-lab"]) {
      const theme = options.themeDefinitions.find((item) => item.id === themeId)
      const backdrop = theme.assets.find(
        (asset) => asset.id === theme.adapterAssets.showBackdrop,
      ).url
      await panel
        .getByTestId("show-theme-" + themeId)
        .getByRole("button", { name: "Use this theme", exact: true })
        .click()
      const confirm = page.getByRole("alertdialog")
      await expect(confirm).toBeVisible()
      await confirm
        .getByRole("button", { name: "Use this theme", exact: true })
        .click()
      await expect(
        panel.getByTestId("show-theme-" + themeId).getByRole("button"),
      ).toBeDisabled()
      await expect(page.getByTestId("editor-game-backdrop")).toHaveAttribute(
        "data-editor-theme",
        themeId,
      )
      await page.getByTestId("editor-panel-close-themes").click()
      await expect(panel).toBeHidden()
      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/extensions/quizzes/${options.quizId}` &&
          response.request().method() === "PUT",
      )
      await page.getByTestId("editor-save-btn").click()
      assert.equal((await saved).status(), 200, "Native editor composite save")
      await page.reload()
      await expect(page.getByTestId("editor-save-btn")).toBeVisible()
      await expect(page.locator('input[name="subject"]')).toHaveValue(
        options.expectedTitle,
      )
      await expect(page.getByTestId("editor-game-backdrop")).toHaveAttribute(
        "data-editor-theme",
        themeId,
      )
      await expect
        .poll(() =>
          page
            .getByTestId("editor-game-backdrop")
            .evaluate((element) => getComputedStyle(element).backgroundImage),
        )
        .toContain(backdrop)
      const actualQuiz = await options.readQuiz()
      const extras = await options.readExtras()
      assert.deepEqual(
        actualQuiz.questions,
        options.expectedQuestions,
        "Theme changes preserve every native question",
      )
      assert.equal(actualQuiz.subject, options.expectedTitle)
      assert.equal(extras.extras.defaults.showTheme.id, themeId)
      await page.getByTestId("editor-question-card-0").click()
      await expect(
        page.locator('input[name="questions.0.question"]'),
      ).toHaveValue(options.expectedQuestions[0].question)
      await page.screenshot({
        path: join(options.evidence, "native-editor-saved-" + themeId + ".png"),
        fullPage: true,
      })
      panel = await openThemes()
      await expect(
        panel.getByTestId("show-theme-" + themeId).getByRole("button"),
      ).toBeDisabled()
      report.push({
        name: "native-editor-save-reload-" + themeId,
        passed: true,
        questionCount: actualQuiz.questions.length,
      })
    }
    await page.getByTestId("editor-panel-close-themes").click()

    await page.goto(options.origin + "/studio/explore")
    await expect(page.locator("[data-catalogue-card]")).toHaveCount(10)
    await page
      .locator('[data-catalogue-card="family"] .game-preview-trigger')
      .click()
    await expect(
      page
        .locator('[data-native-application-preview][data-preview-ready="true"]')
        .first(),
    ).toBeVisible({ timeout: 30_000 })
    await page.screenshot({
      path: join(options.evidence, "authenticated-explore-public-preview.png"),
      fullPage: true,
    })
    report.push({
      name: "authenticated-studio-explore-loads-real-public-preview",
      passed: true,
    })

    await page.goto(options.origin + "/?view=product&game=family")
    await page.getByTestId("catalogue-customise").click()
    await expect(page).toHaveURL(options.origin + editor)
    await expect(page.locator('input[name="subject"]')).toHaveValue(
      options.expectedTitle,
    )
    await page.goto(options.origin + "/?view=product&game=family")
    const roomCreated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/games" &&
        response.request().method() === "POST",
    )
    await page.getByTestId("catalogue-use-game").click()
    const roomResponse = await roomCreated
    assert([200, 201].includes(roomResponse.status()))
    assert.equal(roomResponse.request().postDataJSON().quizzId, options.quizId)
    const room = await roomResponse.json()
    await expect(page).toHaveURL(
      options.origin + "/party/manager/" + room.gameId,
    )
    const hostStage = page.getByTestId("tadazz-show")
    await expect(hostStage).toHaveAttribute(
      "data-show-theme",
      "tadazz-discovery-lab",
      { timeout: 30_000 },
    )
    await expect(hostStage).toHaveAttribute("data-theme-fallback", "false")
    const toolbar = page.getByTestId("manager-control-toolbar")
    await expect(toolbar).toHaveAttribute("data-host-lobby", "true")
    await toolbar.getByRole("button", { name: /^Start/i }).click()
    await expect(toolbar).toHaveAttribute("data-host-lobby", "false", {
      timeout: 30_000,
    })
    await expect(hostStage).toHaveAttribute(
      "data-show-theme",
      "tadazz-discovery-lab",
    )
    await page.screenshot({
      path: join(options.evidence, "native-host-gallery-theme-started.png"),
      fullPage: true,
    })
    report.push({
      name: "catalogue-customise-and-use-buttons-reopen-existing-private-copy",
      passed: true,
    })
    report.push({
      name: "real-hosted-gallery-game-started-with-saved-global-theme",
      passed: true,
      theme: "tadazz-discovery-lab",
    })
    assert.deepEqual(pageErrors, [], "No editor browser JavaScript errors")
    assert.deepEqual(failedAssets, [], "No editor asset failures")
    return { passed: true, results: report, pageErrors, failedAssets }
  } catch (error) {
    await page
      .screenshot({
        path: join(options.evidence, "native-editor-failure.png"),
        fullPage: true,
      })
      .catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
