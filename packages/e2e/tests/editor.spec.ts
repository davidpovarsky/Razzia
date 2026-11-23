import { BASIC_QUIZZ } from "@razzia/e2e/utils/constants"
import {
  addAnswer,
  addQuestionCard,
  questionCard,
  answerInput,
  numberSetting,
  openQuizzTab,
  quizzRow,
  readQuizz,
  saveQuizz,
  seedQuizz,
  solutionPicker,
  switchSetting,
  toggleSolution,
} from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import fs from "fs"
import type { Page } from "@playwright/test"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

const uniqueSubject = (name: string) => `${name} ${Date.now()}`

const headerCardTypeBar = (page: Page) =>
  page.locator('[data-testid="studio-card-type-bar"][data-embedded="false"]')

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

test("saves every question type and setting", async ({ page }) => {
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

test("hides the scoring settings in survey mode", async ({ page }) => {
  const subject = uniqueSubject("Survey quizz")

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await page.getByTestId("editor-mode-advanced").click()
  const settings = await openQuestionSettings(page)
  await expect(
    settings.getByRole("heading", { name: t("quizz:question.config.scoring") }),
  ).toBeVisible()
  await closeQuestionSettings(page)
  await headerCardTypeBar(page).getByTestId("toggle-kind-survey").click()
  await openQuestionSettings(page)

  await expect(solutionPicker(page, 0)).toHaveCount(0)
  await expect(solutionPicker(page, 1)).toHaveCount(0)
  await expect(
    settings.getByRole("heading", { name: t("quizz:question.config.scoring") }),
  ).toBeHidden()
  await expect(
    settings.getByRole("combobox", {
      name: t("quizz:question.config.categoryPlaceholder"),
    }),
  ).toBeHidden()

  await closeQuestionSettings(page)
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Favorite color?")
  await answerInput(page, 0).fill("Red")
  await answerInput(page, 1).fill("Blue")
  await saveQuizz(page)

  expect(readQuizz(subject)?.questions[0]).toMatchObject({
    playMode: "survey",
    answers: ["Red", "Blue"],
  })
})

test("shows validation errors and jumps to the invalid question", async ({
  page,
}) => {
  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Valid question")
  await answerInput(page, 0).fill("Yes")
  await answerInput(page, 1).fill("No")
  await addQuestionCard(page)
  await questionCard(page, 0).click()

  await page.getByRole("button", { name: t("common:save") }).click()

  await expect(
    page.getByPlaceholder(t("quizz:question.placeholder")),
  ).toHaveValue("")
  await expect(page.getByText(t("errors:quizz.questionEmpty"))).toBeVisible()
  await expect(page.getByText(t("errors:quizz.answerEmpty"))).toHaveCount(2)
  await expect(
    questionCard(page, 1).getByLabel(t("quizz:questionHasErrors")),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/manager\/quizz$/u)
})

test("edits then deletes a quizz", async ({ page }) => {
  const subject = uniqueSubject("Editable quizz")

  seedQuizz(subject)
  await page.reload()
  await page
    .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
    .click()
  await quizzRow(page, subject)
    .getByRole("button", { name: t("manager:quizz.edit") })
    .click()

  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Edited question")
  await addQuestionCard(page)
  await questionCard(page, 1).hover()
  await questionCard(page, 1)
    .getByRole("button", { name: t("quizz:question.deleteQuestion") })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t("common:delete") })
    .click()
  await expect(questionCard(page, 1)).toHaveCount(0)
  await saveQuizz(page, t("quizz:quizzUpdated"))

  expect(readQuizz(subject)?.questions).toMatchObject([
    { question: "Edited question" },
  ])

  await page
    .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
    .click()
  await quizzRow(page, subject)
    .getByRole("button", { name: t("manager:quizz.delete") })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t("common:delete") })
    .click()

  await expect(page.getByText(t("manager:quizz.deleted"))).toBeVisible()
  await expect(page.getByText(subject, { exact: true })).toBeHidden()
  expect(readQuizz(subject)).toBeUndefined()
})

