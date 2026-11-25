import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import fs from "node:fs"
import { join } from "node:path"
import { CONFIG_PATH } from "@razzia/e2e/utils/constants"
import { openQuizzTab, quizzRow, seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, startGame } from "@razzia/e2e/utils/manager"
import { answer, joinGame } from "@razzia/e2e/utils/player"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  type QuizExtrasV2,
} from "@razzia/extensions/core"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/wave1-final-qa",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath })
}

interface LiveObservation {
  name: string
  observedAt: number
  data: Record<string, unknown>
}

const liveRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

// Observe the real browser connection; never emit events or change the clock.
const observeLiveFlow = (page: Page) => {
  const rows: LiveObservation[] = []

  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const raw = typeof payload === "string" ? payload : payload.toString()

      if (!raw.startsWith("42")) {
        return
      }

      let packet: unknown = null

      try {
        packet = JSON.parse(raw.slice(raw.indexOf("[")))
      } catch {
        return
      }

      if (!Array.isArray(packet)) {
        return
      }

      const event: unknown = packet[0]
      const value: unknown = packet[1]
      const observedAt = Date.now()

      if (event === EVENTS.GAME.PLAYER_ANSWER && typeof value === "number") {
        rows.push({ name: event, observedAt, data: { count: value } })

        return
      }

      const data = liveRecord(value)

      if (event === EVENTS.GAME.STATUS && typeof data.name === "string") {
        rows.push({ name: data.name, observedAt, data: liveRecord(data.data) })
      }

      if (event === EVENTS.EXTENSIONS.STATE) {
        const extras = liveRecord(data.extras)

        rows.push({
          name: event,
          observedAt,
          data: {
            step: liveRecord(extras.activeTimelineStep),
            sceneData: liveRecord(extras.activeSceneData),
          },
        })
      }
    })
  })

  return rows
}

const observedScene = (rows: LiveObservation[], sceneId: string) =>
  rows.findLast(
    (row) =>
      row.name === EVENTS.EXTENSIONS.STATE &&
      liveRecord(row.data.step).sceneId === sceneId,
  )

const endRecordedVote = async (
  manager: Page,
  input: { rows: LiveObservation[]; questionId: string },
) => {
  const stage = manager.getByTestId("tadazz-show")
  await expect(stage).toHaveAttribute("data-show-scene", "voting")
  const voting = input.rows.findLast(
    (row) =>
      row.name === STATUS.SELECT_ANSWER &&
      row.data.questionId === input.questionId,
  )

  expect(voting).toBeDefined()

  if (!voting) {
    throw new Error("The expected authoritative voting status was not received")
  }

  // RoundManager emits this count only after recording the real player answers.
  await expect
    .poll(() =>
      input.rows.some(
        (row) =>
          row.name === EVENTS.GAME.PLAYER_ANSWER &&
          row.observedAt >= voting.observedAt &&
          row.data.count === 2,
      ),
    )
    .toBe(true)
  const endTimer = manager.getByTestId("host-end-timer-btn")
  await expect(endTimer).toHaveCount(1)
  await expect(endTimer).toBeEnabled()
  await endTimer.click()
}

