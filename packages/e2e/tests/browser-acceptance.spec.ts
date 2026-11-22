import fs from "node:fs"
import { join } from "node:path"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import {
  BASIC_QUIZZ,
  CONFIG_PATH,
  TZILA_PILOT_SECRET,
} from "@razzia/e2e/utils/constants"
import {
  addAnswer,
  questionCard,
  answerInput,
  numberSetting,
  openQuizzTab,
  quizzRow,
  readQuizz,
  seedQuizz,
  toggleSolution,
} from "@razzia/e2e/utils/editor"
import { pngFile } from "@razzia/e2e/utils/media"
import {
  endRecordedVote,
  latestState,
  liveRecord,
  observeLiveFlow,
  setManualProgression,
  waitForRecordedVoting,
} from "@razzia/e2e/utils/extension-manager"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, confirm, joinGame } from "@razzia/e2e/utils/player"
import {
  buildXlsxBuffer,
  SHOW_THEME_AUDIO_EVENTS,
  createDefaultQuizExtras,
  computeCanonicalBaseDigest,
  EXTENSION_EVENTS,
  upgradeLegacyExtrasToV2,
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

const seedImage = (name: string) => {
  const file = pngFile(`${name}-${crypto.randomUUID()}`)
  const mediaDir = join(CONFIG_PATH, "media")
  fs.mkdirSync(mediaDir, { recursive: true })
  fs.writeFileSync(join(mediaDir, file.name), file.buffer, { flag: "wx" })

  return `/media/${file.name}`
}

const seededQuizz = (subject: string) => {
  const quizz = readQuizz(subject)

  if (!quizz) {
    throw new Error(`The actual seeded quiz is required: ${subject}`)
  }

  return quizz
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

    // Use the current native answer controls and the shared real media library.
    const mediaTag = `lifecycle-answer-${crypto.randomUUID()}`
    await page.getByTestId("answer-mode-0-image").click()
    await page.getByTestId("answer-pick-image-0").click()
    const library = page
      .getByRole("dialog", { name: t("quizz:media.library"), exact: true })
      .filter({ has: page.getByPlaceholder(t("quizz:media.search")) })
    await expect(library).toHaveCount(1)
    const uploadPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/api\/media\/?$/u.test(new URL(response.url()).pathname),
    )
    await library
      .locator("input[type=file][multiple]")
      .setInputFiles(pngFile(mediaTag))
    const uploadResponse = await uploadPromise
    expect(uploadResponse.status()).toBe(201)
    const uploaded = liveRecord(await uploadResponse.json())
    expect(uploaded.type).toBe("image")

    if (typeof uploaded.name !== "string" || typeof uploaded.url !== "string") {
      throw new Error(
        "The real media upload must return its stored name and URL",
      )
    }

    // The server normalizes and truncates upload names; select its actual result.
    await library.getByPlaceholder(t("quizz:media.search")).fill(uploaded.name)
    await library.getByTitle(uploaded.name, { exact: true }).click()
    await expect(library).toBeHidden()
    const firstPreview = page.getByTestId("answer-image-preview-0")
    await expect(firstPreview).toBeVisible()
    const uploadedImageUrl = await firstPreview.getAttribute("src")
    expect(uploadedImageUrl).toMatch(/^\/media\//u)
    expect(uploadedImageUrl).toBe(uploaded.url)
    await page.getByTestId("answer-alt-input-0").fill("Hydrogen gas cloud")
    await page.getByTestId("answer-mode-1-both").click()
    await page.getByTestId("answer-pick-image-1").click()
    await library.getByPlaceholder(t("quizz:media.search")).fill(uploaded.name)
    await library.getByTitle(uploaded.name, { exact: true }).click()
    await page.getByTestId("answer-alt-input-1").fill("Helium balloon")
    await expect(page.getByTestId("answer-image-preview-1")).toHaveAttribute(
      "src",
      uploadedImageUrl ?? "",
    )

    // Teams remain editable on the native Participants page.
    await page.getByTestId("studio-tab-participants").click()
    await expect(page.getByTestId("panel-teams")).toBeVisible()
    await page.getByTestId("toggle-teams").check()
    await page.getByTestId("add-team-button").click()

    // The single native policy editor updates both V2 defaults and runtime policy.
    await page.getByTestId("studio-tab-settings").click()
    const leaderboardSettings = page.getByTestId("studio-leaderboard-settings")
    await leaderboardSettings.getByRole("combobox").click()
    await page
      .getByRole("option", {
        name: t("extensions:studio.settings.policyEveryN"),
        exact: true,
      })
      .click()
    await page.getByTestId("every-n-input").fill("2")

    // Interludes in V2 are authored timeline cards, so edit the active representation.
    await page.getByTestId("studio-tab-questions").click()
    await page.getByTestId("editor-mode-advanced").click()
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", {
        name: t("extensions:timeline.transition"),
        exact: true,
      })
      .click()
    await page.getByTestId("studio-add-card-btn").click()
    await page.getByTestId("scene-title-input").fill("First-question interlude")

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
      schemaVersion: number
      defaults: { leaderboardPolicy: string }
      timeline: Array<{ kind: string; questionId?: string; sceneId?: string }>
      scenes: Record<string, { kind: string; title?: string }>
      teams?: { enabled: boolean }
      leaderboard?: { mode: string; everyN?: number }
      questionIds: string[]
      perQuestion: Record<
        string,
        {
          answerVisuals?: Array<{ alt: string; url?: string }>
          interlude?: { kind: string }
        }
      >
    }
    expect(sidecarData.schemaVersion).toBe(2)
    expect(sidecarData.revision).toBe(1)
    expect(sidecarData.defaults.leaderboardPolicy).toBe("everyN")
    expect(sidecarData.teams?.enabled).toBe(true)
    expect(sidecarData.leaderboard?.mode).toBe("everyN")
    expect(sidecarData.leaderboard?.everyN).toBe(2)
    expect(sidecarData.questionIds).toHaveLength(1)
    const [initialQ0Id] = sidecarData.questionIds
    expect(sidecarData.perQuestion[initialQ0Id]?.answerVisuals?.[0]?.alt).toBe(
      "Hydrogen gas cloud",
    )
    expect(sidecarData.perQuestion[initialQ0Id]?.answerVisuals?.[0]?.url).toBe(
      uploadedImageUrl,
    )
    expect(sidecarData.timeline.map((item) => item.kind)).toEqual([
      "question",
      "transition",
    ])
    const [, { sceneId: interludeSceneId }] = sidecarData.timeline
    expect(interludeSceneId).toBeTruthy()
    expect(sidecarData.scenes[interludeSceneId!]).toMatchObject({
      kind: "transition",
      title: "First-question interlude",
    })

    // 10. Reopen the quiz and test QuizzEditorProvider Lifecycle
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/manager/quizz/${actualQuizId}$`, "u"),
    )
    await expect(page.getByTestId("answer-alt-input-0")).toHaveValue(
      "Hydrogen gas cloud",
    )
    await expect(page.getByTestId("answer-image-preview-0")).toHaveAttribute(
      "src",
      uploadedImageUrl ?? "",
    )

    // 11. Add Question 2
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", { name: t("extensions:timeline.quiz"), exact: true })
      .click()
    await page.getByTestId("studio-add-card-btn").click()
    await page
      .getByPlaceholder(t("quizz:question.placeholder"))
      .fill("What is the boiling point of water?")
    await answerInput(page, 0).fill("100 C")
    await answerInput(page, 1).fill("0 C")
    await toggleSolution(page, 0)

    // 12. Duplicate Question 1
    // Hover and click Duplicate on Question 1 in sidebar
    const card1 = questionCard(page, 0)
    await card1.click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("What is the chemical symbol for Hydrogen?")

    await card1.hover()
    const duplicateBtn = card1.getByRole("button", {
      name: t("quizz:question.duplicateQuestion", {
        defaultValue: "Duplicate question",
      }),
      exact: true,
    })
    await duplicateBtn.click()

    // Verify 3 questions now exist in sidebar
    await expect(
      page
        .getByTestId("editor-timeline")
        .locator('[data-testid^="editor-question-card-"]'),
    ).toHaveCount(3)

    // 13. Delete Question 3 (water question, which shifted to 3 after insertion at 1)
    const card3 = questionCard(page, 2)
    await card3.click()
    await expect(
      page.getByPlaceholder(t("quizz:question.placeholder")),
    ).toHaveValue("What is the boiling point of water?")

    await card3.hover()
    const deleteBtn = card3.getByRole("button", {
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
    expect(sidecarData2.scenes[interludeSceneId!]).toEqual(
      sidecarData.scenes[interludeSceneId!],
    )
    expect(
      sidecarData2.timeline.filter((item) => item.kind === "transition"),
    ).toEqual([sidecarData.timeline[1]])
  })

  test("Scenario 2: Asynchronous Sidecar-Loading Race Condition Handling", async ({
    page,
  }) => {
    const subject = `Async Race Quizz ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    const imageUrl = seedImage("async-sidecar")

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
    const extras = createDefaultQuizExtras(
      quizzId,
      qIds,
      computeCanonicalBaseDigest(seededQuizz(subject)),
    )
    extras.perQuestion[qIds[0]] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: imageUrl,
          alt: "Sidecar Photo",
        },
      ],
    }
    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(extras, null, 2),
      "utf-8",
    )

    // Hold the real composite read before opening the editor. The current Studio
    // locks editing until identities and extras are ready, preventing this race.
    let releaseSidecar: () => void = () => undefined
    const sidecarGate = new Promise<void>((resolve) => {
      releaseSidecar = resolve
    })
    await page.route(`**/api/extensions/quizzes/${quizzId}`, async (route) => {
      if (route.request().method() === "GET") {
        await sidecarGate
      }

      await route.continue()
    })
    const compositeResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname === `/api/extensions/quizzes/${quizzId}`,
    )
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizzId}$`, "u"))
    const questionInput = page.getByPlaceholder(t("quizz:question.placeholder"))

    try {
      await expect(page.getByTestId("studio-load-state")).toBeVisible()
      await expect(questionInput).toHaveCount(0)
      await expect(page.getByTestId("editor-save-btn")).toBeDisabled()
      await expect(
        page.getByPlaceholder(t("quizz:titleQuizzPlaceholder")),
      ).toBeDisabled()
    } finally {
      releaseSidecar()
    }

    expect((await compositeResponse).status()).toBe(200)
    await expect(page.getByTestId("studio-load-state")).toHaveCount(0)
    await expect(questionInput).toHaveValue("Original Question One")
    await questionInput.fill("Question Edited After Sidecar Resolved")
    const altInput0 = page.getByTestId("answer-alt-input-0")
    await expect(altInput0).toBeVisible()
    await expect(altInput0).toHaveValue("Sidecar Photo")
    await expect(page.getByTestId("answer-image-preview-0")).toHaveAttribute(
      "src",
      imageUrl,
    )
    expect((await page.request.get(imageUrl)).status()).toBe(200)
    await expect(questionInput).toHaveValue(
      "Question Edited After Sidecar Resolved",
    )

    // The same composite save must persist both the real edit and its association.
    const savePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        new URL(res.url()).pathname === `/api/extensions/quizzes/${quizzId}` &&
        res.status() === 200,
    )
    await page.getByTestId("editor-save-btn").click()
    await savePromise
    await expect(page).toHaveURL(/\/manager\/config$/u)
    const savedBase = JSON.parse(
      fs.readFileSync(join(CONFIG_PATH, "quizz", `${quizzId}.json`), "utf-8"),
    ) as { questions: Array<{ question: string }> }
    expect(savedBase.questions[0].question).toBe(
      "Question Edited After Sidecar Resolved",
    )
    const savedExtras = JSON.parse(
      fs.readFileSync(join(sidecarDir, `${quizzId}.json`), "utf-8"),
    ) as {
      questionIds: string[]
      perQuestion: Record<string, { answerVisuals?: Array<{ alt: string }> }>
    }
    expect(savedExtras.questionIds).toEqual(qIds)
    expect(savedExtras.perQuestion[qIds[0]]?.answerVisuals?.[0]?.alt).toBe(
      "Sidecar Photo",
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
    const extras = createDefaultQuizExtras(
      quizzId,
      qIds,
      computeCanonicalBaseDigest(seededQuizz(subject)),
    )
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
    await session1.getByTestId("studio-tab-settings").click()
    const everyN1 = session1.locator('[data-testid="every-n-input"]')
    await expect(everyN1).toBeVisible()
    await everyN1.fill("5")

    const savePromise1 = session1.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        new URL(res.url()).pathname === `/api/extensions/quizzes/${quizzId}` &&
        res.status() === 200,
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
    await session2.getByTestId("studio-tab-settings").click()
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
    await session1.getByTestId("studio-tab-settings").click()
    await session1.locator('[data-testid="every-n-input"]').fill("9")
    const savePromise3 = session1.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        new URL(res.url()).pathname === `/api/extensions/quizzes/${quizzId}` &&
        res.status() === 200,
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

    const imageUrl = seedImage("phone-team-reveal")
    const hostWire = observeLiveFlow(manager)

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
            url: imageUrl,
          },
          cooldown: 3,
          time: 600,
        },
        {
          type: "single",
          question: "What is 10 + 10?",
          answers: ["20", "30", "40", "50"],
          solutions: [0],
          cooldown: 3,
          time: 600,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const qIds = [crypto.randomUUID(), crypto.randomUUID()]
    const extras = createDefaultQuizExtras(
      quizzId,
      qIds,
      computeCanonicalBaseDigest(seededQuizz(subject)),
    )
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
            url: imageUrl,
            alt: "Clear blue sky",
          },
        ],
      },
    }

    const liveExtras = upgradeLegacyExtrasToV2(seededQuizz(subject), extras, {
      quizId: quizzId,
      baseDigest: extras.baseDigest,
    })
    liveExtras.defaults.showTheme = {
      id: "razzia-original",
      version: "1.0.0",
      overrides: {},
    }
    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(liveExtras, null, 2),
      "utf-8",
    )

    // 2. Create game as authenticated manager
    const pin = await createGame(manager, subject)
    await setManualProgression(manager)
    expect((await manager.request.get(imageUrl)).status()).toBe(200)

    // 3. Join Web Player 1 (Alice)
    const player1 = await newPage()
    const player1Wire = observeLiveFlow(player1)
    await joinGame(player1, pin, "Alice")
    await expect(manager.getByText("Alice").first()).toBeVisible()

    // 4. Join Web Player 2 (Bob)
    const player2 = await newPage()
    const player2Wire = observeLiveFlow(player2)
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
      baseUrl: new URL(manager.url()).origin,
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
    await expect
      .poll(() =>
        revealImg.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true)
    await expect(revealContainer).toHaveAttribute("data-revealed", "true", {
      timeout: 10000,
    })

    // 8. Phone player answers correctly via DTMF '1' ("Mars")
    await waitForRecordedVoting(hostWire, qIds[0])
    const dtmfDirective = await sim.pressKey("1")
    expect(dtmfDirective.message).toContain("submitted")

    // 9. Player 1 (Alice) answers ("Mars")
    await answer(player1, "Mars")

    // 10. Host ends timer early via host toolbar button (before natural countdown expires)
    await endRecordedVote(manager, hostWire, { questionId: qIds[0], count: 2 })

    // 11. Results revealed immediately upon timer end
    await expect(player1.getByText(t("game:correct"))).toBeVisible()
    await expect
      .poll(
        () =>
          player1Wire.findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
            .correct,
      )
      .toBe(true)
    const player1Result = player1Wire.findLast(
      (row) => row.name === STATUS.SHOW_RESULT,
    )?.data
    expect(player1Result?.points).toBeGreaterThan(0)
    expect(player1Result?.myPoints).toBe(player1Result?.points)
    await expect(
      player1.getByTestId("native-razzia-player-result"),
    ).toContainText(`+${String(player1Result?.points)}`)

    // 12. Player 2 reconnect test (simulates connection drop & rejoin during results)
    const replayStart = player2Wire.length
    await player2.reload()
    await expect(
      player2.getByTestId("native-razzia-player-result"),
    ).toBeVisible()
    await expect
      .poll(
        () =>
          player2Wire
            .slice(replayStart)
            .findLast((row) => row.name === EVENTS.PLAYER.SUCCESS_RECONNECT)
            ?.data,
      )
      .toMatchObject({
        currentQuestion: { current: 1, total: 2 },
        status: {
          name: STATUS.SHOW_RESULT,
          data: { correct: false, points: 0, myPoints: 0 },
        },
        player: { username: "Bob", points: 0 },
      })
    await expect(
      player2.getByRole("button", { name: "1 Mars", exact: true }),
    ).toHaveCount(0)

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
      await page.goto(`/game?lng=${loc}`)
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

      const locData = EXTENSION_LOCALES[loc]
      await expect(page.getByTestId("studio-tab-questions")).toHaveText(
        locData.studio.tabs.questions,
      )
      await expect(page.getByTestId("studio-tab-participants")).toHaveText(
        locData.studio.tabs.participants,
      )
      await expect(page.getByTestId("studio-tab-settings")).toHaveText(
        locData.studio.tabs.settings,
      )
      const visuals = page.getByTestId("answer-display-mode-0")
      await expect(visuals).toContainText(locData.visuals.displayText)
      await expect(visuals).toContainText(locData.visuals.displayImage)
      await expect(visuals).toContainText(locData.visuals.displayBoth)

      await page.getByTestId("studio-tab-participants").click()
      await expect(page.getByTestId("panel-teams")).toBeVisible()
      await expect(page.getByTestId("panel-teams")).toContainText(
        locData.teams.enableTeams,
      )
      await expect(page.getByTestId("panel-roster")).toBeVisible()

      await page.getByTestId("studio-tab-settings").click()
      const nativeAudio = page
        .getByTestId("show-theme-settings")
        .locator("details")
        .filter({
          has: page
            .locator("summary")
            .getByText(locData.themes.sections.audio, { exact: true }),
        })
      await expect(nativeAudio).toHaveCount(1)
      await nativeAudio.locator("summary").click()
      for (const event of SHOW_THEME_AUDIO_EVENTS) {
        await expect(
          nativeAudio.getByTestId(`theme-audio-${event}`),
        ).toContainText(locData.themes.audio[event])
      }

      // Verify no untranslated keys exist in panel
      const panelContent =
        (await page.locator("#studio-content").textContent()) ?? ""
      expect(panelContent).not.toContain("extensions:")
      expect(panelContent).not.toContain("errors:")
    }
    /* oxlint-enable eslint/no-await-in-loop */

    // Take screenshot of localized UI
    await page.goto("/game?lng=fr")
    await saveScreenshots(page, "gate3-locales-verified.png")
  })

  test("Scenario 6: Wave 2 Phase A Full Flow - Real Browser Acceptance (Host Controls, Multi-Choice Bar Distribution, Previous/History, Replay Checkpoint, Interlude & Keyboard Navigation)", async ({
    page: manager,
    newPage,
  }) => {
    const subject = `PhaseA Full Flow ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    const hostWire = observeLiveFlow(manager)

    // 1. Seed 3 questions
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "What is the capital of France?",
          answers: ["Paris", "London", "Berlin", "Madrid"],
          solutions: [0],
          cooldown: 3,
          time: 600,
        },
        {
          type: "multi",
          question: "Select prime numbers below 10:",
          answers: ["2", "3", "4", "5"],
          solutions: [0, 1, 3],
          cooldown: 3,
          time: 600,
        },
        {
          type: "single",
          question: "What is 2 + 2?",
          answers: ["4", "5"],
          solutions: [0],
          cooldown: 3,
          time: 600,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const qIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const extras = createDefaultQuizExtras(
      quizzId,
      qIds,
      computeCanonicalBaseDigest(seededQuizz(subject)),
    )
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

    // The canonical migration makes the legacy interlude one active V2 card.
    const liveExtras = upgradeLegacyExtrasToV2(seededQuizz(subject), extras, {
      quizId: quizzId,
      baseDigest: extras.baseDigest,
    })
    liveExtras.defaults.showTheme = {
      id: "razzia-original",
      version: "1.0.0",
      overrides: {},
    }
    expect(liveExtras.timeline.map((item) => item.kind)).toEqual([
      "question",
      "transition",
      "question",
      "question",
    ])
    const [, transitionStep] = liveExtras.timeline

    if (transitionStep.kind !== "transition") {
      throw new Error("The migrated interlude must be one transition card")
    }

    const { sceneId: interludeSceneId } = transitionStep
    expect(interludeSceneId).toBeTruthy()
    fs.writeFileSync(
      join(sidecarDir, `${quizzId}.json`),
      JSON.stringify(liveExtras, null, 2),
      "utf-8",
    )

    // 2. Create game as authenticated manager
    const pin = await createGame(manager, subject)
    await setManualProgression(manager)

    // 3. Two browser players join
    const alice = await newPage()
    const aliceWire = observeLiveFlow(alice)
    await joinGame(alice, pin, "Alice")
    await expect(manager.getByText("Alice").first()).toBeVisible()

    const bob = await newPage()
    const bobWire = observeLiveFlow(bob)
    await joinGame(bob, pin, "Bob")
    await expect(manager.getByText("Bob").first()).toBeVisible()

    // 4. Start the Game
    await startGame(manager)

    // 5. Question 1 begins: Alice answers "Paris", Bob does not answer
    await waitForRecordedVoting(hostWire, qIds[0])
    await answer(alice, "Paris")

    // 6. Host ends timer via actual manager button (closes answers early without waiting 60s)
    await endRecordedVote(manager, hostWire, { questionId: qIds[0], count: 1 })

    // 7. Player answers are scored and personally displayed immediately upon timer end
    await expect(alice.getByText(t("game:correct"))).toBeVisible()
    await expect
      .poll(
        () =>
          aliceWire.findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
            .correct,
      )
      .toBe(true)
    const aliceResult = aliceWire.findLast(
      (row) => row.name === STATUS.SHOW_RESULT,
    )?.data
    expect(aliceResult?.points).toBeGreaterThan(0)
    expect(aliceResult?.myPoints).toBe(aliceResult?.points)
    await expect(
      alice.getByTestId("native-razzia-player-result"),
    ).toContainText(`+${String(aliceResult?.points)}`)

    // 8. Verify Responses screen & response bars (100% for Paris, 0% for others)
    await expect(manager.getByRole("button", { name: /Paris/u })).toContainText(
      "100%",
    )
    await expect(
      manager.getByRole("button", { name: /London/u }),
    ).toContainText("0%")

    // Current host navigation requires two matching ArrowRight presses.
    await manager.getByTestId("host-question-counter").click()
    const nextCommandCount = () =>
      hostWire.filter(
        (row) =>
          row.name === `sent:${EXTENSION_EVENTS.COMMAND}` &&
          row.data.action === "NEXT_SCREEN",
      ).length
    const beforeNext = nextCommandCount()
    await manager.keyboard.press("ArrowRight")
    expect(nextCommandCount()).toBe(beforeNext)
    await manager.keyboard.press("ArrowRight")
    await expect.poll(nextCommandCount).toBe(beforeNext + 1)
    await expect(
      manager.getByRole("heading", {
        name: t("game:leaderboard"),
        exact: true,
      }),
    ).toBeVisible()

    // 9. Advance to Interlude
    await next(manager)
    const interludePresenter = manager.getByTestId("studio-scene-presenter")
    await expect(interludePresenter).toHaveCount(1)
    await expect(interludePresenter).toBeVisible()
    await expect(interludePresenter).toHaveAttribute("data-kind", "transition")
    await expect(
      interludePresenter.getByText("Mid-Quiz Interlude", { exact: true }),
    ).toBeVisible()
    await expect
      .poll(
        () =>
          liveRecord(
            liveRecord(latestState(hostWire)?.extras).activeTimelineStep,
          ).sceneId,
      )
      .toBe(interludeSceneId)
    await expect(manager.getByTestId("host-end-timer-btn")).toHaveCount(0)
    await expect(manager.getByTestId("host-restart-question-btn")).toHaveCount(
      0,
    )
    await expect(
      alice.getByRole("button", { name: "1 Paris", exact: true }),
    ).toHaveCount(0)

    // The existing host Next control advances the single migrated scene once.
    const beforeSceneNext = nextCommandCount()
    await manager.getByTestId("host-next-screen-btn").click()
    await expect.poll(nextCommandCount).toBe(beforeSceneNext + 1)

    // 10. Question 2 (Multi-choice) begins
    await expect(manager.getByText("2 / 3")).toBeVisible()
    await expect(alice.getByText("2 / 3")).toBeVisible()

    // Alice selects "2" and "3", submits
    await waitForRecordedVoting(hostWire, qIds[1])
    await answer(alice, "2")
    await answer(alice, "3")
    await confirm(alice)

    // Bob selects "2" and "5", submits
    await answer(bob, "2")
    await answer(bob, "5")
    await confirm(bob)
    await endRecordedVote(manager, hostWire, { questionId: qIds[1], count: 2 })

    // Both players get personal results immediately
    await expect(alice.getByText(t("game:correct"))).toBeVisible()
    await expect(bob.getByText(t("game:correct"))).toBeVisible()

    // 11. Manager's response bars display authoritative multi-choice percentages (sum can exceed 100%)
    await expect(manager.getByRole("button", { name: /^1 2/u })).toContainText(
      "100%",
    )
    await expect(manager.getByRole("button", { name: /^2 3/u })).toContainText(
      "50%",
    )
    await expect(manager.getByRole("button", { name: /^4 5/u })).toContainText(
      "50%",
    )
    await expect(manager.getByRole("button", { name: /^3 4/u })).toContainText(
      "0%",
    )

    // 12. History has its own control; Previous performs a real one-step rollback.
    const previousBtn = manager.getByTestId("host-history-btn")
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
    const beforeModalState = latestState(hostWire)
    const beforeModalNext = nextCommandCount()
    await manager.keyboard.press("Space")
    await manager.keyboard.press("Space")
    await manager.keyboard.press("ArrowRight")
    await manager.keyboard.press("ArrowRight")
    expect(nextCommandCount()).toBe(beforeModalNext)
    expect(latestState(hostWire)).toEqual(beforeModalState)
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
    const replayBtn = manager.getByRole("button", {
      name: t("extensions:host.replayFromHere"),
    })
    await expect(replayBtn).toBeVisible()
    await expect(replayBtn).toBeEnabled()
    const previousEpoch = latestState(hostWire)?.epoch
    await replayBtn.click()

    // Confirm dialog
    await expect(
      manager.getByText(t("extensions:host.replayConfirmTitle")),
    ).toBeVisible()
    const replayConfirmation = manager.getByRole("alertdialog", {
      name: t("extensions:host.replayConfirmTitle"),
      exact: true,
    })
    const confirmReplay = replayConfirmation.getByRole("button", {
      name: t("extensions:host.replayFromHere"),
      exact: true,
    })
    await expect(confirmReplay).toBeEnabled()
    await confirmReplay.click()
    await expect
      .poll(() => latestState(hostWire)?.epoch)
      .toBeGreaterThan(Number(previousEpoch))

    // 15. Verify Question 1 is restored (epoch rollback & new live question)
    await expect(manager.getByText("1 / 3")).toBeVisible({ timeout: 10000 })
    await expect(alice.getByText("1 / 3")).toBeVisible()
    await expect(bob.getByText("1 / 3")).toBeVisible()

    // 16. Reconnect & refresh test: Bob reloads page during Question 1
    await bob.reload()
    await expect(bob.locator("body")).toBeVisible()
    await waitForRecordedVoting(hostWire, qIds[0])
    const beforeReplayResultCount = bobWire.filter(
      (row) => row.name === STATUS.SHOW_RESULT,
    ).length
    await answer(bob, "Paris")
    await endRecordedVote(manager, hostWire, { questionId: qIds[0], count: 1 })
    await expect(bob.getByText(t("game:correct"))).toBeVisible()
    await expect
      .poll(
        () => bobWire.filter((row) => row.name === STATUS.SHOW_RESULT).length,
      )
      .toBeGreaterThan(beforeReplayResultCount)
    const replayResult = bobWire.findLast(
      (row) => row.name === STATUS.SHOW_RESULT,
    )?.data
    expect(replayResult?.correct).toBe(true)
    expect(replayResult?.points).toBeGreaterThan(0)
    expect(replayResult?.myPoints).toBe(replayResult?.points)

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
    const hostWire = observeLiveFlow(manager)

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

    // Keep the real finite question timer open for the live roster operations.
    await manager.getByTestId("editor-mode-advanced").click()
    await manager.getByTestId("editor-panel-toggle-settings").click()
    await expect(manager.getByTestId("editor-panel-settings")).toBeVisible()
    await numberSetting(manager, t("quizz:question.config.answerTime")).fill(
      "600",
    )
    await manager.getByTestId("editor-panel-close-settings").click()
    await expect(manager.getByTestId("editor-panel-settings")).toBeHidden()

    // The existing native Participants page owns the same roster controls.
    await manager.getByTestId("studio-tab-participants").click()
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
    await expect(previewBox).toContainText(
      t("extensions:roster.errors.invalidPhoneNumber"),
    )
    await expect(previewBox).toContainText(
      t("extensions:roster.previewSummary", {
        valid: 2,
        total: 3,
        invalid: 1,
      }),
    )

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
    await setManualProgression(manager)

    // Verify bottom counter shows 0 / 3 initially (3 pre-registered in roster, 0 connected)
    const bottomCounter = manager.locator(
      '[data-testid="host-connected-counter"]',
    )
    await expect(bottomCounter).toHaveText("0 / 3")

    // 3. Yossi Cohen dials in via pilot-phone endpoint
    const yossiJoin = await manager.request.post("/api/games/pilot-phone", {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
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
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
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

    // The modal owns even fully confirmed host shortcuts while the real timer runs.
    await manager.locator('[data-testid="host-modal-search-input"]').click()
    const beforeModalCommands = hostWire.filter(
      (row) => row.name === `sent:${EXTENSION_EVENTS.COMMAND}`,
    ).length
    const modalQuestionId = latestState(hostWire)?.questionId

    if (typeof modalQuestionId !== "string") {
      throw new Error(
        "The live roster modal must belong to the active question",
      )
    }

    await waitForRecordedVoting(hostWire, modalQuestionId)
    const beforeModalPhase = latestState(hostWire)?.phase
    const beforeModalEpoch = latestState(hostWire)?.epoch
    expect(beforeModalPhase).toBe("question")
    await manager.keyboard.press("Space")
    await manager.keyboard.press("Space")
    await manager.keyboard.press("Enter")
    await manager.keyboard.press("Enter")
    await manager.keyboard.press("ArrowRight")
    await manager.keyboard.press("ArrowRight")
    await manager.locator('[data-testid="host-modal-search-input"]').fill("")
    expect(
      hostWire.filter((row) => row.name === `sent:${EXTENSION_EVENTS.COMMAND}`),
    ).toHaveLength(beforeModalCommands)
    expect(latestState(hostWire)?.phase).toBe(beforeModalPhase)
    expect(latestState(hostWire)?.epoch).toBe(beforeModalEpoch)
    await waitForRecordedVoting(hostWire, modalQuestionId)
    await expect(
      manager.locator("button", { hasText: t("extensions:host.endTimer") }),
    ).toBeVisible()

    // 5. Simulate Yossi hanging up -> status becomes Disconnected and bottom counter becomes 2 / 4
    await manager.request.post("/api/games/pilot-phone", {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
      data: {
        action: "hangup",
        inviteCode: pin,
        callId: "yossi-live-call-1",
        phone: "+972503334455",
      },
    })
    await expect(bottomCounter).toHaveText("2 / 4")
    await expect(
      manager.locator(
        '[data-testid="host-modal-filter"] option[value="disconnected"]',
      ),
    ).toContainText("1")

    // 6. Yossi redials with a brand-new CallId -> status returns to Connected and bottom counter becomes 3 / 4
    await manager.request.post("/api/games/pilot-phone", {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
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
