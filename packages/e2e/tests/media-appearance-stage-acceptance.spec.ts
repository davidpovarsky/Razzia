import fs from "node:fs"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import {
  createGame,
  endTimer,
  loginManager,
  next,
  startGame,
} from "@razzia/e2e/utils/manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/screenshots/media-appearance-stage",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false })
}

// 1x1 transparent PNG buffer for real upload testing
const TINY_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

const assertZeroStageScroll = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const stage =
      document.querySelector('[data-testid="audience-display"] section') ||
      document.querySelector("section") ||
      doc
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      stageScrollHeight: (stage as HTMLElement).scrollHeight,
      stageClientHeight: (stage as HTMLElement).clientHeight,
      stageScrollWidth: (stage as HTMLElement).scrollWidth,
      stageClientWidth: (stage as HTMLElement).clientWidth,
    }
  })

  expect(
    metrics.docScrollWidth,
    `${label}: docScrollWidth (${metrics.docScrollWidth}) > docClientWidth (${metrics.docClientWidth})`,
  ).toBeLessThanOrEqual(metrics.docClientWidth + 1)

  expect(
    metrics.docScrollHeight,
    `${label}: docScrollHeight (${metrics.docScrollHeight}) > docClientHeight (${metrics.docClientHeight})`,
  ).toBeLessThanOrEqual(metrics.docClientHeight + 1)

  expect(
    metrics.stageScrollWidth,
    `${label}: stageScrollWidth (${metrics.stageScrollWidth}) > stageClientWidth (${metrics.stageClientWidth})`,
  ).toBeLessThanOrEqual(metrics.stageClientWidth + 1)

  expect(
    metrics.stageScrollHeight,
    `${label}: stageScrollHeight (${metrics.stageScrollHeight}) > stageClientHeight (${metrics.stageClientHeight})`,
  ).toBeLessThanOrEqual(metrics.stageClientHeight + 1)
}