test("exports and imports a quizz as JSON", async ({ page }) => {
  const download = page.waitForEvent("download")

  await quizzRow(page, BASIC_QUIZZ)
    .getByRole("button", { name: t("manager:quizz.export") })
    .click()

  const exported = JSON.parse(
    fs.readFileSync(await (await download).path(), "utf-8"),
  ) as Record<string, unknown>

  expect(exported).toMatchObject({ subject: BASIC_QUIZZ })
  expect(exported).not.toHaveProperty("id")

  const subject = uniqueSubject("Imported quizz")

  await page.locator("input[type=file]").setInputFiles({
    name: "quizz.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exported, subject })),
  })

  const preview = page.getByRole("alertdialog")
  await expect(preview).toBeVisible()
  await preview
    .getByRole("button", {
      name: "Import Show",
      exact: true,
    })
    .click()
  await expect(page.getByText(t("quizz:quizzSaved"))).toBeVisible()
  await expect(
    page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")),
  ).toHaveValue(subject)
  expect(readQuizz(subject)?.questions).toHaveLength(2)
  await page.getByTestId("editor-exit-btn").click()
  await page
    .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
    .click()
  await expect(page.getByText(subject, { exact: true })).toBeVisible()
})

test("attaches an uploaded image to a question", async ({ page }) => {
  const subject = uniqueSubject("Media quizz")

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("What is this image?")
  await answerInput(page, 0).fill("A pixel")
  await answerInput(page, 1).fill("A cat")

  await page.getByTestId("editor-panel-toggle-media").click()
  const mediaPanel = page.getByTestId("editor-panel-media")
  await expect(mediaPanel).toBeVisible()
  await mediaPanel.locator("input[type=file]").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PNG,
  })

  await expect(
    mediaPanel.getByRole("img", { name: "What is this image?", exact: true }),
  ).toBeVisible()
  await page.getByTestId("editor-panel-close-media").click()
  await saveQuizz(page)

  expect(readQuizz(subject)?.questions[0].media).toMatchObject({
    type: "image",
    url: expect.stringMatching(/^\/media\/pixel-.+\.png$/u),
  })
})

test("keeps the other questions intact when deleting one in the middle", async ({
  page,
}) => {
  const subject = uniqueSubject("Delete middle")
  const fillQuestion = async (question: string, answers: string[]) => {
    await page.getByPlaceholder(t("quizz:question.placeholder")).fill(question)
    await answers.reduce(
      (previous, value, index) =>
        previous.then(async () => {
          if (index >= 2) {
            await addAnswer(page)
          }

          await answerInput(page, index).fill(value)
        }),
      Promise.resolve(),
    )
  }

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await fillQuestion("First", ["A1", "B1"])

  await addQuestionCard(page)
  await fillQuestion("Second", ["A2", "B2", "C2", "D2"])
  await toggleSolution(page, 3)
  await toggleSolution(page, 0)

  await addQuestionCard(page)
  await fillQuestion("Third", ["A3", "B3", "C3"])
  await toggleSolution(page, 2)
  await toggleSolution(page, 0)

  const second = questionCard(page, 1)

  await second.click()
  await second
    .getByRole("button", { name: t("quizz:question.deleteQuestion") })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t("common:delete") })
    .click()

  await questionCard(page, 1).click()
  await expect(answerInput(page, 2)).toHaveValue("C3")
  await saveQuizz(page)

  expect(readQuizz(subject)?.questions).toMatchObject([
    { question: "First", answers: ["A1", "B1"], solutions: [0] },
    { question: "Third", answers: ["A3", "B3", "C3"], solutions: [2] },
  ])
})

test("restores the quiz settings when switching back from survey", async ({
  page,
}) => {
  const subject = uniqueSubject("Back to quiz")

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await page.getByPlaceholder(t("quizz:question.placeholder")).fill("Pick B")
  await answerInput(page, 0).fill("A")
  await answerInput(page, 1).fill("B")
  await toggleSolution(page, 1)
  await toggleSolution(page, 0)

  await page.getByTestId("editor-mode-advanced").click()
  await headerCardTypeBar(page).getByTestId("toggle-kind-survey").click()
  const settings = await openQuestionSettings(page)
  await expect(
    settings.getByRole("heading", { name: t("quizz:question.config.scoring") }),
  ).toBeHidden()
  await closeQuestionSettings(page)
  await headerCardTypeBar(page).getByTestId("toggle-kind-quiz").click()
  await openQuestionSettings(page)

  await expect(
    settings.getByRole("heading", { name: t("quizz:question.config.scoring") }),
  ).toBeVisible()
  await closeQuestionSettings(page)
  await expect(solutionPicker(page, 1)).toHaveAttribute("aria-pressed", "true")
  await saveQuizz(page)

  expect(readQuizz(subject)).toMatchObject({
    gameMode: "quiz",
    questions: [{ solutions: [1] }],
  })
})

