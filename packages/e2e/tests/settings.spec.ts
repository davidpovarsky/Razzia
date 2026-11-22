import type { Locator } from "@playwright/test"
import { BASIC_QUIZZ } from "@razzia/e2e/utils/constants"
import { readQuizz, seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, startGame } from "@razzia/e2e/utils/manager"
import { answer } from "@razzia/e2e/utils/player"

const toggleSetting = async (dialog: Locator, label: string) => {
  await dialog.getByRole("switch", { name: label, exact: true }).click()
}

test("applies the game settings", async ({ page: manager, newPage }) => {
  const subject = `Settings board ${crypto.randomUUID()}`
  const basic = readQuizz(BASIC_QUIZZ)
  expect(basic).toBeDefined()
  seedQuizz(subject, {
    questions: basic!.questions.map((item) => ({ ...item, time: 120 })),
    leaderboard: "upstream",
  })
  const pin = await createGame(manager, subject)

  await manager.getByRole("button", { name: t("game:settings.title") }).click()

  const dialog = manager.getByRole("dialog")

  await toggleSetting(dialog, t("game:settings.generatedUsernames.label"))
  await toggleSetting(dialog, t("game:settings.answersOnly.label"))
  await toggleSetting(dialog, t("game:settings.autoAdvance.label"))
  // Preserve three real seconds for the result and board animations at GAME_SPEED=10.
  // The game still advances automatically; the browser and application clocks stay real.
  await dialog
    .getByLabel(t("game:settings.autoAdvance.responsesDelay"))
    .fill("30")
  await dialog
    .getByLabel(t("game:settings.autoAdvance.leaderboardDelay"))
    .fill("30")
  await dialog.getByRole("button", { name: t("common:save") }).click()
  await expect(dialog).toBeHidden()

  const player = await newPage()

  await player.goto(`/?pin=${pin}`)
  await expect(
    player.getByText(t("game:generatedUsernameNotice")),
  ).toBeVisible()
  await player.getByRole("button", { name: t("common:submit") }).click()

  const nickname = player.getByText(/^[A-Z][a-z]+ [A-Z][a-z]+$/u)

  await expect(nickname).toBeVisible()
  await expect(
    manager.getByText((await nickname.textContent()) ?? ""),
  ).toBeVisible()

  await startGame(manager)

  await expect(
    player.getByRole("button", { name: t("game:question.show") }),
  ).toBeVisible()
  await expect(player.getByText("What is the capital of France?")).toBeHidden()

  await answer(player, "Paris")
  await expect(player.getByText(t("game:correct"))).toBeVisible()

  await expect(
    manager.getByRole("heading", { name: t("game:leaderboard"), exact: true }),
  ).toBeVisible()
  await answer(player, "4")
  await expect(player.getByText(t("game:correct"))).toBeVisible()
  await expect(
    player.getByText(t("game:rank", { count: 1, ordinal: true })),
  ).toBeVisible()
})

test("refuses an auto-advance delay out of range", async ({ page }) => {
  await createGame(page)
  await page.getByRole("button", { name: t("game:settings.title") }).click()

  const dialog = page.getByRole("dialog")

  await toggleSetting(dialog, t("game:settings.autoAdvance.label"))

  await ["2", "601"].reduce(
    (previous, delay) =>
      previous.then(async () => {
        await dialog
          .getByLabel(t("game:settings.autoAdvance.responsesDelay"))
          .fill(delay)
        await dialog.getByRole("button", { name: t("common:save") }).click()
        await expect(
          dialog.getByText(t("errors:game.invalidAutoAdvanceDelay")),
        ).toBeVisible()
      }),
    Promise.resolve(),
  )

  await expect(dialog).toBeVisible()
})
