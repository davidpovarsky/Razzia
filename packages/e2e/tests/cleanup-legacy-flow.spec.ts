/* oxlint-disable no-await-in-loop -- Follow each authoritative round before advancing. */
import { test, expect, type Page } from "@playwright/test"
import type { Question } from "@razzia/common/types/game"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
} from "../../../extensions/src/core"
import { join } from "node:path"

async function command(page: Page, gameId: string, action: string) {
  const result = await page.evaluate(
    ({ id, nextAction }) =>
      new Promise<{ success: boolean; error?: string }>((resolve) => {
        const socket = (
          window as unknown as {
            __socket: {
              emit(event: string, data: unknown, ack: typeof resolve): void
            }
          }
        ).__socket
        socket.emit(
          "extensions:command",
          {
            v: 1,
            gameId: id,
            action: nextAction,
            payload: {},
            requestId: crypto.randomUUID(),
          },
          resolve,
        )
      }),
    { id: gameId, nextAction: action },
  )
  expect(result.success, result.error).toBe(true)
}

test("legacy adapters retain picture voting, multi percentages and zero votes", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120_000)
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(login.ok()).toBe(true)
  const { token } = (await login.json()) as { token: string }
  const questions: Question[] = [
    {
      type: "single",
      playMode: "quiz",
      question: "Legacy picture quiz",
      answers: ["Picture A", "Picture B"],
      solutions: [0],
      cooldown: 3,
      time: 400,
    },
    {
      type: "multi",
      playMode: "quiz",
      question: "Legacy multiple selection",
      answers: ["Multi 1", "Multi 2", "Multi 3", "Multi 4", "Multi 5"],
      solutions: [0, 1],
      options: { scoringMode: "strict" },
      cooldown: 3,
      time: 400,
    },
    {
      type: "single",
      playMode: "survey",
      question: "Legacy zero-vote picture survey",
      answers: ["Poll 1", "Poll 2", "Poll 3", "Poll 4", "Poll 5"],
      solutions: [],
      cooldown: 3,
      time: 400,
    },
  ]
  const quizz = {
    subject: `Legacy adapter proof ${crypto.randomUUID()}`,
    gameMode: "quiz" as const,
    questions,
  }
  const ids = questions.map(() => crypto.randomUUID())
  const extras = createDefaultQuizExtrasV2(
    "draft",
    ids,
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.motionKit = "legacy"
  delete extras.defaults.showTheme
  extras.timeline = ids.map((questionId) => ({
    id: crypto.randomUUID(),
    kind: "question",
    questionId,
  }))
  for (const index of [0, 2]) {
    extras.perQuestion[ids[index]] = {
      answerVisuals: questions[index].answers.map((alt, answerIndex) => ({
        answerIndex,
        display: "both",
        alt,
        url: "/media/theme-answer.png",
      })),
    }
  }
  const headers = { Authorization: `Bearer ${token}` }
  const saved = await request.post("/api/extensions/quizzes", {
    headers,
    data: { quizz, extras },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  const { quizId } = (await saved.json()) as { quizId: string }
  const created = await request.post("/api/games", {
    headers,
    data: { quizzId: quizId },
  })
  expect(created.ok()).toBe(true)
  const { gameId, inviteCode } = (await created.json()) as {
    gameId: string
    inviteCode: string
  }
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await page.goto(`/party/manager/${gameId}`)
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "en-US",
  })

  try {
    const player = await context.newPage()
    await player.goto(`http://127.0.0.1:3170/game?pin=${inviteCode}`)
    await player.getByPlaceholder("Username here").fill("Legacy proof player")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(page.getByTestId("host-connected-counter")).toHaveText("1 / 1")
    await page.evaluate(
      (id) =>
        (
          window as unknown as {
            __socket: { emit(event: string, data: unknown): void }
          }
        ).__socket.emit("manager:startGame", { gameId: id }),
      gameId,
    )
    await expect(player.getByTestId("photo-card-choice-0")).toBeVisible()
    await expect(player.getByTestId("photo-card-grid")).toHaveAttribute(
      "data-answers-count",
      "2",
    )
    await player.getByTestId("photo-card-choice-0").click()
    await expect(page.getByTestId("stage-hud-answer-counter")).toHaveText("1/1")
    await command(page, gameId, "END_ANSWER_TIMER")
    await expect(page.getByTestId("photo-card-grid")).toHaveAttribute(
      "data-revealed",
      "true",
    )
    await page.screenshot({
      path: join(testInfo.outputDir, "legacy-picture-result.png"),
    })

    await command(page, gameId, "NEXT_SCREEN")
    await expect(player.getByRole("button", { name: /Multi 1/u })).toBeVisible()
    await player.getByRole("button", { name: /Multi 1/u }).click()
    await player.getByRole("button", { name: /Multi 2/u }).click()
    await player.getByRole("button", { name: "Confirm", exact: true }).click()
    await expect(page.getByTestId("stage-hud-answer-counter")).toHaveText("1/1")
    await command(page, gameId, "END_ANSWER_TIMER")
    for (const index of [0, 1]) {
      await expect(page.getByTestId(`answer-card-${index}`)).toHaveAttribute(
        "data-percentage",
        "100",
      )
      await expect(page.getByTestId(`answer-card-${index}`)).toHaveAttribute(
        "data-revealed",
        "true",
      )
    }
    await page.screenshot({
      path: join(testInfo.outputDir, "legacy-multi-result.png"),
    })

    await command(page, gameId, "NEXT_SCREEN")
    await expect(player.getByTestId("photo-card-grid")).toHaveAttribute(
      "data-answers-count",
      "5",
    )
    await expect(page.getByTestId("stage-hud-answer-counter")).toHaveText("0/1")
    await command(page, gameId, "END_ANSWER_TIMER")
    await expect(page.getByTestId("zero-votes-notice")).toBeVisible()
    await expect(page.getByTestId("card-winner-badge")).toHaveCount(0)
    await page.screenshot({
      path: join(testInfo.outputDir, "legacy-zero-result.png"),
    })
  } finally {
    await context.close()
  }
})
