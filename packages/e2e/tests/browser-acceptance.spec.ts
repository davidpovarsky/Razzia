import fs from "node:fs"
import { join } from "node:path"
import { BASIC_QUIZZ, CONFIG_PATH } from "@razzia/e2e/utils/constants"
import {
  addAnswer,
  answerInput,
  openQuizzTab,
  quizzRow,
  seedQuizz,
  toggleSolution,
} from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, confirm, joinGame } from "@razzia/e2e/utils/player"
import {
  buildXlsxBuffer,
  createDefaultQuizExtras,
} from "@razzia/extensions/core"
import {
  EXTENSION_LOCALES,
  type SupportedExtensionLanguage,
} from "@razzia/extensions/locales"
import { RealRazziaTransport } from "@razzia/extensions/server"
import {
  KeypadSimulatorCore,
  MockProvider,
  TelephonyBridge,
} from "@razzia/extensions/telephony"
import type { Page } from "@playwright/test"

const ARTIFACT_DIR =
  "C:/Users/DAVID/.gemini/antigravity/brain/6d40cc89-dc92-44aa-8a69-161ad5015706"
const SCREENSHOT_DIR = join(import.meta.dirname, "../test-results/screenshots")

const saveScreenshots = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const p1 = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: p1 })

  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
    const p2 = join(ARTIFACT_DIR, filename)
    fs.copyFileSync(p1, p2)
  } catch {
    /* Ignore */
  }
}

