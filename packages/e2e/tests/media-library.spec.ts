import type { Page } from "@playwright/test"
import {
  addQuestionCard,
  answerInput,
  openQuizzTab,
  questionCard,
  readQuizz,
  saveQuizz,
} from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { listMediaFiles, pngFile, wavFile } from "@razzia/e2e/utils/media"

const openMediaPanel = async (page: Page) => {
  await page.getByTestId("editor-panel-toggle-media").click()
  const panel = page.getByTestId("editor-panel-media")
  await expect(panel).toBeVisible()

  return panel
}

const openLibrary = async (page: Page) => {
  const panel = await openMediaPanel(page)
  await panel
    .getByRole("button", { name: t("quizz:media.library"), exact: true })
    .click()

  const dialog = page
    .getByRole("dialog", { name: t("quizz:media.library"), exact: true })
    .filter({ has: page.getByPlaceholder(t("quizz:media.search")) })

  await expect(dialog).toHaveCount(1)
  await expect(dialog).toBeVisible()

  return dialog
}

const createQuestion = async (page: Page, subject: string) => {
  await page.getByRole("button", { name: t("manager:quizz.create") }).click()
  await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
  await page
    .getByPlaceholder(t("quizz:question.placeholder"))
    .fill("Which media?")
  await answerInput(page, 0).fill("This one")
  await answerInput(page, 1).fill("Another")
}

test.beforeEach(async ({ page }) => {
  await openQuizzTab(page)
})

test("uploads, searches, filters and picks a media", async ({ page }) => {
  const tag = `lib${Date.now()}`

  await createQuestion(page, `Library quizz ${tag}`)

  const dialog = await openLibrary(page)

  await dialog
    .locator("input[type=file][multiple]")
    .setInputFiles([pngFile(`${tag}-image`), wavFile(`${tag}-sound`)])
  await dialog.getByPlaceholder(t("quizz:media.search")).fill(tag)

  const image = dialog.getByTitle(new RegExp(`^${tag}-image-.+\\.png$`, "u"))
  const sound = dialog.getByTitle(new RegExp(`^${tag}-sound-.+\\.wav$`, "u"))

  await expect(image).toBeVisible()
  await expect(sound).toBeVisible()

  await dialog
    .getByRole("combobox", { name: t("quizz:media.filterByType") })
    .click()
  await page
    .getByRole("option", { name: t("quizz:question.media.audio") })
    .click()
  await expect(sound).toBeVisible()
  await expect(image).toBeHidden()

  await dialog
    .getByRole("combobox", { name: t("quizz:media.filterByType") })
    .click()
  await page.getByRole("option", { name: t("quizz:media.filter.all") }).click()
  await dialog
    .getByRole("radio", { name: t("quizz:media.view.list"), exact: true })
    .click()
  await expect(
    dialog.getByRole("radio", {
      name: t("quizz:media.view.list"),
      exact: true,
    }),
  ).toHaveAttribute("data-state", "on")
  await expect(image).toContainText(t("quizz:question.media.image"))
  await expect(sound).toContainText(t("quizz:question.media.audio"))

  await dialog.getByPlaceholder(t("quizz:media.search")).fill(`${tag}-nothing`)
  await expect(dialog.getByText(t("quizz:media.noResults"))).toBeVisible()

  await dialog.getByPlaceholder(t("quizz:media.search")).fill(tag)
  await image.click()

  await expect(dialog).toBeHidden()
  await expect(
    page
      .getByTestId("editor-panel-media")
      .getByRole("img", { name: "Which media?", exact: true }),
  ).toBeVisible()
  await page.getByTestId("editor-panel-close-media").click()
  await saveQuizz(page)

  expect(readQuizz(`Library quizz ${tag}`)?.questions[0].media).toMatchObject({
    type: "image",
    url: expect.stringMatching(new RegExp(`^/media/${tag}-image-`, "u")),
  })
})

test("deletes a media and detaches it from the question", async ({ page }) => {
  const tag = `del${Date.now()}`

  await createQuestion(page, `Delete media quizz ${tag}`)

  let dialog = await openLibrary(page)

  await dialog.locator("input[type=file][multiple]").setInputFiles(pngFile(tag))
  await dialog.getByPlaceholder(t("quizz:media.search")).fill(tag)
  await dialog.getByTitle(new RegExp(`^${tag}-`, "u")).click()
  await expect(
    page
      .getByTestId("editor-panel-media")
      .getByRole("img", { name: "Which media?", exact: true }),
  ).toBeVisible()
  await page.getByTestId("editor-panel-close-media").click()

  await addQuestionCard(page)
  dialog = await openLibrary(page)
  await dialog.getByPlaceholder(t("quizz:media.search")).fill(tag)
  await dialog.getByRole("button", { name: t("quizz:media.delete") }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t("common:delete") })
    .click()

  await expect(dialog.getByText(t("quizz:media.noResults"))).toBeVisible()
  expect(listMediaFiles().some((file) => file.startsWith(tag))).toBe(false)

  await dialog.getByRole("button", { name: t("common:close") }).click()
  await page.getByTestId("editor-panel-close-media").click()
  await questionCard(page, 0).click()
  await expect(
    page.getByPlaceholder(t("quizz:question.placeholder")),
  ).toHaveValue("Which media?")
  const mediaPanel = await openMediaPanel(page)
  await expect(
    mediaPanel.getByRole("img", { name: "Which media?", exact: true }),
  ).toHaveCount(0)
  await expect(mediaPanel.locator("input[type=file]")).toHaveCount(1)
})

test("attaches a media from a URL", async ({ page }) => {
  const subject = `URL media quizz ${Date.now()}`
  const url = "https://example.com/picture.png"

  const { buffer } = pngFile("url-media")
  await page.route(url, (route) =>
    route.fulfill({ contentType: "image/png", body: buffer }),
  )
  await createQuestion(page, subject)
  const mediaPanel = await openMediaPanel(page)
  await mediaPanel
    .getByRole("button", { name: t("quizz:media.fromUrl") })
    .click()
  await page.getByPlaceholder(t("quizz:question.mediaUrlPlaceholder")).fill(url)
  await page
    .getByRole("button", { name: t("quizz:question.media.image") })
    .click()

  await expect(
    page
      .getByTestId("editor-panel-media")
      .getByRole("img", { name: "Which media?", exact: true }),
  ).toBeVisible()
  await page.getByTestId("editor-panel-close-media").click()
  await saveQuizz(page)

  expect(readQuizz(subject)?.questions[0].media).toEqual({
    type: "image",
    url,
  })
})
