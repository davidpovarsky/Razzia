import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import fs from "node:fs"
import { join } from "node:path"
import { CONFIG_PATH } from "@razzia/e2e/utils/constants"
import {
  openQuizzTab,
  questionCard,
  quizzRow,
  seedQuizz,
} from "@razzia/e2e/utils/editor"
import {
  endRecordedVote,
  latestState,
  liveRecord,
  observeLiveFlow,
  setManualProgression,
} from "@razzia/e2e/utils/extension-manager"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, joinGame } from "@razzia/e2e/utils/player"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  type QuizExtrasV2,
} from "@razzia/extensions/core"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/wave1-completion",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath })
}

test.describe("Wave 1 Acceptance: Studio Navigation, Launch Protection & Live Game Scenes", () => {
  test("Scenario 1: Studio Timeline Navigation, Questions, Scene Editor, Participants, Settings and Launch Preflight", async ({
    page,
  }) => {
    const subject = `Wave 1 Studio Acceptance ${Date.now()}`
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "What is 2 + 2?",
        answers: ["3", "4", "5", "6"],
        solutions: [1],
        cooldown: 5,
        time: 20,
      },
      {
        type: "single" as const,
        playMode: "survey" as const,
        question: "How do you rate this studio show?",
        answers: ["Great", "Awesome"],
        solutions: [],
        cooldown: 5,
        time: 20,
      },
    ]

    // 1. Seed base quiz on disk
    seedQuizz(subject, {
      gameMode: "quiz",
      questions,
    })

    // 2. Seed V2 sidecar on disk with opening scene, Q1, transition, Q2
    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const baseDigest = computeCanonicalBaseDigest({
      subject,
      questions,
      gameMode: "quiz",
    })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )

    const openSceneId = crypto.randomUUID()
    const transSceneId = crypto.randomUUID()
    const stepOpenId = crypto.randomUUID()
    const stepQ1Id = crypto.randomUUID()
    const stepTransId = crypto.randomUUID()
    const stepQ2Id = crypto.randomUUID()

    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: stepOpenId, kind: "opening", sceneId: openSceneId },
        { id: stepQ1Id, kind: "question", questionId: q1Id },
        { id: stepTransId, kind: "transition", sceneId: transSceneId },
        { id: stepQ2Id, kind: "question", questionId: q2Id },
      ],
      scenes: {
        [openSceneId]: {
          id: openSceneId,
          kind: "opening",
          title: "Welcome to TADA Studio Show",
          durationMs: 5000,
          advance: "manual",
        },
        [transSceneId]: {
          id: transSceneId,
          kind: "transition",
          title: "Next: Audience Survey",
          durationMs: 3000,
          advance: "manual",
        },
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 3. Login to Manager and open Quiz in Quizz Editor
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizId}$`, "u"))

    // 4. Select the two actual authored scene cards in the native timeline.
    const timeline = page.getByTestId("editor-timeline")
    const opening = timeline.getByTestId("editor-scene-card").filter({
      has: page.getByRole("button", {
        name: "Welcome to TADA Studio Show",
        exact: true,
      }),
    })
    const transition = timeline.getByTestId("editor-scene-card").filter({
      has: page.getByRole("button", {
        name: "Next: Audience Survey",
        exact: true,
      }),
    })
    await expect(opening).toHaveCount(1)
    await expect(opening).toHaveAttribute("data-scene-kind", "opening")
    await expect(transition).toHaveCount(1)
    await expect(transition).toHaveAttribute("data-scene-kind", "transition")

    // A Classic opening's card name is editable; the selected preset owns its stage title.
    await opening.getByTestId("editor-scene-select").click()
    await expect(page.getByTestId("scene-title-input")).toHaveValue(
      "Welcome to TADA Studio Show",
    )
    await expect(page.getByTestId("scene-preset-title-hint")).toHaveText(
      t("extensions:studio.scene.cardNameHint"),
    )
    await expect(page.getByTestId("studio-scene-preview-stage")).toBeVisible()
    await saveScreenshot(page, "01_studio_scene_editor.png")

    // 6. Click Question 1 -> Verify QuestionEditor renders
    await questionCard(page, 0).click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("What is 2 + 2?")
    await saveScreenshot(page, "02_studio_question_editor.png")

    // 7. Click Participants tab in header
    await page
      .getByRole("button", {
        name: t("extensions:studio.tabs.participants", {
          defaultValue: "Participants",
        }),
      })
      .click()
    await expect(
      page.getByText(
        t("extensions:roster.title", { defaultValue: "Participant Roster" }),
      ),
    ).toBeVisible()
    await saveScreenshot(page, "03_studio_participants.png")

    // 8. Click Settings tab in header
    await page
      .getByRole("button", {
        name: t("extensions:studio.tabs.settings", {
          defaultValue: "Settings",
        }),
      })
      .click()
    await expect(
      page.getByText(
        t("extensions:studio.settings.newQuestionMode", {
          defaultValue: "Default Question Mode",
        }),
      ),
    ).toBeVisible()
    await saveScreenshot(page, "04_studio_settings.png")

    // 9. Click Launch tab in header
    await page
      .getByRole("button", {
        name: t("extensions:studio.tabs.launch", { defaultValue: "Launch" }),
      })
      .click()
    await expect(
      page.getByRole("heading", { name: /Launch Live Show/i }),
    ).toBeVisible()
    await expect(page.getByTestId("studio-launch-btn")).toHaveCount(1)
    await expect(page.getByTestId("studio-launch-btn")).toBeEnabled()
    await saveScreenshot(page, "05_studio_launch.png")
  })

  test("Scenario 2: Live Game Scene Presentation, Input Suppression during Scenes, Advance to Question & Finished Podium", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `Live Show Acceptance ${Date.now()}`
    const hostWire = observeLiveFlow(manager)
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const q1Id = crypto.randomUUID()
    const q2Id = crypto.randomUUID()

    const questions = [
      {
        type: "single" as const,
        playMode: "quiz" as const,
        question: "What is 2 + 2?",
        answers: ["Three", "Four", "Five", "Six"],
        solutions: [1],
        cooldown: 3,
        time: 600,
      },
      {
        type: "single" as const,
        playMode: "survey" as const,
        question: "How do you rate this studio show?",
        answers: ["Great", "Awesome"],
        solutions: [],
        cooldown: 3,
        time: 600,
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
      questions,
      gameMode: "quiz",
    })
    const defaultV2 = createDefaultQuizExtrasV2(
      quizId,
      [q1Id, q2Id],
      baseDigest,
    )

    defaultV2.defaults.showTheme = {
      id: "razzia-original",
      version: "1.0.0",
      overrides: {},
    }

    const openSceneId = crypto.randomUUID()
    const transSceneId = crypto.randomUUID()
    const stepOpenId = crypto.randomUUID()
    const stepQ1Id = crypto.randomUUID()
    const stepTransId = crypto.randomUUID()
    const stepQ2Id = crypto.randomUUID()

    const extras: QuizExtrasV2 = {
      ...defaultV2,
      timeline: [
        { id: stepOpenId, kind: "opening", sceneId: openSceneId },
        { id: stepQ1Id, kind: "question", questionId: q1Id },
        { id: stepTransId, kind: "transition", sceneId: transSceneId },
        { id: stepQ2Id, kind: "question", questionId: q2Id },
      ],
      scenes: {
        [openSceneId]: {
          id: openSceneId,
          kind: "opening",
          title: "Grand Opening Scene",
          durationMs: 4000,
          advance: "manual",
        },
        [transSceneId]: {
          id: transSceneId,
          kind: "transition",
          title: "Transition to Survey",
          durationMs: 3000,
          advance: "manual",
        },
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 1. Manager creates game
    const pin = await createGame(manager, subject)
    await setManualProgression(manager)

    // 2. Web Player Alice joins
    const alice = await newPage()
    const aliceWire = observeLiveFlow(alice)
    await joinGame(alice, pin, "Alice")
    await expect(manager.getByTestId("host-bottom-players-btn")).toBeVisible()
    await expect(manager.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
    )

    // 3. Start Game
    const toolbar = manager.getByTestId("manager-control-toolbar")
    await expect(toolbar).toHaveAttribute("data-host-lobby", "true")
    await expect(manager.getByTestId("host-next-screen-btn")).toHaveCount(0)
    await startGame(manager)

    // 4. Authoritative Stage is now Step 0: Grand Opening Scene!
    // Manager and Alice both see Opening Scene
    await expect(manager.getByText("Grand Opening Scene")).toBeVisible({
      timeout: 15000,
    })
    await expect(alice.getByText("Grand Opening Scene")).toBeVisible({
      timeout: 15000,
    })

    // Web Player Alice does NOT see answer options during scene (input suppression)
    await expect(alice.getByText("Four")).not.toBeVisible()

    await saveScreenshot(manager, "06_live_opening_scene_manager.png")
    await saveScreenshot(alice, "07_live_opening_scene_player.png")

    // 5. Manager advances Opening Scene -> Question 1 begins
    await expect
      .poll(() => ({
        phase: latestState(hostWire)?.phase,
        sceneId: liveRecord(
          liveRecord(latestState(hostWire)?.extras).activeTimelineStep,
        ).sceneId,
      }))
      .toEqual({ phase: "scene", sceneId: openSceneId })
    await expect(toolbar).toHaveAttribute("data-host-lobby", "false")
    const advanceSceneBtn = manager.getByTestId("host-next-screen-btn")
    await expect(advanceSceneBtn).toHaveCount(1)
    await expect(manager.getByTestId("host-end-timer-btn")).toHaveCount(0)
    await advanceSceneBtn.click()

    // 6. Question 1 answers appear for Alice
    await expect(alice.getByText("Four", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await saveScreenshot(manager, "08_live_question1_manager.png")

    // Alice selects correct answer "Four"
    await answer(alice, "Four")
    await endRecordedVote(manager, hostWire, { questionId: q1Id, count: 1 })
    await expect(
      alice.getByText(t("game:correct"), { exact: true }),
    ).toBeVisible()
    await expect
      .poll(
        () =>
          aliceWire.findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
            .correct,
      )
      .toBe(true)
    const quizResult = aliceWire.findLast(
      (row) => row.name === STATUS.SHOW_RESULT,
    )?.data
    expect(quizResult?.points).toBeGreaterThan(0)
    expect(quizResult?.myPoints).toBe(quizResult?.points)

    // The host advances the actual scored reveal to the authored transition.
    await next(manager)

    // Verify Transition Scene appears for both Manager and Alice
    await expect(manager.getByText("Transition to Survey")).toBeVisible({
      timeout: 15000,
    })
    await expect(alice.getByText("Transition to Survey")).toBeVisible({
      timeout: 15000,
    })

    await expect
      .poll(
        () =>
          liveRecord(
            liveRecord(latestState(hostWire)?.extras).activeTimelineStep,
          ).sceneId,
      )
      .toBe(transSceneId)
    await expect(manager.getByTestId("host-end-timer-btn")).toHaveCount(0)
    await expect(
      alice.getByRole("button", { name: "2 Four", exact: true }),
    ).toHaveCount(0)

    // Manager advances past Transition Scene -> Question 2 (Survey) begins
    await advanceSceneBtn.click()

    // Question 2 (Survey) answers appear for Alice
    await expect(alice.getByText("Great", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await answer(alice, "Great")
    await endRecordedVote(manager, hostWire, { questionId: q2Id, count: 1 })
    await expect(
      manager.getByRole("button", { name: /^1 Great/u }),
    ).toContainText("100%")

    // Manager advances survey reveal -> finish
    await next(manager)

    // 7. Verify finish podium (since Q1 was scored quiz, mixed finish delivers STATUS.FINISHED with podium!)
    await expect
      .poll(
        () =>
          hostWire.findLast((row) => row.name === STATUS.FINISHED)?.data.top,
      )
      .toEqual([{ username: "Alice", points: quizResult?.myPoints }])
    await expect
      .poll(
        () => aliceWire.findLast((row) => row.name === STATUS.FINISHED)?.data,
      )
      .toMatchObject({
        top: [{ username: "Alice", points: quizResult?.myPoints }],
        rank: 1,
      })
    await expect(manager.getByText("Alice", { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(
      manager.getByRole("button", { name: t("common:exit"), exact: true }),
    ).toBeVisible()
    await expect(
      alice.getByText(t("game:rank", { count: 1, ordinal: true }), {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      alice.getByText(`${String(quizResult?.myPoints)} pts`, { exact: true }),
    ).toBeVisible()
    const steps = hostWire
      .filter((row) => row.name === EVENTS.EXTENSIONS.STATE)
      .map(
        (row) => liveRecord(liveRecord(row.data.extras).activeTimelineStep).id,
      )
      .filter((id): id is string => typeof id === "string")
    expect(steps.filter((id, index) => id !== steps[index - 1])).toEqual(
      extras.timeline.map((item) => item.id),
    )
    await saveScreenshot(manager, "09_live_finish_podium.png")
  })
})
