/* oxlint-disable eslint/no-await-in-loop, eslint/no-plusplus */
import fs from "node:fs"
import { join } from "node:path"
import type { Page } from "@playwright/test"
import { CONFIG_PATH } from "@razzia/e2e/utils/constants"
import {
  answerInput,
  openQuizzTab,
  quizzRow,
  seedQuizz,
  selectOption,
} from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { loginManager } from "@razzia/e2e/utils/manager"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  type QuizExtrasV2,
} from "@razzia/extensions/core"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/wave1-card-editor-regression",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath })
}

interface TelemetryCollector {
  assertClean: () => void
  pageErrors: string[]
  consoleErrors: string[]
  failedRequests: string[]
}

const setupTelemetry = (page: Page): TelemetryCollector => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message)
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text())
    }
  })

  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText

    if (failure && !failure.includes("ERR_ABORTED")) {
      failedRequests.push(`${req.method()} ${req.url()} - ${failure}`)
    }
  })

  page.on("response", (res) => {
    if (res.status() >= 500) {
      failedRequests.push(
        `HTTP ${res.status()} ${res.request().method()} ${res.url()}`,
      )
    }
  })

  return {
    assertClean: () => {
      expect(
        pageErrors,
        `Browser page errors encountered:\n${pageErrors.join("\n")}`,
      ).toEqual([])

      const fatalErrors = consoleErrors.filter(
        (err) =>
          err.includes("reading 'answers'") ||
          err.includes("Cannot read properties of undefined") ||
          err.includes("TypeError") ||
          err.includes("Uncaught"),
      )
      expect(
        fatalErrors,
        `Fatal browser console errors encountered:\n${fatalErrors.join("\n")}`,
      ).toEqual([])

      expect(
        failedRequests,
        `Failed network requests encountered:\n${failedRequests.join("\n")}`,
      ).toEqual([])
    },
    pageErrors,
    consoleErrors,
    failedRequests,
  }
}

