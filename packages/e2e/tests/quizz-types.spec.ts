import { SCORING_QUIZZ, SURVEY_QUIZZ } from "@razzia/e2e/utils/constants"
import { readQuizz, seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import {
  answer,
  confirm,
  expectPoints,
  joinGame,
} from "@razzia/e2e/utils/player"

test("scores every question type with its scoring settings", async ({
  page: manager,
  newPage,
}) => {
  const pin = await createGame(manager, SCORING_QUIZZ)
  const player = await newPage()

  await joinGame(player, pin, "Alice")
  await expect(manager.getByText("Alice")).toBeVisible()
  await startGame(manager)

  await answer(player, "Right")
  await expect(player.getByText("+500")).toBeVisible()
  await expectPoints(player, 500)
  await next(manager)

  await answer(player, "Red")
  await confirm(player)
  await expect(player.getByText("+500")).toBeVisible()
  await expectPoints(player, 1000)
  await next(manager)

  await answer(player, "Red")
  await confirm(player)
  await expect(player.getByText(t("game:wrong"))).toBeVisible()
  await expectPoints(player, 800)
  await next(manager)

  await player.getByLabel(t("game:estimation.yourAnswer")).fill("55")
  await confirm(player)
  await expect(player.getByText("+750")).toBeVisible()
  await expectPoints(player, 1550)
  await next(manager)

  await expect(
    player.getByText(t("game:rank", { count: 1, ordinal: true })),
  ).toBeVisible()
})

test("collects answers without scoring in survey mode", async ({
  page: manager,
  newPage,
}) => {
  const subject = `Survey without scoring ${Date.now()}`
  const survey = readQuizz(SURVEY_QUIZZ)
  expect(survey).toBeDefined()
  // GAME_SPEED=10 turns the original 30-second vote into three real seconds.
  // Keep a finite window for both genuine player clicks without changing shared fixtures.
  seedQuizz(subject, {
    gameMode: survey!.gameMode,
    questions: survey!.questions.map((item) => ({ ...item, time: 120 })),
  })
  const pin = await createGame(manager, subject)
  const alice = await newPage()
  const bob = await newPage()

  await joinGame(alice, pin, "Alice")
  await joinGame(bob, pin, "Bob")
  await expect(manager.getByText("Bob")).toBeVisible()
  await startGame(manager)

  await answer(alice, "Summer")
  await answer(bob, "Winter")

  await expect(alice.getByText(t("game:answerNoted"))).toBeVisible()
  await expect(bob.getByText(t("game:answerNoted"))).toBeVisible()

  await next(manager)

  await expect(manager.getByText(t("game:summary.title"))).toBeVisible()
  await expect(alice.getByText(t("game:summary.title"))).toBeVisible()
  await expect(alice.getByText(t("game:wrong"))).toBeHidden()
})
