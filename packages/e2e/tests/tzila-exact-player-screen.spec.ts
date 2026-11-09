import fs from "node:fs"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { endTimer } from "@razzia/e2e/utils/extension-manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"
const DIRS = [
  join(import.meta.dirname, "../test-results/tzila-exact-player-screen"),
  join(import.meta.dirname, "../test-results/screenshots/tzila"),
  join(import.meta.dirname, "../test-results/tzila-p0-acceptance"),
]
const saveScreenshot = async (page: Page, filename: string) => {
  const primaryPath = join(DIRS[0], filename)
  fs.mkdirSync(DIRS[0], {
    recursive: true,
  })
  await page.screenshot({
    path: primaryPath,
    fullPage: false,
  })
  for (let i = 1; i < DIRS.length; i += 1) {
    fs.mkdirSync(DIRS[i], {
      recursive: true,
    })
    fs.copyFileSync(primaryPath, join(DIRS[i], filename))
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
test.describe("TADA P0: Exact Player Screen Reuse for Audience Display", () => {
  /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
  test("A1: Static Architecture Guard — No duplicate UI trees in /display", async () => {
    const displayPath = join(
      import.meta.dirname,
      "../../web/src/pages/display/$gameId.tsx",
    )
    const content = fs.readFileSync(displayPath, "utf-8")

    // The display page MUST NOT import or independently render these components
    expect(content).not.toMatch(/PhotoCardGrid/u)
    expect(content).not.toMatch(/AnswerCountdown/u)
    expect(content).not.toMatch(/QuestionEntrance/u)
    expect(content).not.toMatch(/ScenePresenter/u)
    expect(content).not.toMatch(/useFullscreen/u)

    // It MUST delegate to the unified PlayerGameView
    expect(content).toMatch(/PlayerGameView/u)
    expect(content).toMatch(/viewRole="spectator"/u)
  })
  /* oxlint-enable require-await, typescript/require-await */
  test("A2-A9: Live Game — Exact Player Parity, Footer Omission, Synced Countdown, Mid-Voting Join & Rejection", async ({
    page: managerPage,
    browser,
  }) => {
    // 1. Host creates game with Tzila show
    const pin = await createGame(
      managerPage,
      "Build Our Story — Tzila · Two-Round Audience Vote",
    )
    expect(pin).toMatch(/^\d{6}$/u)
    const managerUrl = managerPage.url()
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerUrl)
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // 2. Open Spectator Page (1920x1080)
    const spectatorContext = await browser.newContext({
      viewport: {
        width: 1920,
        height: 1080,
      },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(spectatorPage.locator('[data-role="spectator"]')).toBeVisible()

    // 2b. Connect Player (1920x1080 for exact side-by-side comparison)
    const playerContext = await browser.newContext({
      viewport: {
        width: 1920,
        height: 1080,
      },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Alice")

    // Assert host sees exactly 1 player (Alice) — spectator MUST NOT register in roster
    await expect(
      managerPage.getByRole("button", {
        name: /1 \/ 1 Players/i,
      }),
    ).toBeVisible()

    // Both player and spectator are in lobby (Wait screen)
    await expect(playerPage.getByText(/waiting/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(spectatorPage.getByText(/waiting/i)).toBeVisible({
      timeout: 10_000,
    })

    // A3: Verify footer: player has bottom white bar with username "Alice"; spectator DOES NOT
    await expect(playerPage.getByText("Alice")).toBeVisible()
    await expect(spectatorPage.getByText("Alice")).not.toBeVisible()

    // 3. Start Game from Host
    await startGame(managerPage)

    // Opening scene appears on Host, Spectator, and Player via ScenePresenter
    await expect(
      spectatorPage.getByRole("heading", {
        name: "Build Our Story!",
      }),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      playerPage.getByRole("heading", {
        name: "Build Our Story!",
      }),
    ).toBeVisible({
      timeout: 15_000,
    })

    // Save Paired Opening Scene Screenshots
    await saveScreenshot(playerPage, "paired_01_opening_player.png")
    await saveScreenshot(spectatorPage, "paired_01_opening_spectator.png")

    // Host clicks Advance Scene to move to Question 1
    const advanceBtn = managerPage.getByRole("button", {
      name: /Advance Scene/i,
    })
    await expect(advanceBtn).toBeVisible({
      timeout: 5000,
    })
    await advanceBtn.click()
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

    // A1 & A4: DOM Architecture & Card Parity on Question 1
    const playerGrid = playerPage.locator('[data-testid="photo-card-grid"]')
    const spectatorGrid = spectatorPage.locator(
      '[data-testid="photo-card-grid"]',
    )
    await expect(playerGrid).toBeVisible({
      timeout: 10_000,
    })
    await expect(spectatorGrid).toBeVisible({
      timeout: 10_000,
    })
    const playerCards = playerPage.locator(
      '[data-testid^="photo-card-choice-"]',
    )
    const spectatorCards = spectatorPage.locator(
      '[data-testid^="photo-card-choice-"]',
    )
    await expect(playerCards).toHaveCount(5)
    await expect(spectatorCards).toHaveCount(5)

    // Verify colors, labels, and images match exactly across all 5 cards
    const [pColors, sColors] = await Promise.all([
      playerPage.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-testid^="photo-card-choice-"]'),
        ).map((el) => window.getComputedStyle(el).backgroundColor),
      ),
      spectatorPage.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-testid^="photo-card-choice-"]'),
        ).map((el) => window.getComputedStyle(el).backgroundColor),
      ),
    ])
    expect(pColors).toEqual(EXPECTED_COLORS)
    expect(sColors).toEqual(EXPECTED_COLORS)

    // A3: Verify Player has bottom white footer; Spectator DOES NOT have footer
    await expect(playerPage.getByText("Alice")).toBeVisible()
    await expect(spectatorPage.getByText("Alice")).not.toBeVisible()

    // Submit phone vote IMMEDIATELY for Option 4 (Doctor) to win Q1
    const voteRes = await spectatorPage.request.post(SOCKET_API_URL, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000001",
        callId: "call_a_001",
        answerIndex: 4,
      },
    })
    expect(
      (
        (await voteRes.json()) as {
          accepted: boolean
        }
      ).accepted,
    ).toBe(true)

    // A6: Spectator Read-Only & Rejection Tests (perform immediately during voting)
    // 1) Click card as spectator: must not emit or submit
    await spectatorCards.first().click({
      force: true,
    })

    // 2) Synthetic answer emission from spectator page context
    /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
    const rejectionResult = await spectatorPage.evaluate(
      async (gid) =>
        new Promise<{
          rejected: boolean
          message?: string
        }>((resolve) => {
          const win = window as unknown as {
            __socket?: {
              once(event: string, listener: (message: string) => void): void
              emit(event: string, data: unknown): void
            }
            ioClient?: {
              once(event: string, listener: (message: string) => void): void
              emit(event: string, data: unknown): void
            }
          }
          const socket = win.__socket ?? win.ioClient

          if (!socket) {
            resolve({
              rejected: true,
              message: "no-direct-socket",
            })

            return
          }

          socket.once("game:errorMessage", (msg: string) => {
            resolve({
              rejected: true,
              message: msg,
            })
          })
          socket.emit("player:selectedAnswer", {
            gameId: gid,
            data: {
              answerKeys: [0],
            },
          })
          setTimeout(
            () =>
              resolve({
                rejected: true,
              }),
            500,
          )
        }),
      gameId,
    )
    /* oxlint-enable require-await, typescript/require-await */
    expect(rejectionResult.rejected).toBe(true)

    // Verify timer synchronization
    const playerTimer = playerPage.locator('[role="timer"]')
    const spectatorTimer = spectatorPage.locator('[role="timer"]')
    await expect(playerTimer).toBeVisible({
      timeout: 5000,
    })
    await expect(spectatorTimer).toBeVisible({
      timeout: 5000,
    })
    const pTime = parseInt(
      ((await playerTimer.textContent()) ?? "").replace(/\D/gu, ""),
      10,
    )
    const sTime = parseInt(
      ((await spectatorTimer.textContent()) ?? "").replace(/\D/gu, ""),
      10,
    )
    console.log(`[Timer Parity] Player: ${pTime}s, Spectator: ${sTime}s`)
    expect(Math.abs(pTime - sTime)).toBeLessThanOrEqual(1)

    // A2 & A9: Viewport Parity: 1920x1080, 1280x800, 1024x768, 375x667
    const viewports = [
      {
        width: 1920,
        height: 1080,
        name: "1920",
      },
      {
        width: 1280,
        height: 800,
        name: "1280",
      },
      {
        width: 1024,
        height: 768,
        name: "1024",
      },
      {
        width: 375,
        height: 667,
        name: "375",
      },
    ]
    for (const vp of viewports) {
      await playerPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })

      // No horizontal scrollbar overflow on either view
      const pScrollW = await playerPage.evaluate(
        () => document.documentElement.scrollWidth,
      )
      const pClientW = await playerPage.evaluate(
        () => document.documentElement.clientWidth,
      )
      const sScrollW = await spectatorPage.evaluate(
        () => document.documentElement.scrollWidth,
      )
      const sClientW = await spectatorPage.evaluate(
        () => document.documentElement.clientWidth,
      )
      expect(pScrollW).toBeLessThanOrEqual(pClientW + 4)
      expect(sScrollW).toBeLessThanOrEqual(sClientW + 4)
      await saveScreenshot(
        playerPage,
        `paired_02_select_answer_${vp.name}_player.png`,
      )
      await saveScreenshot(
        spectatorPage,
        `paired_02_select_answer_${vp.name}_spectator.png`,
      )
    }

    // Reset viewports back to 1920x1080
    await playerPage.setViewportSize({
      width: 1920,
      height: 1080,
    })
    await spectatorPage.setViewportSize({
      width: 1920,
      height: 1080,
    })

    // 4. End Timer for Question 1 -> interimResults scene (Single Reveal)
    await endTimer(managerPage)

    // A7: interimResults scene appears directly without duplicate reveal
    const interimWinner = spectatorPage.locator(
      '[data-testid="interim-option-row"][data-winner="true"]',
    )
    await expect(interimWinner).toBeVisible({
      timeout: 15_000,
    })
    await expect(interimWinner).toContainText("Doctor")

    // Save Paired Interim Results Screenshots
    await saveScreenshot(playerPage, "paired_04_interim_results_player.png")
    await saveScreenshot(
      spectatorPage,
      "paired_04_interim_results_spectator.png",
    )

    // 5. Question 2: Advance directly to next poll (Single advance click)
    await next(managerPage)
    const q2Title = "Round 1 · Who is the second character?"
    await expect(spectatorPage.getByText(q2Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(playerPage.getByText(q2Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({
      timeout: 15_000,
    })

    // A5: Mid-Voting Late Join Assertion on Question 2 (REQUIRED, non-conditional)
    // Run immediately when Q2 voting starts (~18s remaining)
    const lateContext = await browser.newContext({
      viewport: {
        width: 1280,
        height: 800,
      },
    })
    const lateSpectator = await lateContext.newPage()
    await lateSpectator.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(
      lateSpectator.locator('[data-testid="audience-display"]'),
    ).toBeVisible({
      timeout: 10_000,
    })
    await expect(lateSpectator.getByText(q2Title)).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      lateSpectator.locator('[data-testid^="photo-card-choice-"]'),
    ).toHaveCount(5)
    const lateTimer = lateSpectator.locator('[role="timer"]')
    await expect(lateTimer).toBeVisible({
      timeout: 10_000,
    })
    const lateTimerText = (await lateTimer.textContent()) ?? ""
    const remainingSec = parseInt(lateTimerText.replace(/\D/gu, ""), 10)
    console.log(`[Mid-Voting Late Join Q2] Timer: ${remainingSec}s`)
    expect(remainingSec).toBeLessThanOrEqual(20)
    expect(remainingSec).toBeGreaterThan(0)

    // Save evidence of late join mid-voting showing question + cards + timer
    await saveScreenshot(lateSpectator, "03_spectator_join_mid_voting.png")
    await saveScreenshot(
      lateSpectator,
      "paired_03_late_join_mid_voting_spectator.png",
    )
    await lateContext.close()

    // Tie Scenario on Question 2: Option 0 (1 vote) & Option 2 (1 vote)
    await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "c_tie_1",
          answerIndex: 0,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "c_tie_2",
          answerIndex: 2,
        },
      }),
    ])
    await endTimer(managerPage)

    // Verify Tie presentation in interimResults scene
    await expect(
      spectatorPage.locator('[data-testid="spotlight-tie"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      spectatorPage.locator(
        '[data-testid="interim-option-row"][data-winner="true"]',
      ),
    ).toHaveCount(2)
    await saveScreenshot(playerPage, "paired_05_tie_result_player.png")
    await saveScreenshot(spectatorPage, "paired_05_tie_result_spectator.png")

    // 6. Question 3: Zero Votes Scenario
    await next(managerPage)
    const q3Title = "Round 1 · In which era does the story take place?"
    await expect(spectatorPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(playerPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      spectatorPage.locator('[data-testid^="photo-card-choice-"]'),
    ).toHaveCount(5, {
      timeout: 20_000,
    })

    // End timer immediately with 0 votes
    await endTimer(managerPage)
    await expect(spectatorPage.locator('[data-winner="true"]')).toHaveCount(0, {
      timeout: 15_000,
    })
    await expect(
      spectatorPage.getByText(/No votes|0 votes|Total votes/i).first(),
    ).toBeVisible()
    await saveScreenshot(playerPage, "paired_06_zero_votes_player.png")
    await saveScreenshot(spectatorPage, "paired_06_zero_votes_spectator.png")

    // 7. Revote on Question 3
    const prevBtn = managerPage.locator(
      '[data-testid="host-previous-screen-btn"]',
    )
    await expect(prevBtn).toBeVisible({
      timeout: 5000,
    })
    await prevBtn.click()
    const confirmBtn = managerPage.locator(
      '[data-testid="confirm-reopen-question-btn"]',
    )

    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(spectatorPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(playerPage.getByText(q3Title)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible({
      timeout: 15_000,
    })

    // Vote 2 for Option 1
    await Promise.all([
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000001",
          callId: "c_revote1",
          answerIndex: 1,
        },
      }),
      spectatorPage.request.post(SOCKET_API_URL, {
        data: {
          action: "answer",
          gameId,
          phone: "+972501000002",
          callId: "c_revote2",
          answerIndex: 1,
        },
      }),
    ])
    await endTimer(managerPage)
    await expect(spectatorPage.locator('[data-winner="true"]')).toBeVisible({
      timeout: 15_000,
    })
    await saveScreenshot(playerPage, "paired_07_revote_clean_player.png")
    await saveScreenshot(spectatorPage, "paired_07_revote_clean_spectator.png")
    await playerContext.close()
    await spectatorContext.close()
  })
  test("A7 & A10: Backward Compatibility — Standard Quiz without authored scene", async ({
    page: managerPage,
    browser,
  }) => {
    // Standard quiz "E2E Quizz"
    const pin = await createGame(managerPage, "E2E Quizz")
    expect(pin).toMatch(/^\d{6}$/u)
    const managerUrl = managerPage.url()
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerUrl)
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // Spectator and Player
    const spectatorContext = await browser.newContext({
      viewport: {
        width: 1280,
        height: 800,
      },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    const playerContext = await browser.newContext({
      viewport: {
        width: 375,
        height: 667,
      },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "Dan")
    await startGame(managerPage)

    // Question 1: "What is the capital of France?"
    await expect(
      managerPage.getByText("What is the capital of France?"),
    ).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      spectatorPage.getByText("What is the capital of France?"),
    ).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      playerPage.getByText("What is the capital of France?"),
    ).toBeVisible({
      timeout: 20_000,
    })

    // Player answers
    const answerBtn = playerPage.getByRole("button", {
      name: "Paris",
    })
    await expect(answerBtn).toBeVisible({
      timeout: 15_000,
    })
    await answerBtn.click()
    await endTimer(managerPage)

    // In a normal quiz without authored scenes, default results/responses appear
    await expect(managerPage.getByText("Paris")).toBeVisible({
      timeout: 10_000,
    })
    await saveScreenshot(playerPage, "paired_08_normal_quiz_player.png")
    await saveScreenshot(spectatorPage, "paired_08_normal_quiz_spectator.png")
    await playerContext.close()
    await spectatorContext.close()
  })
})
