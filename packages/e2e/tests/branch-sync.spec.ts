import { test, expect } from "@playwright/test"
import { computeCanonicalBaseDigest, createDefaultQuizExtrasV2 } from "@razzia/extensions/core"
import { join } from "node:path"

for (const explicitSeating of [true, false]) {
  test(`synchronized seating metadata ${explicitSeating ? "uses native live table presence" : "keeps ordinary lobbies unchanged"}`, async ({ page, request, browser }, info) => {
    const login = await request.post("/api/auth/manager", { data: { password: "e2e-password" } })
    expect(login.ok()).toBe(true)
    const { token } = await login.json() as { token: string }
    const quizz = { subject: "Branch sync fixture", gameMode: "quiz", questions: [{ type: "single", question: "QA question", answers: ["One", "Two"], solutions: [0], time: 60, cooldown: 3 }] }
    const questionId = crypto.randomUUID()
    const extras = createDefaultQuizExtrasV2("draft", [questionId], computeCanonicalBaseDigest(quizz))
    const representatives = [{ table: 5, name: "QA Representative One" }, { table: 5, name: "QA Representative Two" }, { table: 9, name: "QA Other Table" }]
    const sceneId = crypto.randomUUID()
    extras.scenes[sceneId] = { id: sceneId, kind: "animation", preset: "representative-directory", title: "QA directory", durationMs: 1000, advance: "manual", seatingPlan: explicitSeating, representatives, dialNumber: "TEST-NO-CALLS" }
    extras.roster.participants = representatives.map(rep => ({ rosterPlayerId: crypto.randomUUID(), displayName: rep.name, tableNumber: rep.table, phoneE164: null }))
    const headers = { Authorization: `Bearer ${token}` }
    const created = await request.post("/api/extensions/quizzes", { headers, data: { quizz, extras } })
    expect(created.ok(), await created.text()).toBe(true)
    const { quizId } = await created.json() as { quizId: string }
    const saved = await request.get(`/api/extensions/quizzes/${quizId}`, { headers })
    const persisted = await saved.json() as { extras: typeof extras }
    expect(persisted.extras.scenes[sceneId]).toHaveProperty("seatingPlan", explicitSeating)
    const room = await request.post("/api/games", { headers, data: { quizzId: quizId } })
    expect(room.ok()).toBe(true)
    const game = await room.json() as { gameId: string; inviteCode: string }
    await page.addInitScript(value => localStorage.setItem("token", value), token)
    await page.goto(`/party/manager/${game.gameId}`)
    const skip = page.getByTestId("tadazz-opening-skip")

    if (await skip.isVisible()) {await skip.click()}

    await expect(page.getByTestId("tadazz-show")).toBeVisible()

    if (!explicitSeating) {
      // The authenticated host already sees its roster in the current native map.
      // An ordinary unflagged show's directory must remain absent from the public display.
      await expect(page.locator(".table-unit")).toHaveCount(31)
      const audienceBrowser = await browser.browserType().launch()

      try {
        const display = await audienceBrowser.newPage()
        await display.goto(`http://127.0.0.1:3170/display/${game.gameId}`)
        await expect(display.getByTestId("tadazz-lobby-pin")).toHaveText(game.inviteCode)
        await expect(display.locator(".tadazz-reference-seating")).toHaveCount(0)
        await expect(display.locator("body")).not.toContainText("QA Representative One")
      } finally { await audienceBrowser.close() }

      return
    }

    await expect(page.locator(".table-unit")).toHaveCount(31)
    const table = page.locator('.table-unit[data-table="5"]')
    await expect(table).toHaveAttribute("aria-label", "Table 5: QA Representative One, QA Representative Two")
    await expect(table).toHaveAttribute("data-connected", "false")
    await expect(page.getByTestId("tadazz-lobby-count")).toHaveText("0 / 2 TABLES CONNECTED")
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })

    try {
      const guest = await guestContext.newPage()
      await guest.goto(`http://127.0.0.1:3170/game?pin=${game.inviteCode}`)
      await guest.getByPlaceholder("Username here").fill("QA Representative One")
      await guest.getByRole("button", { name: "Submit", exact: true }).click()
      await expect(guest.getByTestId("tadazz-show")).toBeVisible()
      await expect(table).toHaveAttribute("data-connected", "true")
      await expect(page.locator('.table-unit[data-table="9"]')).toHaveAttribute("data-connected", "false")
      await expect(page.getByTestId("tadazz-lobby-count")).toHaveText("1 / 2 TABLES CONNECTED")
      await page.screenshot({ path: join(info.outputDir, "synchronized-native-seating.png") })
    } finally { await guestContext.close() }

    await expect(table).toHaveAttribute("data-connected", "false")
    await expect(page.getByTestId("tadazz-lobby-count")).toHaveText("0 / 2 TABLES CONNECTED")
  })
}
