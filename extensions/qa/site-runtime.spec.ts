import { test, expect } from "@playwright/test"
import { createGame, next, startGame } from "../../packages/e2e/utils/manager"
import { joinGame, answer } from "../../packages/e2e/utils/player"
import { t } from "../../packages/e2e/utils/i18n"
import {
  createDefaultQuizExtras,
  computeCanonicalBaseDigest,
} from "../src/core"

test("current runtime preserves actual PIN joining, answers, ranking and podium", async ({
  page: manager,
  browser,
}) => {
  const pin = await createGame(manager)
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  // Current printed links use /?pin and the original join flow lives at /game.
  await joinGame(alice, pin, "Alice")
  await joinGame(bob, pin, "Bob")
  await expect(manager.getByText("Alice", { exact: true })).toBeVisible()
  await startGame(manager)
  await answer(alice, "Paris")
  await answer(bob, "Lyon")
  await expect(
    alice.getByText(t("game:correct"), { exact: true }),
  ).toBeVisible()
  await expect(bob.getByText(t("game:wrong"), { exact: true })).toBeVisible()
  await next(manager)
  const board = manager.getByText(t("game:leaderboard"), { exact: true })
  const secondAnswer = alice.getByRole("button", { name: "2 4", exact: true })
  await expect
    .poll(
      async () => (await board.isVisible()) || (await secondAnswer.isVisible()),
    )
    .toBe(true)

  if (await board.isVisible()) {
    await next(manager)
  }

  await answer(alice, "4")
  await answer(bob, "4")
  await expect(bob.getByText(t("game:correct"), { exact: true })).toBeVisible()
  await next(manager)
  await expect(
    alice.getByText(t("game:rank", { count: 1, ordinal: true }), {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    bob.getByText(t("game:rank", { count: 2, ordinal: true }), { exact: true }),
  ).toBeVisible()
  await aliceContext.close()
  await bobContext.close()
})

test("current native host and presenter preserve presentation and authoritative pause", async ({
  page: host,
  browser,
  request,
}) => {
  const title = `Native host compatibility ${Date.now()}`
  const quizz = {
    subject: title,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Native compatibility question",
        answers: ["Yes", "No"],
        solutions: [0],
        cooldown: 3,
        time: 120,
      },
    ],
  }
  const extras = createDefaultQuizExtras(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  const { token } = (await login.json()) as { token: string }
  const saved = await request.post("/api/extensions/quizzes", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizz, extras },
  })
  expect(saved.ok()).toBe(true)
  const pin = await createGame(host, title)
  const playerContext = await browser.newContext()
  const player = await playerContext.newPage()
  await joinGame(player, pin, "Compatibility player")
  const gameId = /manager\/([^/?#]+)/u.exec(host.url())?.[1]
  expect(gameId).toBeTruthy()
  const displayContext = await browser.newContext()
  const display = await displayContext.newPage()
  await display.goto(`/display/${gameId}`)
  await expect(display.getByText(pin, { exact: true })).toBeVisible()
  await host.getByTestId("host-present-from-host-btn").click()
  const shell = host.getByTestId("tadazz-show")
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await host.keyboard.press("Escape")
  await expect(shell).toHaveAttribute("data-host-presenting", "false")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
  await host.getByTestId("host-present-from-host-btn").click()
  // Current host shortcuts require a confirmed same-chord double press.
  await host.keyboard.press("ArrowRight")
  await host.keyboard.press("ArrowRight")
  await expect(shell).toHaveAttribute("data-voting-open", "true")
  await host.keyboard.press("Space")
  await host.keyboard.press("Space")
  await expect(shell).toHaveAttribute("data-game-paused", "true")
  await host.keyboard.press("Space")
  await host.keyboard.press("Space")
  await expect(shell).toHaveAttribute("data-game-paused", "false")
  await expect(host.locator("[data-tadazz-site]")).toHaveCount(0)
  await playerContext.close()
  await displayContext.close()
})
