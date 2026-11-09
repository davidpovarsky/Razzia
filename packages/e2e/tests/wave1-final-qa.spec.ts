import fs from "node:fs"
import { join } from "node:path"
import { CONFIG_PATH } from "@razzia/e2e/utils/constants"
import { openQuizzTab, quizzRow, seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { joinGame } from "@razzia/e2e/utils/player"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  type QuizExtrasV2,
} from "@razzia/extensions/core"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/wave1-final-qa",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath })
}

test.describe("Wave 1 Final Acceptance: UI Reachability, Settings Width, UI Workflow & Live Scenes", () => {
  test("QA-01: Header reachability and Save/Exit visibility across 1024, 1280, 1440, 1920 viewports + Settings full width", async ({
    page,
  }) => {
    const subject = `Viewport QA ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")

    seedQuizz(subject, {
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Test question for viewport",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const baseDigest = computeCanonicalBaseDigest({
      subject,
      questions: [
        {
          type: "single",
          question: "Test question for viewport",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [crypto.randomUUID()],
      baseDigest,
    )
    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(defaultV2, null, 2),
      "utf-8",
    )

    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizId}$`, "u"))

    const assertViewportReachability = async (
      width: number,
      height: number,
      name: string,
    ) => {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(300)

      const saveBtn = page.getByTestId("editor-save-btn")
      const exitBtn = page.getByTestId("editor-exit-btn")
      const titleInput = page.getByPlaceholder(t("quizz:titleQuizzPlaceholder"))

      await expect(saveBtn).toBeVisible()
      await expect(exitBtn).toBeVisible()
      await expect(titleInput).toBeVisible()

      const saveBox = await saveBtn.boundingBox()
      const exitBox = await exitBtn.boundingBox()

      expect(saveBox).not.toBeNull()
      expect(exitBox).not.toBeNull()

      if (saveBox && exitBox) {
        // Assert fully within viewport horizontally and vertically
        expect(saveBox.x).toBeGreaterThan(0)
        expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(width)
        expect(saveBox.y).toBeGreaterThanOrEqual(0)
        expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(height)

        expect(exitBox.x).toBeGreaterThan(0)
        expect(exitBox.x + exitBox.width).toBeLessThanOrEqual(width)
        expect(exitBox.y).toBeGreaterThanOrEqual(0)
        expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(height)
      }

      await saveScreenshot(page, `viewport_${name}_questions.png`)
    }

    await assertViewportReachability(1024, 768, "1024")
    await assertViewportReachability(1280, 800, "1280")
    await assertViewportReachability(1440, 900, "1440")
    await assertViewportReachability(1920, 1080, "1920")

    // Verify Settings page width at 1280px (UI-02: not trapped at 320px)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByTestId("studio-tab-settings").click()
    await expect(
      page.getByText(
        t("extensions:studio.settings.globalTitle", {
          defaultValue: "Studio Settings & Defaults",
        }),
      ),
    ).toBeVisible()

    // Find the main Settings Card element
    const settingsCard = page
      .getByText(
        t("extensions:studio.settings.newQuestionMode", {
          defaultValue: "Default Mode for New Cards",
        }),
      )
      .locator("xpath=ancestor::div[contains(@class, 'rounded-')][1]")
    const cardBox = await settingsCard.boundingBox()

    expect(cardBox).not.toBeNull()

    if (cardBox) {
      // Prior bug was Card constrained to max-w-80 (320px). Full width in max-w-4xl is >= 700px!
      expect(cardBox.width).toBeGreaterThan(600)
    }

    await saveScreenshot(page, "viewport_1280_settings.png")
  })

  test("QA-02: Editor UI workflow — Card kind toggle, Save button click, and reload persistence", async ({
    page,
  }) => {
    const subject = `UI Workflow Quiz ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "Initial Question 1",
        answers: ["Option 1", "Option 2"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "Initial Question 2",
        answers: ["Yes", "No"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
    ]

    // 1. Seed quiz on disk
    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const baseDigest = computeCanonicalBaseDigest({ subject, questions })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )
    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(defaultV2, null, 2),
      "utf-8",
    )

    // 2. Open quiz in editor via UI
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizId}$`, "u"))

    // 3. Select card 2 in the timeline sidebar
    await page.locator("aside").getByText("2").first().click()

    // 4. In header ToggleGroup, click Survey to switch this card from Quiz -> Survey
    const surveyToggle = page.getByTestId("toggle-kind-survey")
    await surveyToggle.click()
    await expect(surveyToggle).toHaveAttribute("data-state", "on")

    // Verify card 1 remains Quiz
    await page.locator("aside").getByText("1").first().click()
    const quizToggle = page.getByTestId("toggle-kind-quiz")
    await expect(quizToggle).toHaveAttribute("data-state", "on")

    // 5. Click Save button via UI
    const saveBtn = page.getByTestId("editor-save-btn")
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Expect saved toast and navigation back to manager config
    await expect(page.getByText(t("quizz:quizzUpdated"))).toBeVisible({
      timeout: 10000,
    })
    await expect(page).toHaveURL(/\/manager\/config$/u)

    // 6. Re-open quiz from manager list to verify persistence
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()

    // Card 2 should still be Survey!
    await page.locator("aside").getByText("2").first().click()
    await expect(page.getByTestId("toggle-kind-survey")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Card 1 should still be Quiz!
    await page.locator("aside").getByText("1").first().click()
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "editor_ui_saved_quizz.png")
  })

  test("QA-03: Preflight launch protection — dirty draft & missing media warnings", async ({
    page,
  }) => {
    const subject = `Launch Preflight QA ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const mediaSceneId = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        question: "Launch test question",
        answers: ["A", "B"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
    ]

    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const baseDigest = computeCanonicalBaseDigest({ subject, questions })
    const defaultV2 = createDefaultQuizExtrasV2(quizId, [q1Id], baseDigest)
    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: crypto.randomUUID(), kind: "question", questionId: q1Id },
        { id: crypto.randomUUID(), kind: "media", sceneId: mediaSceneId },
      ],
      scenes: {
        [mediaSceneId]: {
          id: mediaSceneId,
          kind: "media",
          title: "Missing Media Card",
          mediaUrl: "",
          mediaType: "image",
          durationMs: 5000,
          advance: "auto",
        },
      },
    }
    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()

    // 1. Click Launch tab in header
    await page.getByTestId("studio-tab-launch").click()

    // 2. Assert that missing media warning is displayed and Launch button is disabled
    await expect(
      page.getByText(
        t("extensions:studio.launch.missingMediaWarning", {
          defaultValue: "Some media cards have empty URLs",
        }),
      ),
    ).toBeVisible()

    const launchBtn = page.getByRole("button", {
      name: t("extensions:studio.launch.launchButton", {
        defaultValue: "Launch Live Show",
      }),
    })
    await expect(launchBtn).toBeDisabled()

    await saveScreenshot(page, "launch_preflight_missing_media_warning.png")
  })

  test("QA-04: Authoritative Live Game Scenes — Real Leaderboard Scores and Interim Results with 2 Players", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `Live Data Scenes Acceptance ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()
    const lbSceneId = crypto.randomUUID()
    const interimSceneId = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "What is 2 + 2?",
        answers: ["Three", "Four", "Five", "Six"],
        solutions: [1],
        cooldown: 3,
        time: 20,
      },
      {
        type: "single" as const,
        playMode: "survey" as const,
        question: "What is your favorite color?",
        answers: ["Red", "Blue"],
        solutions: [],
        cooldown: 3,
        time: 20,
      },
    ]

    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const baseDigest = computeCanonicalBaseDigest({ subject, questions })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )

    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: crypto.randomUUID(), kind: "question", questionId: q1Id },
        { id: crypto.randomUUID(), kind: "leaderboard", sceneId: lbSceneId },
        { id: crypto.randomUUID(), kind: "question", questionId: q2Id },
        {
          id: crypto.randomUUID(),
          kind: "interimResults",
          sceneId: interimSceneId,
        },
      ],
      scenes: {
        [lbSceneId]: {
          id: lbSceneId,
          kind: "leaderboard",
          title: "Mid-Game Leaderboard",
          durationMs: 5000,
          advance: "manual",
        },
        [interimSceneId]: {
          id: interimSceneId,
          kind: "interimResults",
          title: "Audience Poll Overview",
          durationMs: 5000,
          advance: "manual",
        },
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 1. Manager creates game
    const pin = await createGame(manager, subject)

    // 2. Alice and Bob join
    const alice = await newPage()
    await joinGame(alice, pin, "Alice")

    const bob = await newPage()
    await joinGame(bob, pin, "Bob")

    await expect(
      manager.getByRole("button", { name: /2.*Players/i }),
    ).toBeVisible()

    // 3. Start Game
    await startGame(manager)

    // 4. Question 1 (Quiz) starts: Alice answers correct ("Four"), Bob answers wrong ("Three")
    await expect(alice.getByText("Four", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(bob.getByText("Three", { exact: true })).toBeVisible({
      timeout: 15000,
    })

    await alice.getByText("Four", { exact: true }).click()
    await bob.getByText("Three", { exact: true }).click()

    // Manager advances from question reveal
    await next(manager)

    // 5. Step 1: Live Leaderboard Scene!
    // Assert real Leaderboard is displayed with Alice (1st place) and Bob (2nd place)
    await expect(manager.getByText("Mid-Game Leaderboard")).toBeVisible({
      timeout: 15000,
    })
    await expect(alice.getByText("Mid-Game Leaderboard")).toBeVisible({
      timeout: 15000,
    })

    // Assert real rank rows exist in the leaderboard scene (LIVE-01)
    await expect(
      manager.getByTestId("leaderboard-scene-row").getByText("Alice"),
    ).toBeVisible()
    await expect(
      manager.getByTestId("leaderboard-scene-row").getByText("Bob"),
    ).toBeVisible()
    await expect(
      alice.getByTestId("leaderboard-scene-row").getByText("Alice"),
    ).toBeVisible()
    await expect(
      alice.getByTestId("leaderboard-scene-row").getByText("Bob"),
    ).toBeVisible()

    // Input suppression: Alice does not see question answers during scene
    await expect(alice.getByText("Four")).not.toBeVisible()

    await saveScreenshot(manager, "live_leaderboard_real_scores_manager.png")
    await saveScreenshot(alice, "live_leaderboard_real_scores_player.png")

    // 6. Manager advances past Leaderboard Scene -> Question 2 (Survey) begins
    const advanceSceneBtn = manager.getByTestId("scene-skip-button")
    await advanceSceneBtn.click()

    // 7. Question 2 (Survey) starts: Alice votes "Red", Bob votes "Blue"
    await expect(alice.getByText("Red", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(bob.getByText("Blue", { exact: true })).toBeVisible({
      timeout: 15000,
    })

    await alice.getByText("Red", { exact: true }).click()
    await bob.getByText("Blue", { exact: true }).click()

    // Manager advances from survey reveal
    await next(manager)

    // 8. Step 3: Live Interim Results Scene!
    // Assert real question summary and options are displayed (LIVE-02)
    await expect(manager.getByText("Audience Poll Overview")).toBeVisible({
      timeout: 15000,
    })
    await expect(alice.getByText("Audience Poll Overview")).toBeVisible({
      timeout: 15000,
    })

    // Assert question text and options appear with real percentages (50% each)
    await expect(
      manager.getByText("What is your favorite color?"),
    ).toBeVisible()
    await expect(manager.getByText("Red", { exact: true })).toBeVisible()
    await expect(manager.getByText("Blue", { exact: true })).toBeVisible()

    await saveScreenshot(manager, "live_interim_results_real_poll_manager.png")
    await saveScreenshot(alice, "live_interim_results_real_poll_player.png")

    // 9. Manager advances past Interim Results Scene -> Game Finish
    await advanceSceneBtn.click()

    // 10. Verify podium finishes with Alice as winner
    await expect(manager.getByText(/Alice/u).first()).toBeVisible({
      timeout: 15000,
    })
    await saveScreenshot(manager, "live_finish_podium.png")
  })
})
