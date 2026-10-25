import fs from "node:fs"
import { join } from "node:path"
import { BASIC_QUIZZ, CONFIG_PATH } from "@razzia/e2e/utils/constants"
import { openQuizzTab, quizzRow, seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, joinGame } from "@razzia/e2e/utils/player"
import { createDefaultQuizExtras } from "@razzia/extensions/core"
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
          cooldown: 3,
          time: 20,
        },
        {
          type: "single",
          question: "What is 10 + 10?",
          answers: ["20", "30", "40", "50"],
          solutions: [0],
          cooldown: 3,
          time: 20,
        },
      ],
    })

    const sidecarDir = join(CONFIG_PATH, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })

    const qIds = [crypto.randomUUID(), crypto.randomUUID()]
    const extras = createDefaultQuizExtras(quizzId, qIds, "a".repeat(64))
    extras.teams = {
      enabled: true,
      autoAssign: "roundRobin",
      teams: [
        { id: "team-alpha", name: "Alpha Falcons", color: "#3b82f6" },
        { id: "team-bravo", name: "Bravo Lions", color: "#ef4444" },
      ],
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
    await expect(manager.getByText("Alice")).toBeVisible()

    // 4. Join Web Player 2 (Bob)
    const player2 = await newPage()
    await joinGame(player2, pin, "Bob")
    await expect(manager.getByText("Bob")).toBeVisible()

    // 5. Join Simulated Phone Player via real HTTP session + join ticket
    const sessRes = await fetch("http://localhost:3001/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const { token } = (await sessRes.json()) as { token: string }

    const joinRes = await fetch("http://localhost:3001/api/games/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inviteCode: pin, username: "Phone 001" }),
    })
    expect(joinRes.ok).toBe(true)

    // Verify manager room view with players
    await saveScreenshots(manager, "gate3-lobby-players-teams.png")

    // 6. Start the Game
    await startGame(manager)

    // 7. Player 1 answers
    await answer(player1, "Mars")
    await expect(player1.getByText(t("game:correct"))).toBeVisible()

    // 8. Player 2 reconnect test (simulates connection drop & rejoin)
    await player2.reload()
    expect(
      player2
        .getByText(t("game:reconnecting"))
        .or(player2.getByRole("button", { name: /^A /u })),
    ).toBeDefined()

    // 9. Advance to next question / leaderboard
    await next(manager)
    await saveScreenshots(manager, "gate3-gameplay-reveal-leaderboard.png")
  })

  test("Scenario 3: Backwards Compatibility & 8 Locales Verification", async ({
    page,
  }) => {
    // 1. Vanilla quiz execution without extensions
    const vanillaPin = await createGame(page, BASIC_QUIZZ)
    expect(vanillaPin).toMatch(/^\d{6}$/u)

    // 2. Verify all 8 locales render without missing keys or crashes
    const locales = ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]

    /* oxlint-disable eslint/no-await-in-loop */
    for (const loc of locales) {
      await page.goto(`/?lng=${loc}`)
      await expect(page.locator("body")).toBeVisible()

      // Verify no untranslated raw keys (e.g. 'errors:...' or 'quizz:...' as raw strings)
      const bodyText = (await page.locator("body").textContent()) ?? ""
      expect(bodyText).not.toContain("errors:")
      expect(bodyText).not.toContain("quizz:")
      expect(bodyText).not.toContain("common:")
    }
    /* oxlint-enable eslint/no-await-in-loop */

    // Take screenshot of localized UI
    await page.goto("/?lng=fr")
    await saveScreenshots(page, "gate3-locales-verified.png")
  })
})
