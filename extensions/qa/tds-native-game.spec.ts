import { BASIC_QUIZZ } from "../../packages/e2e/utils/constants"
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test"
import { t } from "../../packages/e2e/utils/i18n"
import { createGame, next, startGame } from "../../packages/e2e/utils/manager"
import { answer } from "../../packages/e2e/utils/player"

// Exercise the frozen native application at its current /game entry. The
// historical suite still assumes player entry at /; it is retained untouched.
const test = base.extend<{ newPage: () => Promise<Page> }>({
  newPage: async ({ browser, baseURL }, use) => {
    const contexts: BrowserContext[] = []

    try {
      await use(async () => {
        const context = await browser.newContext({ baseURL, locale: "en-US" })
        contexts.push(context)

        return context.newPage()
      })
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  },
})
async function typePin(page: Page, pin: string) {
  await page.goto("/game")
  await page
    .getByRole("textbox", { name: t("game:pinDigit", { position: 1 }) })
    .click()
  await page.keyboard.type(pin)
}
async function enterPin(page: Page, pin: string) {
  await typePin(page, pin)
  await page.getByRole("button", { name: t("common:submit") }).click()
}
async function joinGame(page: Page, pin: string, username: string) {
  await page.goto(`/game?pin=${pin}`)
  await page.getByPlaceholder(t("game:usernamePlaceholder")).fill(username)
  await page.getByRole("button", { name: t("common:submit") }).click()
  await expect(page.getByText(t("game:waitingForPlayers"))).toBeVisible()
}

test("plays a full quiz from the lobby to the podium", async ({
  page: manager,
  newPage,
}) => {
  const pin = await createGame(manager)
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
  await expect(manager.getByText(t("game:leaderboard"))).toBeVisible()
  await next(manager)

  await answer(alice, "4")
  await answer(bob, "4")

  await expect(bob.getByText(t("game:correct"))).toBeVisible()

  await next(manager)

  await expect(
    manager
      .getByRole("button", { name: t("common:exit"), exact: true })
      .first(),
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
  const pin = await createGame(manager)
  const player = await newPage()

  await joinGame(player, pin, "Alice")
  await expect(manager.getByText("Alice")).toBeVisible()
  await startGame(manager)
  await expect(player.getByText(BASIC_QUIZZ)).toBeVisible()

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
  const pin = await createGame(manager)
  const player = await newPage()
  const context = player.context()

  await joinGame(player, pin, "Alice")
  await expect(manager.getByText("Alice")).toBeVisible()
  await startGame(manager)
  await expect(player.getByText(BASIC_QUIZZ)).toBeVisible()
  await player.close()

  const home = await context.newPage()

  await home.goto("/game")
  await expect(home.getByText(t("game:reconnectTitle"))).toBeVisible()
  await home.getByRole("button", { name: t("game:reconnect") }).click()

  await answer(home, "Paris")
  await expect(home.getByText(t("game:correct"))).toBeVisible()
})
