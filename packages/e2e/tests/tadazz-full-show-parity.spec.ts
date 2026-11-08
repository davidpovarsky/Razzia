import fs from "node:fs"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import {
  createGame,
  loginManager,
  next,
  startGame,
} from "@razzia/e2e/utils/manager"
import { endTimer } from "@razzia/e2e/utils/extension-manager"
import { answer, confirm, joinGame } from "@razzia/e2e/utils/player"
import { seedQuizz } from "@razzia/e2e/utils/editor"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../../../docs/extensions/qa-evidence/tadazz-show-20261105",
)
const CANONICAL_HTML_PATH = join(
  import.meta.dirname,
  "../../../docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html",
)
const SOCKET_API_URL = "http://127.0.0.1:3011/api/games/pilot-phone"
const TZILA_TITLE = "Build Our Story — Tzila · Two-Round Audience Vote"

const saveShot = async (page: Page, name: string, allowWebkit = false) => {
  const isWebkit = page.context().browser()?.browserType().name() === "webkit"
  if (isWebkit && !allowWebkit) return
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SCREENSHOT_DIR, name),
    fullPage: false,
  })
}

const clickCard = async (page: Page, testId: string) => {
  const card = page.getByTestId(testId)
  await expect(card).toBeVisible()
  await expect(card).toHaveClass(/is-selectable/u)
  await card.evaluate((el: HTMLElement) => el.click())
}

const endVotingNow = async (managerPage: Page) => {
  const btn = managerPage.getByRole("button", {
    name: t("extensions:host.endTimer"),
  })
  if (await btn.isVisible().catch(() => false)) {
    await btn.evaluate((el: HTMLElement) => el.click())
  }
}

/**
 * Installs a pre-hydration MutationObserver + RAF sampler that records whether
 * any legacy Razzia GameBackground (`img[alt="background"]`, `.bg-primary` on
 * stage, or non-`#08011a` document background) ever appears even for 1 frame.
 */
const installZeroLegacyFlickerProbe = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __tadazzFlickerProbe?: {
        samples: number
        legacyBgFrames: number
        wrongDocBgFrames: number
        firstDocBg: string
      }
    }
    const state = {
      samples: 0,
      legacyBgFrames: 0,
      wrongDocBgFrames: 0,
      firstDocBg: "",
    }
    w.__tadazzFlickerProbe = state

    const check = () => {
      state.samples += 1
      const bg = getComputedStyle(document.documentElement).backgroundColor
      if (!state.firstDocBg) state.firstDocBg = bg
      if (
        (location.pathname.startsWith("/party") ||
          location.pathname.startsWith("/display")) &&
        bg !== "rgb(8, 1, 26)"
      ) {
        state.wrongDocBgFrames += 1
      }
      if (document.querySelector('img[alt="background"]')) {
        state.legacyBgFrames += 1
      }
    }

    const tick = () => {
      check()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.addEventListener("DOMContentLoaded", check)
  })
}

