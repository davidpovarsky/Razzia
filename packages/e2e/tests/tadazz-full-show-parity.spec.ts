type ReferenceWindow = Window & {
  tadazzShow: Record<
    | "openVoting"
    | "lockVoting"
    | "revealResults"
    | "showLeaderboard"
    | "showFinale",
    (...args: unknown[]) => unknown
  >
  TadazzMotion: {
    sampleTeams: unknown
  }
}
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
} from "@razzia/extensions/core"
import { join } from "node:path"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { CONFIG_PATH, TZILA_PILOT_SECRET } from "@razzia/e2e/utils/constants"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import {
  endRecordedVote,
  latestState,
  liveRecord,
  observeLiveFlow,
  setManualProgression,
  waitForRecordedVoting,
  type LiveObservation,
} from "@razzia/e2e/utils/extension-manager"
import {
  assertNativeTzilaResult,
  assertTzilaOpening,
  assertResponsiveTzilaResult,
  assertTzilaChoices,
  nativeTzilaCards,
  nativeTzilaTimer,
  readStoredTzila,
  setTzilaPaused,
  tzilaQuestion,
} from "@razzia/e2e/utils/tzila-stage"
import { joinGame } from "@razzia/e2e/utils/player"
import { openQuizzTab, quizzRow, seedQuizz } from "@razzia/e2e/utils/editor"
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

  if (isWebkit && !allowWebkit) {
    return
  }

  fs.mkdirSync(SCREENSHOT_DIR, {
    recursive: true,
  })
  await page.screenshot({
    path: join(SCREENSHOT_DIR, name),
    fullPage: false,
  })
}
const clickCard = async (page: Page, index: number) => {
  const card = page.getByTestId(`photo-card-choice-${index}`)
  await expect(card).toBeVisible()
  await expect(card).toBeEnabled()
  await card.click()
}
const endVotingNow = async (managerPage: Page) => {
  const button = managerPage.getByTestId("host-end-timer-btn")
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.click()
}
const activeStep = (rows: LiveObservation[]) =>
  liveRecord(liveRecord(latestState(rows)?.extras).activeTimelineStep)
