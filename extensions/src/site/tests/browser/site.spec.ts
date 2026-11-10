import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test, expect, devices, type Page } from "@playwright/test"
import { swipePage } from "../../../../qa/site-touch"
const evidence = fileURLToPath(
  new URL(
    "../../../../../docs/extensions/qa-evidence/unified-site-20261110/",
    import.meta.url,
  ),
)
const mail = fileURLToPath(
  new URL("../../../../.site-test-config/test-mail.json", import.meta.url),
)
const password = "Local-only-test-passphrase-2026"
const email = () =>
  `site-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.invalid`
const code = (address: string) =>
  (JSON.parse(readFileSync(mail, "utf8")) as Record<string, { code: string }>)[
    address
  ].code

async function register(page: Page, address: string) {
  await page.goto("/signup")
  await page.getByLabel("Email address", { exact: true }).fill(address)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible()
  await page.getByLabel("Six-digit code").fill(code(address))
  await page.getByRole("button", { name: "Verify email", exact: true }).click()
  await expect(
    page.getByText("Email verified. You can now log in.", { exact: true }),
  ).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page).toHaveURL(/\/studio$/u)
  await expect(page.getByRole("heading", { name: "Your shows." })).toBeVisible()
}

test.beforeAll(() => mkdirSync(evidence, { recursive: true }))

test("touch scrolling works on public/account/owned Studio pages and leaves the editor policy intact", async ({
  browser,
  baseURL,
}) => {
  for (const device of ["iPad Pro 11", "iPad Pro 11 landscape", "iPhone 13"]) {
    const context = await browser.newContext({ ...devices[device], baseURL })
    const page = await context.newPage()

    try {
      await page.goto("/")
      await expect(
        page.getByRole("heading", { name: "Make it a show.", exact: true }),
      ).toBeVisible()
      await swipePage(page)
      await page.goto("/signup")
      await expect
        .poll(() =>
          page.evaluate(() => getComputedStyle(document.body).touchAction),
        )
        .toBe("auto")

      if (device !== "iPad Pro 11") {
        continue
      }

      await register(page, email())
      const token = await page.evaluate(() => localStorage.getItem("token"))

      for (let index = 0; index < 12; index += 1) {
        const saved = await page.request.post("/api/quizz", {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            subject: `Touch scroll fixture ${index}`,
            gameMode: "quiz",
            questions: [
              {
                type: "single",
                question: "Touch fixture",
                answers: ["Yes", "No"],
                solutions: [0],
                cooldown: 3,
                time: 10,
              },
            ],
          },
        })
        expect(saved.ok()).toBe(true)
      }

      await page.goto("/studio/games")
      await expect(
        page.getByRole("heading", {
          name: "Touch scroll fixture 0",
          exact: true,
        }),
      ).toBeVisible()
      await swipePage(page)
      await page.goto("/manager/quizz")
      await expect
        .poll(() =>
          page.evaluate(() => getComputedStyle(document.body).touchAction),
        )
        .toBe("none")
      await page.goBack()
      await expect
        .poll(() =>
          page.evaluate(() => getComputedStyle(document.body).touchAction),
        )
        .toBe("auto")
    } finally {
      await context.close()
    }
  }
})