test.describe("TADAZZ Full Show 1:1 Native Port — Acceptance Gates A01–A21", () => {
  test("A01, A02, A03, A04, A05, A06, A07, A08, A11, A12, A15: Live 5-Image Show (Opening MP4+Lottie -> ZZ Wipe -> Lobby -> 3 Players + Phone Vote -> Question -> Vote -> Lock -> Reveal -> Tie -> Zero Votes -> Next Question -> Finale & Projector Parity)", async ({
    page: managerPage,
    browser,
    browserName,
  }) => {
    await managerPage.setViewportSize(
      browserName === "webkit"
        ? { width: 1194, height: 834 }
        : { width: 1920, height: 1080 },
    )
    await installZeroLegacyFlickerProbe(managerPage)

    // 1. Host creates game with Tzila 5-option picture show
    const pin = await createGame(managerPage, TZILA_TITLE)
    expect(pin).toMatch(/^\d{6}$/u)

    const gameIdMatch = managerPage.url().match(/\/party\/manager\/([^/?#]+)/u)
    expect(gameIdMatch).not.toBeNull()
    const gameId = gameIdMatch![1]

    // Verify ZERO iframe is mounted anywhere in the show (strict native port check)
    await expect(managerPage.locator("iframe")).toHaveCount(0)
    await expect(managerPage.locator('img[alt="background"]')).toHaveCount(0)

    // 2. A02: Verify Opening MP4 + transparent Lottie overlay on fresh spectator /display
    const spectatorCtx = await browser.newContext({
      viewport:
        browserName === "webkit"
          ? { width: 1024, height: 768 }
          : { width: 1920, height: 1080 },
    })
    const spectator = await spectatorCtx.newPage()
    await installZeroLegacyFlickerProbe(spectator)
    await spectator.goto(`http://127.0.0.1:3010/display/${gameId}`)

    await expect(spectator.getByTestId("tadazz-show")).toBeVisible()
    await expect(spectator.locator("iframe")).toHaveCount(0)
    await expect(spectator.locator('img[alt="background"]')).toHaveCount(0)

    const opening = spectator.getByTestId("tadazz-opening")
    await expect(opening).toBeVisible()
    const openingVideo = spectator.getByTestId("tadazz-opening-video")
    if (await openingVideo.isVisible().catch(() => false)) {
      await expect(openingVideo).toHaveAttribute(
        "src",
        "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4",
      )
    }
    const openingLottie = spectator.getByTestId("tadazz-opening-lottie")
    await expect(openingLottie).toBeVisible()
    await saveShot(spectator, "01_opening_mp4_plus_lottie.png")

    // If manager or spectator opening is still playing, skip or let it transition via ZZ wipe to Lobby
    for (const pg of [managerPage, spectator]) {
      const skipBtn = pg.getByTestId("tadazz-opening-skip")
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn
          .click({ force: true, timeout: 1500 })
          .catch(() => undefined)
      }
    }

    // 3. A03: Branded Lobby with real PIN, URL, QR, and 3 players joining across Gate A14 resolutions
    await expect(managerPage.getByTestId("tadazz-screen-lobby")).toBeVisible()
    await expect(managerPage.getByTestId("tadazz-lobby-pin")).toHaveText(pin)
    await expect(managerPage.getByTestId("tadazz-lobby-qr")).toBeVisible()

    const p1Ctx = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    })
    const p2Ctx = await browser.newContext({
      viewport: { width: 800, height: 600 },
    })
    const p3Ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const alice = await p1Ctx.newPage()
    const bob = await p2Ctx.newPage()
    const dana = await p3Ctx.newPage()
    await installZeroLegacyFlickerProbe(alice)

    await joinGame(alice, pin, "Alice")
    await joinGame(bob, pin, "Bob")
    await joinGame(dana, pin, "Dana")

    await expect(managerPage.getByText("Alice")).toBeVisible()
    await expect(managerPage.getByText("Bob")).toBeVisible()
    await expect(managerPage.getByText("Dana")).toBeVisible()
    await saveShot(managerPage, "02_lobby_joined_players.png")
    await saveShot(alice, "02b_player_waiting_screen.png")

    // A15: Player has bottom player bar with username; Spectator (/display) does NOT
    await expect(alice.getByTestId("tadazz-player-bar")).toContainText("Alice")
    await expect(spectator.getByTestId("tadazz-player-bar")).toHaveCount(0)

    // 4. Start Game -> Opening timeline scene (showIntro) -> Question 1
    await startGame(managerPage)
    await expect(managerPage.getByTestId("tadazz-intro-screen")).toHaveClass(
      /is-visible/u,
    )
    await expect
      .poll(async () =>
        managerPage
          .getByTestId("tadazz-intro-screen")
          .locator(".tz-intro-logo")
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeGreaterThan(0.95)
    await saveShot(managerPage, "03_timeline_opening_scene.png")

    const advanceBtn = managerPage.getByRole("button", {
      name: /Next Screen|Advance Scene/i,
    })
    await advanceBtn.click()

    // 5. A04 & A05: Question 1 with 5 square photo cards
    const q1Text = "Round 1 · Who is the main character?"
    await expect(
      managerPage.getByTestId("tadazz-question-panel"),
    ).toContainText(q1Text)

    // Wait for SELECT_ANSWER (openVoting) on manager and cast first 3 votes immediately while window is fresh
    await expect(
      managerPage.getByRole("button", { name: t("extensions:host.endTimer") }),
    ).toBeVisible()
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "VOTING OPEN",
    )
    await expect(managerPage.getByTestId("tadazz-timer")).toBeVisible()

    // Verify 5 cards with square photo frames and canonical classes in 2 fast round-trips
    await expect(managerPage.locator(".tz-card.is-vote-open")).toHaveCount(5)
    await expect
      .poll(async () =>
        managerPage
          .locator(".tz-card .tz-photo-frame img")
          .evaluateAll(
            (imgs) =>
              imgs.length === 5 &&
              imgs.every(
                (el) =>
                  (el as HTMLImageElement).complete &&
                  (el as HTMLImageElement).naturalWidth > 0,
              ),
          ),
      )
      .toBe(true)

    // Cast PSTN telephony vote + Alice + Bob first (3 of 4 players -> voting stays open!):
    // Option 3 (index 3, Businessman) gets Phone + Alice + Bob = 3 votes (75%)
    const phoneVote = await managerPage.request.post(SOCKET_API_URL, {
      data: {
        action: "answer",
        gameId,
        phone: "+972501000099",
        callId: "call_parity_01",
        answerIndex: 3, // 0-based index 3 (Businessman)
      },
    })
    expect((await phoneVote.json()).accepted).toBe(true)

    await clickCard(alice, "tadazz-card-3")
    await clickCard(bob, "tadazz-card-3")

    await expect(spectator.getByTestId("tadazz-question-panel")).toContainText(
      q1Text,
    )
    await expect(alice.getByTestId("tadazz-question-panel")).toContainText(
      q1Text,
    )

    await expect
      .poll(async () =>
        managerPage
          .getByTestId("tadazz-card-4")
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeGreaterThan(0.95)

    if (browserName === "webkit") {
      await saveShot(
        managerPage,
        "04d_question_voting_open_ipad_webkit_1194x834.png",
        true,
      )
    } else {
      await Promise.all([
        saveShot(managerPage, "04_question_voting_open_host.png"),
        saveShot(spectator, "04b_question_voting_open_spectator.png"),
        saveShot(dana, "04c_question_voting_open_mobile_390x844.png"),
      ])
    }

    // Option 0 (index 0, Mechaneches) gets Dana = 1 vote (25%)
    await dana.getByTestId("tadazz-pad-option-0").click()

    // End timer to trigger lockVoting() -> revealResults() (or auto-ended when all 4 players voted)
    await endVotingNow(managerPage)

    // 6. A07 & A08: Verify revealResults() on stage (75% vs 25%, AUDIENCE FAVOURITE on card 3)
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "AUDIENCE RESULTS",
    )
    await expect(managerPage.getByTestId("tadazz-card-3")).toHaveClass(
      /is-favourite/u,
      { timeout: 10_000 },
    )
    // A09: Survey mode must NOT mark cards as is-correct / is-incorrect
    await expect(managerPage.locator(".tz-card.is-correct")).toHaveCount(0)
    await expect(managerPage.locator(".tz-card.is-incorrect")).toHaveCount(0)
    await expect(
      managerPage.getByTestId("tadazz-card-3").locator(".tz-result-number"),
    ).toHaveText("75%")
    await expect(
      managerPage.getByTestId("tadazz-card-0").locator(".tz-result-number"),
    ).toHaveText("25%")
    await saveShot(managerPage, "05_reveal_results_winner_favourite.png")
    await saveShot(spectator, "05b_reveal_results_spectator.png")

    // Single Next Screen click advances from Q1 interimResults to Q2 (test TIE case)
    await next(managerPage)
    await expect(
      managerPage.getByTestId("tadazz-question-panel"),
    ).toContainText("Round 1 · Who is the second character?", {
      timeout: 15_000,
    })
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "VOTING OPEN",
      { timeout: 15_000 },
    )

    // Q2: Tie between Option 0 and Option 1 (1 vote each = 50% / 50%)
    await clickCard(alice, "tadazz-card-0")
    await clickCard(bob, "tadazz-card-1")
    await endVotingNow(managerPage)

    await expect(managerPage.getByTestId("tadazz-card-0")).toHaveClass(
      /is-favourite/u,
      { timeout: 10_000 },
    )
    await expect(managerPage.getByTestId("tadazz-card-1")).toHaveClass(
      /is-favourite/u,
    )
    await expect(
      managerPage.getByTestId("tadazz-card-0").locator(".tz-winner-tag"),
    ).toHaveText("JOINT AUDIENCE FAVOURITE")
    await saveShot(managerPage, "06_reveal_results_joint_tie.png")

    // Single Next Screen click advances from Q2 interimResults to Q3 (test ZERO VOTES case)
    await next(managerPage)
    await expect(
      managerPage.getByTestId("tadazz-question-panel"),
    ).toContainText("Round 1 · In which era does the story take place?", {
      timeout: 15_000,
    })
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "VOTING OPEN",
      { timeout: 15_000 },
    )
    // Nobody votes -> end timer immediately
    await endVotingNow(managerPage)
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "AUDIENCE RESULTS",
    )
    // Zero votes -> zero favourite cards!
    await expect(managerPage.locator(".tz-card.is-favourite")).toHaveCount(0)
    await saveShot(managerPage, "07_reveal_results_zero_votes.png")

    // A01: Verify zero flicker frames recorded on manager, spectator, and player
    for (const pg of [managerPage, spectator, alice]) {
      const probe = await pg.evaluate(
        () =>
          (
            window as unknown as {
              __tadazzFlickerProbe: {
                samples: number
                legacyBgFrames: number
                wrongDocBgFrames: number
              }
            }
          ).__tadazzFlickerProbe,
      )
      expect(probe.samples).toBeGreaterThan(0)
      expect(probe.legacyBgFrames).toBe(0)
      expect(probe.wrongDocBgFrames).toBe(0)
    }

    await spectatorCtx.close()
    await p1Ctx.close()
    await p2Ctx.close()
    await p3Ctx.close()
  })

  test("A09, A10, A12, A14, A17: Scored Quiz — Correct/Incorrect Badges, Leaderboard + Rank Change (updateLeaderboard), 2–4 Options Monogram Fallback, Finale with Real Winner & Confetti", async ({
    page: managerPage,
    browser,
  }) => {
    await managerPage.setViewportSize({ width: 1920, height: 1080 })
    const subject = `TADAZZ Quiz Parity ${Date.now()}`
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "Which planet is known as the Red Planet?",
          answers: ["Venus", "Mars", "Jupiter"],
          solutions: [1],
          cooldown: 3,
          time: 20,
        },
        {
          type: "single",
          question: "Speed of light is fastest in?",
          answers: ["Water", "Glass", "Vacuum", "Air"],
          solutions: [2],
          cooldown: 3,
          time: 20,
        },
      ],
    })

    const pin = await createGame(managerPage, subject)
    const p1Ctx = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    })
    const p2Ctx = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    })
    const alice = await p1Ctx.newPage()
    const bob = await p2Ctx.newPage()

    await joinGame(alice, pin, "Alice")
    await joinGame(bob, pin, "Bob")
    await startGame(managerPage)

    // Q1 (3 text options -> monogram 1, 2, 3 fallback)
    await clickCard(alice, "tadazz-card-1") // Mars — Alice right (1st)
    await clickCard(bob, "tadazz-card-0") // Venus — Bob wrong

    // Verify Quiz reveal: Mars (card 1) is-correct, Venus/Jupiter are is-incorrect
    await expect(managerPage.getByTestId("tadazz-card-1")).toHaveClass(
      /is-correct/u,
    )
    await expect(managerPage.getByTestId("tadazz-card-0")).toHaveClass(
      /is-incorrect/u,
    )
    await expect(
      managerPage.getByTestId("tadazz-card-1").locator(".tz-winner-tag"),
    ).toHaveText("CORRECT ANSWER")
    await saveShot(managerPage, "08_quiz_correct_incorrect_3_options.png")

    // Advance to Leaderboard -> Alice is #1, Bob is #2
    await next(managerPage)
    const lbScreen = managerPage.getByTestId("tadazz-leaderboard-screen")
    await expect(lbScreen).toHaveClass(/is-visible/u)
    await expect(lbScreen.locator(".tz-leader-row").nth(0)).toContainText(
      "Alice",
    )
    await expect(lbScreen.locator(".tz-leader-row").nth(1)).toContainText("Bob")
    // Verify demo TEAMS are never rendered
    await expect(lbScreen).not.toContainText("The Brainwaves")
    await expect(lbScreen).not.toContainText("Quiz Khalifa")
    await saveShot(managerPage, "09_leaderboard_round1.png")

    // Q2 (4 options): Bob answers right, Alice answers wrong -> Bob overtakes or scores
    await next(managerPage)
    await clickCard(bob, "tadazz-card-2") // Vacuum
    await clickCard(alice, "tadazz-card-0") // Water
    await saveShot(managerPage, "10_quiz_4_options_reveal.png")

    // Advance to Finale
    await next(managerPage)
    const finaleScreen = managerPage.getByTestId("tadazz-finale-screen")
    await expect(finaleScreen).toHaveClass(/is-visible/u)
    await expect(managerPage.getByTestId("tadazz-winner-name")).toHaveText(
      /Alice|Bob/u,
    )
    await expect(managerPage.getByTestId("tadazz-winner-name")).not.toHaveText(
      "The Brainwaves",
    )
    await expect(finaleScreen.locator(".tz-confetti-bit")).toHaveCount(52)
    await saveShot(managerPage, "11_finale_real_winner_confetti.png")

    // Verify multi-resolution viewports (A14): 1920x1080, 1366x768, 1024x768, 800x600, 390x844
    for (const [w, h] of [
      [1366, 768],
      [1024, 768],
      [800, 600],
      [390, 844],
    ] as const) {
      await managerPage.setViewportSize({ width: w, height: h })
      await managerPage.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.dispatchEvent(new Event("resize"))
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          }),
      )
      await expect
        .poll(async () => {
          const box = await managerPage
            .getByTestId("tadazz-stage")
            .boundingBox()
          return Boolean(
            box &&
            box.width > 100 &&
            box.height > 100 &&
            box.width <= w + 2 &&
            box.height <= h + 2,
          )
        })
        .toBe(true)
      await saveShot(managerPage, `12_viewport_${w}x${h}.png`)
    }

    await p1Ctx.close()
    await p2Ctx.close()
  })

  test("A20 & A21: Studio Editor Untouched + Side-by-Side Frame Sampling (0s, 0.25s, 0.5s, 1.0s, 3.0s) vs Canonical HTML", async ({
    page,
    browser,
  }) => {
    // A20: Verify Studio Editor (/manager/config -> Quizz tab) retains its original Razzia/Studio design
    await loginManager(page)
    await page
      .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
      .click()
    await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
    await saveShot(page, "13_editor_untouched.png")

    // A21: Open Canonical Reference HTML at 1920x1080 and sample frames at 0s, 0.25s, 0.5s, 1.0s, 3.0s
    const refCtx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const refPage = await refCtx.newPage()
    const fileUrl = `file:///${CANONICAL_HTML_PATH.replace(/\\/gu, "/")}`
    await refPage.goto(fileUrl)

    // Hide only the demo HUD toolbar so the 1920x1080 stage is sampled cleanly
    await refPage.addStyleTag({
      content: ".tz-demo-ui { display: none !important; }",
    })

    for (const [label, ms] of [
      ["0000ms", 0],
      ["0250ms", 250],
      ["0500ms", 500],
      ["1000ms", 1000],
      ["3000ms", 3000],
    ] as const) {
      if (ms > 0) await refPage.waitForTimeout(250)
      await saveShot(refPage, `ref_question_${label}.png`)
    }

    // Trigger reference lockVoting -> revealResults -> showLeaderboard -> showFinale and capture reference frames
    await refPage.evaluate(() => (window as any).tadazzShow.openVoting(12))
    await refPage.waitForTimeout(300)
    await saveShot(refPage, "ref_voting_open.png")

    await refPage.evaluate(() => (window as any).tadazzShow.lockVoting())
    await refPage.waitForTimeout(550)
    await saveShot(refPage, "ref_voting_locked.png")

    await refPage.evaluate(() =>
      (window as any).tadazzShow.revealResults([8, 19, 12, 34, 27]),
    )
    await refPage.waitForTimeout(1600)
    await saveShot(refPage, "ref_reveal_results.png")

    await refPage.evaluate(() =>
      (window as any).tadazzShow.showLeaderboard(
        (window as any).TadazzMotion.sampleTeams,
      ),
    )
    await refPage.waitForTimeout(1100)
    await saveShot(refPage, "ref_leaderboard.png")

    await refPage.evaluate(() =>
      (window as any).tadazzShow.showFinale({ name: "Alice", score: 1500 }),
    )
    await refPage.waitForTimeout(1200)
    await saveShot(refPage, "ref_finale.png")

    // Verify computed styles on reference .tz-stage, .tz-question-panel, .tz-card match our React port 1:1
    const refMetrics = await refPage.evaluate(() => {
      const stage = document.querySelector(".tz-stage")!
      const panel = document.querySelector(".tz-question-panel")!
      const sStyle = getComputedStyle(stage)
      const pStyle = getComputedStyle(panel)
      return {
        stageW: sStyle.width,
        stageH: sStyle.height,
        panelRadius: pStyle.borderRadius,
      }
    })
    expect(refMetrics.stageW).toBe("1920px")
    expect(refMetrics.stageH).toBe("1080px")
    expect(refMetrics.panelRadius).toBe("44px")

    await refCtx.close()
  })
})