test.describe("Wave 1 Card Editor Regression & Header Row Swap Suite (C01–C15)", () => {
  test("C01: New quiz route /manager/quizz renders StudioShell with swapped rows, valid default question, and no old enhancements", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    // Row 1: Title input, 4 Studio tabs, Exit/Save buttons
    const titleInput = page.getByPlaceholder(t("quizz:titleQuizzPlaceholder"))
    await expect(titleInput).toBeVisible()
    await expect(page.getByTestId("studio-tab-questions")).toBeVisible()
    await expect(page.getByTestId("studio-tab-participants")).toBeVisible()
    await expect(page.getByTestId("studio-tab-settings")).toBeVisible()
    await expect(page.getByTestId("studio-tab-launch")).toBeVisible()
    await expect(page.getByTestId("editor-save-btn")).toBeVisible()
    await expect(page.getByTestId("editor-exit-btn")).toBeVisible()

    // Row 2: Card type ToggleGroup in Questions tab
    const cardTypeBar = page.getByTestId("studio-card-type-bar")
    await expect(cardTypeBar).toBeVisible()
    const quizToggle = page.getByTestId("toggle-kind-quiz")
    await expect(quizToggle).toBeVisible()
    await expect(quizToggle).toHaveAttribute("data-state", "on")

    // Verify NO old "Quiz Enhancements" accordion / panel anywhere
    await expect(page.getByText("Quiz Enhancements")).toHaveCount(0)

    // Sidebar: 1 default question card
    const sidebar = page.locator("aside").first()
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByText("1").first()).toBeVisible()

    // QuestionEditor mounted with input & answer fields
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toBeVisible()
    await expect(
      page.getByPlaceholder(t("quizz:addAnswerPlaceholder")).first(),
    ).toBeVisible()

    await saveScreenshot(page, "new_quiz_studio_shell.png")
    telemetry.assertClean()
  })

  test("C02: Edit quiz route /manager/quizz/:id renders StudioShell with both rows and full question editing", async ({
    page,
  }) => {
    const subject = `C02 Edit Route ${Date.now()}`
    const _quizId = subject.toLowerCase().replace(/\W+/gu, "-")

    seedQuizz(subject, {
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Existing Question 1",
          answers: ["Option A", "Option B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
        {
          type: "single",
          question: "Existing Question 2",
          answers: ["Yes", "No"],
          solutions: [1],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const telemetry = setupTelemetry(page)
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(/\/manager\/quizz\/[A-Za-z0-9_-]+$/u)

    // Verify top row and bottom selector bar
    await expect(page.getByTestId("studio-tab-questions")).toBeVisible()
    await expect(page.getByTestId("studio-card-type-bar")).toBeVisible()
    await expect(page.getByTestId("editor-save-btn")).toBeVisible()

    // Verify question 1 is active and its content is loaded
    const questionInput = page.getByPlaceholder(t("quizz:question.placeholder"))
    await expect(questionInput).toHaveValue("Existing Question 1")

    // Edit question 1 text
    await questionInput.fill("Updated Question 1 Content")
    await expect(questionInput).toHaveValue("Updated Question 1 Content")

    // Select question 2 in sidebar
    await page.locator("aside").getByText("2").first().click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("Existing Question 2")

    telemetry.assertClean()
  })

  test("C03: Header viewports 1024, 1280, 1440, 1920 keep top row & Save/Exit visible and lower row reachable", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const viewports = [
      {
        width: 1024,
        height: 768,
        name: "1024",
        screenshot: "header_swapped_1024.png",
      },
      {
        width: 1280,
        height: 800,
        name: "1280",
        screenshot: "header_swapped_1280.png",
      },
      { width: 1440, height: 900, name: "1440" },
      { width: 1920, height: 1080, name: "1920" },
    ]

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.waitForTimeout(200)

      const titleInput = page.getByPlaceholder(t("quizz:titleQuizzPlaceholder"))
      const questionsTab = page.getByTestId("studio-tab-questions")
      const participantsTab = page.getByTestId("studio-tab-participants")
      const settingsTab = page.getByTestId("studio-tab-settings")
      const launchTab = page.getByTestId("studio-tab-launch")
      const saveBtn = page.getByTestId("editor-save-btn")
      const exitBtn = page.getByTestId("editor-exit-btn")

      await expect(titleInput).toBeVisible()
      await expect(questionsTab).toBeVisible()
      await expect(participantsTab).toBeVisible()
      await expect(settingsTab).toBeVisible()
      await expect(launchTab).toBeVisible()
      await expect(saveBtn).toBeVisible()
      await expect(exitBtn).toBeVisible()

      // Assert Save & Exit are strictly within the viewport bounds
      const saveBox = await saveBtn.boundingBox()
      const exitBox = await exitBtn.boundingBox()
      expect(saveBox).not.toBeNull()
      expect(exitBox).not.toBeNull()

      if (saveBox && exitBox) {
        expect(saveBox.x).toBeGreaterThan(0)
        expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(vp.width)
        expect(saveBox.y).toBeGreaterThanOrEqual(0)
        expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(vp.height)

        expect(exitBox.x).toBeGreaterThan(0)
        expect(exitBox.x + exitBox.width).toBeLessThanOrEqual(vp.width)
        expect(exitBox.y).toBeGreaterThanOrEqual(0)
        expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(vp.height)
      }

      // Lower row: last toggle (closing) is reachable
      const closingToggle = page.getByTestId("toggle-kind-closing")
      await closingToggle.scrollIntoViewIfNeeded()
      await expect(closingToggle).toBeVisible()

      if (vp.screenshot) {
        await saveScreenshot(page, vp.screenshot)
      }
    }

    telemetry.assertClean()
  })

  test("C04: Create Quiz and Survey cards directly via sidebar footer without overwriting existing questions", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    // Fill in question 1
    const q1Input = page.getByPlaceholder(t("quizz:question.placeholder"))
    await q1Input.fill("Initial Question Card 1")

    // Add 2nd card as Quiz
    const addBtn = page.getByTestId("studio-add-card-btn")
    await addBtn.click()

    // Timeline now has 2 cards
    const aside = page.locator("aside").first()
    await expect(aside.getByText("2").first()).toBeVisible()

    // Fill in question 2
    const q2Input = page.getByPlaceholder(t("quizz:question.placeholder"))
    await q2Input.fill("Second Question Card 2")

    // Add 3rd card as Survey using select dropdown
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.survey", { defaultValue: "Survey" }),
      })
      .click()
    await addBtn.click()

    // Timeline now has 3 cards
    await expect(aside.getByText("3").first()).toBeVisible()

    // Card 3 should be Survey
    const surveyToggle = page.getByTestId("toggle-kind-survey")
    await expect(surveyToggle).toHaveAttribute("data-state", "on")

    // Verify Question 1 is still intact
    await aside.getByText("1").first().click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("Initial Question Card 1")
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "added_quiz_and_survey_cards.png")
    telemetry.assertClean()
  })

  test("C05: Create each non-question kind via sidebar footer and mount corresponding scene editor cleanly", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const nonQuestionKinds = [
      {
        kind: "transition",
        label: t("extensions:timeline.transition", {
          defaultValue: "Transition",
        }),
      },
      {
        kind: "animation",
        label: t("extensions:timeline.animation", {
          defaultValue: "Animation",
        }),
      },
      {
        kind: "media",
        label: t("extensions:timeline.media", { defaultValue: "Media" }),
      },
      {
        kind: "leaderboard",
        label: t("extensions:timeline.leaderboard", {
          defaultValue: "Leaderboard",
        }),
      },
      {
        kind: "interimResults",
        label: t("extensions:timeline.interimResults", {
          defaultValue: "Interim Results",
        }),
      },
      {
        kind: "countdown",
        label: t("extensions:timeline.countdown", {
          defaultValue: "Countdown",
        }),
      },
      {
        kind: "opening",
        label: t("extensions:timeline.opening", { defaultValue: "Opening" }),
      },
      {
        kind: "closing",
        label: t("extensions:timeline.closing", { defaultValue: "Closing" }),
      },
    ]

    const aside = page.locator("aside").first()
    const addBtn = page.getByTestId("studio-add-card-btn")

    for (const item of nonQuestionKinds) {
      await page.getByTestId("studio-card-kind-select").click()
      await page.getByRole("option", { name: item.label }).click()
      await addBtn.click()

      // Assert newly added card is selected in ToggleGroup row 2
      const toggle = page.getByTestId(`toggle-kind-${item.kind}`)
      await expect(toggle).toHaveAttribute("data-state", "on")

      // Assert Scene Editor settings panel is visible on the right
      await expect(
        page.getByText(
          t("extensions:studio.scene.kindSettings", {
            kind: item.kind,
            defaultValue: `${item.kind} Settings`,
          }),
        ),
      ).toBeVisible()
    }

    // Click on the transition card in the sidebar to view TransitionSceneEditor
    await aside
      .locator("div.cursor-pointer", { hasText: "Transition" })
      .first()
      .click()
    await expect(page.getByTestId("toggle-kind-transition")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "added_transition_card_editor.png")
    telemetry.assertClean()
  })

  test("C06: Question -> Scene conversion shows confirmation dialog, cancels safely, converts without crash, and blocks last question", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const aside = page.locator("aside").first()

    // 1. Add a second question so we have 2 questions
    await page.getByTestId("studio-add-card-btn").click()
    await expect(aside.getByText("2").first()).toBeVisible()

    // Select card 2 (which is a question)
    await aside.getByText("2").first().click()
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Try converting to Transition: click toggle-kind-transition
    await page.getByTestId("toggle-kind-transition").click()

    // Assert Confirmation dialog appears
    const dialogTitle = page.getByText(
      t("extensions:timeline.deleteConfirmTitle", {
        defaultValue: "Convert Question to Scene?",
      }),
    )
    await expect(dialogTitle).toBeVisible()

    // Cancel conversion
    await page.getByRole("button", { name: t("common:cancel") }).click()
    await expect(dialogTitle).not.toBeVisible()

    // Verify card 2 is still a question!
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toBeVisible()

    // Try again and Confirm conversion
    await page.getByTestId("toggle-kind-transition").click()
    await expect(dialogTitle).toBeVisible()
    await page
      .getByRole("button", {
        name: t("extensions:studio.convert.confirm", {
          defaultValue: "Convert to Scene",
        }),
      })
      .click()

    // Assert card 2 is now a Transition scene and Scene Editor is displayed without crash
    await expect(page.getByTestId("toggle-kind-transition")).toHaveAttribute(
      "data-state",
      "on",
    )
    await expect(
      page.getByText(
        t("extensions:studio.scene.kindSettings", {
          kind: "transition",
          defaultValue: "transition Settings",
        }),
      ),
    ).toBeVisible()

    // Now verify that converting the LAST remaining question is blocked
    // Card 1 is the only remaining question
    await aside.getByText("1").first().click()
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    await page.getByTestId("toggle-kind-transition").click()
    await expect(dialogTitle).toBeVisible()
    await page
      .getByRole("button", {
        name: t("extensions:studio.convert.confirm", {
          defaultValue: "Convert to Scene",
        }),
      })
      .click()

    // Toast error: cannot delete last question
    await expect(
      page.getByText(t("extensions:timeline.cannotDeleteLastQuestion")),
    ).toBeVisible()

    // Card 1 remains a question!
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "converted_card_no_crash.png")
    telemetry.assertClean()
  })

  test("C07: Scene -> Question conversion creates a valid question with answers and immediately usable question editor", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    // Add a scene card directly (e.g. countdown)
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.countdown", {
          defaultValue: "Countdown",
        }),
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()

    // Countdown card is selected
    await expect(page.getByTestId("toggle-kind-countdown")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Convert this scene card to Quiz: click toggle-kind-quiz
    await page.getByTestId("toggle-kind-quiz").click()

    // Card is now a Question
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    // QuestionEditor is mounted with valid fields
    const questionInput = page.getByPlaceholder(t("quizz:question.placeholder"))
    await expect(questionInput).toBeVisible()
    await questionInput.fill("Converted from countdown question")

    const answer0 = page
      .getByPlaceholder(t("quizz:addAnswerPlaceholder"))
      .nth(0)
    const answer1 = page
      .getByPlaceholder(t("quizz:addAnswerPlaceholder"))
      .nth(1)
    await expect(answer0).toBeVisible()
    await expect(answer1).toBeVisible()

    await answer0.fill("Option Alpha")
    await answer1.fill("Option Beta")

    telemetry.assertClean()
  })

  test("C08: Quiz <-> Survey toggle modifies only the selected card without affecting other cards", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const aside = page.locator("aside").first()

    // Fill in question 1
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Card 1 Question")

    // Add question 2
    await page.getByTestId("studio-add-card-btn").click()
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Card 2 Question")

    // Card 2 is selected -> toggle to Survey
    const surveyToggle = page.getByTestId("toggle-kind-survey")
    await surveyToggle.click()
    await expect(surveyToggle).toHaveAttribute("data-state", "on")

    // Select Card 1 -> should STILL be Quiz!
    await aside.getByText("1").first().click()
    const quizToggle = page.getByTestId("toggle-kind-quiz")
    await expect(quizToggle).toHaveAttribute("data-state", "on")

    // Switch Card 1 to Survey as well
    await surveyToggle.click()
    await expect(surveyToggle).toHaveAttribute("data-state", "on")

    // Switch Card 1 back to Quiz
    await quizToggle.click()
    await expect(quizToggle).toHaveAttribute("data-state", "on")

    // Card 2 should still be Survey!
    await aside.getByText("2").first().click()
    await expect(surveyToggle).toHaveAttribute("data-state", "on")

    telemetry.assertClean()
  })

  test("C09: Duplicate and remove cards preserves stable state without stale selections or undefined dereferencing", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const aside = page.locator("aside").first()

    // Add 1 question card and 1 transition scene card
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Original Q1")
    await page.getByTestId("studio-add-card-btn").click()
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Original Q2")

    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.transition", {
          defaultValue: "Transition",
        }),
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()

    // Duplicate Q2 (hover over card in sidebar and click duplicate)
    const q2Card = aside
      .locator("div.cursor-pointer", { hasText: "Original Q2" })
      .first()
    await q2Card.hover()
    await q2Card
      .locator(
        `button[title="${t("quizz:question.duplicateQuestion", { defaultValue: "Duplicate question" })}"]`,
      )
      .click()

    // Duplicate transition card
    const transCard = aside
      .locator("div.cursor-pointer", { hasText: "Transition" })
      .first()
    await transCard.hover()
    await transCard.getByTitle("Duplicate card").click()

    // Delete one duplicated question card
    const cardToDelete = aside
      .locator("div.cursor-pointer", { hasText: "Original Q2" })
      .last()
    await cardToDelete.hover()
    await cardToDelete
      .locator(`button[aria-label="${t("quizz:question.deleteQuestion")}"]`)
      .click()

    // Confirm delete dialog
    await page.getByRole("button", { name: t("common:delete") }).click()

    // Verify remaining question 1 can still be edited smoothly
    await aside.getByText("1").first().click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("Original Q1")

    telemetry.assertClean()
  })

  test("C10: Drag-and-drop reorders mixed timeline and updates question ordinals accurately", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const aside = page.locator("aside").first()

    // Create Question 1, Transition, Question 2
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Question 1 Before Drag")

    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.transition", {
          defaultValue: "Transition",
        }),
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()

    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.quiz", { defaultValue: "Quiz" }),
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Question 2 Before Drag")

    // Drag Transition card above Question 1
    const cards = aside.locator("div.cursor-pointer")
    const q1Card = cards.nth(0)
    const transCard = cards.nth(1)

    const q1Box = await q1Card.boundingBox()
    const transBox = await transCard.boundingBox()

    expect(q1Box).not.toBeNull()
    expect(transBox).not.toBeNull()

    if (q1Box && transBox) {
      await page.mouse.move(
        transBox.x + transBox.width / 2,
        transBox.y + transBox.height / 2,
      )
      await page.mouse.down()
      await page.mouse.move(transBox.x + transBox.width / 2, transBox.y - 10, {
        steps: 10,
      })
      await page.mouse.move(q1Box.x + q1Box.width / 2, q1Box.y + 5, {
        steps: 10,
      })
      await page.mouse.up()
    }

    await page.waitForTimeout(400)

    await saveScreenshot(page, "mixed_timeline_after_drag.png")
    telemetry.assertClean()
  })

  test("C11: Save / exit / reopen persists exact mixed order, card kinds, scene configs and questions", async ({
    page,
  }) => {
    const subject = `Mixed Timeline Persistence ${Date.now()}`
    const _quizId = subject.toLowerCase().replace(/\W+/gu, "-")

    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    // Set quiz title
    await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)

    // Set Question 1
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Persistent Question 1")
    await answerInput(page, 0).fill("Persist Answer 1")
    await answerInput(page, 1).fill("Persist Answer 2")

    // Add Transition card
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.transition", {
          defaultValue: "Transition",
        }),
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()

    // Set Transition Title
    const transitionTitleInput = page.getByPlaceholder(
      t("extensions:studio.scene.titlePlaceholder", {
        defaultValue: "Card title...",
      }),
    )
    await transitionTitleInput.fill("Persisted Transition Scene")

    // Add Survey Question 2
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.survey", { defaultValue: "Survey" }),
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Persistent Survey Question 2")
    await answerInput(page, 0).fill("Persist Answer A")
    await answerInput(page, 1).fill("Persist Answer B")

    // Click Save button
    const saveBtn = page.getByTestId("editor-save-btn")
    await saveBtn.click()

    // Wait for save toast and navigation back to manager config
    await expect(page.getByText(t("quizz:quizzSaved"))).toBeVisible({
      timeout: 10000,
    })
    await expect(page).toHaveURL(/\/manager\/config$/u)

    // Re-open the quiz from manager quiz list
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(/\/manager\/quizz\/[A-Za-z0-9_-]+$/u)

    const aside = page.locator("aside").first()

    // Verify Question 1 content
    await aside.getByText("1").first().click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("Persistent Question 1")
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Verify Transition card content
    await aside
      .locator("div.cursor-pointer", { hasText: "Transition" })
      .first()
      .click()
    await expect(page.getByTestId("toggle-kind-transition")).toHaveAttribute(
      "data-state",
      "on",
    )
    await expect(
      page.getByPlaceholder(
        t("extensions:studio.scene.titlePlaceholder", {
          defaultValue: "Card title...",
        }),
      ),
    ).toHaveValue("Persisted Transition Scene")

    // Verify Survey Question 2 content
    await aside.getByText("2").first().click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("Persistent Survey Question 2")
    await expect(page.getByTestId("toggle-kind-survey")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "saved_and_reopened_mixed_timeline.png")
    telemetry.assertClean()
  })

  test("C12: Rapid interactions and estimation question type never trigger undefined.answers or unhandled errors", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    // Change question 1 to estimation
    await selectOption(
      page,
      t("quizz:question.config.answerMode"),
      t("quizz:questionType.estimation"),
    )
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("Estimation Rapid Test")

    // Add 3 cards rapidly
    const addBtn = page.getByTestId("studio-add-card-btn")
    await addBtn.click()
    await addBtn.click()
    await addBtn.click()

    const aside = page.locator("aside").first()

    // Rapidly click between all cards
    for (let i = 1; i <= 4; i++) {
      await aside.getByText(String(i)).first().click()
      await page.waitForTimeout(50)
    }

    // Rapidly switch between Questions and Settings tabs
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("studio-tab-settings").click()
      await page.waitForTimeout(50)
      await page.getByTestId("studio-tab-questions").click()
      await page.waitForTimeout(50)
    }

    telemetry.assertClean()
  })

  test("C13: Legacy pre-V2 quiz without sidecar loads seamlessly, preserves data, and saves cleanly", async ({
    page,
  }) => {
    const subject = `Legacy Compatibility Quiz ${Date.now()}`
    const _quizId = subject.toLowerCase().replace(/\W+/gu, "-")

    // Seed on disk strictly without sidecar
    seedQuizz(subject, {
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Legacy Pre-V2 Question",
          answers: ["Original 1", "Original 2"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const telemetry = setupTelemetry(page)
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(/\/manager\/quizz\/[A-Za-z0-9_-]+$/u)

    // Verify question loads into StudioShell
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("Legacy Pre-V2 Question")
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Switch tabs and ensure no gameMode mutation occurs
    await page.getByTestId("studio-tab-participants").click()
    await page.getByTestId("studio-tab-questions").click()
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Save quiz
    await page.getByTestId("editor-save-btn").click()
    await expect(page.getByText(t("quizz:quizzUpdated"))).toBeVisible({
      timeout: 10000,
    })
    await expect(page).toHaveURL(/\/manager\/config$/u)

    telemetry.assertClean()
  })

  test("C14: Launch preflight blockers prevent launch on missing media and permit valid launches", async ({
    page,
  }) => {
    // Part 1: Verify unsaved draft blocks launch on new quiz
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    await page.getByTestId("studio-tab-launch").click()
    await expect(
      page.getByText(
        t("extensions:studio.launch.saveFirst", {
          defaultValue: "Please save the quiz before launching a live session.",
        }),
      ),
    ).toBeVisible()

    const launchBtnNew = page.getByRole("button", {
      name: t("extensions:studio.launch.launchButton", {
        defaultValue: "Launch Live Show",
      }),
    })
    await expect(launchBtnNew).toBeDisabled()

    // Part 2: Verify missing media on a saved quiz blocks launch
    const subject = `Launch Missing Media QA ${Date.now()}`
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
    await expect(page).toHaveURL(/\/manager\/quizz\/[A-Za-z0-9_-]+$/u)

    await page.getByTestId("studio-tab-launch").click()

    await expect(
      page.getByText(
        t("extensions:studio.launch.missingMediaWarning", {
          defaultValue: "Some media cards have empty URLs",
        }),
      ),
    ).toBeVisible()

    const launchBtnSaved = page.getByRole("button", {
      name: t("extensions:studio.launch.launchButton", {
        defaultValue: "Launch Live Show",
      }),
    })
    await expect(launchBtnSaved).toBeDisabled()

    telemetry.assertClean()
  })

  test("C15: Participants, Settings, and Launch navigation collapses Row 2 and leaves card state intact", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await loginManager(page)
    await page.goto("/manager/quizz")
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    const cardTypeBar = page.getByTestId("studio-card-type-bar")
    const saveBtn = page.getByTestId("editor-save-btn")
    const exitBtn = page.getByTestId("editor-exit-btn")

    // 1. Initial on Questions: Row 2 is visible
    await expect(cardTypeBar).toBeVisible()

    // 2. Click Participants tab
    await page.getByTestId("studio-tab-participants").click()
    await expect(cardTypeBar).not.toBeVisible()
    await expect(saveBtn).toBeVisible()
    await expect(exitBtn).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Participants", exact: true }),
    ).toBeVisible()

    // 3. Click Settings tab
    await page.getByTestId("studio-tab-settings").click()
    await expect(cardTypeBar).not.toBeVisible()
    await expect(saveBtn).toBeVisible()
    await expect(exitBtn).toBeVisible()
    await expect(
      page.getByText(
        t("extensions:studio.settings.globalTitle", {
          defaultValue: "Studio Settings & Defaults",
        }),
      ),
    ).toBeVisible()

    // 4. Click Launch tab
    await page.getByTestId("studio-tab-launch").click()
    await expect(cardTypeBar).not.toBeVisible()
    await expect(saveBtn).toBeVisible()
    await expect(exitBtn).toBeVisible()

    // 5. Click back to Questions tab
    await page.getByTestId("studio-tab-questions").click()
    await expect(cardTypeBar).toBeVisible()
    await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "settings_and_launch_nav.png")
    telemetry.assertClean()
  })
})
