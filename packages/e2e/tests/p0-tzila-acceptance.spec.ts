import fs from "node:fs"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, endTimer, next, startGame } from "@razzia/e2e/utils/manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(import.meta.dirname, "../test-results/p0-acceptance")

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath, fullPage: false })
}

test.describe("P0: Tzila Five-Option Picture Polls & Projector Acceptance", () => {
  test("Full Tzila Show Lifecycle: 5-option cards, PSTN DTMF 1-5, spectator display, tie, zero votes", async ({
    page: managerPage,
    browser,
  }) => {
    // 1. Create game with Tzila show
    const pin = await createGame(
      managerPage,
      "Build Our Story — Tzila · Two-Round Audience Vote",
    )
    expect(pin).toMatch(/^\d{6}$/u)

    // Extract gameId from manager URL
    const managerUrl = managerPage.url()
    const gameIdMatch = managerUrl.match(/\/party\/manager\/([^/?#]+)/u)
    expect(gameIdMatch).not.toBeNull()
    const gameId = gameIdMatch![1]

    // 2. Open Spectator Page in a clean secondary browser context
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)

    // Verify spectator initial state
    await expect(spectatorPage.locator('[data-testid="audience-display"]')).toBeVisible()
    await expect(spectatorPage.locator('[data-role="spectator"]')).toBeVisible()

    // Spectator MUST NOT have manager toolbar or player bar
    await expect(spectatorPage.getByRole("button", { name: t("common:exit") })).not.toBeVisible()
    await expect(spectatorPage.getByRole("button", { name: t("game:startGame") })).not.toBeVisible()

    // 2b. Connect 1 real browser participant to verify spectator does not alter player count
    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Alice")

    // Assert host sees exactly 1 player (Alice), NOT 2 (spectator must not count)
    await expect(managerPage.getByRole("button", { name: /1 \/ 1 Players/i })).toBeVisible()

    // 3. Start Game from Host
    await startGame(managerPage)

    // Studio timeline starts with Show Opening scene: verify Opening scene on Spectator and Host
    await expect(spectatorPage.getByRole("heading", { name: "Build Our Story!" })).toBeVisible({ timeout: 15_000 })
    await expect(managerPage.getByRole("heading", { name: "Build Our Story!" })).toBeVisible({ timeout: 15_000 })

    // Host clicks Advance Scene to move from Opening Scene to Question 1
    const advanceBtn = managerPage.getByRole("button", { name: /Advance Scene/i })
    await expect(advanceBtn).toBeVisible({ timeout: 5000 })
    await advanceBtn.click()

    // Wait for Question 1 to become active on both Host and Spectator
    const q1Title = "Round 1 · Who is the main character?"
    await expect(managerPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })

    // Verify 5 Photo Cards rendered DURING voting
    const spectatorCards = spectatorPage.locator('[data-testid^="photo-card-choice-"]')
    await expect(spectatorCards).toHaveCount(5)

    // Verify badge numbers 1 to 5
    for (let i = 1; i <= 5; i++) {
      await expect(spectatorPage.getByText(String(i), { exact: true }).first()).toBeVisible()
    }

    // Verify internal note is HIDDEN from audience and spectator
    await expect(spectatorPage.getByText(/Vote by pressing 1–5/i)).not.toBeVisible()
    await expect(spectatorPage.getByText(/Category 1 - Main Character\.png/i)).not.toBeVisible()

    // Capture (1) Host Question with Image Cards
    await saveScreenshot(managerPage, "01_host_question_with_image_cards.png")

    // Capture (2) Spectator Question Cards
    await saveScreenshot(spectatorPage, "02_spectator_question_cards.png")

    // Wait for voting to be active (SELECT_ANSWER state: End Timer button visible on manager)
    await expect(managerPage.getByRole("button", { name: t("extensions:host.endTimer") })).toBeVisible({
      timeout: 15_000,
    })

    // 4. Submit real DTMF votes concurrently via HTTP pilot endpoint (DTMF key 5 -> answerIndex 4)
    const socketApiUrl = "http://127.0.0.1:3011/api/games/pilot-phone"

    const [vote1, vote2, vote3] = await Promise.all([
      spectatorPage.request.post(socketApiUrl, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(socketApiUrl, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(socketApiUrl, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000003",
          callId: "call_003",
          answerIndex: 1,
        },
      }),
    ])
    expect(vote1.ok()).toBe(true)
    expect(vote2.ok()).toBe(true)
    expect(vote3.ok()).toBe(true)
    expect((await vote1.json()).accepted).toBe(true)
    expect((await vote2.json()).accepted).toBe(true)
    expect((await vote3.json()).accepted).toBe(true)

    // 5. End Timer to Reveal Results
    await endTimer(managerPage)

    // Wait for Spectator Results: Option 5 (Doctor) should be leader
    await expect(spectatorPage.locator('[data-winner="true"]')).toBeVisible({ timeout: 15_000 })
    const winnerCard = spectatorPage.locator('[data-winner="true"]')
    await expect(winnerCard).toContainText("Doctor")
    await expect(winnerCard).toContainText("2 votes")

    // Verify all 5 cards still present in results
    await expect(spectatorPage.locator('[data-testid^="photo-card-choice-"]')).toHaveCount(5)

    // Capture (3) Spectator Result with Winner
    await saveScreenshot(spectatorPage, "03_spectator_result_with_winner.png")

    // 6. Advance to Question 2 (Tie Scenario)
    await next(managerPage)

    // If an interlude scene is shown, advance through it
    const nextQuestionText = "Round 1 · What is the secondary plot?"
    const reachedQ2 = await spectatorPage.getByText(nextQuestionText).isVisible({ timeout: 5000 }).catch(() => false)
    if (!reachedQ2) {
      await next(managerPage)
    }

    // Wait for Q2 answering
    await expect(spectatorPage.locator('[data-testid^="photo-card-choice-"]')).toHaveCount(5, { timeout: 20_000 })
    await expect(managerPage.getByRole("button", { name: t("extensions:host.endTimer") })).toBeVisible({ timeout: 15_000 })

    // Vote 1 for option 0, Vote 1 for option 2 concurrently (Tie scenario)
    await Promise.all([
      spectatorPage.request.post(socketApiUrl, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001_q2",
          answerIndex: 0,
        },
      }),
      spectatorPage.request.post(socketApiUrl, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002_q2",
          answerIndex: 2,
        },
      }),
    ])

    // End timer for Q2
    await endTimer(managerPage)

    // Verify Tie: exactly 2 winners highlighted
    await expect(spectatorPage.locator('[data-winner="true"]')).toHaveCount(2, { timeout: 15_000 })

    // Capture (4) Spectator Result Tie
    await saveScreenshot(spectatorPage, "04_spectator_result_tie.png")

    // 7. Advance to Question 3 (Zero Votes Scenario)
    await next(managerPage)
    const reachedQ3 = await spectatorPage.locator('[data-testid^="photo-card-choice-"]').isVisible({ timeout: 5000 }).catch(() => false)
    if (!reachedQ3) {
      await next(managerPage)
    }
    await expect(spectatorPage.locator('[data-testid^="photo-card-choice-"]')).toHaveCount(5, { timeout: 20_000 })

    // Cast NO votes, immediately end timer
    await endTimer(managerPage)

    // Verify zero votes neutral state: no fake winner
    await expect(spectatorPage.locator('[data-winner="true"]')).toHaveCount(0, { timeout: 15_000 })
    await expect(spectatorPage.getByText(/No votes yet|0 votes/i).first()).toBeVisible()

    // Capture (5) Spectator Result Zero Votes
    await saveScreenshot(spectatorPage, "05_spectator_result_zero_votes.png")

    // 8. Clean Spectator Fullscreen / Multi-Resolution Viewports
    // 1920x1080
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })
    await spectatorPage.waitForTimeout(500)
    await saveScreenshot(spectatorPage, "06_spectator_clean_projector.png")

    // 1024x768 verification
    await spectatorPage.setViewportSize({ width: 1024, height: 768 })
    await spectatorPage.waitForTimeout(500)
    await saveScreenshot(spectatorPage, "06b_spectator_1024x768.png")

    // Verify no vertical scrollbar needed on 1024x768
    const scrollHeight = await spectatorPage.evaluate(() => document.documentElement.scrollHeight)
    const clientHeight = await spectatorPage.evaluate(() => document.documentElement.clientHeight)
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 10) // within tolerance

    // 9. Negative Security Checks: Spectator cannot vote or control host
    // Attempt player vote on spectator route: verify no interactive voting buttons exist
    const spectatorButtons = spectatorPage.locator('button[data-testid^="answer-btn-"]')
    await expect(spectatorButtons).toHaveCount(0)

    await playerContext.close()
    await spectatorContext.close()
  })

  test("P0 Previous Screen True Revote: reopens completed question, resets timer and votes, allows revoting via DTMF, and preserves subsequent results", async ({
    page: managerPage,
    browser,
  }) => {
    // 1. Create game with Tzila show
    const pin = await createGame(
      managerPage,
      "Build Our Story — Tzila · Two-Round Audience Vote",
    )
    expect(pin).toMatch(/^\d{6}$/u)

    const managerUrl = managerPage.url()
    const gameIdMatch = managerUrl.match(/\/party\/manager\/([^/?#]+)/u)
    expect(gameIdMatch).not.toBeNull()
    const gameId = gameIdMatch![1]

    // 2. Open Spectator Page in a clean secondary browser context
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)

    await expect(spectatorPage.locator('[data-testid="audience-display"]')).toBeVisible()

    // 2b. Connect participant so game can start
    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Alice")
    await expect(managerPage.getByRole("button", { name: /1 \/ 1 Players/i })).toBeVisible()

    // 3. Start Game from Host
    await startGame(managerPage)

    // Wait for Opening Scene
    await expect(spectatorPage.getByRole("heading", { name: "Build Our Story!" })).toBeVisible({ timeout: 15_000 })
    await expect(managerPage.getByRole("heading", { name: "Build Our Story!" })).toBeVisible({ timeout: 15_000 })

    // Advance from Show Opening Scene to Question 1
    const advanceBtn = managerPage.getByRole("button", { name: /Advance Scene/i })
    await expect(advanceBtn).toBeVisible({ timeout: 10_000 })
    await advanceBtn.click()

    // Question 1: "Round 1 · Who is the main character?"
    const q1Title = "Round 1 · Who is the main character?"
    await expect(managerPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })
    await expect(spectatorPage.locator('[data-testid^="photo-card-choice-"]')).toHaveCount(5, { timeout: 20_000 })

    // Wait for voting to be active (SELECT_ANSWER state: End Timer button visible on manager)
    await expect(managerPage.getByRole("button", { name: t("extensions:host.endTimer") })).toBeVisible({
      timeout: 15_000,
    })

    const socketApiUrl = "http://127.0.0.1:3011/api/games/pilot-phone"

    // Initial Q1 vote: Caller 1 & 2 vote for Doctor (key 5 -> index 4)
    const vote1 = await spectatorPage.request.post(socketApiUrl, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000001",
        callId: "call_001_initial",
        answerIndex: 4,
      },
    })
    expect((await vote1.json()).accepted).toBe(true)

    const vote2 = await spectatorPage.request.post(socketApiUrl, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000002",
        callId: "call_002_initial",
        answerIndex: 4,
      },
    })
    expect((await vote2.json()).accepted).toBe(true)

    // End timer on Q1 -> Doctor wins with 2 votes
    await endTimer(managerPage)
    await expect(spectatorPage.locator('[data-winner="true"]')).toBeVisible({ timeout: 15_000 })
    const winnerCardInitial = spectatorPage.locator('[data-winner="true"]')
    await expect(winnerCardInitial).toContainText("Doctor")
    await expect(winnerCardInitial).toContainText("2 votes")

    // 4. Host uses visible Previous Screen button from Q1 results to reopen Question 1 for a fresh vote!
    const prevBtn = managerPage.locator('[data-testid="host-previous-screen-btn"]')
    await expect(prevBtn).toBeVisible({ timeout: 5000 })
    await prevBtn.click()

    // Confirmation dialog appears
    const confirmBtn = managerPage.locator('[data-testid="confirm-reopen-question-btn"]')
    const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasConfirm) {
      await saveScreenshot(managerPage, "07_host_reopen_confirm_dialog.png")
      await confirmBtn.click()
    }

    // Question 1 is reopened for a fresh vote!
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })
    await expect(managerPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })

    // Verify 5 Photo Cards rendered, no winner highlighted, 0 votes
    const reopenedCards = spectatorPage.locator('[data-testid^="photo-card-choice-"]')
    await expect(reopenedCards).toHaveCount(5, { timeout: 20_000 })
    await expect(spectatorPage.locator('[data-winner="true"]')).toHaveCount(0)

    // Capture screenshot of reopened question with fresh voting timer
    await saveScreenshot(spectatorPage, "08_spectator_q1_reopened_fresh_timer.png")

    // Wait for voting to be active
    await expect(managerPage.getByRole("button", { name: t("extensions:host.endTimer") })).toBeVisible({ timeout: 15_000 })

    // 5. Submit REVOTE via DTMF:
    // This time Caller 1 votes Working Girl (key 2 -> index 1)
    // And Caller 2 votes Working Girl (key 2 -> index 1)
    const revote1 = await spectatorPage.request.post(socketApiUrl, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000001",
        callId: "call_001_revote",
        answerIndex: 1,
      },
    })
    expect(revote1.ok()).toBe(true)
    expect((await revote1.json()).accepted).toBe(true)

    const revote2 = await spectatorPage.request.post(socketApiUrl, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000002",
        callId: "call_002_revote",
        answerIndex: 1,
      },
    })
    expect(revote2.ok()).toBe(true)
    expect((await revote2.json()).accepted).toBe(true)

    // End timer for revoted Q1
    await endTimer(managerPage)

    // Verify new results: Working Girl is now the winner with 2 votes!
    await expect(spectatorPage.locator('[data-winner="true"]')).toBeVisible({ timeout: 15_000 })
    const newWinnerCard = spectatorPage.locator('[data-winner="true"]')
    await expect(newWinnerCard).toContainText("Working Girl")
    await expect(newWinnerCard).toContainText("2 votes")

    // Capture screenshot of new revote winner
    await saveScreenshot(spectatorPage, "09_spectator_q1_revoted_new_winner.png")

    // 6. Advance to Question 2 ("Round 1 · Who is the second character?")
    await next(managerPage)
    const q2Title = "Round 1 · Who is the second character?"
    const reachedQ2 = await spectatorPage.getByText(q2Title).isVisible({ timeout: 5000 }).catch(() => false)
    if (!reachedQ2) {
      await next(managerPage)
    }
    await expect(spectatorPage.getByText(q2Title)).toBeVisible({ timeout: 20_000 })
    const q2Cards = spectatorPage.locator('[data-testid^="photo-card-choice-"]')
    await expect(q2Cards).toHaveCount(5, { timeout: 20_000 })
    await expect(managerPage.getByRole("button", { name: t("extensions:host.endTimer") })).toBeVisible({ timeout: 15_000 })

    // Q2 voting: 1 vote for Nun (option 0), 1 vote for Queen Elizabeth (option 2) (Tie scenario)
    await spectatorPage.request.post(socketApiUrl, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000001",
        callId: "call_001_q2",
        answerIndex: 0,
      },
    })
    await spectatorPage.request.post(socketApiUrl, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000002",
        callId: "call_002_q2",
        answerIndex: 2,
      },
    })
    await endTimer(managerPage)

    // Verify Q2 Tie: exactly 2 winners highlighted
    await expect(spectatorPage.locator('[data-winner="true"]')).toHaveCount(2, { timeout: 15_000 })

    // 7. Multi-resolution screenshots
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await spectatorPage.waitForTimeout(300)
    await saveScreenshot(spectatorPage, "10_spectator_1280x800.png")

    await spectatorPage.setViewportSize({ width: 390, height: 844 })
    await spectatorPage.waitForTimeout(300)
    await saveScreenshot(spectatorPage, "11_spectator_mobile_390x844.png")

    await playerContext.close()
    await spectatorContext.close()
  })
})