test("public routes, catalogue, demo, history, responsive navigation and screenshots", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: "Make it a show.", exact: true }),
    ).toBeVisible()

    if (width < 700) {
      await page.getByRole("button", { name: "Toggle navigation" }).click()
    }

    await expect(
      page.getByRole("link", { name: "Log in", exact: true }).first(),
    ).toBeVisible()

    if (width < 700) {
      await page.getByRole("button", { name: "Toggle navigation" }).click()
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `${evidence}/marketing-${width}.png`,
      fullPage: true,
    })
  }
  await page.getByRole("button", { name: "Toggle navigation" }).click()
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Games", exact: true })
    .click()
  await page.getByRole("searchbox", { name: "Search games" }).fill("not-a-game")
  await expect(page.getByText("No games found", { exact: true })).toBeVisible()
  await page.goto("/?view=demo")
  await page.getByRole("button", { name: "A secret", exact: true }).click()
  await page.getByRole("button", { name: "Reveal sample results" }).click()
  await expect(
    page.getByRole("heading", { name: "The big reveal!" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Back to home" }).click()
  await page.goBack()
  await expect(
    page.getByRole("heading", { name: "Which twist would change everything?" }),
  ).toBeVisible()
  await page.goto("/?view=product&game=story")
  await page.reload()
  await expect(
    page.getByRole("heading", { name: "Story Sparks", exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test("real account → original editor save/edit → duplicate/export/delete → prepare → sign-out", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await register(page, email())
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto("/studio")
    await expect(
      page.getByRole("heading", { name: "Your shows." }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `${evidence}/studio-empty-${width}.png`,
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page
    .getByRole("link", { name: "Create game", exact: true })
    .first()
    .click()
  await expect(page).toHaveURL(/\/manager\/quizz\/?$/u)
  await expect(page.locator("[data-tadazz-site]")).toHaveCount(0)
  await page.getByPlaceholder("Quizz title...").fill("Real Studio round")
  await page
    .getByPlaceholder("Start typing your question...")
    .fill("Which answer?")
  await page.getByPlaceholder("Add an answer...").nth(0).fill("Yes")
  await page.getByPlaceholder("Add an answer...").nth(1).fill("No")
  await page.screenshot({
    path: `${evidence}/original-editor-1440.png`,
    fullPage: true,
  })
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  await expect(
    page.getByRole("heading", { name: "Real Studio round", exact: true }),
  ).toBeVisible()
  const card = page.locator("article[data-game-id]").first()
  const id = await card.getAttribute("data-game-id")
  await card.getByRole("link", { name: "Edit game", exact: true }).click()
  await expect(page.getByPlaceholder("Quizz title...")).toHaveValue(
    "Real Studio round",
  )
  await page.getByPlaceholder("Quizz title...").fill("Real Studio edited")
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  await expect(
    page.getByRole("heading", { name: "Real Studio edited", exact: true }),
  ).toBeVisible()
  await page
    .locator("article[data-game-id]")
    .first()
    .getByRole("button", { name: "Duplicate", exact: true })
    .click()
  await expect(page.locator("article[data-game-id]")).toHaveCount(2)
  const ids = await page
    .locator("article[data-game-id]")
    .evaluateAll((cards) =>
      cards.map((item) => item.getAttribute("data-game-id")),
    )
  expect(new Set(ids).size).toBe(2)
  expect(ids).toContain(id)
  await page.locator("article[data-game-id]").first().locator("summary").click()
  const downloaded = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Enhanced bundle", exact: true })
    .first()
    .click()
  const download = await downloaded
  expect(download.suggestedFilename()).toMatch(/\.bundle\.json$/u)
  const downloadPath = await download.path()
  expect(JSON.parse(readFileSync(downloadPath, "utf8"))).toHaveProperty("quizz")
  await page
    .locator("article[data-game-id]")
    .first()
    .getByRole("button", { name: "Delete", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(page.locator("article[data-game-id]")).toHaveCount(1)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await page.getByLabel("Import game file", { exact: true }).setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        gameMode: "quiz",
        subject: "Imported Studio round",
        questions: [
          {
            type: "single",
            question: "Imported question",
            answers: ["Yes", "No"],
            solutions: [0],
            cooldown: 3,
            time: 10,
          },
        ],
      }),
    ),
  })
  await expect(page.getByTestId("show-import-commit")).toBeEnabled()
  await page.getByTestId("show-import-commit").click()
  await expect(page).toHaveURL(/\/manager\/quizz\//u)
  await page.getByTestId("editor-exit-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  await expect(
    page.getByRole("heading", { name: "Imported Studio round", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Help", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.goto("/studio/account")
  await expect(
    page.getByText("Billing is disabled. No purchases are available.", {
      exact: true,
    }),
  ).toBeVisible()
  await page.goto("/studio/prepare")
  await page
    .getByRole("combobox", { name: "My Games", exact: true })
    .selectOption({ label: "Real Studio edited" })
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page).toHaveURL(/\/party\/manager\//u)
  await page.goto("/studio")
  await page.getByRole("button", { name: "Sign out", exact: true }).click()
  await expect(page).toHaveURL("http://127.0.0.1:4310/")
  await page.goto("/studio/games")
  await expect(page).toHaveURL(/\/login/u)
  await expect(
    page.getByText("Real Studio edited", { exact: true }),
  ).toHaveCount(0)
  expect(errors).toEqual([])
})

test("localized routes and reduced motion keep the reference usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const [language, label] of [
    ["fr", "Se connecter"],
    ["de", "Anmelden"],
    ["es", "Iniciar sesión"],
    ["it", "Accedi"],
    ["ja", "ログイン"],
    ["tr", "Giriş yap"],
    ["vi", "Đăng nhập"],
  ]) {
    await page.goto(`/?lng=${language}`)
    await expect(
      page.getByRole("link", { name: label, exact: true }).first(),
    ).toBeVisible()
  }
  await page.goto("/?view=store&lng=en")
  await page.locator("article.game-card").first().hover()
  expect(
    await page
      .locator("article.game-card")
      .first()
      .evaluate((card) => getComputedStyle(card).transform),
  ).toBe("none")
  await expect(
    page.locator("button[data-control-source=standalone]"),
  ).toHaveCount(0)
  await page.goto("/?view=pricing")
  await expect(
    page.getByRole("button", { name: "Purchases unavailable" }),
  ).toHaveCount(2)
  await expect(
    page.getByRole("button", { name: "Purchases unavailable" }).first(),
  ).toBeDisabled()
  const pinCheck = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/games/check") && request.method() === "POST",
  )
  await page.goto("/?pin=123456")
  await expect(page).toHaveURL(/\/game\?/u)
  expect((await pinCheck).postDataJSON()).toEqual({ inviteCode: "123456" })
})

test("password reset, failed authentication, guest and cross-account isolation", async ({
  page,
  browser,
}) => {
  const address = email()
  await register(page, address)
  const tokenA = await page.evaluate(() => localStorage.getItem("token"))
  const seeded = await page.request.post("/api/quizz", {
    headers: { Authorization: `Bearer ${tokenA}` },
    data: {
      gameMode: "quiz",
      subject: "Alice private game",
      questions: [
        {
          type: "single",
          question: "Private",
          answers: ["Yes", "No"],
          solutions: [0],
          cooldown: 3,
          time: 10,
        },
      ],
    },
  })
  expect(seeded.ok()).toBe(true)
  const { id } = (await seeded.json()) as { id: string }
  const contextB = await browser.newContext()
  const bob = await contextB.newPage()
  await register(bob, email())
  const tokenB = await bob.evaluate(() => localStorage.getItem("token"))
  const foreign = await bob.request.get(`/api/quizz/${id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  expect([403, 404]).toContain(foreign.status())
  const deleteForeign = await bob.request.delete(
    `/api/extensions/quizzes/${id}`,
    { headers: { Authorization: `Bearer ${tokenB}` } },
  )
  expect([403, 404]).toContain(deleteForeign.status())
  await bob.goto("/studio/games")
  await expect(
    bob.getByText("Alice private game", { exact: true }),
  ).toHaveCount(0)
  await contextB.close()
  const guest = await page.request.get("/api/quizz")
  expect(guest.status()).toBe(401)
  await page.goto("/forgot")
  await page.getByLabel("Email address", { exact: true }).fill(address)
  await page
    .getByRole("button", { name: "Send reset code", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Set a new password.", exact: true }),
  ).toBeVisible()
  await page.getByLabel("Six-digit code").fill(code(address))
  await page
    .getByLabel("New password", { exact: true })
    .fill(`${password}-updated`)
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click()
  await expect(
    page.getByText("Password updated. Please log in.", { exact: true }),
  ).toBeVisible()
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("does not match")
  await page.getByLabel("Password", { exact: true }).fill(`${password}-updated`)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page).toHaveURL(/\/studio$/u)
  await page.evaluate(() => {
    localStorage.setItem("token", "invalid-session")
  })
  await page.reload()
  await expect(page).toHaveURL(/\/login/u)
})

test("past events read real persisted results and confirm deletion", async ({
  page,
}) => {
  await register(page, email())
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const profile = await page.request.get("/api/accounts/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(profile.ok()).toBe(true)
  const { id: accountId } = (await profile.json()) as { id: string }
  expect(accountId).toMatch(/^[a-f0-9-]+$/u)
  const fixtureRoot = fileURLToPath(
    new URL("../../../../.site-test-config", import.meta.url),
  )
  const resultsRoot = join(fixtureRoot, "tenants", accountId, "results")
  mkdirSync(resultsRoot, { recursive: true })
  // Synthetic persisted fixture, consumed through the actual owner-scoped API.
  writeFileSync(
    join(resultsRoot, "completed.json"),
    JSON.stringify({
      id: "completed-event",
      gameMode: "quiz",
      subject: "Completed show fixture",
      date: new Date().toISOString(),
      players: [{ username: "Fixture player", points: 100, rank: 1 }],
      questions: [
        {
          type: "single",
          question: "Result question",
          answers: ["Yes", "No"],
          solutions: [0],
          cooldown: 3,
          time: 10,
          playerAnswers: [
            {
              playerName: "Fixture player",
              answerIds: [0],
              correct: true,
              points: 100,
            },
          ],
        },
      ],
    }),
  )
  await page.goto("/studio/events")
  await expect(
    page.getByRole("heading", { name: "Completed show fixture", exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: `${evidence}/events-1440.png`, fullPage: true })
  await page.getByRole("button", { name: "View results", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: "Completed show fixture", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("Result question", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(
    page.getByText("No past events yet.", { exact: true }),
  ).toBeVisible()
})

test("failed deletion stays in the dialog and can be retried without a false success", async ({
  page,
}) => {
  await register(page, email())
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const saved = await page.request.post("/api/quizz", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      gameMode: "quiz",
      subject: "Delete retry fixture",
      questions: [
        {
          type: "single",
          question: "Retry question",
          answers: ["Yes", "No"],
          solutions: [0],
          cooldown: 3,
          time: 10,
        },
      ],
    },
  })
  expect(saved.ok()).toBe(true)
  const { id } = (await saved.json()) as { id: string }
  await page.goto("/studio/games")
  await page.route(`**/api/extensions/quizzes/${id}`, async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 500,
        json: { error: "injected-local-failure" },
      })
    } else {
      await route.continue()
    }
  })
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "could not be completed",
  )
  expect(
    (
      await page.request.get(`/api/quizz/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200)
  await page.unroute(`**/api/extensions/quizzes/${id}`)
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Delete retry fixture", exact: true }),
  ).toHaveCount(0)
})
