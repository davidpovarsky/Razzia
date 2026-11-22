import fs from "node:fs"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { TZILA_PILOT_SECRET } from "@razzia/e2e/utils/constants"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { endTimer } from "@razzia/e2e/utils/extension-manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"
import {
  assertNativeTzilaResult,
  assertTzilaOpening,
  assertResponsiveTzilaResult,
  assertTzilaChoices,
  nativeTzilaCards,
  readVotingSeconds,
  requireSpectatorAnswerRejected,
  setTzilaPaused,
} from "@razzia/e2e/utils/tzila-stage"

const DIRS = [
  join(import.meta.dirname, "../test-results/tzila-four-visual-fixes"),
  join(import.meta.dirname, "../test-results/p0-acceptance"),
]

const saveScreenshot = async (page: Page, filename: string) => {
  for (const dir of DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: join(dir, filename), fullPage: false })
  }
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

    // Configure answersOnly = true in lobby to exercise player answersOnly mode (Fix D)
    const settingsBtn = managerPage.getByRole("button", {
      name: t("game:settings.title"),
    })

    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()
    const dialog = managerPage.getByRole("dialog")
    const answersOnlySwitch = dialog.getByRole("switch", {
      name: t("game:settings.answersOnly.label"),
      exact: true,
    })
    await expect(answersOnlySwitch).toBeVisible()
    await expect(answersOnlySwitch).toHaveAttribute("aria-checked", "false")
    await answersOnlySwitch.click()
    await expect(answersOnlySwitch).toHaveAttribute("aria-checked", "true")
    await dialog.getByRole("button", { name: t("common:save") }).click()
    await expect(dialog).toBeHidden()

    // Extract gameId from manager URL
    const managerUrl = managerPage.url()
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerUrl)
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // 2. Open Spectator Page in a clean secondary browser context (1920x1080)
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)

    // Verify spectator initial state
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible()
    await expect(spectatorPage.getByTestId("audience-display")).toHaveAttribute(
      "data-role",
      "spectator",
    )

    // Spectator MUST NOT have manager toolbar or player bar
    await expect(
      spectatorPage.getByRole("button", { name: t("common:exit") }),
    ).not.toBeVisible()
    await expect(
      spectatorPage.getByRole("button", { name: t("game:startGame") }),
    ).not.toBeVisible()

    // 2b. Connect 1 real browser participant to verify spectator does not alter player count
    const playerContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Alice")

    // Assert host sees exactly 1 player (Alice), NOT 2 (spectator must not count)
    await expect(managerPage.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
    )

    // 3. Start Game from Host
    await startGame(managerPage)

    await assertTzilaOpening({
      manager: managerPage,
      player: playerPage,
      spectator: spectatorPage,
    })

    // Host clicks Advance Scene to move from Opening Scene to Question 1
    const advanceBtn = managerPage.getByTestId("host-next-screen-btn")
    await expect(advanceBtn).toBeVisible({ timeout: 5000 })
    await advanceBtn.click()

    // Wait for Question 1 to become active on Host and Spectator
    const q1Title = "Round 1 · Who is the main character?"
    await expect(managerPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })

    // Wait for voting to be active (SELECT_ANSWER state: End Timer button visible on manager)
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({
      timeout: 15_000,
    })

    // 4. Submit real DTMF votes via HTTP pilot endpoint immediately while voting window is open:
    // Option 4 (Doctor) = 2 votes, Option 1 (Working Girl) = 1 vote
    const socketApiUrl = "http://127.0.0.1:3011/api/games/pilot-phone"

    const [vote1, vote2, vote3] = await Promise.all([
      spectatorPage.request.post(socketApiUrl, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(socketApiUrl, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(socketApiUrl, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
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
    expect(((await vote1.json()) as { accepted: boolean }).accepted).toBe(true)
    expect(((await vote2.json()) as { accepted: boolean }).accepted).toBe(true)
    expect(((await vote3.json()) as { accepted: boolean }).accepted).toBe(true)

    // AnswersOnly hides the player's inline heading and exposes a readable dialog.
    const playerHeading = playerPage.getByTestId("game-question-title")
    await expect(playerHeading).toBeHidden()
    const showQuestion = playerPage.getByRole("button", {
      name: t("game:question.show"),
      exact: true,
    })
    await expect(showQuestion).toBeVisible()
    await showQuestion.click()
    const questionDialog = playerPage.getByRole("dialog")
    await expect(
      questionDialog.getByRole("heading", { name: q1Title, exact: true }),
    ).toBeVisible()
    await playerPage.keyboard.press("Escape")
    await expect(questionDialog).toBeHidden()
    await expect(playerHeading).toBeHidden()
    await expect(
      managerPage.getByTestId("tadazz-question-panel"),
    ).toContainText(q1Title)

    await assertTzilaChoices({
      page: playerPage,
      questionIndex: 0,
      surface: "player",
    })
    await assertTzilaChoices({
      page: spectatorPage,
      questionIndex: 0,
      surface: "native",
    })
    await assertTzilaChoices({
      page: managerPage,
      questionIndex: 0,
      surface: "native",
    })
    await requireSpectatorAnswerRejected(spectatorPage, gameId)
    // Freeze only through the supported host pause while measuring viewport geometry.
    await setTzilaPaused(managerPage, true)
    const playerTimer = playerPage.getByRole("timer")
    await expect(playerTimer).toBeVisible()
    const timerDigits = playerTimer
      .locator(":scope > span")
      .filter({ hasText: /^\d{1,2}$/u })
    const fontSize = await timerDigits.evaluate((element) =>
      parseInt(getComputedStyle(element).fontSize, 10),
    )
    expect(fontSize).toBeGreaterThanOrEqual(28)

    const qBox = await showQuestion.boundingBox()
    const tBox = await playerTimer.boundingBox()
    const firstCardBox = await playerPage
      .getByTestId("photo-card-choice-0")
      .boundingBox()
    expect(qBox).not.toBeNull()
    expect(tBox).not.toBeNull()
    expect(firstCardBox).not.toBeNull()
    expect(tBox!.y).toBeGreaterThanOrEqual(qBox!.y + qBox!.height - 5)
    expect(firstCardBox!.y).toBeGreaterThanOrEqual(tBox!.y + tBox!.height - 5)

    // Capture (4) Player answersOnly Question & Big Timer (375x667)
    await saveScreenshot(
      playerPage,
      "04_player_answers_only_question_big_timer_375.png",
    )

    // The native host/projector and responsive participant retain the same five
    // original labels, images and option order. Palette checks apply to the
    // responsive PhotoCardGrid; the native theme keeps its own authored design.
    await expect(nativeTzilaCards(spectatorPage)).toHaveCount(5)

    // Capture (1) Host Question with 5 Solid Image Cards (1920)
    await managerPage.setViewportSize({ width: 1920, height: 1080 })
    await saveScreenshot(
      managerPage,
      "01_manager_voting_5_solid_photo_cards_1920.png",
    )

    // Capture (2) Spectator Voting Question Timer (1920)
    await saveScreenshot(
      spectatorPage,
      "02_spectator_voting_question_timer_1920.png",
    )

    // Capture (3) Spectator Voting Question Timer at 1024x768
    await spectatorPage.setViewportSize({ width: 1024, height: 768 })
    await spectatorPage.waitForTimeout(300)
    await saveScreenshot(
      spectatorPage,
      "03_spectator_voting_question_timer_1024.png",
    )
    // Check no vertical scrollbar at 1024x768
    const scrollHeight1024 = await spectatorPage.evaluate(
      () => document.documentElement.scrollHeight,
    )
    const clientHeight1024 = await spectatorPage.evaluate(
      () => document.documentElement.clientHeight,
    )
    expect(scrollHeight1024).toBeLessThanOrEqual(clientHeight1024 + 10)
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    await setTzilaPaused(managerPage, false)

    // 5. End Timer to Reveal Results directly on the authored interimResults scene (Single Reveal)
    await endTimer(managerPage)

    await assertNativeTzilaResult({
      page: spectatorPage,
      questionIndex: 0,
      counts: [0, 1, 0, 0, 2],
    })
    await assertNativeTzilaResult({
      page: managerPage,
      questionIndex: 0,
      counts: [0, 1, 0, 0, 2],
    })
    await playerPage.setViewportSize({ width: 1280, height: 800 })
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 0,
      counts: [0, 1, 0, 0, 2],
    })
    const interimWinner = playerPage
      .getByTestId("interim-option-row")
      .filter({ has: playerPage.getByText("Doctor", { exact: true }) })
    const interimWinnerBox = await interimWinner.boundingBox()
    expect(interimWinnerBox).not.toBeNull()
    const interimRunners = playerPage
      .getByTestId("interim-option-row")
      .and(playerPage.locator('[data-winner="false"]'))
    await expect(interimRunners).toHaveCount(4)
    const firstRunner = interimRunners.filter({
      has: playerPage.getByText("Working Girl", { exact: true }),
    })
    await expect(firstRunner).toHaveCount(1)
    const firstInterimRunnerBox = await firstRunner.boundingBox()
    expect(firstInterimRunnerBox).not.toBeNull()
    expect(interimWinnerBox!.width * interimWinnerBox!.height).toBeGreaterThan(
      1.8 * firstInterimRunnerBox!.width * firstInterimRunnerBox!.height,
    )
    expect(firstInterimRunnerBox!.y).toBeGreaterThanOrEqual(
      interimWinnerBox!.y + interimWinnerBox!.height - 30,
    )
    await saveScreenshot(
      playerPage,
      "responsive_player_results_hero_plus_ranked_1280.png",
    )

    // Capture (6) Manager Results Hero Plus Ranked (1280)
    await managerPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(
      managerPage,
      "06_manager_results_hero_plus_ranked_1280.png",
    )

    // Capture (7) Spectator Results Hero Plus Ranked (1920)
    await saveScreenshot(
      spectatorPage,
      "07_spectator_results_hero_plus_ranked_1920.png",
    )

    // Capture (8) Interim Results Hero Plus Ranked (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(
      spectatorPage,
      "08_interim_results_hero_plus_ranked_1280.png",
    )
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // 6. Single Advance Click moves directly to Question 2 (Tie Scenario)
    await next(managerPage)
    const q2Title = "Round 1 · Who is the second character?"
    await expect(spectatorPage.getByText(q2Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(nativeTzilaCards(spectatorPage)).toHaveCount(5, {
      timeout: 20_000,
    })

    // Vote 1 for option 0 (Nun), Vote 1 for option 2 (Queen Elizabeth) concurrently (Tie scenario)
    await Promise.all([
      spectatorPage.request.post(socketApiUrl, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001_q2",
          answerIndex: 0,
        },
      }),
      spectatorPage.request.post(socketApiUrl, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002_q2",
          answerIndex: 2,
        },
      }),
    ])

    // End timer for Q2 -> transitions immediately to interimResults scene with tie
    await endTimer(managerPage)

    await assertNativeTzilaResult({
      page: spectatorPage,
      questionIndex: 1,
      counts: [1, 0, 1, 0, 0],
    })
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 1,
      counts: [1, 0, 1, 0, 0],
    })

    // Capture (9) Interim Results First Place Tie (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(
      spectatorPage,
      "09_interim_results_first_place_tie_1280.png",
    )
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // 7. Single Advance Click moves directly to Question 3 (Zero Votes Scenario)
    await next(managerPage)
    const q3Title = "Round 1 · In which era does the story take place?"
    await expect(spectatorPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(nativeTzilaCards(spectatorPage)).toHaveCount(5, {
      timeout: 20_000,
    })

    // Cast NO votes, immediately end timer
    await endTimer(managerPage)

    await assertNativeTzilaResult({
      page: spectatorPage,
      questionIndex: 2,
      counts: [0, 0, 0, 0, 0],
    })
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 2,
      counts: [0, 0, 0, 0, 0],
    })

    // Capture (10) Zero Votes No Winner (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(spectatorPage, "10_zero_votes_no_winner_1280.png")

    await playerContext.close()
    await spectatorContext.close()
  })

  test("P0 Previous Screen True Revote: reopens completed question, resets timer and votes, allows revoting via DTMF, and preserves subsequent results", async ({
    page: managerPage,
    browser,
  }) => {
    // 1. Create game with Tzila show (answersOnly = false default)
    const pin = await createGame(
      managerPage,
      "Build Our Story — Tzila · Two-Round Audience Vote",
    )
    expect(pin).toMatch(/^\d{6}$/u)

    const managerUrl = managerPage.url()
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerUrl)
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // 2. Open Spectator Page
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible()

    // 2b. Connect participant in normal mode (answersOnly = false) at 375x667
    const playerContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Alice")
    await expect(managerPage.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
    )

    // 3. Start Game from Host
    await startGame(managerPage)

    // The timeline keeps the authored name; Classic owns its native bookend preset.
    await assertTzilaOpening({
      manager: managerPage,
      player: playerPage,
      spectator: spectatorPage,
    })

    // Advance from Show Opening Scene to Question 1
    const advanceBtn = managerPage.getByTestId("host-next-screen-btn")
    await expect(advanceBtn).toBeVisible({ timeout: 10_000 })
    await advanceBtn.click()

    // Question 1: "Round 1 · Who is the main character?"
    const q1Title = "Round 1 · Who is the main character?"
    await expect(managerPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })

    // Wait for voting to be active
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({
      timeout: 15_000,
    })

    // FIX C & D in normal player mode: verify question title & timer, capture (5)
    await expect(playerPage.getByText(q1Title)).toBeVisible({ timeout: 20_000 })
    await expect(playerPage.locator('[role="timer"]')).toBeVisible()
    await saveScreenshot(
      playerPage,
      "05_player_normal_question_big_timer_375.png",
    )

    const socketApiUrl = "http://127.0.0.1:3011/api/games/pilot-phone"

    // Initial Q1 vote: Caller 1 & 2 vote for Doctor (key 5 -> index 4)
    const vote1 = await spectatorPage.request.post(socketApiUrl, {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
      data: {
        action: "answer",
        gameId,
        phone: "+972501000001",
        callId: "call_001_initial",
        answerIndex: 4,
      },
    })
    expect(((await vote1.json()) as { accepted: boolean }).accepted).toBe(true)

    const vote2 = await spectatorPage.request.post(socketApiUrl, {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
      data: {
        action: "answer",
        gameId,
        phone: "+972501000002",
        callId: "call_002_initial",
        answerIndex: 4,
      },
    })
    expect(((await vote2.json()) as { accepted: boolean }).accepted).toBe(true)

    // End timer on Q1 -> Doctor wins with 2 votes
    await endTimer(managerPage)
    await assertNativeTzilaResult({
      page: spectatorPage,
      questionIndex: 0,
      counts: [0, 0, 0, 0, 2],
    })
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 0,
      counts: [0, 0, 0, 0, 2],
    })

    // 4. Host uses visible Previous Screen button from Q1 results to reopen Question 1 for a fresh vote!
    const prevBtn = managerPage.locator(
      '[data-testid="host-previous-screen-btn"]',
    )
    await expect(prevBtn).toBeVisible({ timeout: 5000 })
    await prevBtn.click()

    // Confirmation dialog appears
    const confirmBtn = managerPage.locator(
      '[data-testid="confirm-reopen-question-btn"]',
    )
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // Question 1 is reopened for a fresh vote!
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(managerPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })

    // Wait for voting to be active
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({ timeout: 15_000 })

    // Verify 5 Photo Cards rendered, old visual winner is cleared (0 winner cards)
    const reopenedCards = nativeTzilaCards(spectatorPage)
    await expect(reopenedCards).toHaveCount(5, { timeout: 20_000 })
    await expect(
      nativeTzilaCards(spectatorPage).and(
        spectatorPage.locator(".is-favourite"),
      ),
    ).toHaveCount(0)
    const reopenedSeconds = await readVotingSeconds({
      page: spectatorPage,
      surface: "native",
    })
    expect(reopenedSeconds).toBeGreaterThan(0)
    expect(reopenedSeconds).toBeLessThanOrEqual(20)

    // Capture (11) Reopened Question No Stale Winner
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(
      spectatorPage,
      "11_reopened_question_no_stale_winner.png",
    )
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // 5. Submit REVOTE via DTMF:
    // Working Girl (key 2 -> index 1)
    const revote1 = await spectatorPage.request.post(socketApiUrl, {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
      data: {
        action: "answer",
        gameId,
        phone: "+972501000001",
        callId: "call_001_revote",
        answerIndex: 1,
      },
    })
    expect(revote1.ok()).toBe(true)
    expect(((await revote1.json()) as { accepted: boolean }).accepted).toBe(
      true,
    )

    const revote2 = await spectatorPage.request.post(socketApiUrl, {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
      data: {
        action: "answer",
        gameId,
        phone: "+972501000002",
        callId: "call_002_revote",
        answerIndex: 1,
      },
    })
    expect(revote2.ok()).toBe(true)
    expect(((await revote2.json()) as { accepted: boolean }).accepted).toBe(
      true,
    )

    // End timer for revoted Q1
    await endTimer(managerPage)

    await assertNativeTzilaResult({
      page: spectatorPage,
      questionIndex: 0,
      counts: [0, 2, 0, 0, 0],
    })
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 0,
      counts: [0, 2, 0, 0, 0],
    })

    await playerContext.close()
    await spectatorContext.close()
  })
})
