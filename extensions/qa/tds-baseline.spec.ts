import { test, expect, type Page } from "@playwright/test"
import { readFileSync, mkdirSync } from "node:fs"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
} from "../src/core"
import { createPackageFixture } from "../src/testkit/package-fixtures"
import { joinGame } from "../../packages/e2e/utils/player"

const out = `/evidence/${process.env.TDS_CAPTURE ?? "before"}`
const password = "Synthetic-tds-2026-passphrase"
const quizz = {
  subject: "Design system fixture",
  gameMode: "quiz",
  questions: ["Which answer?", "Second fixture question?"].map((question) => ({
    type: "single",
    question,
    answers: ["Yes", "No"],
    solutions: [0],
    cooldown: 3,
    time: 120,
  })),
}
const shot = async (page: Page, name: string) => {
  if (/^editor-/u.test(name)) await page.mouse.move(1, 1)
  const bytes = await page.screenshot({
    path: `${out}/${name}.png`,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  })
  if (process.env.TDS_COMPARE_EDITOR === "1" && /^editor-/u.test(name)) {
    expect(bytes).toMatchSnapshot(`${name}.png`, {
      threshold: 0,
      maxDiffPixels: 0,
    })
  }
  return bytes
}
test.beforeAll(() => mkdirSync(out, { recursive: true }))

async function account(page: Page) {
  const address = `tds-${Date.now()}@example.invalid`
  await page.goto("/signup")
  await page.getByLabel("Email address", { exact: true }).fill(address)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await expect(page.getByLabel("Six-digit code")).toBeVisible()
  const mail = JSON.parse(
    readFileSync(
      new URL("../.site-test-config/test-mail.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, { code: string }>
  await page.getByLabel("Six-digit code").fill(mail[address].code)
  await page.getByRole("button", { name: "Verify email", exact: true }).click()
  await expect(
    page.getByText("Email verified. You can now log in.", { exact: true }),
  ).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Your shows." })).toBeVisible()
}

test("synthetic site, Studio, package and frozen editor baseline", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/")
  await expect(page.locator("[data-tadazz-site]")).toBeVisible()
  await shot(page, "home")
  await page.goto("/?view=demo")
  await expect(
    page.getByRole("button", { name: "A secret", exact: true }),
  ).toBeVisible()
  await shot(page, "demo")
  await account(page)
  await shot(page, "studio")
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const extras = createDefaultQuizExtrasV2(
    "draft",
    quizz.questions.map(() => crypto.randomUUID()),
    computeCanonicalBaseDigest(quizz),
  )
  const sceneId = crypto.randomUUID()
  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "opening",
    title: "Baseline opening",
    durationMs: 5000,
    advance: "manual",
  }
  extras.timeline.push({ id: crypto.randomUUID(), kind: "opening", sceneId })
  extras.roster.participants = Array.from({ length: 40 }, (_, i) => ({
    rosterPlayerId: crypto.randomUUID(),
    displayName: `Fixture participant ${i + 1}`,
    phoneE164: null,
  }))
  const response = await page.request.post("/api/extensions/quizzes", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizz, extras },
  })
  expect(response.ok()).toBe(true)
  await page.goto("/studio/games")
  await expect(
    page.getByRole("heading", { name: quizz.subject, exact: true }),
  ).toBeVisible()
  await shot(page, "games-gallery")
  await page.getByRole("button", { name: "List view", exact: true }).click()
  await shot(page, "games-list")
  const fixture = createPackageFixture(
    "game",
    `tds-fixture-${Date.now()}`,
    "1.0.0",
  )
  await page.getByTestId("package-file-input").setInputFiles({
    name: "fixture.tadazz",
    mimeType: "application/octet-stream",
    buffer: fixture.bytes,
  })
  await expect(page.getByTestId("package-preflight")).toBeVisible()
  await page.getByTestId("package-manager").screenshot({
    path: `${out}/package-preflight.png`,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "Help", exact: true }).click()
  await shot(page, "studio-dialog")
  await page.keyboard.press("Escape")
  await page.goto("/studio/account")
  await expect(
    page.getByRole("heading", { name: "Account & licences" }),
  ).toBeVisible()
  await shot(page, "account")
  await page.goto("/studio/games")
  await page
    .getByRole("link", { name: "Edit game", exact: true })
    .first()
    .click()
  await expect(page.getByPlaceholder("Quizz title...")).toHaveValue(
    quizz.subject,
  )
  await page.getByTestId("editor-question-card-0").click()
  await expect(page.getByTestId("editor-question-card-0")).toHaveClass(
    /border-primary/u,
  )
  await expect(page.locator("[data-tadazz-site]")).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await shot(page, "editor-question")
  await page.getByRole("button", { name: "Media library", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await shot(page, "editor-media")
  await page.keyboard.press("Escape")
  await page.getByText("Baseline opening", { exact: true }).first().click()
  await shot(page, "editor-scene-timeline")
  await page.getByTestId("studio-tab-settings").click()
  await expect(page.getByTestId("show-theme-settings")).toBeVisible()
  await shot(page, "editor-theme-settings")
  await page
    .getByTestId("show-theme-settings")
    .getByRole("button", { name: "Preview", exact: true })
    .click()
  await expect(page.getByTestId("show-theme-preview")).toBeVisible()
  await shot(page, "theme-preview")
  if (process.env.TDS_EDITOR_ONLY === "1") return
  await page.getByTestId("studio-tab-questions").click()
  // Read-only capture after loading the saved fixture. No editor implementation is modified.
  await page.getByTestId("editor-exit-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  await page
    .getByRole("link", { name: "Prepare show", exact: true })
    .first()
    .click()
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  await shot(page, "host-join")
  for (const [id, name] of [
    ["host-shortcuts-btn", "host-shortcuts"],
    ["host-bottom-players-btn", "host-roster"],
  ]) {
    const trigger = page.getByTestId(id)
    await expect(trigger).toBeVisible()
    await trigger.click()
    await shot(page, name)
    await page.keyboard.press("Escape")
  }
  await page.getByRole("button", { name: "Game settings", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await shot(page, "host-settings")
  await page.keyboard.press("Escape")
  const gameId = /manager\/([^/?#]+)/u.exec(page.url())?.[1]
  const displayContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
  })
  const display = await displayContext.newPage()
  await display.goto(`/display/${gameId}`)
  await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await shot(display, "audience")
  await displayContext.close()
  await page.getByTestId("host-present-from-host-btn").click()
  await shot(page, "host-fullscreen")
  await page.keyboard.press("Escape")
  const playerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
  })
  const player = await playerContext.newPage()
  const pin = await page.getByText(/^\d{6}$/u).textContent()
  await joinGame(player, pin!, "FixturePlayer")
  await expect(page.getByTestId("host-connected-counter")).toHaveText(
    /^1\s*\//u,
  )
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("host-end-timer-btn")).toBeVisible()
  await page.getByTestId("host-end-timer-btn").click()
  await expect(page.getByTestId("host-next-screen-btn")).toBeVisible()
  await page.getByTestId("host-next-screen-btn").click()
  await expect(page.getByTestId("host-history-btn")).toBeVisible()
  await page.getByTestId("host-history-btn").click()
  await expect(page.getByTestId("history-dialog-content")).toBeVisible()
  await shot(page, "host-history")
  await page.keyboard.press("Escape")
  await playerContext.close()
})
