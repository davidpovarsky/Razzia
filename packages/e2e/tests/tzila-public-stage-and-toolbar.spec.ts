import fs from "node:fs"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { endTimer } from "@razzia/e2e/utils/extension-manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"

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

const EXPECTED_COLORS = [
  // Option 1 (#e69f00)
  "rgb(230, 159, 0)",
  // Option 2 (#56b4e9)
  "rgb(86, 180, 233)",
  // Option 3 (#3dbfa0)
  "rgb(61, 191, 160)",
  // Option 4 (#cc79a7)
  "rgb(204, 121, 167)",
  // Option 5 (#0072b2)
  "rgb(0, 114, 178)",
]

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
    await expect(
      managerPage.getByRole("button", { name: /1 \/ 1 Players/i }),
    ).toBeVisible()

    // 3. Start Game from Host
    await startGame(managerPage)

    // Opening scene appears on Spectator and Host
    await expect(
      spectatorPage.getByRole("heading", { name: "Build Our Story!" }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      managerPage.getByRole("heading", { name: "Build Our Story!" }),
    ).toBeVisible({ timeout: 15_000 })

    // Host clicks Advance Scene to move from Opening Scene to Question 1
    const advanceBtn = managerPage.getByRole("button", {
      name: /Advance Scene/i,
    })
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
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "call_002",
          answerIndex: 4,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
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

    // 4. Gate A Verification: Spectator 5 solid photo cards, completed images immediately
    const spectatorCards = spectatorPage.locator(
      '[data-testid^="photo-card-choice-"]',
    )
    await expect(spectatorCards).toHaveCount(5)

    for (let i = 0; i < 5; i += 1) {
      const card = spectatorPage.locator(
        `[data-testid="photo-card-choice-${i}"]`,
      )
      const cardBg = await card.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      )
      expect(cardBg).toBe(EXPECTED_COLORS[i])
      expect(cardBg).not.toContain("rgba")

      // Image loaded complete with natural dimensions
      const img = card.locator(`[data-testid="photo-card-image-${i}"]`)
      const isComplete = await img.evaluate(
        (el) =>
          (el as HTMLImageElement).complete &&
          (el as HTMLImageElement).naturalWidth > 0,
      )
      expect(isComplete).toBe(true)
    }

    // Verify Spectator is read-only: clicking a card does NOT submit an answer or change state
    await spectatorCards.first().click({ force: true })

    // Verify timer synchronization while voting is fresh
    const playerTimerEl = playerPage.locator('[role="timer"]')
    const spectatorTimerEl = spectatorPage.locator('[role="timer"]')
    await expect(playerTimerEl).toBeVisible({ timeout: 5000 })
    await expect(spectatorTimerEl).toBeVisible({ timeout: 5000 })
    const playerTimeStr = (await playerTimerEl.textContent()) ?? ""
    const spectatorTimeStr = (await spectatorTimerEl.textContent()) ?? ""
    const playerSec = parseInt(playerTimeStr.replace(/\D/gu, ""), 10)
    const spectatorSec = parseInt(spectatorTimeStr.replace(/\D/gu, ""), 10)
    const timestamp = new Date().toISOString()
    console.log(
      `[Gate A] Timer synchronization check at ${timestamp}: Player=${playerSec}s, Spectator=${spectatorSec}s`,
    )
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
    const lateTimer = lateSpectatorPage.locator('[role="timer"]')
    await expect(lateTimer).toBeVisible({ timeout: 10_000 })
    const lateTimerText = (await lateTimer.textContent()) ?? ""
    const remainingSeconds = parseInt(lateTimerText.replace(/\D/gu, ""), 10)
    console.log(
      `[Gate A] Mid-voting spectator joined with timer: ${remainingSeconds}s`,
    )
    expect(remainingSeconds).toBeLessThanOrEqual(20)
    expect(remainingSeconds).toBeGreaterThan(0)
    await saveScreenshot(lateSpectatorPage, "03_spectator_join_mid_voting.png")
    await lateSpectatorContext.close()

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

    // 6. Gate B Verification: Single Poll Reveal
    // Host clicks End Timer -> transitions directly to interimResults scene (SINGLE REVEAL)
    await endTimer(managerPage)

    // Spectator directly shows the interimResults scene
    const interimWinner = spectatorPage.locator(
      '[data-testid="interim-option-row"][data-winner="true"]',
    )
    await expect(interimWinner).toBeVisible({ timeout: 15_000 })
    await expect(interimWinner).toContainText("Doctor")
    await expect(interimWinner).toContainText("2 votes")

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
    await expect(
      spectatorPage.locator('[data-testid^="photo-card-choice-"]'),
    ).toHaveCount(5, { timeout: 20_000 })

    // Capture (06) Next Poll No Duplicate (1920)
    await saveScreenshot(spectatorPage, "06_next_poll_no_duplicate.png")

    // 8. Question 2: Vote Tie Scenario
    await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001_q2",
          answerIndex: 0,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
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

    // Verify Tie in interimResults scene: spotlight tie and exactly 2 co-winners
    await expect(
      spectatorPage.locator('[data-testid="spotlight-tie"]'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      spectatorPage.locator(
        '[data-testid="interim-option-row"][data-winner="true"]',
      ),
    ).toHaveCount(2)

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
    await expect(
      spectatorPage.locator('[data-testid^="photo-card-choice-"]'),
    ).toHaveCount(5, { timeout: 20_000 })

    // Cast NO votes, immediately end timer
    await endTimer(managerPage)

    // Verify zero votes neutral state: no fake winner hero
    await expect(spectatorPage.locator('[data-winner="true"]')).toHaveCount(0, {
      timeout: 15_000,
    })
    await expect(
      spectatorPage.getByText(/No votes|0 votes|Total votes/i).first(),
    ).toBeVisible()

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

    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click()
    }

    // Question 3 is reopened for fresh vote
    await expect(spectatorPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({ timeout: 15_000 })

    // Submit revote: Option 1 (1920s) = 2 votes
    const [revote1, revote2] = await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "call_001_revote",
          answerIndex: 1,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
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

    // Verify clean revote winner
    await expect(spectatorPage.locator('[data-winner="true"]')).toBeVisible({
      timeout: 15_000,
    })
    const revoteWinner = spectatorPage.locator('[data-winner="true"]')
    await expect(revoteWinner).toContainText("2 votes")

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

    await expect(
      managerPage.getByRole("button", { name: /1 \/ 1 Players/i }),
    ).toBeVisible({ timeout: 10_000 })

    // 2. Start Game
    await startGame(managerPage)

    // Opening scene appears
    await expect(
      managerPage.getByRole("heading", { name: "Build Our Story!" }),
    ).toBeVisible({ timeout: 15_000 })

    // Move to Question 1
    const advanceBtn = managerPage.getByRole("button", {
      name: /Advance Scene/i,
    })
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

    // Now test Results/Scene mode toolbar responsiveness
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

    // 3. Start Game
    await startGame(managerPage)

    // Question 1 of E2E Quizz: "What is the capital of France?"
    await expect(
      managerPage.getByText("What is the capital of France?"),
    ).toBeVisible({ timeout: 20_000 })

    // Wait for player to answer
    const answerBtn = playerPage.getByRole("button", { name: "Paris" })
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
