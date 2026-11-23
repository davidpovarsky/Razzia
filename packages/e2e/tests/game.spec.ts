import type { Page } from "@playwright/test"
import { BASIC_QUIZZ } from "@razzia/e2e/utils/constants"
import { readQuizz, seedQuizz } from "@razzia/e2e/utils/editor"
import { closePage, expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, enterPin, joinGame, typePin } from "@razzia/e2e/utils/player"

// Reconnection must occur during a finite accepting window, not a three-second
// fixture deadline. Only these owned copies change; the shared base stays intact.
const createReconnectGame = async (manager: Page) => {
  const subject = `Reconnect quiz ${crypto.randomUUID()}`
  const basic = readQuizz(BASIC_QUIZZ)
  expect(basic).toBeDefined()
  seedQuizz(subject, {
    questions: basic!.questions.map((item) => ({ ...item, time: 120 })),
  })
  const pin = await createGame(manager, subject)
  await manager.getByRole("button", { name: t("game:settings.title") }).click()
  const settings = manager.getByRole("dialog")
  const completion = settings.getByTestId("settings-end-on-all-answered")

  if ((await completion.getAttribute("aria-checked")) !== "true") {
    await completion.click()
  }

  await expect(completion).toHaveAttribute("aria-checked", "true")
  await settings
    .getByRole("button", { name: t("common:save"), exact: true })
    .click()
  await expect(settings).toBeHidden()

  return { pin, subject }
}

test("plays a full quiz from the lobby to the podium", async ({
  page: manager,
  newPage,
}) => {
  const subject = `Complete quiz ${crypto.randomUUID()}`
  const basic = readQuizz(BASIC_QUIZZ)
  expect(basic).toBeDefined()
  seedQuizz(subject, {
    questions: basic!.questions.map((question) => ({ ...question, time: 120 })),
    leaderboard: "upstream",
  })
  const pin = await createGame(manager, subject)
  await manager.getByRole("button", { name: t("game:settings.title") }).click()
  const settings = manager.getByRole("dialog")
  const completion = settings.getByTestId("settings-end-on-all-answered")

  if ((await completion.getAttribute("aria-checked")) !== "true") {
    await completion.click()
  }

  await expect(completion).toHaveAttribute("aria-checked", "true")
  await settings
    .getByRole("button", { name: t("common:save"), exact: true })
    .click()
  await expect(settings).toBeHidden()
  const alice = await newPage()
  const bob = await newPage()

  await enterPin(alice, pin)
  await alice.getByPlaceholder(t("game:usernamePlaceholder")).fill("Alice")
  await alice.getByRole("button", { name: t("common:submit") }).click()
  await joinGame(bob, pin, "Bob")

  await expect(manager.getByText("Alice")).toBeVisible()
  await expect(manager.getByText("Bob")).toBeVisible()

  await startGame(manager)

  await answer(alice, "Paris")
  await answer(bob, "Lyon")

  await expect(alice.getByText(t("game:correct"))).toBeVisible()
  await expect(bob.getByText(t("game:wrong"))).toBeVisible()

  await next(manager)
  await expect(
    manager.getByRole("heading", { name: t("game:leaderboard"), exact: true }),
  ).toBeVisible()
  await next(manager)

  await answer(alice, "4")
  await answer(bob, "4")

  await expect(bob.getByText(t("game:correct"))).toBeVisible()

  await next(manager)

  await expect(
    manager.getByRole("button", { name: t("common:exit") }),
  ).toBeVisible()
  await expect(
    alice.getByText(t("game:rank", { count: 1, ordinal: true })),
  ).toBeVisible()
  await expect(
    bob.getByText(t("game:rank", { count: 2, ordinal: true })),
  ).toBeVisible()
})

test("refuses players once the room is locked", async ({
  page: manager,
  newPage,
}) => {
  const pin = await createGame(manager)
  const player = await newPage()

  await manager.getByRole("button", { name: t("game:lock.lock") }).click()
  await expect(manager.getByText(pin)).toBeHidden()

  await enterPin(player, pin)

  await expect(player.getByText(t("errors:game.locked"))).toBeVisible()
})

test("submits the PIN with the Enter key", async ({
  page: manager,
  newPage,
}) => {
  const pin = await createGame(manager)
  const player = await newPage()

  await typePin(player, pin)
  await player.keyboard.press("Enter")

  await expect(
    player.getByPlaceholder(t("game:usernamePlaceholder")),
  ).toBeVisible()
})

test("lets the manager kick a player", async ({ page: manager, newPage }) => {
  const pin = await createGame(manager)
  const player = await newPage()

  await joinGame(player, pin, "Mallory")
  await manager.getByText("Mallory").click()

  await expect(player.getByText(t("errors:game.kickedByManager"))).toBeVisible()
  await expect(player.getByText(t("game:pinLabel"))).toBeVisible()
})

test("brings a player back into the game after a reload", async ({
  page: manager,
  newPage,
}) => {
  const { pin, subject } = await createReconnectGame(manager)
  const player = await newPage()

  await joinGame(player, pin, "Alice")
  await expect(manager.getByText("Alice")).toBeVisible()
  await startGame(manager)
  await expect(player.getByText(subject)).toBeVisible()
  await expect(player.getByRole("button", { name: /^1 Paris$/u })).toBeVisible()

  await player.reload()

  await answer(player, "Paris")
  await expect(player.getByText(t("game:correct"))).toBeVisible()
})

test("sends players home when the manager exits the waiting room", async ({
  page: manager,
  newPage,
}) => {
  const pin = await createGame(manager)
  const player = await newPage()

  await joinGame(player, pin, "Alice")
  await expect(manager.getByText("Alice")).toBeVisible()
  await manager.getByRole("button", { name: t("common:exit") }).click()

  await expect(manager).toHaveURL(/\/manager\/config$/u)
  await expect(
    player.getByText(t("errors:game.managerDisconnected")),
  ).toBeVisible()
  await expect(player.getByText(t("game:pinLabel"))).toBeVisible()
})

test("refuses to start a game without players", async ({ page }) => {
  await createGame(page)
  await startGame(page)

  await expect(
    page.getByText(t("errors:game.noPlayersConnected")),
  ).toBeVisible()
  await expect(page.getByText(t("game:waitingForPlayers"))).toBeVisible()
})

test("lets a player rejoin from the home page after closing the tab", async ({
  page: manager,
  newPage,
}) => {
  const { pin, subject } = await createReconnectGame(manager)
  const player = await newPage()
  const context = player.context()

  await joinGame(player, pin, "Alice")
  await expect(manager.getByText("Alice")).toBeVisible()
  await startGame(manager)
  await expect(player.getByText(subject)).toBeVisible()
  await expect(player.getByRole("button", { name: /^1 Paris$/u })).toBeVisible()
  await closePage(player)

  const home = await context.newPage()

  await home.goto("/game")
  await expect(home.getByText(t("game:reconnectTitle"))).toBeVisible()
  await home.getByRole("button", { name: t("game:reconnect") }).click()

  await answer(home, "Paris")
  await expect(home.getByText(t("game:correct"))).toBeVisible()
})
