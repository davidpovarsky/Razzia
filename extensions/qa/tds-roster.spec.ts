import { expect, test, type Page } from "@playwright/test"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
  type HostPresenceSnapshot,
} from "../src/core"
import { registerSynthetic } from "./tds-site-fixture"

async function openHost(page: Page) {
  const headers = await registerSynthetic(page)
  const quizz = {
    subject: `Roster QA ${Date.now()}`,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Roster verification?",
        answers: ["Yes", "No"],
        solutions: [0],
        cooldown: 3,
        time: 600,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  expect(
    (
      await page.request.post("/api/extensions/quizzes", {
        headers,
        data: { quizz, extras },
      })
    ).ok(),
  ).toBe(true)
  await page.goto("/studio/games")
  await page.getByRole("link", { name: "Prepare show", exact: true }).click()
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()

  return {
    headers,
    gameId: /manager\/([^/?#]+)/u.exec(page.url())![1],
  }
}

const importCsv = (count: number) =>
  [
    "name,phone",
    ...Array.from({ length: count }, (_, index) => {
      const number = String(index + 1).padStart(3, "0")
      return `Synthetic participant ${number},+447700900${number}`
    }),
  ].join("\n")

async function fetchPresence(
  page: Page,
  gameId: string,
  headers: Record<string, string>,
) {
  const response = await page.request.get(`/api/games/${gameId}/roster`, {
    headers,
  })
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { presence: HostPresenceSnapshot })
    .presence
}

test("authoritative phone policy, confirmed deletion, imports, filtering and 40/400-row responsive roster", async ({
  page,
}, testInfo) => {
  const room = await openHost(page)
  await page.getByTestId("host-bottom-players-btn").click()
  const modal = page.getByTestId("host-players-modal")
  await expect(modal).toBeVisible()

  const imported = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/games/${room.gameId}/roster/participants`) &&
      response.request().method() === "PUT",
  )
  await page.getByTestId("host-modal-file-input").setInputFiles({
    name: "synthetic-roster-40.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(importCsv(40)),
  })
  await expect(page.getByTestId("host-modal-import-preview")).toContainText(
    "40 valid / 40 total",
  )
  await page.getByTestId("host-modal-import-approve-btn").click()
  expect((await imported).ok()).toBe(true)
  await expect(modal.getByTestId("kpi-registered")).toContainText("40")
  await expect(
    modal.getByTestId("host-modal-players-table").locator("tbody tr"),
  ).toHaveCount(40)

  const csvTemplate = page.waitForEvent("download")
  await page.getByTestId("host-modal-csv-template-btn").click()
  expect((await csvTemplate).suggestedFilename()).toBe(
    "tada-roster-template.csv",
  )
  const exported = page.waitForEvent("download")
  await page.getByTestId("host-modal-export-csv-btn").click()
  expect((await exported).suggestedFilename()).toBe("tada-live-roster.csv")

  const search = page.getByTestId("host-modal-search-input")
  await search.fill("participant 040")
  await expect(
    modal.getByTestId("host-modal-players-table").locator("tbody tr"),
  ).toHaveCount(1)
  await expect(modal).toContainText("Synthetic participant 040")
  await search.fill("")
  await page.getByTestId("host-filter-not_joined").click()
  await expect(
    modal.getByTestId("host-modal-players-table").locator("tbody tr"),
  ).toHaveCount(40)
  await page.getByTestId("host-filter-all").click()

  const presence = await fetchPresence(page, room.gameId, room.headers)
  const participant = presence.players.find(
    (player) => player.displayName === "Synthetic participant 001",
  )!
  const remove = page.getByTestId(
    `host-player-remove-${participant.rosterPlayerId}`,
  )
  let deleteRequests = 0
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request
        .url()
        .endsWith(
          `/api/games/${room.gameId}/roster/${participant.rosterPlayerId}`,
        )
    )
      deleteRequests += 1
  })

  await remove.click()
  const confirmation = page.getByRole("alertdialog", {
    name: "Remove Synthetic participant 001?",
    exact: true,
  })
  await expect(confirmation).toContainText(
    "disconnects any associated live session",
  )
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click()
  expect(deleteRequests).toBe(0)
  await expect(remove).toBeFocused()
  await expect(modal).toContainText("Synthetic participant 001")

  const deletePattern = `**/api/games/${room.gameId}/roster/${participant.rosterPlayerId}`
  await page.route(deletePattern, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "errors:route.description" }),
    })
  })
  await remove.click()
  await confirmation.getByTestId("host-roster-remove-confirm").click()
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole("alert")).toContainText(
    "The participant remains in the roster",
  )
  await expect(modal).toContainText("Synthetic participant 001")
  expect(deleteRequests).toBe(1)
  await page.keyboard.press("Escape")
  await expect(confirmation).toHaveCount(0)
  await expect(remove).toBeFocused()
  await page.unroute(deletePattern)

  await remove.click()
  await confirmation
    .getByTestId("host-roster-remove-confirm")
    .evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
  await expect(confirmation).toHaveCount(0)
  await expect(modal).not.toContainText("Synthetic participant 001")
  expect(deleteRequests).toBe(2)
  await expect(search).toBeFocused()

  const rosterPolicy = modal.getByRole("switch", {
    name: "Phone Invite Only",
    exact: true,
  })
  await expect(rosterPolicy).not.toBeChecked()
  await rosterPolicy.click()
  await expect(rosterPolicy).toBeChecked()
  await expect(modal.getByRole("status")).toHaveText("Saved")

  await page.getByTestId("host-players-close-btn").click()
  const settingsTrigger = page.getByRole("button", {
    name: "Game settings",
    exact: true,
  })
  await settingsTrigger.click()
  const settings = page.getByRole("dialog")
  const settingsPolicy = settings.getByRole("switch", {
    name: "Phone Invite Only",
    exact: true,
  })
  const unrelated = settings.getByRole("switch", {
    name: "Answers only",
    exact: true,
  })
  await expect(settingsPolicy).toBeChecked()
  await unrelated.click()
  await expect(unrelated).toBeChecked()
  const externalSave = await page.request.patch(
    `/api/games/${room.gameId}/roster/settings`,
    { headers: room.headers, data: { phoneInviteOnly: false } },
  )
  expect(externalSave.ok(), await externalSave.text()).toBe(true)
  await expect(settingsPolicy).not.toBeChecked()
  await expect(unrelated).toBeChecked()
  const settingsSave = page.waitForRequest(
    (request) =>
      request.url().endsWith(`/api/games/${room.gameId}/settings`) &&
      request.method() === "PATCH",
  )
  await settings.getByRole("button", { name: "Save", exact: true }).click()
  expect((await settingsSave).postDataJSON()).toEqual({ answersOnly: true })
  await expect(settings).toHaveCount(0)

  const participants = Array.from({ length: 400 }, (_, index) => ({
    rosterPlayerId: `synthetic-${String(index + 1).padStart(4, "0")}`,
    displayName: `Large roster ${String(index + 1).padStart(4, "0")}`,
    phoneE164: null,
  }))
  const replaced = await page.request.put(
    `/api/games/${room.gameId}/roster/participants`,
    { headers: room.headers, data: { participants } },
  )
  expect(replaced.ok(), await replaced.text()).toBe(true)
  await page.getByTestId("host-bottom-players-btn").click()
  await expect(modal.getByTestId("kpi-registered")).toContainText("400")
  await expect(
    modal.getByTestId("host-modal-players-table").locator("tbody tr"),
  ).toHaveCount(400)
  await search.fill("Large roster 0400")
  await expect(
    modal.getByTestId("host-modal-players-table").locator("tbody tr"),
  ).toHaveCount(1)
  await search.fill("")

  await page.setViewportSize({ width: 1024, height: 768 })
  await modal.screenshot({
    path: `/evidence/phase-09-roster-400-1024-${testInfo.project.name}.png`,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(
    await page.getByTestId("host-modal-players-table").evaluate((table) => {
      const viewport = table.parentElement!
      return table.scrollWidth > viewport.clientWidth
    }),
  ).toBe(true)
  await modal.screenshot({
    path: `/evidence/phase-09-roster-400-390-${testInfo.project.name}.png`,
    animations: "disabled",
  })
})