test.describe("GATE 3: Browser Acceptance & Real-World UI Verification", () => {
  test("Scenario 1: QuizzEditorProvider Lifecycle, Enhancements, First-Save Disk Persistence & Stable Asset Association", async ({
    page,
  }) => {
    const subject = `Real App Lifecycle Quiz ${Date.now()}`

    // 1. Open Quizz tab and click Create Quiz
    await openQuizzTab(page)
    await page.getByRole("button", { name: t("manager:quizz.create") }).click()
    await expect(page).toHaveURL(/\/manager\/quizz$/u)

    // 2. Fill Subject & Question 1
    await page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")).fill(subject)
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("What is the chemical symbol for Hydrogen?")
    await answerInput(page, 0).fill("H")
    await answerInput(page, 1).fill("He")
    await addAnswer(page)
    await answerInput(page, 2).fill("Li")
    await addAnswer(page)
    await answerInput(page, 3).fill("Be")
    await toggleSolution(page, 0)

    // 3. Open Enhancements Panel
    const toggleBtn = page.locator('[data-testid="toggle-enhancements-button"]')
    await expect(toggleBtn).toBeVisible()
    await toggleBtn.click({ force: true })

    const enhancementPanel = page.locator(
      '[data-testid="editor-enhancement-panel"]',
    )
    await expect(enhancementPanel).toBeVisible()

    // 4. Configure Visuals Tab (Answer 0 Image, Answer 1 Both)
    const tabVisuals = page.locator('[data-testid="tab-visuals"]')
    await tabVisuals.click()
    await expect(page.locator('[data-testid="panel-visuals"]')).toBeVisible()

    const displaySelect0 = page.locator('[data-testid="display-select-0"]')
    await expect(displaySelect0).toBeVisible()
    await displaySelect0.selectOption("image")
    const mediaInput0 = page.locator('[data-testid="media-url-input-0"]')
    await expect(mediaInput0).toBeVisible()
    await mediaInput0.fill("/media/blue-sky.png")
    const altInput0 = page.locator('[data-testid="alt-input-0"]')
    await expect(altInput0).toBeVisible()
    await altInput0.fill("Hydrogen gas cloud")

    const displaySelect1 = page.locator('[data-testid="display-select-1"]')
    await expect(displaySelect1).toBeVisible()
    await displaySelect1.selectOption("both")
    const mediaInput1 = page.locator('[data-testid="media-url-input-1"]')
    await expect(mediaInput1).toBeVisible()
    await mediaInput1.fill("/media/blue-sky.png")
    const altInput1 = page.locator('[data-testid="alt-input-1"]')
    await expect(altInput1).toBeVisible()
    await altInput1.fill("Helium balloon")

    // 5. Configure Teams Tab
    const tabTeams = page.locator('[data-testid="tab-teams"]')
    await tabTeams.click()
    await expect(page.locator('[data-testid="panel-teams"]')).toBeVisible()

    const toggleTeams = page.locator('[data-testid="toggle-teams"]')
    await toggleTeams.click()
    const addTeamBtn = page.locator('[data-testid="add-team-button"]')
    await expect(addTeamBtn).toBeVisible()
    await addTeamBtn.click()

    // 6. Configure Leaderboard Tab
    const tabLeaderboard = page.locator('[data-testid="tab-leaderboard"]')
    await tabLeaderboard.click()
    await expect(
      page.locator('[data-testid="panel-leaderboard"]'),
    ).toBeVisible()

    const radioEveryN = page.locator('[data-testid="mode-radio-everyN"]')
    await radioEveryN.click()
    const everyNInput = page.locator('[data-testid="every-n-input"]')
    await everyNInput.fill("2")

    // 7. Configure Interlude Tab on Q1
    const tabInterlude = page.locator('[data-testid="tab-interlude"]')
    await tabInterlude.click()
    await expect(page.locator('[data-testid="panel-interlude"]')).toBeVisible()
    const toggleInterlude = page.locator('[data-testid="toggle-interlude"]')
    await toggleInterlude.click()

    // Save screenshot of editor enhancements
    await saveScreenshots(page, "gate3-editor-enhancements.png")

    // 8. Save brand new quiz for the first time via createQuizComposite
    const savePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/extensions/quizzes") &&
        (res.status() === 200 || res.status() === 201),
    )
    const saveBtn = page.getByRole("button", { name: t("common:save") })
    await saveBtn.click()
    const saveRes = await savePromise
    const saveJson = (await saveRes.json()) as {
      quizId: string
      revision: number
    }
    const actualQuizId = saveJson.quizId
    await expect(page).toHaveURL(/\/manager\/config$/u)

    // 9. VERIFY ACTUAL SERVER DISK PERSISTENCE FOR FIRST-SAVE
    const sidecarPath = join(
      CONFIG_PATH,
      "extensions",
      "quizzes",
      `${actualQuizId}.json`,
    )
    expect(fs.existsSync(sidecarPath)).toBe(true)

    // Locate base quiz on disk by actualQuizId
    const baseFiles = fs.readdirSync(join(CONFIG_PATH, "quizz"))
    const baseQuizRecord = baseFiles
      .map(
        (file) =>
          JSON.parse(
            fs.readFileSync(join(CONFIG_PATH, "quizz", file), "utf-8"),
          ) as { id: string; subject: string; questions: unknown[] },
      )
      .find((q) => q.id === actualQuizId)
    expect(baseQuizRecord).toBeDefined()
    expect(baseQuizRecord?.subject).toBe(subject)
    expect(baseQuizRecord?.questions).toHaveLength(1)

    const sidecarData = JSON.parse(fs.readFileSync(sidecarPath, "utf-8")) as {
      revision?: number
      teams?: { enabled: boolean }
      leaderboard?: { mode: string; everyN?: number }
      questionIds: string[]
      perQuestion: Record<
        string,
        {
          answerVisuals?: Array<{ alt: string }>
          interlude?: { kind: string }
        }
      >
    }
    expect(sidecarData.revision).toBe(1)
    expect(sidecarData.teams?.enabled).toBe(true)
    expect(sidecarData.leaderboard?.mode).toBe("everyN")
    expect(sidecarData.leaderboard?.everyN).toBe(2)
    expect(sidecarData.questionIds).toHaveLength(1)
    const [initialQ0Id] = sidecarData.questionIds
    expect(sidecarData.perQuestion[initialQ0Id]?.answerVisuals?.[0]?.alt).toBe(
      "Hydrogen gas cloud",
    )
    expect(sidecarData.perQuestion[initialQ0Id]?.interlude?.kind).toBe("title")

    // 10. Reopen the quiz and test QuizzEditorProvider Lifecycle
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/manager/quizz/${actualQuizId}$`, "u"),
    )
    await toggleBtn.click({ force: true })
    await expect(enhancementPanel).toBeVisible()

    // 11. Add Question 2
    await page.getByRole("button", { name: t("quizz:addQuestion") }).click()
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("What is the boiling point of water?")
    await answerInput(page, 0).fill("100 C")
    await answerInput(page, 1).fill("0 C")
    await toggleSolution(page, 0)

    // 12. Duplicate Question 1
    // Hover and click Duplicate on Question 1 in sidebar
    const card1 = page.locator("aside").getByText("1").first()
    await card1.click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("What is the chemical symbol for Hydrogen?")

    await card1.hover()
    const duplicateBtn = page.getByRole("button", {
      name: t("quizz:question.duplicateQuestion", {
        defaultValue: "Duplicate question",
      }),
      exact: true,
    })
    await duplicateBtn.click()

    // Verify 3 questions now exist in sidebar
    await expect(page.locator("aside").getByText("3")).toBeVisible()

    // 13. Delete Question 3 (water question, which shifted to 3 after insertion at 1)
    const card3 = page.locator("aside").getByText("3").first()
    await card3.click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("What is the boiling point of water?")

    await card3.hover()
    const deleteBtn = page.getByRole("button", {
      name: t("quizz:question.deleteQuestion"),
      exact: true,
    })
    await deleteBtn.click()
    const confirmDeleteBtn = page.getByRole("button", {
      name: t("common:delete"),
    })
    await expect(confirmDeleteBtn).toBeVisible()
    await confirmDeleteBtn.click()

    // 14. Save the modified quiz
    const savePromise2 = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().includes(`/api/extensions/quizzes/${actualQuizId}`) &&
        res.status() === 200,
    )
    await saveBtn.click()
    await savePromise2
    await expect(page).toHaveURL(/\/manager\/config$/u)

    // 15. Verify disk persistence after lifecycle operations
    const sidecarData2 = JSON.parse(
      fs.readFileSync(sidecarPath, "utf-8"),
    ) as typeof sidecarData
    expect(sidecarData2.revision).toBe(2)
    expect(sidecarData2.questionIds).toHaveLength(2)

    const [finalQ0, finalQ1] = sidecarData2.questionIds
    expect(finalQ0).toBe(initialQ0Id)
    expect(sidecarData2.perQuestion[finalQ0]?.answerVisuals?.[0]?.alt).toBe(
      "Hydrogen gas cloud",
    )
    expect(finalQ1).not.toBe(finalQ0)
    expect(sidecarData2.perQuestion[finalQ1]?.answerVisuals?.[0]?.alt).toBe(
      "Hydrogen gas cloud",
    )
    expect(Object.keys(sidecarData2.perQuestion)).toHaveLength(2)
  })

  test("Scenario 2: Asynchronous Sidecar-Loading Race Condition Handling", async ({
    page,
  }) => {
    const subject = `Async Race Quizz ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    // 1. Seed quiz with extension sidecar on disk
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "Original Question One",
          answers: ["Ans A", "Ans B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const qIds = [crypto.randomUUID()]
    const extras = createDefaultQuizExtras(quizzId, qIds, "c".repeat(64))
    extras.perQuestion[qIds[0]] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/blue-sky.png",
          alt: "Sidecar Photo",
        },
      ],
    }
    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 2. Intercept composite API request and delay response by 1200ms
    await page.route(`**/api/extensions/quizzes/${quizzId}`, async (route) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1200)
      })
      await route.continue()
    })

    // 3. Open quiz in editor
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizzId}$`, "u"))

    // 4. Begin typing/editing immediately before the 1200ms delay finishes
    const questionInput = page.getByPlaceholder(t("quizz:question.placeholder"))
    await questionInput.fill("Question Edited Before Sidecar Resolved")

    // 5. Wait for the sidecar response to arrive and complete
    await page.waitForResponse((res) =>
      res.url().includes(`/api/extensions/quizzes/${quizzId}`),
    )

    // 6. Assert user edits are NOT silently overwritten by delayed sidecar response
    await expect(questionInput).toHaveValue(
      "Question Edited Before Sidecar Resolved",
    )

    // 7. Verify the sidecar attachment is still associated with this question
    const toggleBtn = page.locator('[data-testid="toggle-enhancements-button"]')
    await toggleBtn.click({ force: true })
    const tabVisuals = page.locator('[data-testid="tab-visuals"]')
    await tabVisuals.click()
    const altInput0 = page.locator('[data-testid="alt-input-0"]')
    await expect(altInput0).toBeVisible()
    await expect(altInput0).toHaveValue("Sidecar Photo")

    // 8. Save and verify server persistence reflects both user edit and sidecar extras
    const savePromise = page.waitForResponse(
      (res) => res.url().includes("/quizz") && res.status() === 200,
    )
    const saveBtn = page.getByRole("button", { name: t("common:save") })
    await saveBtn.click()
    await savePromise
    await expect(page).toHaveURL(/\/manager\/config$/u)

    const savedBase = JSON.parse(
      fs.readFileSync(join(CONFIG_PATH, "quizz", `${quizzId}.json`), "utf-8"),
    ) as { questions: Array<{ question: string }> }
    expect(savedBase.questions[0].question).toBe(
      "Question Edited Before Sidecar Resolved",
    )
  })

  test("Scenario 3: HTTP 409 Conflict Handling with Two Real Editing Sessions (Cancel, Reload, and Confirmed Force Overwrite)", async ({
    page: session1,
    newPage,
  }) => {
    const subject = `Conflict 409 Quiz ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    // 1. Seed quiz with sidecar extras (revision 1)
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "Conflict Testing Question",
          answers: ["Option 1", "Option 2"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    const qIds = [crypto.randomUUID()]
    const extras = createDefaultQuizExtras(quizzId, qIds, "d".repeat(64))
    extras.leaderboard = { mode: "everyN", everyN: 1 }
    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 2. Open Session 1 and Session 2 on the same quiz
    await openQuizzTab(session1)
    await quizzRow(session1, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(session1).toHaveURL(
      new RegExp(`/manager/quizz/${quizzId}$`, "u"),
    )

    const session2 = await newPage()
    await openQuizzTab(session2)
    await quizzRow(session2, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(session2).toHaveURL(
      new RegExp(`/manager/quizz/${quizzId}$`, "u"),
    )

    // 3. Session 1 modifies Leaderboard everyN to 5 and saves (revision becomes 2)
    const toggle1 = session1.locator(
      '[data-testid="toggle-enhancements-button"]',
    )
    await toggle1.click({ force: true })
    await session1.locator('[data-testid="tab-leaderboard"]').click()
    const everyN1 = session1.locator('[data-testid="every-n-input"]')
    await expect(everyN1).toBeVisible()
    await everyN1.fill("5")

    const savePromise1 = session1.waitForResponse(
      (res) => res.url().includes("/quizz") && res.status() === 200,
    )
    await session1.getByRole("button", { name: t("common:save") }).click()
    await savePromise1
    await expect(session1).toHaveURL(/\/manager\/config$/u)

    // Verify disk revision advanced to 2
    const diskSidecar1 = JSON.parse(
      fs.readFileSync(join(sidecarDir, `${quizzId}.json`), "utf-8"),
    ) as { revision: number; leaderboard?: { everyN?: number } }
    expect(diskSidecar1.revision).toBe(2)
    expect(diskSidecar1.leaderboard?.everyN).toBe(5)

    // 4. Session 2 (has expectedRevision 1) modifies everyN to 3 and tries to save -> 409 Conflict
    const toggle2 = session2.locator(
      '[data-testid="toggle-enhancements-button"]',
    )
    await toggle2.click({ force: true })
    await session2.locator('[data-testid="tab-leaderboard"]').click()
    const everyN2 = session2.locator('[data-testid="every-n-input"]')
    await expect(everyN2).toBeVisible()
    await everyN2.fill("3")

    const conflictPromise = session2.waitForResponse(
      (res) =>
        res.url().includes(`/api/extensions/quizzes/${quizzId}`) &&
        res.status() === 409,
    )
    await session2.getByRole("button", { name: t("common:save") }).click()
    await conflictPromise

    // Conflict modal must appear
    const conflictModal = session2.locator('[data-testid="conflict-modal"]')
    await expect(conflictModal).toBeVisible()
    await expect(
      session2.locator('[data-testid="conflict-title"]'),
    ).toBeVisible()

    await saveScreenshots(session2, "gate3-editor-conflict-modal.png")

    // 5. Step A: Test CANCEL in conflict modal
    const cancelBtn = session2.locator('[data-testid="conflict-cancel-button"]')
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()
    await expect(conflictModal).toBeHidden()
    // Verify user edits are preserved after cancel
    await expect(everyN2).toHaveValue("3")

    // 6. Step B: Test RELOAD in conflict modal
    await session2.getByRole("button", { name: t("common:save") }).click()
    await expect(conflictModal).toBeVisible()
    const reloadBtn = session2.locator('[data-testid="conflict-reload-button"]')
    await expect(reloadBtn).toBeVisible()
    await reloadBtn.click()
    await expect(conflictModal).toBeHidden()
    // Verify latest server value (5) reloaded into form
    await expect(everyN2).toHaveValue("5")

    // 7. Step C: Test CONFIRMED FORCE OVERWRITE
    // Session 1 makes another change and saves (revision becomes 3)
    await openQuizzTab(session1)
    await quizzRow(session1, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await toggle1.click({ force: true })
    await session1.locator('[data-testid="tab-leaderboard"]').click()
    await session1.locator('[data-testid="every-n-input"]').fill("9")
    const savePromise3 = session1.waitForResponse(
      (res) => res.url().includes("/quizz") && res.status() === 200,
    )
    await session1.getByRole("button", { name: t("common:save") }).click()
    await savePromise3
    await expect(session1).toHaveURL(/\/manager\/config$/u)

    // Now Session 2 edits everyN to 7 (has expectedRevision 2, server is 3)
    await everyN2.fill("7")
    await session2.getByRole("button", { name: t("common:save") }).click()
    await expect(conflictModal).toBeVisible()

    // Click Force Overwrite -> Confirmation banner appears
    const overwriteBtn = session2.locator(
      '[data-testid="conflict-overwrite-button"]',
    )
    await expect(overwriteBtn).toBeVisible()
    await overwriteBtn.click()

    const confirmOverwriteBtn = session2.locator(
      '[data-testid="conflict-confirm-overwrite-button"]',
    )
    await expect(confirmOverwriteBtn).toBeVisible()
    await saveScreenshots(session2, "gate3-editor-conflict-overwrite.png")

    // Confirm Force Overwrite -> Saves with expectedRevision: null
    const overwritePromise = session2.waitForResponse(
      (res) =>
        res.url().includes(`/api/extensions/quizzes/${quizzId}`) &&
        res.status() === 200,
    )
    await confirmOverwriteBtn.click()
    await overwritePromise
    await expect(session2).toHaveURL(/\/manager\/config$/u)

    // Verify disk has overwritten value with incremented revision
    const diskSidecarFinal = JSON.parse(
      fs.readFileSync(join(sidecarDir, `${quizzId}.json`), "utf-8"),
    ) as { revision: number; leaderboard?: { everyN?: number } }
    expect(diskSidecarFinal.revision).toBe(4)
    expect(diskSidecarFinal.leaderboard?.everyN).toBe(7)
  })

  test("Scenario 4: Live Gameplay - Manager + 2 Web Players + Simulated Phone, Teams, Reveal & Reconnect", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `Gameplay Team Quizz ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    // 1. Seed quiz with extension extras (teams and reveal)
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "Which planet is known as the Red Planet?",
          answers: ["Mars", "Venus", "Jupiter", "Saturn"],
          solutions: [0],
          media: {
            type: "image",
            url: "/media/blue-sky.png",
          },
          cooldown: 3,
          time: 60,
        },
        {
          type: "single",
          question: "What is 10 + 10?",
          answers: ["20", "30", "40", "50"],
          solutions: [0],
          cooldown: 3,
          time: 60,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const qIds = [crypto.randomUUID(), crypto.randomUUID()]
    const extras = createDefaultQuizExtras(quizzId, qIds, "a".repeat(64))
    extras.leaderboard = {
      mode: "everyN",
      everyN: 1,
    }
    extras.teams = {
      enabled: true,
      autoAssign: "roundRobin",
      teams: [
        { id: "team-alpha", name: "Alpha Falcons", color: "#3b82f6" },
        { id: "team-bravo", name: "Bravo Lions", color: "#ef4444" },
      ],
    }
    extras.perQuestion = {
      [qIds[0]]: {
        reveal: {
          effect: "blur",
          durationMs: 1500,
          trigger: "automatic",
          audience: "all",
        },
        answerVisuals: [
          {
            answerIndex: 0,
            display: "both",
            url: "/media/blue-sky.png",
            alt: "Clear blue sky",
          },
        ],
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 2. Create game as authenticated manager
    const pin = await createGame(manager, subject)

    // 3. Join Web Player 1 (Alice)
    const player1 = await newPage()
    await joinGame(player1, pin, "Alice")
    await expect(manager.getByText("Alice").first()).toBeVisible()

    // 4. Join Web Player 2 (Bob)
    const player2 = await newPage()
    await joinGame(player2, pin, "Bob")
    await expect(manager.getByText("Bob").first()).toBeVisible()

    // 5. Connect Real Telephone Player via RealRazziaTransport + TelephonyBridge
    const realTransport = new RealRazziaTransport()
    const mockProvider = new MockProvider({
      secret: "e2e-secret-that-is-at-least-32-characters",
    })
    const bridge = new TelephonyBridge({
      transport: realTransport,
      provider: mockProvider,
      baseUrl: "http://localhost:3001",
    })
    const sim = new KeypadSimulatorCore(bridge, { callId: "browser_phone_001" })
    await sim.startCall("07700900101")
    const joinDirective = await sim.enterDigits(pin)
    expect(joinDirective.message).toContain("Connected as Phone")
    expect(bridge.getActiveSessionsCount()).toBe(1)

    // Verify Lobby Team Assignment and Player badges
    await expect(
      manager.locator('[data-testid="lobby-team-assignment"]'),
    ).toBeVisible()
    await expect(
      manager.locator('[data-testid="lobby-team-card-team-alpha"]'),
    ).toBeVisible()
    await expect(
      manager.locator('[data-testid="lobby-team-card-team-bravo"]'),
    ).toBeVisible()
    await expect(manager.getByText(/Phone/u).first()).toBeVisible()
    await expect(
      manager.locator('[data-testid="lobby-team-card-team-alpha"]'),
    ).toContainText("Alpha Falcons")
    await expect(
      manager.locator('[data-testid="lobby-team-card-team-bravo"]'),
    ).toContainText("Bravo Lions")

    await saveScreenshots(manager, "gate3-lobby-players-teams.png")

    // 6. Start the Game
    await startGame(manager)

    // 7. Verify Question 1 Reveal Media
    const revealContainer = manager.locator(
      '[data-testid="reveal-media-container"]',
    )
    await expect(revealContainer).toBeVisible()
    expect(await revealContainer.getAttribute("data-effect")).toBe("blur")
    const revealImg = manager.locator('[data-testid="reveal-media-image"]')
    await expect(revealImg).toBeVisible()
    await expect(revealContainer).toHaveAttribute("data-revealed", "true", {
      timeout: 10000,
    })

    // 8. Phone player answers correctly via DTMF '1' ("Mars")
    const dtmfDirective = await sim.pressKey("1")
    expect(dtmfDirective.message).toContain("submitted")

    // 9. Player 1 (Alice) answers ("Mars")
    await answer(player1, "Mars")

    // 10. Host ends timer early via host toolbar button (before natural countdown expires)
    const endTimerBtn = manager.getByRole("button", {
      name: t("extensions:host.endTimer"),
    })
    await expect(endTimerBtn).toBeVisible()
    await endTimerBtn.click()

    // 11. Results revealed immediately upon timer end
    await expect(player1.getByText(t("game:correct"))).toBeVisible()
    const player1Score = player1.locator("div.rounded-lg.bg-gray-800")
    await expect(player1Score).not.toHaveText("0")

    // 12. Player 2 reconnect test (simulates connection drop & rejoin during results)
    await player2.reload()
    expect(
      player2
        .getByText(t("game:reconnecting"))
        .or(player2.getByRole("button", { name: /^A /u })),
    ).toBeDefined()

    await next(manager)
    const teamLeaderboard = manager.locator(
      '[data-testid="team-leaderboard-panel"]',
    )
    await expect(teamLeaderboard).toBeVisible()
    await expect(
      manager.locator('[data-testid="team-score-row-team-alpha"]'),
    ).toBeVisible()
    await expect(
      manager.locator('[data-testid="team-score-row-team-bravo"]'),
    ).toBeVisible()
    await saveScreenshots(manager, "gate3-gameplay-reveal-leaderboard.png")

    // 12. Advance to Question 2
    await next(manager)
    await expect(manager.getByText("2 / 2")).toBeVisible()
    await expect(player1.getByText("2 / 2")).toBeVisible()

    // Clean up telephone call
    await sim.hangup()
    expect(bridge.getActiveSessionsCount()).toBe(0)
  })

  test("Scenario 5: Backwards Compatibility & 8 Locales Verification", async ({
    page,
  }) => {
    // 1. Vanilla quiz execution without extensions
    const vanillaPin = await createGame(page, BASIC_QUIZZ)
    expect(vanillaPin).toMatch(/^\d{6}$/u)
    await saveScreenshots(page, "gate3-vanilla-feature-off.png")

    // Seed a quiz to test editor localization
    const locSubject = `Localized Quiz ${Date.now()}`
    const locQuizzId = locSubject.toLowerCase().replace(/\W+/gu, "-")
    seedQuizz(locSubject, {
      questions: [
        {
          type: "single",
          question: "Translation test question",
          answers: ["One", "Two"],
          solutions: [0],
          cooldown: 3,
          time: 15,
        },
      ],
    })

    // 2. Verify all 8 locales render without missing keys or crashes
    const locales: SupportedExtensionLanguage[] = [
      "en",
      "fr",
      "de",
      "es",
      "it",
      "ja",
      "tr",
      "vi",
    ]

    /* oxlint-disable eslint/no-await-in-loop */
    for (const loc of locales) {
      // Check landing page
      await page.goto(`/?lng=${loc}`)
      await expect(page.locator("body")).toBeVisible()

      const bodyText = (await page.locator("body").textContent()) ?? ""
      expect(bodyText).not.toContain("errors:")
      expect(bodyText).not.toContain("quizz:")
      expect(bodyText).not.toContain("common:")
      expect(bodyText).not.toContain("extensions:")

      // Open quiz editor in this locale directly
      await page.goto(`/manager/quizz/${locQuizzId}?lng=${loc}`)
      await expect(page).toHaveURL(
        new RegExp(`/manager/quizz/${locQuizzId}`, "u"),
      )

      // Open enhancements panel
      const toggleBtn = page.locator(
        '[data-testid="toggle-enhancements-button"]',
      )
      await expect(toggleBtn).toBeVisible()
      await toggleBtn.click({ force: true })

      const enhancementPanel = page.locator(
        '[data-testid="editor-enhancement-panel"]',
      )
      await expect(enhancementPanel).toBeVisible()

      // Verify localized tab labels
      const locData = EXTENSION_LOCALES[loc]
      await expect(page.locator('[data-testid="tab-visuals"]')).toContainText(
        locData.tabs.visuals,
      )
      await expect(page.locator('[data-testid="tab-interlude"]')).toContainText(
        locData.tabs.interludes,
      )
      await expect(
        page.locator('[data-testid="tab-leaderboard"]'),
      ).toContainText(locData.tabs.leaderboard)
      await expect(page.locator('[data-testid="tab-teams"]')).toContainText(
        locData.tabs.teams,
      )
      await expect(page.locator('[data-testid="tab-audio"]')).toContainText(
        locData.tabs.audio,
      )

      // Click Teams tab and verify localized elements
      await page.locator('[data-testid="tab-teams"]').click()
      await expect(page.locator('[data-testid="panel-teams"]')).toBeVisible()
      await expect(page.locator('[data-testid="panel-teams"]')).toContainText(
        locData.teams.enableTeams,
      )

      // Click Audio tab and verify localized elements
      await page.locator('[data-testid="tab-audio"]').click()
      await expect(page.locator('[data-testid="panel-audio"]')).toBeVisible()
      await expect(page.locator('[data-testid="panel-audio"]')).toContainText(
        locData.audio.cuesTitle,
      )

      // Verify no untranslated keys exist in panel
      const panelContent = (await enhancementPanel.textContent()) ?? ""
      expect(panelContent).not.toContain("extensions:")
      expect(panelContent).not.toContain("errors:")
    }
    /* oxlint-enable eslint/no-await-in-loop */

    // Take screenshot of localized UI
    await page.goto("/?lng=fr")
    await saveScreenshots(page, "gate3-locales-verified.png")
  })

  test("Scenario 6: Wave 2 Phase A Full Flow - Real Browser Acceptance (Host Controls, Multi-Choice Bar Distribution, Previous/History, Replay Checkpoint, Interlude & Keyboard Navigation)", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `PhaseA Full Flow ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    // 1. Seed 3 questions
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "What is the capital of France?",
          answers: ["Paris", "London", "Berlin", "Madrid"],
          solutions: [0],
          cooldown: 3,
          time: 60,
        },
        {
          type: "multi",
          question: "Select prime numbers below 10:",
          answers: ["2", "3", "4", "5"],
          solutions: [0, 1, 3],
          cooldown: 3,
          time: 60,
        },
        {
          type: "single",
          question: "What is 2 + 2?",
          answers: ["4", "5"],
          solutions: [0],
          cooldown: 3,
          time: 60,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const qIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const extras = createDefaultQuizExtras(quizzId, qIds, "b".repeat(64))
    extras.leaderboard = {
      mode: "everyN",
      everyN: 1,
    }
    // Interlude on Q1
    extras.perQuestion = {
      [qIds[0]]: {
        interlude: {
          kind: "title",
          title: "Mid-Quiz Interlude",
          durationMs: 5000,
          advance: "manual",
        },
      },
    }

    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // 2. Create game as authenticated manager
    const pin = await createGame(manager, subject)

    // 3. Two browser players join
    const alice = await newPage()
    await joinGame(alice, pin, "Alice")
    await expect(manager.getByText("Alice").first()).toBeVisible()

    const bob = await newPage()
    await joinGame(bob, pin, "Bob")
    await expect(manager.getByText("Bob").first()).toBeVisible()

    // 4. Start the Game
    await startGame(manager)

    // 5. Question 1 begins: Alice answers "Paris", Bob does not answer
    await answer(alice, "Paris")

    // 6. Host ends timer via actual manager button (closes answers early without waiting 60s)
    const endTimerButton = manager.getByRole("button", {
      name: t("extensions:host.endTimer"),
    })
    await expect(endTimerButton).toBeVisible()
    await endTimerButton.click()

    // 7. Player answers are scored and personally displayed immediately upon timer end
    await expect(alice.getByText(t("game:correct"))).toBeVisible()
    const aliceScore = alice.locator("div.rounded-lg.bg-gray-800")
    await expect(aliceScore).not.toHaveText("0")

    // 8. Verify Responses screen & response bars (100% for Paris, 0% for others)
    await expect(manager.getByRole("button", { name: /Paris/u })).toContainText(
      "100%",
    )
    await expect(
      manager.getByRole("button", { name: /London/u }),
    ).toContainText("0%")

    // 8. Keyboard navigation: Host presses Space to advance to Leaderboard
    await manager.keyboard.press("Space")
    await expect(manager.getByText(t("game:leaderboard"))).toBeVisible()

    // 9. Advance to Interlude
    await next(manager)
    const interludePresenter = manager.locator(
      '[data-testid="interlude-presenter"]',
    )
    await expect(interludePresenter).toBeVisible()
    await expect(manager.getByText("Mid-Quiz Interlude")).toBeVisible()

    // Interlude manual skip produces exactly one transition to Question 2
    const skipInterludeBtn = manager.getByRole("button", {
      name: t("extensions:interludes.skipInterlude"),
    })
    await expect(skipInterludeBtn).toBeVisible()
    await skipInterludeBtn.click()

    // 10. Question 2 (Multi-choice) begins
    await expect(manager.getByText("2 / 3")).toBeVisible()
    await expect(alice.getByText("2 / 3")).toBeVisible()

    // Alice selects "2" and "3", submits
    await answer(alice, "2")
    await answer(alice, "3")
    await confirm(alice)

    // Bob selects "2" and "5", submits
    await answer(bob, "2")
    await answer(bob, "5")
    await confirm(bob)

    // Both players get personal results immediately
    await expect(alice.getByText(t("game:correct"))).toBeVisible()
    await expect(bob.getByText(t("game:correct"))).toBeVisible()

    // 11. Manager's response bars display authoritative multi-choice percentages (sum can exceed 100%)
    await expect(manager.getByRole("button", { name: /^A 2/u })).toContainText(
      "100%",
    )
    await expect(manager.getByRole("button", { name: /^B 3/u })).toContainText(
      "50%",
    )
    await expect(manager.getByRole("button", { name: /^D 5/u })).toContainText(
      "50%",
    )
    await expect(manager.getByRole("button", { name: /^C 4/u })).toContainText(
      "0%",
    )

    // 12. Host clicks Previous (History Viewer Modal)
    const previousBtn = manager.getByRole("button", {
      name: t("extensions:host.previous"),
    })
    await expect(previousBtn).toBeVisible()
    await previousBtn.click()

    // Verify modal is open with question 1 details and accurate respondent count (1 answer, not 2!)
    await expect(
      manager.getByRole("heading", { name: t("extensions:host.previous") }),
    ).toBeVisible()
    await expect(
      manager.getByText("What is the capital of France?"),
    ).toBeVisible()
    await expect(
      manager.getByText(t("extensions:host.answersCount", { count: 1 })),
    ).toBeVisible()

    // 13. Keyboard modal focus protection: pressing Space while modal is open does NOT trigger live action
    await manager.getByText("What is the capital of France?").click()
    await manager.keyboard.press("Space")
    await expect(
      manager.getByRole("heading", { name: t("extensions:host.previous") }),
    ).toBeVisible()

    // Escape closes the modal
    await manager.keyboard.press("Escape")
    await expect(
      manager.getByRole("heading", { name: t("extensions:host.previous") }),
    ).not.toBeVisible()

    // 14. Replay from Checkpoint
    await previousBtn.click()
    await expect(
      manager.getByRole("heading", { name: t("extensions:host.previous") }),
    ).toBeVisible()
    await manager.waitForTimeout(900)
    const replayBtn = manager.getByRole("button", {
      name: t("extensions:host.replayFromHere"),
    })
    await expect(replayBtn).toBeVisible()
    await replayBtn.click()

    // Confirm dialog
    await expect(
      manager.getByText(t("extensions:host.replayConfirmTitle")),
    ).toBeVisible()
    await manager.waitForTimeout(900)
    await manager
      .getByRole("button", { name: t("extensions:host.replayFromHere") })
      .last()
      .click()

    // 15. Verify Question 1 is restored (epoch rollback & new live question)
    await expect(manager.getByText("1 / 3")).toBeVisible({ timeout: 10000 })
    await expect(alice.getByText("1 / 3")).toBeVisible()
    await expect(bob.getByText("1 / 3")).toBeVisible()

    // 16. Reconnect & refresh test: Bob reloads page during Question 1
    await bob.reload()
    await expect(bob.locator("body")).toBeVisible()
    await answer(bob, "Paris")
    await expect(bob.getByText(t("game:correct"))).toBeVisible()

    // Manager immediately shows updated responses for replayed Question 1
    await expect(manager.getByRole("button", { name: /Paris/u })).toContainText(
      "100%",
    )
    await saveScreenshots(manager, "gate3-phase-a-flow-replay.png")
  })

  test("Scenario 7 (P0): Phone Roster, XLSX/CSV Import Preview, Full Unmasked Host Phone Numbers, Live Players Modal, and Truthful Bottom Counter", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `P0 Phone Roster Quiz ${Date.now()}`

    // 1. Open Quiz Editor and configure Roster tab with manual entry + XLSX import preview
    await openQuizzTab(manager)
    await manager
      .getByRole("button", { name: t("manager:quizz.create") })
      .click()
    await expect(manager).toHaveURL(/\/manager\/quizz$/u)

    await manager
      .getByPlaceholder(t("quizz:titleQuizzPlaceholder"))
      .fill(subject)
    await manager
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("What is 3 + 3?")
    await answerInput(manager, 0).fill("6")
    await answerInput(manager, 1).fill("7")
    await addAnswer(manager)
    await answerInput(manager, 2).fill("8")
    await addAnswer(manager)
    await answerInput(manager, 3).fill("9")
    await toggleSolution(manager, 0)

    const toggleBtn = manager.locator(
      '[data-testid="toggle-enhancements-button"]',
    )
    await toggleBtn.click({ force: true })
    await expect(
      manager.locator('[data-testid="editor-enhancement-panel"]'),
    ).toBeVisible()

    // Switch to Phone & Roster tab
    await manager.locator('[data-testid="tab-roster"]').click()
    await expect(manager.locator('[data-testid="panel-roster"]')).toBeVisible()

    // Toggle Phone Invite Only ON
    await manager.locator('[data-testid="toggle-phone-invite-only"]').check()

    // Add manual participant with Israeli phone
    await manager
      .locator('[data-testid="roster-name-input"]')
      .fill("Yossi Cohen")
    await manager
      .locator('[data-testid="roster-phone-input"]')
      .fill("050-333-4455")
    await manager.locator('[data-testid="roster-save-participant-btn"]').click()

    // Verify full unmasked phone number is visible in editor table
    await expect(
      manager.locator('[data-testid="roster-participants-table"]'),
    ).toContainText("Yossi Cohen")
    await expect(
      manager.locator('[data-testid="roster-participants-table"]'),
    ).toContainText("+972503334455")

    // Upload a real .xlsx file with 2 valid rows (+44 and +972) and 1 invalid row, verify preview, cancel first, then upload and approve
    const xlsxBytes = buildXlsxBuffer([
      ["name", "phone"],
      ["Miriam UK", "+447911223344"],
      ["Avi Israel", "052-888-9900"],
      ["Bad Row", "not-a-phone"],
    ])

    await manager.locator('[data-testid="roster-file-input"]').setInputFiles({
      name: "p0-participants.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(xlsxBytes),
    })

    const previewBox = manager.locator('[data-testid="roster-import-preview"]')
    await expect(previewBox).toBeVisible()
    await expect(previewBox).toContainText("Miriam UK")
    await expect(previewBox).toContainText("+447911223344")
    await expect(previewBox).toContainText("Invalid telephone number")

    // Cancel import first -> ensure Miriam UK is NOT added
    await manager.locator('[data-testid="roster-import-cancel-btn"]').click()
    await expect(previewBox).not.toBeVisible()
    await expect(
      manager.locator('[data-testid="roster-participants-table"]'),
    ).not.toContainText("Miriam UK")

    // Re-upload and click Approve & Import
    await manager.locator('[data-testid="roster-file-input"]').setInputFiles({
      name: "p0-participants.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(xlsxBytes),
    })
    await expect(previewBox).toBeVisible()
    await manager.locator('[data-testid="roster-import-approve-btn"]').click()
    await expect(previewBox).not.toBeVisible()

    // Verify all 3 valid participants and their FULL unmasked numbers are in the table
    const editorTable = manager.locator(
      '[data-testid="roster-participants-table"]',
    )
    await expect(editorTable).toContainText("Yossi Cohen")
    await expect(editorTable).toContainText("+972503334455")
    await expect(editorTable).toContainText("Miriam UK")
    await expect(editorTable).toContainText("+447911223344")
    await expect(editorTable).toContainText("Avi Israel")
    await expect(editorTable).toContainText("+972528889900")

    // Save quiz
    const savePromise = manager.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/extensions/quizzes") &&
        (res.status() === 200 || res.status() === 201),
    )
    await manager.getByRole("button", { name: t("common:save") }).click()
    await savePromise
    await expect(manager).toHaveURL(/\/manager\/config$/u)

    // 2. Start a live game from this quiz
    const pin = await createGame(manager, subject)

    // Verify bottom counter shows 0 / 3 initially (3 pre-registered in roster, 0 connected)
    const bottomCounter = manager.locator(
      '[data-testid="host-connected-counter"]',
    )
    await expect(bottomCounter).toHaveText("0 / 3")

    // 3. Yossi Cohen dials in via pilot-phone endpoint
    const yossiJoin = await manager.request.post("/api/games/pilot-phone", {
      data: {
        action: "join_or_poll",
        inviteCode: pin,
        callId: "yossi-live-call-1",
        phone: "050-333-4455",
      },
    })
    expect(yossiJoin.status()).toBe(200)

    // Bottom counter updates to 1 / 3
    await expect(bottomCounter).toHaveText("1 / 3")

    // Miriam UK dials in
    const miriamJoin = await manager.request.post("/api/games/pilot-phone", {
      data: {
        action: "join_or_poll",
        inviteCode: pin,
        callId: "miriam-live-call-1",
        phone: "+447911223344",
      },
    })
    expect(miriamJoin.status()).toBe(200)
    await expect(bottomCounter).toHaveText("2 / 3")

    // Web player joins (registeredTotal becomes 4, connectedNow becomes 3 -> 3 / 4)
    const webPlayer = await newPage()
    await joinGame(webPlayer, pin, "WebPlayerOne")
    await expect(bottomCounter).toHaveText("3 / 4")

    // 4. Start the game and open the Host Players / Status Modal during active question timer
    await startGame(manager)
    await expect(
      manager.getByRole("button", { name: t("extensions:host.endTimer") }),
    ).toBeVisible()

    // Open Host Players Modal
    await manager.locator('[data-testid="host-bottom-players-btn"]').click()
    const hostModal = manager.locator('[data-testid="host-players-modal"]')
    await expect(hostModal).toBeVisible()

    // Verify full unmasked phone numbers are shown in the live host modal
    const modalTable = manager.locator(
      '[data-testid="host-modal-players-table"]',
    )
    await expect(modalTable).toContainText("Yossi Cohen")
    await expect(modalTable).toContainText("+972503334455")
    await expect(modalTable).toContainText("Miriam UK")
    await expect(modalTable).toContainText("+447911223344")
    await expect(modalTable).toContainText("Avi Israel")
    await expect(modalTable).toContainText("+972528889900")
    await expect(modalTable).toContainText("WebPlayerOne")

    // Verify pressing Space while Host Players Modal is open does NOT end the question timer!
    await manager.locator('[data-testid="host-modal-search-input"]').click()
    await manager.keyboard.press("Space")
    await manager.locator('[data-testid="host-modal-search-input"]').fill("")
    await expect(
      manager.locator("button", { hasText: t("extensions:host.endTimer") }),
    ).toBeVisible()

    // 5. Simulate Yossi hanging up -> status becomes Disconnected and bottom counter becomes 2 / 4
    await manager.request.post("/api/games/pilot-phone", {
      data: {
        action: "hangup",
        inviteCode: pin,
        callId: "yossi-live-call-1",
        phone: "+972503334455",
      },
    })
    await expect(bottomCounter).toHaveText("2 / 4")
    await expect(
      manager.locator('[data-testid="kpi-disconnected"]'),
    ).toContainText("1")

    // 6. Yossi redials with a brand-new CallId -> status returns to Connected and bottom counter becomes 3 / 4
    await manager.request.post("/api/games/pilot-phone", {
      data: {
        action: "join_or_poll",
        inviteCode: pin,
        callId: "yossi-redial-call-2",
        phone: "050-333-4455",
      },
    })
    await expect(bottomCounter).toHaveText("3 / 4")

    // Verify webPlayer page DOM never contains any phone numbers
    const playerHtml = await webPlayer.content()
    expect(playerHtml).not.toContain("+972503334455")
    expect(playerHtml).not.toContain("+447911223344")

    await saveScreenshots(manager, "gate3-p0-host-players-modal.png")
    await manager.locator('[data-testid="host-players-close-btn"]').click()
    await expect(hostModal).not.toBeVisible()
  })
})
