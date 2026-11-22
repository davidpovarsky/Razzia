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
  join(import.meta.dirname, "../test-results/screenshots/tzila"),
  join(import.meta.dirname, "../test-results/tzila-p0-acceptance"),
]

const saveScreenshot = async (page: Page, filename: string) => {
  for (const dir of DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: join(dir, filename), fullPage: false })
  }
}

const SOCKET_API_URL = "http://127.0.0.1:3011/api/games/pilot-phone"

test.describe("P0: Tzila Public Stage, Single Poll Reveal, and Responsive Toolbar", () => {
  test("Gate A & Gate B: Audience Live Display, Synced Countdown, Mid-Voting Join, Single Reveal, Ties, Revote", async ({
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
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerUrl)
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // 2. Open Spectator Page at 1920x1080
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({ timeout: 15_000 })

    // 2b. Connect registered player at 375x667
    const playerContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Alice")

    // Assert host sees exactly 1 player (Alice) - spectator MUST NOT count
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

    // Wait for Question 1 to become active on Host, Spectator, and Player
    const q1Title = "Round 1 · Who is the main character?"
    await expect(managerPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(spectatorPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(playerPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })

    // Wait for voting state SELECT_ANSWER
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({
      timeout: 15_000,
    })

    // Submit DTMF votes immediately while voting window is open:
    // Option 4 (Doctor) = 2 votes, Option 1 (Working Girl) = 1 vote
    const [vote1, vote2, vote3] = await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
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
    expect(((await vote1.json()) as { accepted: boolean }).accepted).toBe(true)
    expect(((await vote2.json()) as { accepted: boolean }).accepted).toBe(true)
    expect(((await vote3.json()) as { accepted: boolean }).accepted).toBe(true)

    // Both supported surfaces receive the same clock and authored question.
    await requireSpectatorAnswerRejected(spectatorPage, gameId)
    const playerSec = await readVotingSeconds({
      page: playerPage,
      surface: "player",
    })
    const spectatorSec = await readVotingSeconds({
      page: spectatorPage,
      surface: "native",
    })
    expect(playerSec).toBeGreaterThan(0)
    expect(spectatorSec).toBeGreaterThan(0)
    expect(Math.abs(playerSec - spectatorSec)).toBeLessThanOrEqual(1)

    // Capture (04) Synchronized Player vs Spectator Timers
    await saveScreenshot(spectatorPage, "04_player_vs_spectator_timers.png")

    // Capture (03) Spectator Join Mid-Voting (Gate A mid-voting join while voting window is fresh)
    const lateSpectatorContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const lateSpectatorPage = await lateSpectatorContext.newPage()
    await lateSpectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(
      lateSpectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(lateSpectatorPage.getByText(q1Title)).toBeVisible({
      timeout: 10_000,
    })
    // Check that late joiner gets live countdown <= 20 and > 0 (strictly required, non-conditional)
    const remainingSeconds = await readVotingSeconds({
      page: lateSpectatorPage,
      surface: "native",
    })
    expect(remainingSeconds).toBeLessThanOrEqual(20)
    expect(remainingSeconds).toBeGreaterThan(0)
    await expect(nativeTzilaCards(lateSpectatorPage)).toHaveCount(5)
    await saveScreenshot(lateSpectatorPage, "03_spectator_join_mid_voting.png")
    await lateSpectatorContext.close()
    // The host pause holds the real voting phase during the viewport measurements.
    await setTzilaPaused(managerPage, true)
    await assertTzilaChoices({
      page: playerPage,
      questionIndex: 0,
      surface: "player",
      paused: true,
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

    // Capture (01) Spectator Live Question (1920)
    await saveScreenshot(spectatorPage, "01_spectator_live_question_1920.png")

    // Capture (02) Spectator Live Question at 1024x768 (check no scroll overflow)
    await spectatorPage.setViewportSize({ width: 1024, height: 768 })
    await spectatorPage.waitForTimeout(200)
    await saveScreenshot(spectatorPage, "02_spectator_live_question_1024.png")
    const scrollHeight1024 = await spectatorPage.evaluate(
      () => document.documentElement.scrollHeight,
    )
    const clientHeight1024 = await spectatorPage.evaluate(
      () => document.documentElement.clientHeight,
    )
    expect(scrollHeight1024).toBeLessThanOrEqual(clientHeight1024 + 10)
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    await setTzilaPaused(managerPage, false)

    // 6. Gate B Verification: Single Poll Reveal
    // Host clicks End Timer -> transitions directly to interimResults scene (SINGLE REVEAL)
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
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 0,
      counts: [0, 1, 0, 0, 2],
    })

    // Capture (05) Single Result Transition (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(spectatorPage, "05_single_result_transition.png")
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // 7. Single Advance Click moves directly to Question 2 (NO duplicate reveal!)
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

    // Capture (06) Next Poll No Duplicate (1920)
    await saveScreenshot(spectatorPage, "06_next_poll_no_duplicate.png")

    // 8. Question 2: Vote Tie Scenario
    await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001_q2",
          answerIndex: 0,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
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

    // Capture (07) Tie Result (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(spectatorPage, "07_tie_result.png")
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // 9. Question 3: Zero Votes Scenario
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

    // Capture (08) Zero Votes Result (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(spectatorPage, "08_zero_votes_result.png")
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // 10. Previous Screen & True Revote on Q3
    const prevBtn = managerPage.locator(
      '[data-testid="host-previous-screen-btn"]',
    )
    await expect(prevBtn).toBeVisible({ timeout: 5000 })
    await prevBtn.click()

    const confirmBtn = managerPage.locator(
      '[data-testid="confirm-reopen-question-btn"]',
    )

    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // Question 3 is reopened for fresh vote
    await expect(spectatorPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({ timeout: 15_000 })

    const reopenedSeconds = await readVotingSeconds({
      page: spectatorPage,
      surface: "native",
    })
    expect(reopenedSeconds).toBeGreaterThan(0)
    expect(reopenedSeconds).toBeLessThanOrEqual(20)
    await expect(
      nativeTzilaCards(spectatorPage).and(
        spectatorPage.locator(".is-favourite"),
      ),
    ).toHaveCount(0)

    // Submit revote: original option 1 (Victorian Era) = 2 votes
    const [revote1, revote2] = await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001_revote",
          answerIndex: 1,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002_revote",
          answerIndex: 1,
        },
      }),
    ])
    expect(((await revote1.json()) as { accepted: boolean }).accepted).toBe(
      true,
    )
    expect(((await revote2.json()) as { accepted: boolean }).accepted).toBe(
      true,
    )

    // End timer on revote
    await endTimer(managerPage)

    await assertNativeTzilaResult({
      page: spectatorPage,
      questionIndex: 2,
      counts: [0, 2, 0, 0, 0],
    })
    await assertResponsiveTzilaResult({
      page: playerPage,
      questionIndex: 2,
      counts: [0, 2, 0, 0, 0],
    })

    // Capture (09) Revote Clean Result (1280)
    await spectatorPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(spectatorPage, "09_revote_clean_result.png")

    await playerContext.close()
    await spectatorContext.close()
  })

  test("Gate C: Responsive Host Toolbar across Viewports & Localization", async ({
    page: managerPage,
    browser,
  }) => {
    // 1. Create game with Tzila show
    const pin = await createGame(
      managerPage,
      "Build Our Story — Tzila · Two-Round Audience Vote",
    )

    // Connect player to ensure lobby can start cleanly
    const playerContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Carol")

    await expect(managerPage.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
      { timeout: 10_000 },
    )

    // 2. Start Game
    await startGame(managerPage)

    await assertTzilaOpening({ manager: managerPage, player: playerPage })

    // Move to Question 1
    const advanceBtn = managerPage.getByTestId("host-next-screen-btn")
    await expect(advanceBtn).toBeVisible({ timeout: 10_000 })
    await advanceBtn.click()

    const q1Title = "Round 1 · Who is the main character?"
    await expect(managerPage.getByText(q1Title)).toBeVisible({
      timeout: 20_000,
    })

    const toolbar = managerPage.locator(
      '[data-testid="manager-control-toolbar"]',
    )
    await expect(toolbar).toBeVisible({ timeout: 10_000 })

    await expect(managerPage.getByTestId("host-end-timer-btn")).toBeVisible()
    await setTzilaPaused(managerPage, true)

    // Viewport widths to verify
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 800, screenshot: "13_host_toolbar_1280.png" },
      { width: 1024, height: 768, screenshot: "12_host_toolbar_1024.png" },
      { width: 768, height: 1024 },
      { width: 720, height: 900, screenshot: "10_host_toolbar_720.png" },
      { width: 600, height: 800 },
      { width: 375, height: 667, screenshot: "11_host_toolbar_375.png" },
      { width: 320, height: 568 },
    ]

    for (const vp of viewports) {
      await managerPage.setViewportSize({ width: vp.width, height: vp.height })
      await managerPage.waitForTimeout(100)

      // 1. No horizontal scrollbar on page
      const scrollWidth = await managerPage.evaluate(
        () => document.documentElement.scrollWidth,
      )
      const clientWidth = await managerPage.evaluate(
        () => document.documentElement.clientWidth,
      )
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)

      // 2. Toolbar bounding box fits within viewport
      const toolbarBox = await toolbar.boundingBox()
      expect(toolbarBox).not.toBeNull()
      expect(toolbarBox!.x).toBeGreaterThanOrEqual(0)
      expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(
        vp.width + 2,
      )

      // 3. No raw unrendered i18n keys
      const toolbarText = await toolbar.innerText()
      expect(toolbarText).not.toMatch(/extensions:host\./)
      expect(toolbarText).not.toMatch(/common:\w+/)
      expect(toolbarText).not.toMatch(/game:\w+/)

      // 4. All visible buttons have valid bounding boxes within viewport
      const buttons = toolbar.locator("button")
      const btnCount = await buttons.count()
      for (let i = 0; i < btnCount; i += 1) {
        const btn = buttons.nth(i)

        if (await btn.isVisible()) {
          const box = await btn.boundingBox()
          expect(box).not.toBeNull()
          expect(box!.width).toBeGreaterThan(0)
          expect(box!.height).toBeGreaterThan(0)
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 2)
        }
      }

      // Save required screenshots
      if (vp.screenshot) {
        await saveScreenshot(managerPage, vp.screenshot)
      }
    }

    // Resume the real clock before ending this same vote.
    await setTzilaPaused(managerPage, false)
    await endTimer(managerPage)

    // Wait for Next Screen button to be visible in Results/Scene mode
    const nextBtn = managerPage.locator('[data-testid="host-next-screen-btn"]')
    await expect(nextBtn).toBeVisible({ timeout: 15_000 })

    const sceneViewports = [
      { width: 1280, height: 800 },
      { width: 720, height: 900 },
      { width: 375, height: 667 },
      { width: 320, height: 568 },
    ]

    for (const vp of sceneViewports) {
      await managerPage.setViewportSize({ width: vp.width, height: vp.height })
      await managerPage.waitForTimeout(100)

      const scrollWidth = await managerPage.evaluate(
        () => document.documentElement.scrollWidth,
      )
      const clientWidth = await managerPage.evaluate(
        () => document.documentElement.clientWidth,
      )
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)

      const toolbarText = await toolbar.innerText()
      expect(toolbarText).not.toMatch(/extensions:host\./)

      const nextBox = await nextBtn.boundingBox()
      expect(nextBox).not.toBeNull()
      expect(nextBox!.x + nextBox!.width).toBeLessThanOrEqual(vp.width + 2)
    }

    await playerContext.close()
  })

  test("Gate B Fallback: Normal Quiz Results Unaffected (Backward Compatibility)", async ({
    page: managerPage,
    browser,
  }) => {
    // 1. Create standard quiz game (fixtures/quizz/basic.json "E2E Quizz")
    const pin = await createGame(managerPage, "E2E Quizz")
    expect(pin).toMatch(/^\d{6}$/u)

    // 2. Connect player
    const playerContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Bob")
    await expect(managerPage.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
    )

    // 3. Start Game
    await startGame(managerPage)

    // Question 1 of E2E Quizz: "What is the capital of France?"
    await expect(
      managerPage.getByText("What is the capital of France?"),
    ).toBeVisible({ timeout: 20_000 })

    // Wait for player to answer
    const answerBtn = playerPage.getByRole("button", {
      name: "1 Paris",
      exact: true,
    })
    await expect(answerBtn).toBeVisible({ timeout: 15_000 })
    await answerBtn.click()

    // 4. Host ends timer (or waits for cooldown)
    await endTimer(managerPage)

    // In a normal quiz without authored interimResults scenes, standard SHOW_RESPONSES MUST APPEAR!
    // Verify standard responses stage is visible on Host
    const nextBtn = managerPage.getByRole("button", {
      name: new RegExp(
        `${t("game:next")}|${t("extensions:host.nextScreen")}`,
        "i",
      ),
    })
    await expect(nextBtn).toBeVisible({ timeout: 15_000 })

    // Host shows responses (e.g. answer counts / percentages)
    await expect(managerPage.getByText("Paris")).toBeVisible({
      timeout: 10_000,
    })

    // Capture (14) Normal Quiz Results Unaffected (1280)
    await managerPage.setViewportSize({ width: 1280, height: 800 })
    await saveScreenshot(managerPage, "14_normal_quiz_results_unaffected.png")

    await playerContext.close()
  })
})
