import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
} from "../../../extensions/src/core"
import { join } from "node:path"

async function seed(request: APIRequestContext, page: Page, legacy: boolean) {
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(login.ok()).toBe(true)
  const { token } = await login.json()
  const questionId = crypto.randomUUID()
  const quizz = {
    subject: `Isolated cleanup ${crypto.randomUUID()}`,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Which city is in France?",
        answers: ["Paris", "London"],
        solutions: [0],
        time: 30,
        cooldown: 3,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [questionId],
    computeCanonicalBaseDigest(quizz),
  )
  if (legacy) extras.defaults.motionKit = "legacy"
  const sceneId = crypto.randomUUID()
  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "transition",
    title: "Isolated scene",
    durationMs: 5000,
    advance: "manual",
  }
  extras.timeline.unshift({
    id: crypto.randomUUID(),
    kind: "transition",
    sceneId,
  })
  const headers = { Authorization: `Bearer ${token}` }
  const saved = await request.post("/api/extensions/quizzes", {
    headers,
    data: { quizz, extras },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  const { quizId } = await saved.json()
  const created = await request.post("/api/games", {
    headers,
    data: { quizzId: quizId },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const game = await created.json()
  await page.addInitScript(
    (tokenValue) => localStorage.setItem("token", tokenValue),
    token,
  )
  await page.goto(`/party/manager/${game.gameId}`)
  return { ...game, quizId, token }
}

test("Classic host, player and display keep the current lobby and authoritative pause/roster", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const game = await seed(request, page, false)
  const skip = page.getByTestId("tadazz-opening-skip")
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await expect(page.getByTestId("tadazz-show")).toBeVisible()
  await expect(page.getByTestId("tadazz-lobby-pin")).toHaveText(game.inviteCode)
  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
  await player.goto(`http://127.0.0.1:3170/?pin=${game.inviteCode}`)
  await player.getByPlaceholder("Username here").fill("Cleanup Alice")
  await player.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByTestId("host-connected-counter")).toHaveText("1 / 1")
  const displayContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
  })
  const display = await displayContext.newPage()
  await display.goto(`http://127.0.0.1:3170/display/${game.gameId}`)
  await expect(display.getByTestId("tadazz-lobby-pin")).toHaveText(
    game.inviteCode,
  )
  await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(display.locator('img[alt="background"], iframe')).toHaveCount(0)
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("host-pause-resume-btn")).toBeVisible()
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "true",
  )
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "false",
  )
  await page.screenshot({ path: join(testInfo.outputDir, "classic-host.png") })
  await display.screenshot({
    path: join(testInfo.outputDir, "classic-display.png"),
  })
  await playerContext.close()
  await displayContext.close()
})

test("explicit rollback uses extracted scene presenter and original Studio controls", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const game = await seed(request, page, true)
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  const participantContext = await browser.newContext()
  const participant = await participantContext.newPage()
  await participant.goto(`http://127.0.0.1:3170/?pin=${game.inviteCode}`)
  await participant.getByPlaceholder("Username here").fill("Rollback Alice")
  await participant.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Rollback Alice", { exact: true }).first(),
  ).toBeVisible()
  await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __socket: { emit(event: string, data: unknown): void }
        }
      ).__socket.emit("manager:startGame", { gameId: id }),
    game.gameId,
  )
  await expect(page.getByTestId("studio-scene-presenter")).toBeVisible()
  await expect(page.getByText("Isolated scene", { exact: true })).toBeVisible()
  await page.screenshot({
    path: join(testInfo.outputDir, "rollback-scene.png"),
  })
  await page.goto(`/manager/quizz/${game.quizId}`)
  await expect(page.getByTestId("studio-card-type-bar")).toBeVisible()
  await expect(
    page.getByText("Isolated scene", { exact: true }).first(),
  ).toBeVisible()
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  await participantContext.close()
})
