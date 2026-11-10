import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { preflightShowImport } from "../src/core"
import { createPackageFixture } from "../src/testkit/package-fixtures"
import {
  registerSynthetic,
  seedSynthetic,
  openGameActions,
} from "./tds-site-fixture"

test("real duplicate and all four export handlers retain formats and import preflight", async ({
  page,
}) => {
  const headers = await registerSynthetic(page)
  const game = await seedSynthetic(page, headers)
  await page.goto("/studio/games")
  const card = page.locator(`article[data-game-id="${game.id}"]`)
  await openGameActions(card)
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
  await expect(page.locator("article[data-game-id]")).toHaveCount(2)
  const ids = await page
    .locator("article[data-game-id]")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-game-id")),
    )
  expect(new Set(ids).size).toBe(2)
  const copyId = ids.find((id) => id !== game.id)!
  const copy = await (
    await page.request.get(`/api/extensions/export/${copyId}`, { headers })
  ).json()
  expect(copy.extras.roster.participants[0].displayName).toBe(
    "Synthetic private example",
  )
  const formats = [
    ["Legacy JSON", "legacy-json"],
    ["Enhanced bundle", "enhanced-bundle"],
    ["Excel workbook", "tada-xlsx"],
    ["Tadazz JSON", "tada-json"],
  ] as const
  let enhanced: Buffer | undefined
  for (const [label, format] of formats) {
    await openGameActions(card)
    await page.getByRole("menuitem", { name: "Export", exact: true }).click()
    const pending = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: label, exact: true }).click()
    const download = await pending
    const bytes = readFileSync((await download.path())!)
    const result = preflightShowImport(bytes, download.suggestedFilename())
    expect(result.ok, JSON.stringify(result.issues)).toBe(true)
    expect(result.format).toBe(format)
    expect(result.summary?.questionCount).toBe(2)
    if (format === "enhanced-bundle") enhanced = bytes
    if (format === "tada-json")
      expect(JSON.parse(bytes.toString()).format).toBe("tada-show")
  }
  await page.getByLabel("Import game file", { exact: true }).setInputFiles({
    name: "roundtrip.bundle.json",
    mimeType: "application/json",
    buffer: enhanced!,
  })
  await expect(page.getByTestId("show-import-commit")).toBeEnabled()
  await page.getByTestId("show-import-commit").click()
  // Import routes to the unchanged editor; inspect and exit without editing.
  await expect(page).toHaveURL(/\/manager\/quizz\//u)
  await expect(page.getByPlaceholder("Quizz title...")).toHaveValue(
    game.subject,
  )
  await page.getByTestId("editor-exit-btn").click()
  await expect(page.locator("article[data-game-id]")).toHaveCount(3)
})

test("delete identifies the game, cancel sends nothing, genuine failure stays open and retry succeeds", async ({
  page,
}) => {
  const headers = await registerSynthetic(page)
  const game = await seedSynthetic(page, headers, "Deletion safety example")
  await page.goto("/studio/games")
  const card = page.locator(`article[data-game-id="${game.id}"]`)
  let requests = 0,
    fail = true
  await page.route(`**/api/extensions/quizzes/${game.id}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue()
    requests += 1
    if (fail)
      await route.fulfill({ status: 500, json: { error: "synthetic-failure" } })
    else await route.continue()
  })
  await openGameActions(card)
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("alertdialog", {
    name: "Delete game?",
    exact: true,
  })
  await expect(dialog).toContainText(game.subject)
  await expect(dialog).toContainText(
    "This permanently removes the game and its enhancements.",
  )
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  expect(requests).toBe(0)
  await expect(
    card.getByRole("button", { name: /^More actions for /u }),
  ).toBeFocused()
  await openGameActions(card)
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
  await dialog
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(dialog.getByRole("alert")).toContainText(
    "could not be completed",
  )
  expect(requests).toBe(1)
  expect(
    (await page.request.get(`/api/quizz/${game.id}`, { headers })).status(),
  ).toBe(200)
  fail = false
  await dialog
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(card).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  expect(requests).toBe(2)
})

test("advanced packages stay lazy, auto-expand for actual import and preserve preflight when collapsed", async ({
  page,
}) => {
  await registerSynthetic(page)
  await page.goto("/studio/games")
  await expect(page.getByTestId("package-manager")).toHaveCount(0)
  const fixture = createPackageFixture("game", `tds-ui-${Date.now()}`, "1.0.0")
  await page.getByLabel("Import game file", { exact: true }).setInputFiles({
    name: "fixture.tadazz",
    mimeType: "application/octet-stream",
    buffer: fixture.bytes,
  })
  await expect(page.getByTestId("package-preflight")).toBeVisible()
  await expect(
    page.getByTestId("package-tools-toggle").locator(".."),
  ).toHaveAttribute("open", "")
  await page.getByTestId("package-tools-toggle").click()
  await expect(page.getByTestId("package-preflight")).not.toBeVisible()
  await page.getByTestId("package-tools-toggle").click()
  await expect(page.getByTestId("package-preflight")).toBeVisible()
  await page.getByTestId("package-manager").screenshot({
    path: `/evidence/phase-06-packages-${test.info().project.name}.png`,
  })
})
