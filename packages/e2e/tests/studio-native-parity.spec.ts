import type { Page } from "@playwright/test"
// Original all-question-types regression with the already existing Studio Add card selector.
import {
  addAnswer,
  addQuestionCard,
  answerInput,
  numberSetting,
  openQuizzTab,
  readQuizz,
  saveQuizz,
  switchSetting,
} from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"

const toggleSolution = async (
  page: import("@playwright/test").Page,
  index: number,
) => {
  await page
    .getByRole("button", {
      name: t("quizz:markCorrect", { label: String(index + 1) }),
    })
    .click()
}
const uniqueSubject = (name: string) => `${name} ${Date.now()}`

const openQuestionSettings = async (page: Page) => {
  await page.getByTestId("editor-panel-toggle-settings").click()
  const panel = page.getByTestId("editor-panel-settings")
  await expect(panel).toBeVisible()

  return panel
}

const closeQuestionSettings = async (page: Page) => {
  await page.getByTestId("editor-panel-close-settings").click()
  await expect(page.getByTestId("editor-panel-settings")).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await openQuizzTab(page)
})

test("Studio preserves native question settings, category inheritance and saving", async ({
  page,
}) => {
  const subject = uniqueSubject("Full quizz")

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await page.getByTestId("editor-mode-advanced").click()

  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Single question")
  await page
    .getByRole("textbox", { name: t("quizz:question.note") })
    .fill("Because")
  await answerInput(page, 0).fill("Wrong")
  await answerInput(page, 1).fill("Right")
  await toggleSolution(page, 1)
  await toggleSolution(page, 0)
  const settings = await openQuestionSettings(page)
  await settings
    .getByRole("combobox", {
      name: t("quizz:question.config.categoryPlaceholder"),
    })
    .fill("Round 1")
  await numberSetting(page, t("quizz:question.config.maxPoints")).fill("500")
  await switchSetting(page, t("quizz:question.config.penalty")).click()
  await numberSetting(page, t("quizz:question.config.penalty")).fill("250")
  await expect(settings.getByTestId("system-question-lead-in")).toHaveText("2")
  await expect(
    settings.getByRole("spinbutton", {
      name: t("quizz:question.config.questionDisplay"),
      exact: true,
    }),
  ).toHaveCount(0)
  await switchSetting(page, t("quizz:question.config.answerTime")).click()
  await closeQuestionSettings(page)

  await addQuestionCard(page)
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Multi question")
  await openQuestionSettings(page)
  await settings.getByTestId("answer-type-multi").click()
  await closeQuestionSettings(page)
  await addAnswer(page)
  await answerInput(page, 0).fill("A")
  await answerInput(page, 1).fill("B")
  await answerInput(page, 2).fill("C")
  await toggleSolution(page, 2)
  await openQuestionSettings(page)
  await settings
    .getByRole("radio", {
      name: t("quizz:question.config.scoringMode.strict"),
      exact: true,
    })
    .click()
  await closeQuestionSettings(page)

  await addQuestionCard(page)
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Estimation question")
  await openQuestionSettings(page)
  await settings.getByTestId("answer-type-estimation").click()
  await closeQuestionSettings(page)
  await page
    .getByRole("spinbutton", {
      name: t("quizz:question.config.estimation.max"),
    })
    .fill("200")
  await page
    .getByRole("spinbutton", {
      name: t("quizz:question.config.estimation.min"),
    })
    .fill("10")
  await page
    .getByRole("spinbutton", {
      name: t("quizz:question.estimation.correctAnswer"),
    })
    .fill("120")
  await openQuestionSettings(page)
  await settings
    .getByRole("radio", {
      name: t("quizz:question.config.estimation.inputModes.input"),
      exact: true,
    })
    .click()
  await numberSetting(page, t("quizz:question.config.estimation.step")).fill(
    "5",
  )
  await numberSetting(page, t("quizz:question.config.estimation.margin")).fill(
    "20",
  )

  await closeQuestionSettings(page)
  await saveQuizz(page)

  expect(readQuizz(subject)).toMatchObject({
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Single question",
        note: "Because",
        answers: ["Wrong", "Right"],
        solutions: [1],
        category: "Round 1",
        maxPoints: 500,
        penalty: 250,
        cooldown: 2,
        time: -1,
      },
      {
        type: "multi",
        answers: ["A", "B", "C"],
        solutions: [0, 2],
        category: "Round 1",
        options: { scoringMode: "strict" },
      },
      {
        type: "estimation",
        solutions: [120],
        options: { inputMode: "input", min: 10, max: 200, step: 5, margin: 20 },
      },
    ],
  })
})
