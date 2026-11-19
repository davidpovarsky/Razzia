/** Native editor acceptance using only an account owned by the disposable host. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { join } from "node:path"
import { writeFileSync } from "node:fs"
import { verifyEditorRefinements } from "../experience-refinement/editor-verify.mjs"
import { verifyGuestAdmission } from "../experience-refinement/guest-verify.mjs"
import { verifyPlatformDefaults } from "../experience-refinement/platform-verify.mjs"
import {
  verifyNativePalette,
  verifyCatalogueCovers,
} from "./palette-verify.mjs"

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
    await page.getByTestId("editor-question-card-0").click()
    const initialGeometry = await verifyNativePalette(
      page,
      "tadazz-midnight-club",
      "editor",
      options.evidence,
    )
    let panel = await openThemes()
    assert.equal(options.themeDefinitions.length, 11)
    await expect
      .poll(
        () =>
          panel.locator("img").evaluateAll((images) =>
            images
              .filter((image) => {
                const bounds = image.getBoundingClientRect()
                return (
                  bounds.top < window.innerHeight &&
                  bounds.bottom > 0 &&
                  bounds.width > 0
                )
              })
              .every((image) => image.complete && image.naturalWidth > 0),
          ),
        { timeout: 15000 },
      )
      .toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
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
      await page.waitForURL(options.origin + "/studio/games")
      await openEditor()
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
      const geometry = await verifyNativePalette(
        page,
        themeId,
        "editor",
        options.evidence,
      )
      assert.deepEqual(
        geometry,
        initialGeometry,
        "Theme colors preserve native question and answer geometry",
      )
      await page.evaluate(() => window.scrollTo(0, 0))
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
    await verifyCatalogueCovers(page, "studio", options.evidence)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: join(options.evidence, "authenticated-gallery-covers.png"),
      fullPage: true,
    })
    await page
      .locator('[data-catalogue-card="family"] .game-preview-trigger')
      .click()
    await expect(
      page
        .locator('[data-native-application-preview][data-preview-ready="true"]')
        .first(),
    ).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => window.scrollTo(0, 0))
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
    let capturedRoom
    await page.route(options.origin + "/api/games", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      const response = await route.fetch()
      capturedRoom = {
        status: response.status(),
        quizId: route.request().postDataJSON().quizzId,
        body: await response.json(),
      }
      await route.fulfill({ response })
    })
    await page.getByTestId("catalogue-use-game").click()
    await expect.poll(() => Boolean(capturedRoom)).toBe(true)
    assert([200, 201].includes(capturedRoom.status))
    assert.equal(capturedRoom.quizId, options.quizId)
    const room = capturedRoom.body
    await expect(page).toHaveURL(
      options.origin + "/party/manager/" + room.gameId,
    )
    await expect(page.getByTestId("platform-opening-start")).toBeEnabled({
      timeout: 30_000,
    })
    await page.getByTestId("platform-opening-start").click()
    await expect(page.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-platform-opening-stage",
      "opening",
    )
    await expect(page.getByTestId("platform-opening-skip")).toBeEnabled()
    await page.getByTestId("platform-opening-skip").click()
    await expect(page.getByTestId("platform-game-opening")).toBeHidden({
      timeout: 30_000,
    })
    const hostStage = page.getByTestId("tadazz-show")
    await expect(hostStage).toHaveAttribute(
      "data-show-theme",
      "tadazz-discovery-lab",
      { timeout: 30_000 },
    )
    await expect(hostStage).toHaveAttribute("data-theme-fallback", "false")
    const toolbar = page.getByTestId("manager-control-toolbar")
    await expect(toolbar).toHaveAttribute("data-host-lobby", "true")
    const pin = (
      await page
        .getByText(/^\d{6}$/)
        .first()
        .textContent()
    ).trim()
    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "en-GB",
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    })
    await playerContext.addInitScript(() =>
      localStorage.setItem("i18nextLng", "en"),
    )
    const player = await playerContext.newPage()
    player.on("pageerror", (error) =>
      pageErrors.push("player: " + error.message),
    )
    await player.goto(options.origin + "/game?pin=" + encodeURIComponent(pin))
    await player.getByPlaceholder("Username here").fill("Gallery QA player")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(player).toHaveURL(options.origin + "/party/" + room.gameId)
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /CONNECTED:\s*1/i })
        .first(),
    ).toBeVisible({ timeout: 30_000 })
    report.push({
      name: "real-anonymous-player-joined-isolated-gallery-room",
      passed: true,
    })
    await toolbar.getByRole("button", { name: "Start", exact: true }).click()
    await expect(toolbar).toHaveAttribute("data-host-lobby", "false", {
      timeout: 30_000,
    })
    await expect(hostStage).toHaveAttribute(
      "data-show-theme",
      "tadazz-discovery-lab",
    )
    await expect(hostStage).toHaveAttribute("data-show-scene", "voting", {
      timeout: 30_000,
    })
    await expect(hostStage).toHaveAttribute("data-voting-open", "true")
    await expect(page.getByTestId("host-question-counter")).toHaveText("1 / 8")
    await expect(player.locator('[data-native-layout="true"]')).toBeVisible()
    const nativePhoneChoice = player
      .locator("button")
      .filter({ has: player.getByTestId("answer-badge-0") })
    await expect(nativePhoneChoice).toBeVisible({ timeout: 10_000 })
    await expect(nativePhoneChoice).toBeEnabled()
    const playerDiagnostic = await player.evaluate(() => ({
      url: location.origin + location.pathname,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        coarsePointer: matchMedia("(pointer: coarse)").matches,
      },
      buttons: [...document.querySelectorAll("button")].map((button) => {
        const bounds = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return {
          text: button.innerText?.trim(),
          firstAnswerBadge: Boolean(
            button.querySelector('[data-testid="answer-badge-0"]'),
          ),
          testid: button.getAttribute("data-testid"),
          ariaLabel: button.getAttribute("aria-label"),
          disabled: button.disabled,
          visible:
            bounds.width > 0 &&
            bounds.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none",
        }
      }),
      surfaces: [
        ...document.querySelectorAll(
          "[data-show-theme], [data-native-layout], [data-testid='tadazz-show']",
        ),
      ].map((element) =>
        Object.fromEntries(
          [...element.attributes]
            .filter((attribute) => attribute.name.startsWith("data-"))
            .map((attribute) => [attribute.name, attribute.value]),
        ),
      ),
    }))
    writeFileSync(
      join(options.evidence, "native-player-voting-controls.json"),
      JSON.stringify(playerDiagnostic, null, 2) + "\n",
    )
    const observedChoice = playerDiagnostic.buttons.filter(
      (button) => button.firstAnswerBadge && button.visible && !button.disabled,
    )
    assert.equal(
      observedChoice.length,
      1,
      "Exactly one live native first-answer button",
    )
    assert(
      (observedChoice[0].ariaLabel || observedChoice[0].text)
        .replace(/\s+/g, " ")
        .includes(options.expectedQuestions[0].answers[0]),
      "Observed phone choice matches the actual authored first answer",
    )
    await nativePhoneChoice.click()
    await expect(
      player.getByRole("heading", {
        name: "Thanks, that's noted",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(hostStage).toHaveAttribute("data-show-scene", "results", {
      timeout: 30_000,
    })
    await expect(
      page.getByTestId("tadazz-card-0").locator(".result-percentage"),
    ).toHaveAttribute("data-target-percentage", "100")
    await expect(
      page.getByTestId("tadazz-card-0").locator(".result-percentage"),
    ).toHaveText("100%")
    for (const index of [1, 2, 3])
      await expect(
        page.getByTestId("tadazz-card-" + index).locator(".result-percentage"),
      ).toHaveAttribute("data-target-percentage", "0")
    await player.screenshot({
      path: join(options.evidence, "native-player-gallery-answer-sent.png"),
      fullPage: true,
    })
    report.push({
      name: "real-phone-player-voted-in-gallery-room",
      passed: true,
      acceptedVotes: 1,
    })
    await verifyNativePalette(
      page,
      "tadazz-discovery-lab",
      "host",
      options.evidence,
    )
    await page.evaluate(() => window.scrollTo(0, 0))
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
    const guestReceipt = await verifyGuestAdmission({
      ...options,
      page,
      browser,
      context,
      player,
      playerContext,
      room,
      pin,
    })
    assert.equal(guestReceipt.passed, true)
    report.push(...guestReceipt.results)

    const refinementReceipt = await verifyEditorRefinements({
      ...options,
      page,
    })
    assert.equal(refinementReceipt.passed, true)
    report.push(...refinementReceipt.results)

    const platformReceipt = await verifyPlatformDefaults({
      ...options,
      browser,
      context,
    })
    assert.equal(platformReceipt.passed, true)
    report.push(...platformReceipt.results)

    assert.deepEqual(pageErrors, [], "No editor browser JavaScript errors")
    assert.deepEqual(failedAssets, [], "No editor asset failures")
    return { passed: true, results: report, pageErrors, failedAssets }
  } catch (error) {
    writeFileSync(
      join(options.evidence, "native-editor-partial-receipt.json"),
      JSON.stringify(
        {
          passed: false,
          results: report,
          pageErrors,
          failedAssets,
          error: String(error?.stack ?? error),
        },
        null,
        2,
      ) + "\n",
    )
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
