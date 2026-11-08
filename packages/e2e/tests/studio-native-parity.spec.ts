// Original all-question-types regression with the already existing Studio Add card selector.
import {
  addAnswer,
  answerInput,
  numberSetting,
  openQuizzTab,
  readQuizz,
  saveQuizz,
  selectOption,
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

test.beforeEach(async ({ page }) => {
  await openQuizzTab(page)
})

test("Studio preserves native question settings, category inheritance and saving", async ({
  page,
}) => {
  const subject = uniqueSubject("Full quizz")

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)

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
  await page
    .getByRole("combobox", {
      name: t("quizz:question.config.categoryPlaceholder"),
    })
    .fill("Round 1")
  await numberSetting(page, t("quizz:question.config.maxPoints")).fill("500")
  await switchSetting(page, t("quizz:question.config.penalty")).click()
  await numberSetting(page, t("quizz:question.config.penalty")).fill("250")
  await numberSetting(page, t("quizz:question.config.questionDisplay")).fill(
    "4",
  )
  await switchSetting(page, t("quizz:question.config.answerTime")).click()

  await page.getByTestId("studio-add-card-btn").click()
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Multi question")
  await selectOption(
    page,
    t("quizz:question.config.answerMode"),
    t("quizz:questionType.multi"),
  )
  await addAnswer(page)
  await answerInput(page, 0).fill("A")
  await answerInput(page, 1).fill("B")
  await answerInput(page, 2).fill("C")
  await toggleSolution(page, 2)
  await selectOption(
    page,
    t("quizz:question.config.scoringMode"),
    t("quizz:question.config.scoringMode.strict"),
  )

  await page.getByTestId("studio-add-card-btn").click()
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Estimation question")
  await selectOption(
    page,
    t("quizz:question.config.answerMode"),
    t("quizz:questionType.estimation"),
  )
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
  await selectOption(
    page,
    t("quizz:question.config.estimation.inputMode"),
    t("quizz:question.config.estimation.inputModes.input"),
  )
  await numberSetting(page, t("quizz:question.config.estimation.step")).fill(
    "5",
  )
  await numberSetting(page, t("quizz:question.config.estimation.margin")).fill(
    "20",
  )

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
        cooldown: 4,
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