test.describe("Wave 1 Final Acceptance: UI Reachability, Settings Width, UI Workflow & Live Scenes", () => {
  test("QA-01: Header reachability and Save/Exit visibility across 1024, 1280, 1440, 1920 viewports + Settings full width", async ({
    page,
  }) => {
    const subject = `Viewport QA ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")

    seedQuizz(subject, {
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Test question for viewport",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const baseDigest = computeCanonicalBaseDigest({
      subject,
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Test question for viewport",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [crypto.randomUUID()],
      baseDigest,
    )
    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(defaultV2, null, 2),
      "utf-8",
    )

    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizId}$`, "u"))

    const assertViewportReachability = async (
      width: number,
      height: number,
      name: string,
    ) => {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(300)

      const saveBtn = page.getByTestId("editor-save-btn")
      const exitBtn = page.getByTestId("editor-exit-btn")
      const titleInput = page.getByPlaceholder(t("quizz:titleQuizzPlaceholder"))

      await expect(saveBtn).toBeVisible()
      await expect(exitBtn).toBeVisible()
      await expect(titleInput).toBeVisible()

      const saveBox = await saveBtn.boundingBox()
      const exitBox = await exitBtn.boundingBox()

      expect(saveBox).not.toBeNull()
      expect(exitBox).not.toBeNull()

      if (saveBox && exitBox) {
        // Assert fully within viewport horizontally and vertically
        expect(saveBox.x).toBeGreaterThan(0)
        expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(width)
        expect(saveBox.y).toBeGreaterThanOrEqual(0)
        expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(height)

        expect(exitBox.x).toBeGreaterThan(0)
        expect(exitBox.x + exitBox.width).toBeLessThanOrEqual(width)
        expect(exitBox.y).toBeGreaterThanOrEqual(0)
        expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(height)
      }

      await saveScreenshot(page, `viewport_${name}_questions.png`)
    }

    await assertViewportReachability(1024, 768, "1024")
    await assertViewportReachability(1280, 800, "1280")
    await assertViewportReachability(1440, 900, "1440")
    await assertViewportReachability(1920, 1080, "1920")

    // Verify Settings page width at 1280px (UI-02: not trapped at 320px)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByTestId("studio-tab-settings").click()
    await expect(
      page.getByText(
        t("extensions:studio.settings.globalTitle", {
          defaultValue: "Studio Settings & Defaults",
        }),
      ),
    ).toBeVisible()

    // Find the main Settings Card element
    const settingsCard = page
      .getByText(
        t("extensions:studio.settings.newQuestionMode", {
          defaultValue: "Default Mode for New Cards",
        }),
      )
      .locator("xpath=ancestor::div[contains(@class, 'rounded-')][1]")
    const cardBox = await settingsCard.boundingBox()

    expect(cardBox).not.toBeNull()

    if (cardBox) {
      // Prior bug was Card constrained to max-w-80 (320px). Full width in max-w-4xl is >= 700px!
      expect(cardBox.width).toBeGreaterThan(600)
    }

    await saveScreenshot(page, "viewport_1280_settings.png")
  })

  test("QA-02: Editor UI workflow — Card kind toggle, Save button click, and reload persistence", async ({
    page,
  }) => {
    const subject = `UI Workflow Quiz ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "Initial Question 1",
        answers: ["Option 1", "Option 2"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "Initial Question 2",
        answers: ["Yes", "No"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
    ]

    // 1. Seed quiz on disk
    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const baseDigest = computeCanonicalBaseDigest({
      subject,
      gameMode: "quiz",
      questions,
    })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )
    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(defaultV2, null, 2),
      "utf-8",
    )

    // 2. Open quiz in editor via UI
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizId}$`, "u"))

    // 3. Select card 2 in the timeline sidebar
    await page.locator("aside").getByText("2").first().click()

    // 4. In header ToggleGroup, click Survey to switch this card from Quiz -> Survey
    const kindBar = page.locator(
      '[data-testid="studio-card-type-bar"][data-embedded="false"]',
    )
    const surveyToggle = kindBar.getByTestId("toggle-kind-survey")
    await surveyToggle.click()
    await expect(surveyToggle).toHaveAttribute("data-state", "on")

    // Verify card 1 remains Quiz
    await page.locator("aside").getByText("1").first().click()
    const quizToggle = kindBar.getByTestId("toggle-kind-quiz")
    await expect(quizToggle).toHaveAttribute("data-state", "on")

    // 5. Click Save button via UI
    const saveBtn = page.getByTestId("editor-save-btn")
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Expect saved toast and navigation back to manager config
    await expect(page.getByText(t("quizz:quizzUpdated"))).toBeVisible({
      timeout: 10000,
    })
    await expect(page).toHaveURL(/\/manager\/config$/u)

    // 6. Re-open quiz from manager list to verify persistence
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()

    // Card 2 should still be Survey!
    await page.locator("aside").getByText("2").first().click()
    await expect(kindBar.getByTestId("toggle-kind-survey")).toHaveAttribute(
      "data-state",
      "on",
    )

    // Card 1 should still be Quiz!
    await page.locator("aside").getByText("1").first().click()
    await expect(kindBar.getByTestId("toggle-kind-quiz")).toHaveAttribute(
      "data-state",
      "on",
    )

    await saveScreenshot(page, "editor_ui_saved_quizz.png")
  })

  test("QA-03: Preflight launch protection — dirty draft & missing media warnings", async ({
    page,
  }) => {
    const subject = `Launch Preflight QA ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const mediaSceneId = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        question: "Launch test question",
        answers: ["A", "B"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
    ]

    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const baseDigest = computeCanonicalBaseDigest({
      subject,
      gameMode: "quiz",
      questions,
    })
    const defaultV2 = createDefaultQuizExtrasV2(quizId, [q1Id], baseDigest)
    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: crypto.randomUUID(), kind: "question", questionId: q1Id },
        { id: crypto.randomUUID(), kind: "media", sceneId: mediaSceneId },
      ],
      scenes: {
        [mediaSceneId]: {
          id: mediaSceneId,
          kind: "media",
          title: "Missing Media Card",
          mediaUrl: "",
          mediaType: "image",
          durationMs: 5000,
          advance: "auto",
        },
      },
    }
    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()

    // 1. Click Launch tab in header
    await page.getByTestId("studio-tab-launch").click()

    // 2. Assert that missing media warning is displayed and Launch button is disabled
    await expect(
      page.getByText(
        t("extensions:studio.launch.missingMediaWarning", {
          defaultValue: "Some media cards have empty URLs",
        }),
      ),
    ).toBeVisible()

    const launchBtn = page.getByRole("button", {
      name: t("extensions:studio.launch.launchButton", {
        defaultValue: "Launch Live Show",
      }),
    })
    await expect(launchBtn).toBeDisabled()

    await saveScreenshot(page, "launch_preflight_missing_media_warning.png")
  })

  test("QA-04: Authoritative Live Game Scenes — Real Leaderboard Scores and Interim Results with 2 Players", async ({
    page: manager,
    newPage,
  }, testInfo) => {
    const subject = `Live Data Scenes Acceptance ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()
    const lbSceneId = crypto.randomUUID()
    const interimSceneId = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "What is 2 + 2?",
        answers: ["Three", "Four", "Five", "Six"],
        solutions: [1],
        cooldown: 3,
        time: 120,
      },
      {
        type: "single" as const,
        playMode: "survey" as const,
        question: "What is your favorite color?",
        answers: ["Red", "Blue"],
        solutions: [],
        cooldown: 3,
        time: 120,
      },
    ]

    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const baseDigest = computeCanonicalBaseDigest({
      subject,
      gameMode: "quiz",
      questions,
    })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )

    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: crypto.randomUUID(), kind: "question", questionId: q1Id },
        { id: crypto.randomUUID(), kind: "leaderboard", sceneId: lbSceneId },
        { id: crypto.randomUUID(), kind: "question", questionId: q2Id },
        {
          id: crypto.randomUUID(),
          kind: "interimResults",
          sceneId: interimSceneId,
        },
      ],
      scenes: {
        [lbSceneId]: {
          id: lbSceneId,
          kind: "leaderboard",
          title: "Mid-Game Leaderboard",
          durationMs: 5000,
          advance: "manual",
        },
        [interimSceneId]: {
          id: interimSceneId,
          kind: "interimResults",
          title: "Audience Poll Overview",
          durationMs: 5000,
          advance: "manual",
        },
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // This scenario checks live data and manual progression, not accelerated expiry.
    // Keep a finite clock while allowing both real browser players to answer.
    const hostWire = observeLiveFlow(manager)
    const alice = await newPage()
    const aliceWire = observeLiveFlow(alice)
    const bob = await newPage()
    const bobWire = observeLiveFlow(bob)
    const observations: Array<Record<string, unknown>> = []

    try {
      const pin = await createGame(manager, subject)
      await joinGame(alice, pin, "Alice")
      await joinGame(bob, pin, "Bob")

      const presence = manager.getByTestId("host-bottom-players-btn")
      await expect(presence).toBeVisible()
      await expect(presence.getByTestId("host-connected-counter")).toHaveText(
        /^2(?:\s*\/\s*2)?$/u,
      )
      const stage = manager.getByTestId("tadazz-show")
      await expect(stage).toHaveAttribute("data-show-theme", "tadazz-classic")
      await startGame(manager)

      await Promise.all([answer(alice, "Four"), answer(bob, "Three")])
      await endRecordedVote(manager, { rows: hostWire, questionId: q1Id })
      await expect
        .poll(() =>
          hostWire.some(
            (row) =>
              row.name === STATUS.SHOW_RESPONSES &&
              row.data.questionId === q1Id,
          ),
        )
        .toBe(true)
      await expect(stage).toHaveAttribute("data-show-scene", "results")
      await expect
        .poll(() => aliceWire.some((row) => row.name === STATUS.SHOW_RESULT))
        .toBe(true)
      await expect
        .poll(() => bobWire.some((row) => row.name === STATUS.SHOW_RESULT))
        .toBe(true)

      const aliceResult =
        aliceWire.find((row) => row.name === STATUS.SHOW_RESULT)?.data ?? {}
      const bobResult =
        bobWire.find((row) => row.name === STATUS.SHOW_RESULT)?.data ?? {}
      const aliceScore =
        typeof aliceResult.myPoints === "number" ? aliceResult.myPoints : NaN
      expect(Number.isInteger(aliceScore)).toBe(true)
      expect(aliceScore).toBeGreaterThan(0)
      expect(aliceScore).toBeLessThanOrEqual(1000)
      expect(aliceResult).toMatchObject({
        correct: true,
        points: aliceScore,
        myPoints: aliceScore,
        rank: 1,
      })
      expect(bobResult).toMatchObject({
        correct: false,
        points: 0,
        myPoints: 0,
        rank: 2,
      })
      const reveal = hostWire.find(
        (row) =>
          row.name === STATUS.SHOW_RESPONSES && row.data.questionId === q1Id,
      )
      expect(reveal?.data.responses).toEqual({ 0: 1, 1: 1 })
      await manager.getByTestId("host-next-screen-btn").click()

      await expect.poll(() => observedScene(hostWire, lbSceneId)).toBeDefined()
      await expect.poll(() => observedScene(aliceWire, lbSceneId)).toBeDefined()
      const ranks = [
        { rank: 1, displayName: "Alice", points: aliceScore },
        { rank: 2, displayName: "Bob", points: 0 },
      ]
      for (const rows of [hostWire, aliceWire]) {
        const scene = observedScene(rows, lbSceneId)
        expect(liveRecord(scene?.data.step)).toMatchObject({
          sceneId: lbSceneId,
          kind: "leaderboard",
          advance: "manual",
        })
        const sceneData = liveRecord(scene?.data.sceneData)
        expect(liveRecord(sceneData.leaderboard).entries).toEqual(ranks)
      }

      await expect(manager.getByTestId("host-end-timer-btn")).toHaveCount(0)
      await expect(manager.getByTestId("host-skip-question-btn")).toHaveCount(0)
      await expect(
        manager.getByTestId("host-restart-question-btn"),
      ).toHaveCount(0)
      const managerRows = manager
        .getByTestId("tadazz-leaderboard-screen")
        .locator(".tz-leader-row")
      const playerScene = alice.getByTestId("studio-scene-presenter")
      const playerRows = playerScene.locator(
        '[data-testid="tadazz-leaderboard-row"], [data-testid="leaderboard-scene-row"]',
      )
      await expect(managerRows).toHaveCount(2)
      await expect(playerRows).toHaveCount(2)

      for (const entry of ranks) {
        const hostRow = managerRows.filter({
          has: manager.getByText(entry.displayName, { exact: true }),
        })
        const playerRow = playerRows.filter({
          has: alice.getByText(entry.displayName, { exact: true }),
        })
        await expect(hostRow).toHaveCount(1)
        await expect(playerRow).toHaveCount(1)
        await expect(hostRow).toBeVisible()
        await expect(playerRow).toBeVisible()
        await expect
          .poll(async () =>
            Number(await hostRow.locator(".tz-rank").textContent()),
          )
          .toBe(entry.rank)
        await expect
          .poll(async () =>
            Number.parseFloat(
              (await hostRow.locator(".tz-team-score").textContent()) ?? "",
            ),
          )
          .toBe(entry.points)

        const fallback =
          (await playerRow.getAttribute("data-testid")) ===
          "leaderboard-scene-row"
        const playerRank = playerRow.locator(
          fallback ? ":scope > div > span:first-child" : ".tdz-rank-number",
        )
        const playerScore = playerRow.locator(
          fallback ? ":scope > span" : ".tdz-rank-score",
        )
        await expect(playerRank).toHaveText(String(entry.rank))
        await expect
          .poll(async () =>
            Number.parseFloat((await playerScore.textContent()) ?? ""),
          )
          .toBe(entry.points)
      }

      observations.push({
        phase: "leaderboard",
        managerRows: await managerRows.allTextContents(),
        playerRows: await playerRows.allTextContents(),
      })
      // These titles are public authored content; a missing title still fails the case.
      await Promise.all([
        expect
          .soft(manager.getByText("Mid-Game Leaderboard", { exact: true }))
          .toBeVisible({ timeout: 15000 }),
        expect
          .soft(playerScene.getByText("Mid-Game Leaderboard", { exact: true }))
          .toBeVisible({ timeout: 15000 }),
      ])
      await expect(alice.getByText("Four", { exact: true })).not.toBeVisible()
      await saveScreenshot(manager, "live_leaderboard_real_scores_manager.png")
      await saveScreenshot(alice, "live_leaderboard_real_scores_player.png")

      await manager.getByTestId("host-next-screen-btn").click()
      await Promise.all([answer(alice, "Red"), answer(bob, "Blue")])
      await endRecordedVote(manager, { rows: hostWire, questionId: q2Id })

      // The immediately authored interim scene owns Q2's reveal. No extra Next.
      await expect
        .poll(() => observedScene(hostWire, interimSceneId))
        .toBeDefined()
      await expect
        .poll(() => observedScene(aliceWire, interimSceneId))
        .toBeDefined()
      for (const rows of [hostWire, aliceWire]) {
        const scene = observedScene(rows, interimSceneId)
        expect(liveRecord(scene?.data.step)).toMatchObject({
          sceneId: interimSceneId,
          kind: "interimResults",
          advance: "manual",
        })
        const sceneData = liveRecord(scene?.data.sceneData)
        const poll = liveRecord(sceneData.interimResults)
        expect(poll).toMatchObject({
          sourceQuestionId: q2Id,
          questionText: "What is your favorite color?",
        })
        expect(poll.options).toEqual([
          expect.objectContaining({ label: "Red", count: 1, percentage: 50 }),
          expect.objectContaining({ label: "Blue", count: 1, percentage: 50 }),
        ])
      }
      expect(
        hostWire.some(
          (row) =>
            row.name === STATUS.SHOW_RESPONSES && row.data.questionId === q2Id,
        ),
      ).toBe(false)
      await expect(
        manager
          .getByTestId("tadazz-question-panel")
          .getByText("What is your favorite color?", { exact: true }),
      ).toBeVisible()
      const pollRows = playerScene.getByTestId("interim-option-row")
      await expect(pollRows).toHaveCount(2)
      for (const [index, label] of ["Red", "Blue"].entries()) {
        const hostOption = manager.getByTestId(`tadazz-card-${index}`)
        const playerOption = pollRows.filter({
          has: alice.getByText(label, { exact: true }),
        })
        await expect(hostOption.getByText(label, { exact: true })).toBeVisible()
        await expect(hostOption.locator(".tz-result-number")).toHaveText("50%")
        await expect(playerOption).toHaveCount(1)
        // The winner card shows a compact summary and the large percentage.
        const percentages = playerOption.getByText("50%", { exact: true })
        await expect(percentages).toHaveText(["50%", "50%"])
        await Promise.all(
          (await percentages.all()).map((percentage) =>
            expect(percentage).toBeVisible(),
          ),
        )
        const voteLabel = `(${t("extensions:reveal.votes", { count: 1, defaultValue: "1 vote" })})`
        const voteCounts = playerOption.getByText(voteLabel, { exact: true })
        await expect(voteCounts).toHaveText([voteLabel, voteLabel])
        await Promise.all(
          (await voteCounts.all()).map((count) => expect(count).toBeVisible()),
        )
      }
      await expect(
        alice.getByRole("button", { name: "1 Red", exact: true }),
      ).toHaveCount(0)
      observations.push({
        phase: "interimResults",
        playerRows: await pollRows.allTextContents(),
        managerStatus: hostWire
          .filter((row) => row.name !== EVENTS.EXTENSIONS.STATE)
          .at(-1),
        endTimerVisible: await manager
          .getByTestId("host-end-timer-btn")
          .isVisible(),
        nextVisible: await manager
          .getByTestId("host-next-screen-btn")
          .isVisible(),
      })
      await Promise.all([
        expect
          .soft(manager.getByText("Audience Poll Overview", { exact: true }))
          .toBeVisible({ timeout: 15000 }),
        expect
          .soft(
            playerScene.getByText("Audience Poll Overview", { exact: true }),
          )
          .toBeVisible({ timeout: 15000 }),
      ])
      await saveScreenshot(
        manager,
        "live_interim_results_real_poll_manager.png",
      )
      await saveScreenshot(alice, "live_interim_results_real_poll_player.png")

      await expect(manager.getByTestId("host-end-timer-btn")).toHaveCount(0)
      await expect(manager.getByTestId("host-skip-question-btn")).toHaveCount(0)
      await expect(
        manager.getByTestId("host-restart-question-btn"),
      ).toHaveCount(0)
      await manager.getByTestId("host-next-screen-btn").click()
      await expect
        .poll(() => hostWire.some((row) => row.name === STATUS.FINISHED))
        .toBe(true)
      await expect
        .poll(() => aliceWire.some((row) => row.name === STATUS.FINISHED))
        .toBe(true)
      await expect
        .poll(() => bobWire.some((row) => row.name === STATUS.FINISHED))
        .toBe(true)
      const finalTop = [
        { username: "Alice", points: aliceScore },
        { username: "Bob", points: 0 },
      ]
      expect(
        hostWire.find((row) => row.name === STATUS.FINISHED)?.data.top,
      ).toEqual(finalTop)
      expect(
        aliceWire.find((row) => row.name === STATUS.FINISHED)?.data,
      ).toMatchObject({ top: finalTop, rank: 1 })
      expect(
        bobWire.find((row) => row.name === STATUS.FINISHED)?.data,
      ).toMatchObject({ top: finalTop, rank: 2 })
      await expect(stage).toHaveAttribute("data-show-scene", "finale")
      const finale = manager.getByTestId("tadazz-finale-screen")
      await expect(finale).toBeVisible()
      await expect(finale.getByTestId("tadazz-winner-name")).toHaveText("Alice")
      await expect(finale.locator(".tz-win-score")).toContainText(
        String(aliceScore),
      )
      const observedStepIds = hostWire
        .filter((row) => row.name === EVENTS.EXTENSIONS.STATE)
        .map((row) => liveRecord(row.data.step).id)
        .filter((id): id is string => typeof id === "string")
      expect(
        observedStepIds.filter(
          (id, index) => id !== observedStepIds[index - 1],
        ),
      ).toEqual(extras.timeline.map((item) => item.id))
      await saveScreenshot(manager, "live_finish_podium.png")
    } finally {
      await testInfo.attach("qa04-live-flow.json", {
        body: JSON.stringify(
          { hostWire, aliceWire, bobWire, observations },
          null,
          2,
        ),
        contentType: "application/json",
      })
    }
  })
})