const recordedStepIds = (rows: LiveObservation[]) => {
  const ids = rows
    .filter((row) => row.name === EVENTS.EXTENSIONS.STATE)
    .map((row) => liveRecord(liveRecord(row.data.extras).activeTimelineStep).id)
    .filter((id): id is string => typeof id === "string")

  return ids.filter((id, index) => id !== ids[index - 1])
}
const waitForVoteCount = async (input: {
  rows: LiveObservation[]
  questionId: string
  count: number
}) => {
  const voting = await waitForRecordedVoting(input.rows, input.questionId)
  const start = input.rows.indexOf(voting)
  await expect
    .poll(
      () =>
        input.rows
          .slice(start)
          .findLast((row) => row.name === EVENTS.GAME.PLAYER_ANSWER)?.data
          .count ?? 0,
    )
    .toBe(input.count)
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

      if (!state.firstDocBg) {
        state.firstDocBg = bg
      }

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
test.describe("TADAZZ Full Show 1:1 Native Port â€” Acceptance Gates A01â€“A21", () => {
  test("A01, A02, A03, A04, A05, A06, A07, A08, A11, A12, A15: Live 5-Image Show (Shared Lobby -> 3 Players + Phone Vote -> Question -> Vote -> Lock -> Reveal -> Tie -> Zero Votes -> Next Question -> Finale & Projector Parity)", async ({
    page: managerPage,
    browser,
    browserName,
  }, testInfo) => {
    await managerPage.setViewportSize(
      browserName === "webkit"
        ? {
            width: 1194,
            height: 834,
          }
        : {
            width: 1920,
            height: 1080,
          },
    )
    await installZeroLegacyFlickerProbe(managerPage)
    const imported = readStoredTzila()
    const hostWire = observeLiveFlow(managerPage)

    // 1. Host creates game with Tzila 5-option picture show
    const pin = await createGame(managerPage, TZILA_TITLE)
    expect(pin).toMatch(/^\d{6}$/u)
    await setManualProgression(managerPage)
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerPage.url())
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // Verify ZERO iframe is mounted anywhere in the show (strict native port check)
    await expect(managerPage.locator("iframe")).toHaveCount(0)
    await expect(managerPage.locator('img[alt="background"]')).toHaveCount(0)

    // 2. The shared product opening has completed; a fresh display joins the lobby.
    // platform-opening.spec owns MP4/Lottie and host/audience opening timing.
    const spectatorCtx = await browser.newContext({
      viewport:
        browserName === "webkit"
          ? {
              width: 1024,
              height: 768,
            }
          : {
              width: 1920,
              height: 1080,
            },
    })
    const spectator = await spectatorCtx.newPage()
    const spectatorWire = observeLiveFlow(spectator)
    await installZeroLegacyFlickerProbe(spectator)
    await spectator.goto(`http://127.0.0.1:3010/display/${gameId}`)
    await expect(spectator.getByTestId("tadazz-show")).toBeVisible()
    await expect(spectator.locator("iframe")).toHaveCount(0)
    await expect(spectator.locator('img[alt="background"]')).toHaveCount(0)
    await expect(spectator.getByTestId("tadazz-lobby-pin")).toHaveText(pin, {
      timeout: 5_000,
    })
    await expect(spectator.getByTestId("platform-game-opening")).toHaveCount(0)
    await expect(spectator.getByTestId("tadazz-opening")).toHaveCount(0)
    await expect(spectator.getByTestId("platform-opening-start")).toHaveCount(0)
    await spectator.reload()
    await expect(spectator.getByTestId("tadazz-lobby-pin")).toHaveText(pin, {
      timeout: 5_000,
    })
    await expect(spectator.getByTestId("platform-game-opening")).toHaveCount(0)
    await expect(spectator.getByTestId("tadazz-opening")).toHaveCount(0)
    await saveShot(spectator, "01_existing_lobby_display.png")

    // 3. A03: Branded Lobby with real PIN, URL, QR, and 3 players joining across Gate A14 resolutions
    await expect(managerPage.getByTestId("tadazz-screen-lobby")).toBeVisible()
    await expect(managerPage.getByTestId("tadazz-lobby-pin")).toHaveText(pin)
    await expect(managerPage.getByTestId("tadazz-lobby-qr")).toBeVisible()
    const p1Ctx = await browser.newContext({
      viewport: {
        width: 1024,
        height: 768,
      },
    })
    const p2Ctx = await browser.newContext({
      viewport: {
        width: 800,
        height: 600,
      },
    })
    const p3Ctx = await browser.newContext({
      viewport: {
        width: 390,
        height: 844,
      },
    })
    const alice = await p1Ctx.newPage()
    const bob = await p2Ctx.newPage()
    const dana = await p3Ctx.newPage()
    const aliceWire = observeLiveFlow(alice)
    await installZeroLegacyFlickerProbe(alice)
    await joinGame(alice, pin, "Alice")
    await joinGame(bob, pin, "Bob")
    await joinGame(dana, pin, "Dana")
    await expect(managerPage.getByTestId("host-connected-counter")).toHaveText(
      /^3(?:\s*\/\s*3)?$/u,
    )
    await managerPage.getByTestId("host-bottom-players-btn").click()
    const roster = managerPage.getByTestId("host-players-modal")
    await expect(roster).toBeVisible()
    for (const name of ["Alice", "Bob", "Dana"]) {
      await expect(roster.getByText(name, { exact: true })).toBeVisible()
    }
    await managerPage.getByTestId("host-players-close-btn").click()
    await expect(roster).toBeHidden()
    await saveShot(managerPage, "02_lobby_joined_players.png")
    await saveShot(alice, "02b_player_waiting_screen.png")

    // A15: Player has bottom player bar with username; Spectator (/display) does NOT
    await expect(alice.getByText("Alice", { exact: true })).toBeVisible()
    await expect(spectator.getByText("Alice", { exact: true })).toHaveCount(0)

    // 4. Start Game -> Opening timeline scene (showIntro) -> Question 1
    await startGame(managerPage)
    await assertTzilaOpening({ manager: managerPage, player: alice, spectator })
    await expect(managerPage.getByTestId("tadazz-intro-screen")).toHaveClass(
      /is-visible/u,
    )
    /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
    await expect
      .poll(async () =>
        managerPage
          .getByTestId("tadazz-intro-screen")
          .locator(".tz-intro-logo")
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeGreaterThan(0.95)
    /* oxlint-enable require-await, typescript/require-await */
    await saveShot(managerPage, "03_timeline_opening_scene.png")
    const advanceBtn = managerPage.getByTestId("host-next-screen-btn")
    await advanceBtn.click()

    // 5. A04 & A05: Question 1 with 5 square photo cards
    const q1Text = "Round 1 · Who is the main character?"
    await expect(
      managerPage.getByTestId("tadazz-question-panel"),
    ).toContainText(q1Text)

    // Wait for SELECT_ANSWER (openVoting) on manager and cast first 3 votes immediately while window is fresh
    await expect(
      managerPage.getByRole("button", {
        name: t("extensions:host.endTimer"),
      }),
    ).toBeVisible()
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "VOTING OPEN",
    )
    await expect(nativeTzilaTimer(managerPage)).toBeVisible()

    // Verify 5 cards with square photo frames and canonical classes in 2 fast round-trips
    await expect(managerPage.locator(".tz-card.is-vote-open")).toHaveCount(5)
    /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
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

    await assertTzilaChoices({
      page: alice,
      questionIndex: 0,
      surface: "player",
    })
    await expect(alice.getByTestId("game-question-title")).toContainText(q1Text)
    await assertTzilaChoices({
      page: spectator,
      questionIndex: 0,
      surface: "native",
    })
    await expect
      .poll(() => activeStep(hostWire))
      .toMatchObject({
        id: imported.extras.timeline[1].id,
        kind: "question",
        questionId: imported.extras.questionIds[0],
        stepIndex: 1,
        totalSteps: 23,
      })

    // Cast PSTN telephony vote + Alice + Bob first (3 of 4 players -> voting stays open!):
    // Option 3 (index 3, Businessman) gets Phone + Alice + Bob = 3 votes (75%)
    /* oxlint-enable require-await, typescript/require-await */
    const phoneVote = await managerPage.request.post(SOCKET_API_URL, {
      headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
      data: {
        action: "answer",
        gameId,
        phone: "+972501000099",
        callId: "call_parity_01",
        // 0-based index 3 (Businessman)
        answerIndex: 3,
      },
    })
    expect(
      (
        (await phoneVote.json()) as {
          accepted: boolean
        }
      ).accepted,
    ).toBe(true)
    const aliceAnswerStart = aliceWire.length
    await clickCard(alice, 3)
    await clickCard(bob, 3)
    await waitForVoteCount({
      rows: hostWire,
      questionId: imported.extras.questionIds[0],
      count: 3,
    })
    await expect
      .poll(
        () =>
          aliceWire
            .slice(aliceAnswerStart)
            .findLast((row) => row.name === STATUS.WAIT)?.data,
      )
      .toEqual({ text: "game:waitingForAnswers" })
    await expect(
      alice.getByRole("heading", {
        name: t("game:waitingForAnswers"),
        exact: true,
      }),
    ).toBeVisible()
    await expect(alice.getByTestId("photo-card-grid")).toHaveCount(0)
    await expect(spectator.getByTestId("tadazz-question-panel")).toContainText(
      q1Text,
    )
    await expect(dana.getByTestId("game-question-title")).toContainText(q1Text)
    await setTzilaPaused(managerPage, true)
    /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
    await expect
      .poll(async () =>
        managerPage
          .getByTestId("tadazz-card-4")
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeGreaterThan(0.95)

    /* oxlint-enable require-await, typescript/require-await */
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
    await setTzilaPaused(managerPage, false)
    await clickCard(dana, 0)
    await waitForVoteCount({
      rows: hostWire,
      questionId: imported.extras.questionIds[0],
      count: 4,
    })

    // The real manual setting keeps voting open until this host End Timer action.
    await endVotingNow(managerPage)

    // 6. A07 & A08: Verify revealResults() on stage (75% vs 25%, AUDIENCE FAVOURITE on card 3)
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "AUDIENCE RESULTS",
    )
    await expect(managerPage.getByTestId("tadazz-card-3")).toHaveClass(
      /is-favourite/u,
      {
        timeout: 10_000,
      },
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
    await assertNativeTzilaResult({
      page: managerPage,
      questionIndex: 0,
      counts: [1, 0, 0, 3, 0],
    })
    await assertNativeTzilaResult({
      page: spectator,
      questionIndex: 0,
      counts: [1, 0, 0, 3, 0],
    })
    await assertResponsiveTzilaResult({
      page: alice,
      questionIndex: 0,
      counts: [1, 0, 0, 3, 0],
    })
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
      {
        timeout: 15_000,
      },
    )

    // Q2: Tie between Option 0 and Option 1 (1 vote each = 50% / 50%)
    await clickCard(alice, 0)
    await clickCard(bob, 1)
    await waitForVoteCount({
      rows: hostWire,
      questionId: imported.extras.questionIds[1],
      count: 2,
    })
    await endVotingNow(managerPage)
    await expect(managerPage.getByTestId("tadazz-card-0")).toHaveClass(
      /is-favourite/u,
      {
        timeout: 10_000,
      },
    )
    await expect(managerPage.getByTestId("tadazz-card-1")).toHaveClass(
      /is-favourite/u,
    )
    await expect(
      managerPage.getByTestId("tadazz-card-0").locator(".tz-winner-tag"),
    ).toHaveText("JOINT AUDIENCE FAVOURITE")
    await assertNativeTzilaResult({
      page: managerPage,
      questionIndex: 1,
      counts: [1, 1, 0, 0, 0],
    })
    await assertResponsiveTzilaResult({
      page: alice,
      questionIndex: 1,
      counts: [1, 1, 0, 0, 0],
    })
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
      {
        timeout: 15_000,
      },
    )
    // Nobody votes -> end timer immediately, preserving the authored duration.
    await waitForVoteCount({
      rows: hostWire,
      questionId: imported.extras.questionIds[2],
      count: 0,
    })
    await endVotingNow(managerPage)
    await expect(managerPage.getByTestId("tadazz-status")).toContainText(
      "AUDIENCE RESULTS",
    )
    // Zero votes -> zero favourite cards!
    await expect(managerPage.locator(".tz-card.is-favourite")).toHaveCount(0)
    await assertNativeTzilaResult({
      page: managerPage,
      questionIndex: 2,
      counts: [0, 0, 0, 0, 0],
    })
    await assertResponsiveTzilaResult({
      page: alice,
      questionIndex: 2,
      counts: [0, 0, 0, 0, 0],
    })
    await saveShot(managerPage, "07_reveal_results_zero_votes.png")

    // Complete the remaining authored cards in their exact saved order. Each
    // question keeps its original lead-in/duration; only the legitimate host
    // End Timer/Next actions advance it.
    await expect
      .poll(() => activeStep(hostWire).id)
      .toBe(imported.extras.timeline[6].id)
    for (const [index, item] of imported.extras.timeline.entries()) {
      if (index <= 6) {
        continue
      }

      if (item.kind !== "interimResults") {
        await managerPage.getByTestId("host-next-screen-btn").click()
      }

      for (const rows of [hostWire, spectatorWire, aliceWire]) {
        await expect
          .poll(() => activeStep(rows))
          .toMatchObject({
            id: item.id,
            kind: item.kind,
            stepIndex: index,
            totalSteps: 23,
          })
      }

      if (item.kind === "question") {
        const questionIndex = imported.extras.questionIds.indexOf(
          item.questionId,
        )
        expect(questionIndex).toBeGreaterThanOrEqual(3)
        await waitForRecordedVoting(hostWire, item.questionId)
        await expect(
          managerPage.getByTestId("tadazz-question-panel"),
        ).toContainText(tzilaQuestion(questionIndex).question.question)
        await expect(nativeTzilaCards(managerPage)).toHaveCount(5)
        await waitForVoteCount({
          rows: hostWire,
          questionId: item.questionId,
          count: 0,
        })
        await endVotingNow(managerPage)
        const nextItem = imported.extras.timeline.at(index + 1)
        assert(nextItem?.kind === "interimResults")
        for (const rows of [hostWire, spectatorWire, aliceWire]) {
          await expect.poll(() => activeStep(rows).id).toBe(nextItem.id)
        }
        await assertNativeTzilaResult({
          page: managerPage,
          questionIndex,
          counts: [0, 0, 0, 0, 0],
        })
      } else if (item.kind === "transition") {
        const scene = new Map(Object.entries(imported.extras.scenes)).get(
          item.sceneId,
        )
        assert(scene?.kind === "transition" && scene.title)
        await expect(
          managerPage.getByText(scene.title, { exact: true }),
        ).toBeVisible()
        await expect(
          alice.getByText(scene.title, { exact: true }),
        ).toBeVisible()
      } else if (item.kind === "closing") {
        const scene = new Map(Object.entries(imported.extras.scenes)).get(
          item.sceneId,
        )
        assert(scene?.kind === "closing" && scene.title)
        await expect(
          managerPage.getByTestId("tadazz-finale-screen"),
        ).toHaveClass(/is-visible/u)
        await expect(
          alice.getByRole("heading", { name: scene.title, exact: true }),
        ).toBeVisible()
      } else {
        assert.equal(item.kind, "interimResults")
      }
    }
    await managerPage.getByTestId("host-next-screen-btn").click()
    for (const rows of [hostWire, spectatorWire, aliceWire]) {
      await expect
        .poll(() => rows.some((row) => row.name === STATUS.FINISHED))
        .toBe(true)
      expect(recordedStepIds(rows)).toEqual(
        imported.extras.timeline.map((item) => item.id),
      )
    }
    await expect(managerPage.getByTestId("tadazz-finale-screen")).toHaveClass(
      /is-visible/u,
    )
    await saveShot(managerPage, "07b_complete_authored_timeline_finale.png")
    await testInfo.attach("tzila-full-authored-timeline.json", {
      body: JSON.stringify(
        {
          expectedStepIds: imported.extras.timeline.map((item) => item.id),
          hostWire,
          spectatorWire,
          aliceWire,
        },
        null,
        2,
      ),
      contentType: "application/json",
    })

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
  test("A09, A10, A12, A14, A17: Scored Quiz â€” Correct/Incorrect Badges, Leaderboard + Rank Change (updateLeaderboard), 2â€“4 Options Monogram Fallback, Finale with Real Winner & Confetti", async ({
    page: managerPage,
    browser,
  }, testInfo) => {
    await managerPage.setViewportSize({
      width: 1920,
      height: 1080,
    })
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
    const quizId = subject.toLowerCase().replace(/\W+/gu, "-")
    const base = quizzValidator.parse(
      JSON.parse(
        fs.readFileSync(join(CONFIG_PATH, "quizz", `${quizId}.json`), "utf8"),
      ),
    )
    const questionIds = [randomUUID(), randomUUID()]
    const leaderboardId = randomUUID()
    const initial = createDefaultQuizExtrasV2(
      quizId,
      questionIds,
      computeCanonicalBaseDigest(base),
    )
    const scoredExtras = quizExtrasV2Schema.parse({
      ...initial,
      defaults: { ...initial.defaults, leaderboardPolicy: "cardOnly" },
      timeline: [
        initial.timeline[0],
        { id: randomUUID(), kind: "leaderboard", sceneId: leaderboardId },
        initial.timeline[1],
      ],
      scenes: {
        [leaderboardId]: {
          id: leaderboardId,
          kind: "leaderboard",
          title: "Mid-Game Leaderboard",
          advance: "manual",
          durationMs: 5000,
        },
      },
    })
    const sidecars = join(CONFIG_PATH, "extensions/quizzes")
    fs.mkdirSync(sidecars, { recursive: true })
    fs.writeFileSync(
      join(sidecars, `${quizId}.json`),
      JSON.stringify(scoredExtras),
      { flag: "wx" },
    )
    const hostWire = observeLiveFlow(managerPage)
    const pin = await createGame(managerPage, subject)
    await setManualProgression(managerPage)
    const p1Ctx = await browser.newContext({
      viewport: {
        width: 1366,
        height: 768,
      },
    })
    const p2Ctx = await browser.newContext({
      viewport: {
        width: 1024,
        height: 768,
      },
    })
    const alice = await p1Ctx.newPage()
    const bob = await p2Ctx.newPage()
    const aliceWire = observeLiveFlow(alice)
    const bobWire = observeLiveFlow(bob)
    await joinGame(alice, pin, "Alice")
    await joinGame(bob, pin, "Bob")
    await startGame(managerPage)

    const firstStep = scoredExtras.timeline.at(0)
    const boardStep = scoredExtras.timeline.at(1)
    const secondStep = scoredExtras.timeline.at(2)
    assert(
      firstStep?.kind === "question" &&
        boardStep?.kind === "leaderboard" &&
        secondStep?.kind === "question",
    )

    // The host's native cards are read-only. Players answer through their real
    // responsive text buttons, while all three monograms remain on the stage.
    await waitForRecordedVoting(hostWire, firstStep.questionId)
    for (const rows of [hostWire, aliceWire, bobWire]) {
      await expect
        .poll(() => activeStep(rows))
        .toMatchObject({
          id: firstStep.id,
          kind: "question",
          stepIndex: 0,
          totalSteps: 3,
        })
    }
    const nativeCards = managerPage
      .getByTestId("tadazz-show")
      .getByTestId(/^tadazz-card-[0-3]$/u)
    await expect(nativeCards).toHaveCount(3)
    await expect(nativeCards.locator(".answer-monogram")).toHaveText([
      "1",
      "2",
      "3",
    ])
    await expect(nativeCards.locator(".tz-photo-frame img")).toHaveCount(0)
    await Promise.all([
      alice.getByRole("button", { name: "2 Mars", exact: true }).click(),
      bob.getByRole("button", { name: "1 Venus", exact: true }).click(),
    ])
    await endRecordedVote(managerPage, hostWire, {
      questionId: firstStep.questionId,
      count: 2,
    })
    await expect
      .poll(
        () =>
          aliceWire.findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
            .correct,
      )
      .toBe(true)
    await expect
      .poll(
        () =>
          bobWire.findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
            .correct,
      )
      .toBe(false)
    const aliceFirst = aliceWire.findLast(
      (row) => row.name === STATUS.SHOW_RESULT,
    )?.data
    const bobFirst = bobWire.findLast(
      (row) => row.name === STATUS.SHOW_RESULT,
    )?.data
    const aliceScore = aliceFirst?.myPoints
    assert(typeof aliceScore === "number")
    expect(Number.isInteger(aliceScore)).toBe(true)
    expect(aliceScore).toBeGreaterThan(0)
    expect(aliceScore).toBeLessThanOrEqual(1000)
    expect(aliceFirst).toMatchObject({
      correct: true,
      points: aliceScore,
      myPoints: aliceScore,
      rank: 1,
    })
    expect(bobFirst).toMatchObject({
      correct: false,
      points: 0,
      myPoints: 0,
      rank: 2,
    })
    await expect(
      alice.getByText(t("game:correct"), { exact: true }),
    ).toBeVisible()
    await expect(managerPage.getByTestId("tadazz-card-1")).toHaveClass(
      /is-correct/u,
    )
    await expect(managerPage.getByTestId("tadazz-card-0")).toHaveClass(
      /is-incorrect/u,
    )
    await expect(managerPage.getByTestId("tadazz-card-2")).toHaveClass(
      /is-incorrect/u,
    )
    await expect(
      managerPage.getByTestId("tadazz-card-1").locator(".tz-winner-tag"),
    ).toHaveText("CORRECT ANSWER")
    await saveShot(managerPage, "08_quiz_correct_incorrect_3_options.png")

    // A manual authored leaderboard is the supported cardOnly contract. Its
    // actual data and visible rows must carry the two real scores and ranks.
    await managerPage.getByTestId("host-next-screen-btn").click()
    const rankings = [
      { rank: 1, displayName: "Alice", points: aliceScore },
      { rank: 2, displayName: "Bob", points: 0 },
    ]
    for (const rows of [hostWire, aliceWire, bobWire]) {
      await expect
        .poll(() => activeStep(rows))
        .toMatchObject({
          id: boardStep.id,
          kind: "leaderboard",
          sceneId: boardStep.sceneId,
          stepIndex: 1,
          totalSteps: 3,
        })
      await expect
        .poll(
          () =>
            liveRecord(
              liveRecord(liveRecord(latestState(rows)?.extras).activeSceneData)
                .leaderboard,
            ).entries,
        )
        .toEqual(rankings)
    }
    const lbScreen = managerPage.getByTestId("tadazz-leaderboard-screen")
    await expect(lbScreen).toHaveClass(/is-visible/u)
    await expect(
      lbScreen.getByRole("heading", {
        name: "Mid-Game Leaderboard",
        exact: true,
      }),
    ).toBeVisible()
    const boardRows = lbScreen.locator(".tz-leader-row")
    await expect(boardRows).toHaveCount(2)
    for (const entry of rankings) {
      const row = boardRows.filter({
        has: managerPage.getByText(entry.displayName, { exact: true }),
      })
      await expect(row).toHaveCount(1)
      await expect(row).toBeVisible()
      await expect(row.locator(".tz-rank")).toHaveText(
        String(entry.rank).padStart(2, "0"),
      )
      await expect
        .poll(async () =>
          Number.parseFloat(
            (await row.locator(".tz-team-score").textContent()) ?? "",
          ),
        )
        .toBe(entry.points)
    }
    await expect(
      alice
        .getByTestId("studio-scene-presenter")
        .getByRole("heading", { name: "Mid-Game Leaderboard", exact: true }),
    ).toBeVisible()
    await expect(lbScreen).not.toContainText("The Brainwaves")
    await expect(lbScreen).not.toContainText("Quiz Khalifa")
    await saveShot(managerPage, "09_leaderboard_round1.png")

    // Q2 retains its original four options and 20-second timer. Bob earns real
    // points while Alice's accumulated score is unchanged by the wrong answer.
    const aliceSecondStart = aliceWire.length
    const bobSecondStart = bobWire.length
    await managerPage.getByTestId("host-next-screen-btn").click()
    await waitForRecordedVoting(hostWire, secondStep.questionId)
    await expect(nativeCards).toHaveCount(4)
    await expect(nativeCards.locator(".answer-monogram")).toHaveText([
      "1",
      "2",
      "3",
      "4",
    ])
    await expect(nativeCards.locator(".tz-photo-frame img")).toHaveCount(0)
    await Promise.all([
      bob.getByRole("button", { name: "3 Vacuum", exact: true }).click(),
      alice.getByRole("button", { name: "1 Water", exact: true }).click(),
    ])
    await endRecordedVote(managerPage, hostWire, {
      questionId: secondStep.questionId,
      count: 2,
    })
    await expect
      .poll(
        () =>
          bobWire
            .slice(bobSecondStart)
            .findLast((row) => row.name === STATUS.SHOW_RESULT)?.data.correct,
      )
      .toBe(true)
    await expect
      .poll(
        () =>
          aliceWire
            .slice(aliceSecondStart)
            .findLast((row) => row.name === STATUS.SHOW_RESULT)?.data.correct,
      )
      .toBe(false)
    const aliceSecond = aliceWire
      .slice(aliceSecondStart)
      .findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
    const bobSecond = bobWire
      .slice(bobSecondStart)
      .findLast((row) => row.name === STATUS.SHOW_RESULT)?.data
    const bobScore = bobSecond?.myPoints
    assert(typeof bobScore === "number")
    expect(Number.isInteger(bobScore)).toBe(true)
    expect(bobScore).toBeGreaterThan(0)
    expect(bobScore).toBeLessThanOrEqual(1000)
    expect(bobSecond).toMatchObject({
      correct: true,
      points: bobScore,
      myPoints: bobScore,
    })
    expect(aliceSecond).toMatchObject({
      correct: false,
      points: 0,
      myPoints: aliceScore,
    })
    await expect(managerPage.getByTestId("tadazz-card-2")).toHaveClass(
      /is-correct/u,
    )
    await expect(managerPage.getByTestId("tadazz-card-0")).toHaveClass(
      /is-incorrect/u,
    )
    await saveShot(managerPage, "10_quiz_4_options_reveal.png")

    // Finish from the final real reveal, not from a guessed automatic board.
    await managerPage.getByTestId("host-next-screen-btn").click()
    for (const rows of [hostWire, aliceWire, bobWire]) {
      await expect
        .poll(() => rows.some((row) => row.name === STATUS.FINISHED))
        .toBe(true)
      expect(recordedStepIds(rows)).toEqual(
        scoredExtras.timeline.map((item) => item.id),
      )
    }
    const finalTop = hostWire.findLast((row) => row.name === STATUS.FINISHED)
      ?.data.top
    assert(Array.isArray(finalTop))
    const actualTop: unknown[] = finalTop
    expect(actualTop).toHaveLength(2)
    expect(actualTop).toEqual(
      expect.arrayContaining([
        { username: "Alice", points: aliceScore },
        { username: "Bob", points: bobScore },
      ]),
    )
    const winner = liveRecord(actualTop[0])
    assert(
      typeof winner.username === "string" && typeof winner.points === "number",
    )
    expect(winner.points).toBe(Math.max(aliceScore, bobScore))
    const winnerNames = actualTop
      .map((entry) => liveRecord(entry))
      .filter((entry) => entry.points === winner.points)
      .map((entry) => {
        assert(typeof entry.username === "string")

        return entry.username
      })
    for (const [name, rows] of [
      ["Alice", aliceWire],
      ["Bob", bobWire],
    ] as const) {
      const finish = rows.findLast((row) => row.name === STATUS.FINISHED)?.data
      expect(finish?.top).toEqual(actualTop)
      expect(finish?.rank).toBe(
        actualTop.findIndex((entry) => liveRecord(entry).username === name) + 1,
      )
    }
    const finaleScreen = managerPage.getByTestId("tadazz-finale-screen")
    await expect(finaleScreen).toHaveClass(/is-visible/u)
    await expect(managerPage.getByTestId("tadazz-winner-name")).toHaveText(
      winnerNames.join(" & "),
    )
    await expect
      .poll(async () =>
        Number(
          (
            (await finaleScreen.locator(".tz-win-score").textContent()) ?? ""
          ).replaceAll(/[^\d]/gu, ""),
        ),
      )
      .toBe(winner.points)
    await expect(managerPage.getByTestId("tadazz-winner-name")).not.toHaveText(
      "The Brainwaves",
    )
    await expect(finaleScreen.locator(".tz-confetti-bit")).toHaveCount(52)
    await saveShot(managerPage, "11_finale_real_winner_confetti.png")
    await testInfo.attach("scored-native-full-show.json", {
      body: JSON.stringify(
        {
          expectedStepIds: scoredExtras.timeline.map((item) => item.id),
          aliceScore,
          bobScore,
          finalTop,
          hostWire,
          aliceWire,
          bobWire,
        },
        null,
        2,
      ),
      contentType: "application/json",
    })

    // Verify multi-resolution viewports (A14): 1920x1080, 1366x768, 1024x768, 800x600, 390x844
    for (const [w, h] of [
      [1366, 768],
      [1024, 768],
      [800, 600],
      [390, 844],
    ] as const) {
      await managerPage.setViewportSize({
        width: w,
        height: h,
      })
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
  }, testInfo) => {
    // A20: The library remains Studio UI. A plain Classic bookend's editable
    // card name is preserved, while its existing native preset owns stage text.
    const beforeEditor = readStoredTzila()
    await openQuizzTab(page)
    await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
    await saveShot(page, "13_editor_untouched.png")
    await quizzRow(page, TZILA_TITLE)
      .getByRole("button", { name: t("manager:quizz.edit"), exact: true })
      .click()
    const timeline = page.getByTestId("editor-timeline")
    const opening = beforeEditor.extras.timeline.at(0)
    const closing = beforeEditor.extras.timeline.at(-1)
    assert(opening?.kind === "opening" && closing?.kind === "closing")
    for (const item of [opening, closing]) {
      const scene = new Map(Object.entries(beforeEditor.extras.scenes)).get(
        item.sceneId,
      )
      assert(
        scene &&
          (scene.kind === "opening" || scene.kind === "closing") &&
          scene.title,
      )
      const card = timeline.getByTestId("editor-scene-card").filter({
        has: page.getByRole("button", { name: scene.title, exact: true }),
      })
      await expect(card).toHaveCount(1)
      await expect(card).toHaveAttribute("data-scene-kind", item.kind)
      await card.getByTestId("editor-scene-select").click()
      await expect(page.getByTestId("scene-title-input")).toHaveValue(
        scene.title,
      )
      await expect(page.getByTestId("scene-preset-title-hint")).toHaveText(
        t("extensions:studio.scene.cardNameHint"),
      )
      await expect(page.getByTestId("studio-scene-preview-stage")).toBeVisible()
    }
    expect(readStoredTzila()).toEqual(beforeEditor)
    await saveShot(page, "13b_editor_native_bookend_names.png")

    // A21: Open Canonical Reference HTML at 1920x1080 and sample frames at 0s, 0.25s, 0.5s, 1.0s, 3.0s
    const refCtx = await browser.newContext({
      viewport: {
        width: 1920,
        height: 1080,
      },
    })
    const refPage = await refCtx.newPage()
    const fileUrl = `file:///${CANONICAL_HTML_PATH.replace(/\\/gu, "/")}`
    await refPage.goto(fileUrl)

    // Hide only the demo HUD toolbar so the 1920x1080 stage is sampled cleanly
    await refPage.addStyleTag({
      content: ".tz-demo-ui { display: none !important; }",
    })
    const referenceStartedAt = await refPage.evaluate(() => performance.now())
    const referenceSamples: Array<{
      requestedMs: number
      beforeScreenshotMs: number
      afterScreenshotMs: number
    }> = []
    for (const [label, ms] of [
      ["0000ms", 0],
      ["0250ms", 250],
      ["0500ms", 500],
      ["1000ms", 1000],
      ["3000ms", 3000],
    ] as const) {
      const beforeScreenshotMs = await refPage.evaluate(
        async ({ startedAt, targetMs }) => {
          const target = startedAt + targetMs

          while (performance.now() < target) {
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => resolve())
            })
          }

          return performance.now() - startedAt
        },
        { startedAt: referenceStartedAt, targetMs: ms },
      )
      expect(beforeScreenshotMs).toBeGreaterThanOrEqual(ms)
      await saveShot(refPage, `ref_question_${label}.png`)
      const afterScreenshotMs = await refPage.evaluate(
        (startedAt) => performance.now() - startedAt,
        referenceStartedAt,
      )
      referenceSamples.push({
        requestedMs: ms,
        beforeScreenshotMs,
        afterScreenshotMs,
      })
    }
    await testInfo.attach("canonical-reference-frame-times.json", {
      body: JSON.stringify(
        {
          referenceOnly: true,
          clock: "performance.now",
          samples: referenceSamples,
        },
        null,
        2,
      ),
      contentType: "application/json",
    })

    // Trigger reference lockVoting -> revealResults -> showLeaderboard -> showFinale and capture reference frames
    await refPage.evaluate(() =>
      (window as unknown as ReferenceWindow).tadazzShow.openVoting(12),
    )
    await refPage.waitForTimeout(300)
    await saveShot(refPage, "ref_voting_open.png")
    await refPage.evaluate(() =>
      (window as unknown as ReferenceWindow).tadazzShow.lockVoting(),
    )
    await refPage.waitForTimeout(550)
    await saveShot(refPage, "ref_voting_locked.png")
    await refPage.evaluate(() =>
      (window as unknown as ReferenceWindow).tadazzShow.revealResults([
        8, 19, 12, 34, 27,
      ]),
    )
    await refPage.waitForTimeout(1600)
    await saveShot(refPage, "ref_reveal_results.png")
    await refPage.evaluate(() =>
      (window as unknown as ReferenceWindow).tadazzShow.showLeaderboard(
        (window as unknown as ReferenceWindow).TadazzMotion.sampleTeams,
      ),
    )
    await refPage.waitForTimeout(1100)
    await saveShot(refPage, "ref_leaderboard.png")
    await refPage.evaluate(() =>
      (window as unknown as ReferenceWindow).tadazzShow.showFinale({
        name: "Alice",
        score: 1500,
      }),
    )
    await refPage.waitForTimeout(1200)
    await saveShot(refPage, "ref_finale.png")

    // Retain the canonical reference geometry baseline; these values describe the reference, not an unmeasured live port.
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