test.describe("Tada Studio Complete: Media Library Reuse, Card Backgrounds, Audio, Staged Motion & Zero-Scroll Stage", () => {
  test("1. Studio Editor: Responsive Zero-Overflow (1280..320), Smart Convert Question->Scene, Per-Answer Visuals, Shared Media Library & Reference-Safe Delete", async ({
    page,
  }) => {
    await loginManager(page)

    // Create a new show in Studio
    await page.goto("/manager/quizz")
    await expect(
      page.locator('[data-testid="studio-card-type-bar"]'),
    ).toBeVisible({ timeout: 15_000 })

    // 1A. Verify responsive zero-horizontal-overflow across 1280, 1024, 844, 768, 390, 320
    const editorWidths = [1280, 1024, 844, 768, 390, 320]
    for (const w of editorWidths) {
      await page.setViewportSize({ width: w, height: 800 })
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `Editor horizontal overflow at width ${w}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      await expect(
        page.locator('[data-testid="studio-card-type-bar"]'),
      ).toBeVisible()
    }

    await saveScreenshot(page, "01_editor_narrow_320px.png")
    await page.setViewportSize({ width: 1280, height: 900 })

    // 1B. Smart Conversion Confirmation:
    // Add a second question card so we have > 1 question
    const addBtn = page.locator('[data-testid="studio-add-card-btn"]')
    await addBtn.click()

    // New question is blank -> converting to "Transition" scene should happen IMMEDIATELY without confirmation dialog!
    const transitionToggle = page
      .locator('[data-testid="studio-card-type-bar"]')
      .getByRole("radio", { name: /Transition/i })
    await transitionToggle.click()

    await expect(
      page.getByPlaceholder("Card title..."),
    ).toBeVisible({ timeout: 5_000 })

    // Convert scene back to Quiz question and populate question title -> then converting to Scene MUST prompt confirmation
    const quizToggle = page
      .locator('[data-testid="studio-card-type-bar"]')
      .getByRole("radio", { name: /Quiz/i })
    await quizToggle.click()

    const titleInput = page.getByPlaceholder(t("quizz:question.placeholder"))
    await expect(titleInput).toBeVisible()
    await titleInput.fill("Populated Question Title")

    await transitionToggle.click()
    // Confirmation dialog should appear, and its text must NOT falsely claim automatic Undo
    const dialogDesc = page.getByText(/replace its question content/i)
    await expect(dialogDesc).toBeVisible()
    const descText = (await dialogDesc.textContent()) ?? ""
    expect(descText.toLowerCase()).not.toContain("undo")

    // Cancel keeps the populated question intact
    await page.getByRole("button", { name: t("common:cancel") }).click()
    await expect(titleInput).toHaveValue("Populated Question Title")

    // 1C. Upload image once in Answer 0 picker and reuse across Card Background & Scene without re-uploading
    const pickAns0Btn = page.locator('[data-testid="answer-pick-image-0"]')
    await expect(pickAns0Btn).toBeVisible()
    await pickAns0Btn.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Verify file input accept attribute is strictly filtered to image
    const fileInput = dialog.locator('input[type="file"]')
    await expect(fileInput).toHaveAttribute("accept", /image/i)

    // Upload a real PNG image
    await fileInput.setInputFiles({
      name: "shared-stage-asset.png",
      mimeType: "image/png",
      buffer: TINY_PNG_BUFFER,
    })

    // Select the uploaded image from the library grid
    const uploadedThumb = dialog.locator('img[alt^="shared-stage-asset"]')
    await expect(uploadedThumb).toBeVisible({ timeout: 10_000 })
    await uploadedThumb.click()

    // Verify Answer 0 now displays the thumbnail preview and "Both" mode is active
    await expect(
      page.locator('[data-testid="answer-image-preview-0"]'),
    ).toBeVisible()

    // Reuse the SAME uploaded image in Card Background without re-uploading (from "In This Show" tab!)
    const chooseBgBtn = page.locator('[data-testid="card-bg-choose-btn"]')
    await chooseBgBtn.click()
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-testid="media-scope-show"]').click()
    await expect(
      dialog.locator('img[alt^="shared-stage-asset"]'),
    ).toBeVisible()
    await dialog.locator('img[alt^="shared-stage-asset"]').click()

    await expect(page.locator('[data-testid="card-bg-preview"]')).toBeVisible()

    // 1D. Configure Per-Card Audio Cue (Built-in sound selection) & Staged Animations
    const customAudioBtn = page.locator(
      '[data-testid="card-audio-mode-showQuestion-custom"]',
    )
    await customAudioBtn.click()
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-testid="media-scope-builtin"]').click()
    const builtinSoundBtn = dialog
      .locator('[data-testid^="builtin-sound-select-"]')
      .first()
    await expect(builtinSoundBtn).toBeVisible()
    await builtinSoundBtn.click()

    // Configure Staged Animation slots
    await expect(
      page.locator('[data-testid="staged-animation-section"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="stage-anim-slot-answerEntrance"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="stage-anim-slot-answerBadgeEntrance"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="stage-anim-slot-resultsRevealEntrance"]'),
    ).toBeVisible()

    await saveScreenshot(page, "02_editor_card_appearance_configured.png")

    // 1E. Verify "Remove from Card" only detaches from card, while Library Delete on a referenced asset returns 409 Conflict warning
    const removeBgFromCardBtn = page.locator(
      '[data-testid="card-bg-remove-btn"]',
    )
    await removeBgFromCardBtn.click()
    await expect(
      page.locator('[data-testid="card-bg-preview"]'),
    ).not.toBeVisible()
    // Answer 0 image preview is still intact!
    await expect(
      page.locator('[data-testid="answer-image-preview-0"]'),
    ).toBeVisible()
  })

  test("2. Live Runtime & Zero-Scroll Stage Matrix (STAGE-P0) across 8 Viewports + Card Background + Single Audio + Staged Motion", async ({
    page: managerPage,
    browser,
  }) => {
    const SOCKET_ORIGIN = "http://127.0.0.1:3011"
    await loginManager(managerPage)

    // Upload a real background PNG via API so we can reference it in a composite show
    const token = await managerPage.evaluate(() =>
      localStorage.getItem("token"),
    )
    const uploadRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        multipart: {
          file: {
            name: "custom-card-bg.png",
            mimeType: "image/png",
            buffer: TINY_PNG_BUFFER,
          },
        },
      },
    )
    expect(uploadRes.status()).toBe(201)
    const uploadedBg = (await uploadRes.json()) as {
      name: string
      url: string
      type: string
    }

    // Create a composite show with:
    // - Opening scene WITH custom background override
    // - Question 1 (5 image+text options, custom background override, custom audio cue, and 4-slot staged animations)
    // - Question 2 (4 options, NO card background override -> must fall back to default GameBackground, muted showQuestion audio)
    // - InterimResults scene
    // - Leaderboard scene
    // - Closing scene
    const createRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/quizzes`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        data: {
          quizz: {
            subject: "Zero Scroll & Appearance E2E Show",
            gameMode: "survey",
            questions: [
              {
                type: "single",
                playMode: "survey",
                question: "Question 1 with Custom Background & 5 Visual Options",
                answers: [
                  "Alpha Choice",
                  "Beta Choice",
                  "Gamma Choice",
                  "Delta Choice",
                  "Epsilon Choice",
                ],
                solutions: [],
                cooldown: 5,
                time: 60,
              },
              {
                type: "single",
                playMode: "survey",
                question: "Question 2 with Default Game Background & Muted Cue",
                answers: ["North", "South", "East", "West"],
                solutions: [],
                cooldown: 5,
                time: 60,
              },
            ],
          },
          extras: {
            schemaVersion: 2,
            revision: 1,
            quizId: "temp-e2e-appearance",
            baseDigest:
              "0000000000000000000000000000000000000000000000000000000000000000",
            questionIds: [
              "00000000-0000-4000-8000-000000000001",
              "00000000-0000-4000-8000-000000000002",
            ],
            timeline: [
              {
                id: "00000000-0000-4000-8000-000000000011",
                kind: "opening",
                sceneId: "00000000-0000-4000-8000-000000000021",
              },
              {
                id: "00000000-0000-4000-8000-000000000012",
                kind: "question",
                questionId: "00000000-0000-4000-8000-000000000001",
              },
              {
                id: "00000000-0000-4000-8000-000000000013",
                kind: "interimResults",
                sceneId: "00000000-0000-4000-8000-000000000022",
              },
              {
                id: "00000000-0000-4000-8000-000000000014",
                kind: "question",
                questionId: "00000000-0000-4000-8000-000000000002",
              },
              {
                id: "00000000-0000-4000-8000-000000000015",
                kind: "leaderboard",
                sceneId: "00000000-0000-4000-8000-000000000023",
              },
              {
                id: "00000000-0000-4000-8000-000000000016",
                kind: "closing",
                sceneId: "00000000-0000-4000-8000-000000000024",
              },
            ],
            scenes: {
              "00000000-0000-4000-8000-000000000021": {
                id: "00000000-0000-4000-8000-000000000021",
                kind: "opening",
                title: "Welcome to Studio Stage",
                subtitle: "Zero-Scroll Public Display Verification",
                durationMs: 30000,
                advance: "manual",
                background: {
                  url: uploadedBg.url,
                  fit: "cover",
                  position: "center",
                  overlayOpacity: 0.4,
                },
                audio: {
                  mode: "custom",
                  url: "/sounds/boump.mp3",
                  volume: 0.6,
                  loop: false,
                },
                stageAnimations: {
                  questionEntrance: {
                    preset: "zoom-soft",
                    durationMs: 700,
                    timing: "simultaneous",
                    staggerMs: 90,
                  },
                },
              },
              "00000000-0000-4000-8000-000000000022": {
                id: "00000000-0000-4000-8000-000000000022",
                kind: "interimResults",
                title: "Round 1 Breakdown",
                durationMs: 30000,
                advance: "manual",
                stageAnimations: {
                  resultsRevealEntrance: {
                    preset: "slide-up",
                    durationMs: 600,
                    timing: "sequential",
                    staggerMs: 80,
                  },
                },
              },
              "00000000-0000-4000-8000-000000000023": {
                id: "00000000-0000-4000-8000-000000000023",
                kind: "leaderboard",
                title: "Top Standings",
                durationMs: 30000,
                advance: "manual",
              },
              "00000000-0000-4000-8000-000000000024": {
                id: "00000000-0000-4000-8000-000000000024",
                kind: "closing",
                title: "Thanks for Joining!",
                subtitle: "See you next time",
                durationMs: 30000,
                advance: "manual",
              },
            },
            defaults: {
              newQuestionMode: "survey",
              leaderboardPolicy: "cardOnly",
              advanceMode: "manual",
            },
            perQuestion: {
              "00000000-0000-4000-8000-000000000001": {
                background: {
                  url: uploadedBg.url,
                  fit: "cover",
                  position: "center",
                  overlayOpacity: 0.35,
                },
                audioCues: {
                  showQuestion: {
                    mode: "custom",
                    url: "/sounds/show.mp3",
                    volume: 0.7,
                    loop: false,
                  },
                  answersMusic: {
                    mode: "custom",
                    url: "/sounds/answersMusic.mp3",
                    volume: 0.4,
                    loop: true,
                  },
                },
                questionEntrance: {
                  preset: "slide-up",
                  durationMs: 750,
                },
                stageAnimations: {
                  questionEntrance: {
                    preset: "slide-up",
                    durationMs: 750,
                    timing: "simultaneous",
                    staggerMs: 90,
                  },
                  answerEntrance: {
                    preset: "fade",
                    durationMs: 650,
                    timing: "sequential",
                    staggerMs: 80,
                  },
                  answerBadgeEntrance: {
                    preset: "zoom-soft",
                    durationMs: 500,
                    timing: "sequential",
                    staggerMs: 80,
                  },
                  resultsRevealEntrance: {
                    preset: "spotlight",
                    durationMs: 700,
                    timing: "sequential",
                    staggerMs: 90,
                  },
                },
                answerVisuals: [
                  {
                    answerIndex: 0,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Alpha Visual",
                  },
                  {
                    answerIndex: 1,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Beta Visual",
                  },
                  {
                    answerIndex: 2,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Gamma Visual",
                  },
                  {
                    answerIndex: 3,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Delta Visual",
                  },
                  {
                    answerIndex: 4,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Epsilon Visual",
                  },
                ],
              },
              "00000000-0000-4000-8000-000000000002": {
                audioCues: {
                  showQuestion: {
                    mode: "mute",
                    volume: 0,
                    loop: false,
                  },
                },
              },
            },
          },
        },
      },
    )
    expect(createRes.status()).toBe(201)

    // Verify Reference-Safe Deletion: attempting to delete `custom-card-bg.png` without detach MUST return 409 Conflict!
    const deleteBlockedRes = await managerPage.request.delete(
      `${SOCKET_ORIGIN}/api/media/${uploadedBg.name}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    expect(deleteBlockedRes.status()).toBe(409)
    const blockedBody = (await deleteBlockedRes.json()) as {
      error: string
      references: Array<{ quizId: string }>
    }
    expect(blockedBody.references.length).toBeGreaterThan(0)

    // Start the game from Manager UI (reload /manager/config so React Query fetches the newly created show)
    await managerPage.reload()
    const pin = await createGame(
      managerPage,
      "Zero Scroll & Appearance E2E Show",
    )
    expect(pin).toMatch(/^\d{6}$/u)

    const gameIdMatch = managerPage.url().match(/\/party\/manager\/([^/?#]+)/u)
    expect(gameIdMatch).not.toBeNull()
    const gameId = gameIdMatch![1]

    // Open Spectator Display (/display/$gameId) and Player (/game/$gameId)
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({ timeout: 15_000 })

    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "StageTester")

    // Assert host sees 1 player connected before starting
    await expect(
      managerPage.getByRole("button", { name: /1 \/ 1 Players/i }),
    ).toBeVisible({ timeout: 10_000 })

    await startGame(managerPage)

    // 2A. Opening Scene: verify custom card background, custom audio state, and zero-scroll across viewports
    await expect(
      spectatorPage.getByRole("heading", { name: "Welcome to Studio Stage" }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      spectatorPage.locator('[data-testid="stage-card-background"]'),
    ).toHaveAttribute("data-bg-url", uploadedBg.url)
    await expect(
      spectatorPage.locator('[data-testid="audio-cue-player-state"]'),
    ).toHaveAttribute("data-audio-url", "/sounds/boump.mp3")

    const stageViewports = [
      { width: 1920, height: 1080, name: "1920x1080" },
      { width: 1366, height: 768, name: "1366x768" },
      { width: 1280, height: 800, name: "1280x800" },
      { width: 1024, height: 768, name: "1024x768" },
      { width: 800, height: 600, name: "800x600_4_3" },
      { width: 768, height: 1024, name: "768x1024" },
      { width: 390, height: 844, name: "390x844" },
      { width: 320, height: 568, name: "320x568" },
    ]

    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(spectatorPage, `Opening Scene @ ${vp.name}`)
    }
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })
    await saveScreenshot(spectatorPage, "03_opening_scene_custom_bg_1080p.png")

    // Advance to Question 1
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()

    // Wait for Question 1 voting phase (SELECT_ANSWER)
    await expect(
      spectatorPage.getByText(
        "Question 1 with Custom Background & 5 Visual Options",
      ),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      spectatorPage.locator('[data-testid="photo-card-grid"]'),
    ).toBeVisible({ timeout: 15_000 })

    // Verify custom background is active on Question 1
    await expect(
      spectatorPage.locator('[data-testid="stage-card-background"]'),
    ).toHaveAttribute("data-bg-url", uploadedBg.url)

    // Verify Staged Animation attributes on Question 1 cards & badges
    await expect(
      spectatorPage.locator('[data-testid="photo-card-choice-0"]'),
    ).toHaveAttribute("data-tada-entrance", "fade")
    await expect(
      spectatorPage.locator('[data-testid="photo-card-label-0"]'),
    ).toHaveAttribute("data-tada-entrance", "zoom-soft")

    // Verify Zero-Scroll across all 8 required viewports during 5-option image+text voting!
    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(
        spectatorPage,
        `Q1 5-Option Voting @ ${vp.name}`,
      )
      if (vp.name === "800x600_4_3" || vp.name === "1920x1080" || vp.name === "390x844") {
        await saveScreenshot(
          spectatorPage,
          `04_q1_voting_${vp.name}.png`,
        )
      }
    }
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // Player casts a vote on Option 0
    await playerPage.locator('[data-testid="photo-card-choice-0"]').click()

    // Host ends timer -> SHOW_RESPONSES reveal
    await endTimer(managerPage)
    await expect(
      spectatorPage.locator('[data-testid="results-hero-section"]'),
    ).toBeVisible({ timeout: 15_000 })

    // Verify resultsRevealEntrance animation on interim results winner
    await expect(
      spectatorPage.locator('[data-testid="interim-option-row"][data-winner="true"]'),
    ).toHaveAttribute("data-tada-entrance", "slide-up")

    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(
        spectatorPage,
        `Q1 Interim Reveal @ ${vp.name}`,
      )
      if (vp.name === "800x600_4_3" || vp.name === "1920x1080") {
        await saveScreenshot(
          spectatorPage,
          `05_q1_reveal_${vp.name}.png`,
        )
      }
    }
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // Advance to Question 2 (which has NO custom card background and has showQuestion audio MUTED)
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()
    await expect(
      spectatorPage.getByText(
        "Question 2 with Default Game Background & Muted Cue",
      ),
    ).toBeVisible({ timeout: 15_000 })

    // Verify fallback to default GameBackground (no stage-card-background overlay)
    await expect(
      spectatorPage.locator('[data-testid="stage-card-background"]'),
    ).toHaveCount(0)

    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(spectatorPage, `Q2 Default BG @ ${vp.name}`)
    }

    await spectatorContext.close()
    await playerContext.close()
  })
})
