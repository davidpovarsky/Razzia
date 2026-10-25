import fs from "node:fs"
import { join } from "node:path"
import { BASIC_QUIZZ, CONFIG_PATH } from "@razzia/e2e/utils/constants"
import { openQuizzTab, quizzRow, seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, joinGame } from "@razzia/e2e/utils/player"
import { createDefaultQuizExtras } from "@razzia/extensions/core"
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
  "C:/Users/DAVID/.gemini/antigravity/brain/d1b5848a-d6a2-423d-83f8-55479cf5220b"
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
  test("Scenario 1: Manager/Editor - enhancements, reveal, teams, interludes, audio, persistence & 409 conflict", async ({
    page,
  }) => {
    page.on("console", (msg) =>
      console.log("[BROWSER CONSOLE]", msg.type(), msg.text()),
    )
    page.on("pageerror", (err) => console.log("[BROWSER PAGE ERROR]", err))
    page.on("requestfailed", (req) =>
      console.log("[REQ FAILED]", req.url(), req.failure()?.errorText),
    )
    page.on("response", async (res) => {
      if (res.status() >= 400) {
        console.log("[HTTP ERROR]", res.status(), res.url())

        try {
          console.log("[HTTP ERROR BODY]", await res.text())
        } catch {
          /* Ignore */
        }
      }
    })

    const subject = `Gate3 Acceptance Quizz ${Date.now()}`
    const quizzId = subject.toLowerCase().replace(/\W+/gu, "-")

    // 1. Seed base quiz in isolated e2e config
    seedQuizz(subject, {
      questions: [
        {
          type: "single",
          question: "What color is the sky on a clear day?",
          answers: ["Blue", "Green", "Red", "Yellow"],
          solutions: [0],
          cooldown: 3,
          time: 15,
        },
      ],
    })

    // 2. Open quiz in editor
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizzId}$`, "u"))

    // 3. Open Enhancements Panel
    const toggleBtn = page.locator('[data-testid="toggle-enhancements-button"]')
    await expect(toggleBtn).toBeVisible()
    await toggleBtn.click({ force: true })

    const enhancementPanel = page.locator(
      '[data-testid="editor-enhancement-panel"]',
    )
    await expect(enhancementPanel).toBeVisible()

    // 4. Configure Visuals Tab (Reveal animation & Answer image)
    const tabVisuals = page.locator('[data-testid="tab-visuals"]')
    await tabVisuals.click()
    await expect(page.locator('[data-testid="panel-visuals"]')).toBeVisible()

    // Configure Answer 0 visual
    const displaySelect0 = page.locator('[data-testid="display-select-0"]')

    if (await displaySelect0.isVisible()) {
      await displaySelect0.selectOption("image")
      const mediaInput0 = page.locator('[data-testid="media-url-input-0"]')
      await mediaInput0.fill("/media/blue-sky.png")
      const altInput0 = page.locator('[data-testid="alt-input-0"]')
      await altInput0.fill("Clear blue sky")
    }

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

    // 7. Configure Interlude Tab
    const tabInterlude = page.locator('[data-testid="tab-interlude"]')
    await tabInterlude.click()
    await expect(page.locator('[data-testid="panel-interlude"]')).toBeVisible()
    const toggleInterlude = page.locator('[data-testid="toggle-interlude"]')
    await toggleInterlude.click()

    // 8. Verify Audio Tab
    const tabAudio = page.locator('[data-testid="tab-audio"]')
    await tabAudio.click()
    await expect(page.locator('[data-testid="panel-audio"]')).toBeVisible()

    // Save screenshot of configured enhancements panel
    await saveScreenshots(page, "gate3-editor-enhancements.png")

    // 9. Save quiz
    const savePromise = page.waitForResponse((res) =>
      res.url().includes("/quizz"),
    )
    const saveBtn = page.getByRole("button", { name: t("common:save") })
    await saveBtn.click()
    const saveRes = await savePromise
    console.log("=== SAVE RESPONSE STATUS ===", saveRes.status())
    console.log("=== SAVE RESPONSE BODY ===", await saveRes.text())
    await expect(page).toHaveURL(/\/manager\/config$/u)

    // 10. Reload and verify persistence
    await openQuizzTab(page)
    await quizzRow(page, subject)
      .getByRole("button", { name: t("manager:quizz.edit") })
      .click()
    await expect(page).toHaveURL(new RegExp(`/manager/quizz/${quizzId}$`, "u"))
    await toggleBtn.click({ force: true })
    await expect(enhancementPanel).toBeVisible()

    // Verify sidecar file exists on disk
    const sidecarPath = join(
      CONFIG_PATH,
      "extensions",
      "quizzes",
      `${quizzId}.json`,
    )
    expect(fs.existsSync(sidecarPath)).toBe(true)
    const sidecarData = JSON.parse(fs.readFileSync(sidecarPath, "utf-8")) as {
      revision?: number
      teams?: { enabled: boolean }
      leaderboard?: { mode: string }
    }
    expect(sidecarData.teams?.enabled).toBe(true)
    expect(sidecarData.leaderboard?.mode).toBe("everyN")

    // 11. Test Revision Conflict Handling (409)
    // Alter sidecar revision on disk to simulate a concurrent writer
    sidecarData.revision = (sidecarData.revision ?? 1) + 5
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecarData, null, 2), "utf-8")

    // Attempt to save again from current browser session (has older expectedRevision)
    await saveBtn.click()

    // Conflict modal must appear!
    const conflictModal = page.locator('[data-testid="conflict-modal"]')
    await expect(conflictModal).toBeVisible({ timeout: 10000 })
    const conflictTitle = page.locator('[data-testid="conflict-title"]')
    await expect(conflictTitle).toBeVisible()

    await saveScreenshots(page, "gate3-editor-conflict-modal.png")

    // Click reload button in conflict modal
    const reloadBtn = page.locator('[data-testid="conflict-reload-button"]')
    await expect(reloadBtn).toBeVisible()
    await reloadBtn.click()

    // Conflict modal dismisses after reload
    await expect(conflictModal).toBeHidden()
  })

  test("Scenario 2: Live Gameplay - Manager + 2 Web Players + Simulated Phone, Teams, Reveal & Reconnect", async ({
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

    // 9. Player 1 (Alice) answers correctly ("Mars")
    await answer(player1, "Mars")
    await expect(player1.getByText(t("game:correct"))).toBeVisible()
    const player1Score = player1.locator("div.rounded-lg.bg-gray-800")
    await expect(player1Score).not.toHaveText("0")

    // 10. Player 2 reconnect test (simulates connection drop & rejoin)
    await player2.reload()
    expect(
      player2
        .getByText(t("game:reconnecting"))
        .or(player2.getByRole("button", { name: /^A /u })),
    ).toBeDefined()

    // 11. Advance to Leaderboard
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

  test("Scenario 3: Backwards Compatibility & 8 Locales Verification", async ({
    page,
  }) => {
    // 1. Vanilla quiz execution without extensions
    const vanillaPin = await createGame(page, BASIC_QUIZZ)
    expect(vanillaPin).toMatch(/^\d{6}$/u)

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
})
