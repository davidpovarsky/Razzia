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
  "../test-results/wave1-completion",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath })
}

test.describe("Wave 1 Acceptance: Studio Navigation, Launch Protection & Live Game Scenes", () => {
  test("Scenario 1: Studio Timeline Navigation, Questions, Scene Editor, Participants, Settings and Launch Preflight", async ({
    page,
  }) => {
    const subject = `Wave 1 Studio Acceptance ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "What is 2 + 2?",
        answers: ["3", "4", "5", "6"],
        solutions: [1],
        cooldown: 5,
        time: 20,
      },
      {
        type: "single" as const,
        playMode: "survey" as const,
        question: "How do you rate this studio show?",
        answers: ["Great", "Awesome"],
        solutions: [],
        cooldown: 5,
        time: 20,
      },
    ]

    // 1. Seed base quiz on disk
    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    // 2. Seed V2 sidecar on disk with opening scene, Q1, transition, Q2
    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const baseDigest = computeCanonicalBaseDigest({ subject, questions })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )

    const openSceneId = crypto.randomUUID()
    const transSceneId = crypto.randomUUID()
    const stepOpenId = crypto.randomUUID()
    const stepQ1Id = crypto.randomUUID()
    const stepTransId = crypto.randomUUID()
    const stepQ2Id = crypto.randomUUID()

    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: stepOpenId, kind: "opening", sceneId: openSceneId },
        { id: stepQ1Id, kind: "question", questionId: q1Id },
        { id: stepTransId, kind: "transition", sceneId: transSceneId },
        { id: stepQ2Id, kind: "question", questionId: q2Id },
      ],
      scenes: {
        [openSceneId]: {
          id: openSceneId,
          kind: "opening",
          title: "Welcome to TADA Studio Show",
          durationMs: 5000,
          advance: "manual",
        },
        [transSceneId]: {
          id: transSceneId,
          kind: "transition",
          title: "Next: Audience Survey",
          durationMs: 3000,
          advance: "manual",
        },
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 3. Login to Manager and open Quiz in Quizz Editor
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizId}$`, "u"))

    // 4. Verify Studio Timeline cards in sidebar
    await expect(
      page
        .locator("aside")
        .getByText(/opening/i)
        .first(),
    ).toBeVisible()
    await expect(
      page
        .locator("aside")
        .getByText(/transition/i)
        .first(),
    ).toBeVisible()

    // 5. Click Opening Scene card -> Verify StudioSceneEditor renders
    await page
      .locator("aside")
      .getByText(/opening/i)
      .first()
      .click()
    await expect(
      page.getByRole("heading", { name: "Welcome to TADA Studio Show" }),
    ).toBeVisible()
    await saveScreenshot(page, "01_studio_scene_editor.png")

    // 6. Click Question 1 -> Verify QuestionEditor renders
    await page.locator("aside").getByText("1").first().click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("What is 2 + 2?")
    await saveScreenshot(page, "02_studio_question_editor.png")

    // 7. Click Participants tab in header
    await page
      .getByRole("button", {
        name: t("extensions:studio.tabs.participants", {
          defaultValue: "Participants",
        }),
      })
      .click()
    await expect(
      page.getByText(
        t("extensions:roster.title", { defaultValue: "Participant Roster" }),
      ),
    ).toBeVisible()
    await saveScreenshot(page, "03_studio_participants.png")

    // 8. Click Settings tab in header
    await page
      .getByRole("button", {
        name: t("extensions:studio.tabs.settings", {
          defaultValue: "Settings",
        }),
      })
      .click()
    await expect(
      page.getByText(
        t("extensions:studio.settings.newQuestionMode", {
          defaultValue: "Default Question Mode",
        }),
      ),
    ).toBeVisible()
    await saveScreenshot(page, "04_studio_settings.png")

    // 9. Click Launch tab in header
    await page
      .getByRole("button", {
        name: t("extensions:studio.tabs.launch", { defaultValue: "Launch" }),
      })
      .click()
    await expect(
      page.getByRole("heading", { name: /Launch Live Show/i }),
    ).toBeVisible()
    await saveScreenshot(page, "05_studio_launch.png")
  })

  test("Scenario 2: Live Game Scene Presentation, Input Suppression during Scenes, Advance to Question & Finished Podium", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `Live Show Acceptance ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()

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
        question: "How do you rate this studio show?",
        answers: ["Great", "Awesome"],
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

    const openSceneId = crypto.randomUUID()
    const transSceneId = crypto.randomUUID()
    const stepOpenId = crypto.randomUUID()
    const stepQ1Id = crypto.randomUUID()
    const stepTransId = crypto.randomUUID()
    const stepQ2Id = crypto.randomUUID()

    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: stepOpenId, kind: "opening", sceneId: openSceneId },
        { id: stepQ1Id, kind: "question", questionId: q1Id },
        { id: stepTransId, kind: "transition", sceneId: transSceneId },
        { id: stepQ2Id, kind: "question", questionId: q2Id },
      ],
      scenes: {
        [openSceneId]: {
          id: openSceneId,
          kind: "opening",
          title: "Grand Opening Scene",
          durationMs: 4000,
          advance: "manual",
        },
        [transSceneId]: {
          id: transSceneId,
          kind: "transition",
          title: "Transition to Survey",
          durationMs: 3000,
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

    // 2. Web Player Alice joins
    const alice = await newPage()
    await joinGame(alice, pin, "Alice")
    await expect(
      manager.getByRole("button", { name: /1.*Players/i }),
    ).toBeVisible()

    // 3. Start Game
    await startGame(manager)

    // 4. Authoritative Stage is now Step 0: Grand Opening Scene!
    // Manager and Alice both see Opening Scene
    await expect(manager.getByText("Grand Opening Scene")).toBeVisible({
      timeout: 15000,
    })
    await expect(alice.getByText("Grand Opening Scene")).toBeVisible({
      timeout: 15000,
    })

    // Web Player Alice does NOT see answer options during scene (input suppression)
    await expect(alice.getByText("Four")).not.toBeVisible()

    await saveScreenshot(manager, "06_live_opening_scene_manager.png")
    await saveScreenshot(alice, "07_live_opening_scene_player.png")

    // 5. Manager advances Opening Scene -> Question 1 begins
    const advanceSceneBtn = manager.getByTestId("scene-skip-button")
    await advanceSceneBtn.click()

    // 6. Question 1 answers appear for Alice
    await expect(alice.getByText("Four", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await saveScreenshot(manager, "08_live_question1_manager.png")

    // Alice selects correct answer "Four"
    await alice.getByText("Four", { exact: true }).click()

    // When Alice answers, RoundManager automatically transitions to SHOW_RESULT -> SHOW_RESPONSES (Reveal)
    // Manager advances from Reveal -> Transition Scene begins
    await next(manager)

    // Verify Transition Scene appears for both Manager and Alice
    await expect(manager.getByText("Transition to Survey")).toBeVisible({
      timeout: 15000,
    })
    await expect(alice.getByText("Transition to Survey")).toBeVisible({
      timeout: 15000,
    })

    // Manager advances past Transition Scene -> Question 2 (Survey) begins
    await advanceSceneBtn.click()

    // Question 2 (Survey) answers appear for Alice
    await expect(alice.getByText("Great", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await alice.getByText("Great", { exact: true }).click()

    // Manager advances survey reveal -> finish
    await next(manager)

    // 7. Verify finish podium (since Q1 was scored quiz, mixed finish delivers STATUS.FINISHED with podium!)
    await expect(manager.getByText(/Alice/u).first()).toBeVisible({
      timeout: 15000,
    })
    await saveScreenshot(manager, "09_live_finish_podium.png")
  })
})