test("refuses to save a quizz without a title", async ({ page }) => {
  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill("")
  await page.getByPlaceholder(t("quizz:question.placeholder")).fill("Question")
  await answerInput(page, 0).fill("A")
  await answerInput(page, 1).fill("B")
  await page.getByRole("button", { name: t("common:save") }).click()

  await expect(page.getByText(t("errors:quizz.subjectEmpty"))).toBeVisible()
  await expect(page).toHaveURL(/\/manager\/quizz$/u)
})

test("keeps the number settings within their limits", async ({ page }) => {
  const subject = uniqueSubject("Limits")

  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await page.getByPlaceholder(t("quizz:question.placeholder")).fill("Question")
  await answerInput(page, 0).fill("A")
  await answerInput(page, 1).fill("B")

  await page.getByTestId("editor-mode-advanced").click()
  const settings = await openQuestionSettings(page)
  await expect(settings.getByTestId("system-question-lead-in")).toHaveText("2")
  await expect(
    settings.getByRole("spinbutton", {
      name: t("quizz:question.config.questionDisplay"),
      exact: true,
    }),
  ).toHaveCount(0)

  const fields = [
    [t("quizz:question.config.answerTime"), "1", "5"],
    [t("quizz:question.config.maxPoints"), "-50", "0"],
  ] as const

  await fields.reduce(
    (previous, [label, typed, expected]) =>
      previous.then(async () => {
        const input = numberSetting(page, label)

        await input.fill(typed)
        await input.blur()
        await expect(input).toHaveValue(expected)
      }),
    Promise.resolve(),
  )

  await closeQuestionSettings(page)
  await saveQuizz(page)

  expect(readQuizz(subject)?.questions[0]).toMatchObject({
    cooldown: 2,
    time: 5,
    maxPoints: 0,
  })
})

test("uses original Studio controls for every card kind, keyboard navigation and media", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByTestId("editor-mode-advanced").click()
  const kindBar = page.locator(
    '[data-testid="studio-card-type-bar"][data-embedded="false"]',
  )
  const kinds = [
    "quiz",
    "survey",
    "media",
    "animation",
    "transition",
    "opening",
    "closing",
    "countdown",
    "leaderboard",
    "interimResults",
    "answerRecap",
  ]
  for (const kind of kinds) {
    await expect(kindBar.getByTestId(`toggle-kind-${kind}`)).toBeVisible()
  }
  const quiz = kindBar.getByTestId("toggle-kind-quiz")
  const survey = kindBar.getByTestId("toggle-kind-survey")
  await quiz.focus()
  await quiz.press("ArrowRight")
  await expect(survey).toBeFocused()
  await survey.press("Space")
  await expect(survey).toHaveAttribute("data-state", "on")
  await survey.press("ArrowLeft")
  await expect(quiz).toBeFocused()
  await quiz.press("Space")
  await expect(quiz).toHaveAttribute("data-state", "on")
  for (const group of ["media", "effects", "show", "results"]) {
    await expect(
      kindBar.getByTestId(`toggle-group-divider-${group}`),
    ).toBeVisible()
  }
  await page.getByTestId("answer-mode-0-both").click()
  await expect(page.getByTestId("answer-mode-0-both")).toHaveAttribute(
    "data-state",
    "on",
  )
  const imageAction = page.getByTestId("answer-pick-image-0")
  expect(
    await imageAction.evaluate(
      (element) => getComputedStyle(element).fontFamily,
    ),
  ).toContain("Rubik Variable")
  expect(
    await imageAction.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  ).toBe("8px")
  await imageAction.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByTestId("media-scope-all")).toBeVisible()
  await expect(page.locator('[data-control-source="standalone"]')).toHaveCount(
    0,
  )
  await page.screenshot({ path: info.outputPath("native-media-controls.png") })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.setViewportSize({ width: 800, height: 900 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
  await expect(quiz).toHaveAttribute("data-state", "on")
  await page.screenshot({ path: info.outputPath("native-editor-narrow.png") })
})
