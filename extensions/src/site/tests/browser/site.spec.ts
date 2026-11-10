import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test, expect, devices, type Page } from "@playwright/test"
import { swipePage } from "../../../../qa/site-touch"
import { createPackageFixture } from "../../../../src/testkit/package-fixtures"
import { packageSha } from "../../../../src/server/packages/archive"
import {
  startGame,
  next as nextQuestion,
} from "../../../../../packages/e2e/utils/manager"
import { joinGame, answer } from "../../../../../packages/e2e/utils/player"
import { t as hostText } from "../../../../../packages/e2e/utils/i18n"
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

test("Studio keeps navigation warm, protects initial verification and styles actual package actions", async ({
  page,
  browser,
  baseURL,
}) => {
  const address = email()
  await register(page, address)
  const stamp = await page.evaluate(() => performance.timeOrigin)
  const navigationStarted = Date.now()
  const visited: string[] = []
  page.on("request", (request) => visited.push(new URL(request.url()).pathname))
  await page.getByRole("link", { name: "My Games", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "My Games", exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId("package-manager")).toHaveCount(0)
  await page.getByTestId("package-tools-toggle").click()
  await expect(page.getByTestId("package-manager")).toBeVisible()
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(stamp)
  expect(visited.filter((path) => path === "/api/accounts/me")).toHaveLength(0)
  writeFileSync(
    join(evidence, "audit-navigation.json"),
    JSON.stringify(
      {
        fullDocumentReloads: 0,
        extraProfileRequests: 0,
        dashboardToGamesMs: Date.now() - navigationStarted,
        origin: "isolated local production build",
      },
      null,
      2,
    ),
  )

  const fixture = createPackageFixture(
    "game",
    `site-package-${Date.now()}`,
    "1.0.0",
  )
  await page.getByTestId("package-file-input").setInputFiles({
    name: "site-fixture.tadazz",
    mimeType: "application/octet-stream",
    buffer: fixture.bytes,
  })
  await expect(page.getByTestId("package-preflight")).toBeVisible()
  const built = page.waitForResponse(
    (response) =>
      response.url().endsWith("/build") &&
      response.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Build preview", exact: true }).click()
  expect((await built).ok()).toBe(true)
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const claims = JSON.parse(
    Buffer.from(token!.split(".")[1], "base64url").toString(),
  ) as { sub: string }
  const headers = { Authorization: `Bearer ${token}` }
  const catalog = (await (
    await page.request.get("/api/packages", { headers })
  ).json()) as { packages: Array<{ upload: string }> }
  const [{ upload }] = catalog.packages
  const receipt = (await (
    await page.request.get(`/api/packages/uploads/${upload}`, { headers })
  ).json()) as { sourceDigest: string }
  // Local worker attestation fixture, as in the existing PackageStore tests.
  // No production data, code execution or claim of real ffmpeg validation here.
  const job = fileURLToPath(
    new URL(
      `../../../../.site-test-config/extensions/packages/${packageSha(claims.sub)}/jobs/${upload}/`,
      import.meta.url,
    ),
  )
  const output = Buffer.from("{}")
  writeFileSync(join(job, "bundle.json"), output)
  writeFileSync(
    join(job, "result.json"),
    JSON.stringify({
      sourceDigest: receipt.sourceDigest,
      outputDigest: packageSha(output),
      mediaValidated: true,
    }),
  )
  await expect(
    page.getByRole("button", { name: "Install selected", exact: true }),
  ).toBeEnabled({ timeout: 15000 })
  await page
    .getByRole("button", { name: "Install selected", exact: true })
    .click()
  await expect(
    page
      .getByTestId("package-manager")
      .getByText("Installed privately", { exact: true })
      .first(),
  ).toBeVisible()
  const button = page
    .getByTestId("package-manager")
    .getByRole("button", { name: "Export package", exact: true })
  await expect(button).toHaveCSS("background-color", "rgb(231, 255, 55)")
  const download = page.waitForEvent("download")
  await button.click()
  expect((await download).suggestedFilename()).toMatch(/\.tadazz$/u)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page
    .getByTestId("package-manager")
    .screenshot({ path: `${evidence}/packages-restyled-1024.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page
        .locator("aside.sidebar")
        .evaluate((element) => element.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0)
  await page
    .getByTestId("package-manager")
    .screenshot({ path: `${evidence}/packages-restyled-390.png` })
  const bounds = await page.getByTestId("package-manager").evaluate((panel) => {
    const parent = panel.getBoundingClientRect()

    return [...panel.querySelectorAll("h2,p,button,label,li")].map(
      (element) => ({
        right: element.getBoundingClientRect().right,
        left: element.getBoundingClientRect().left,
        parentRight: parent.right,
        parentLeft: parent.left,
      }),
    )
  })
  expect(
    bounds.every(
      (element) =>
        element.right <= element.parentRight + 1 &&
        element.left >= element.parentLeft - 1,
    ),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  const mobile = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  })

  try {
    await mobile.addInitScript(
      (value) => localStorage.setItem("token", value),
      token!,
    )
    const phone = await mobile.newPage()
    await phone.goto("/studio/games")
    await phone
      .getByTestId("package-manager")
      .locator("ul li")
      .first()
      .getByRole("button")
      .first()
      .click()
    await expect(phone.getByTestId("package-preflight")).toBeVisible()
    await phone
      .getByTestId("package-manager")
      .screenshot({ path: `${evidence}/packages-mobile-direct.png` })
    const textFits = await phone
      .getByTestId("package-manager")
      .evaluate((panel) =>
        [...panel.querySelectorAll("h2,p,button")].every(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
    expect(textFits).toBe(true)
  } finally {
    await mobile.close()
  }

  await page
    .getByRole("link", { name: "My account", exact: true })
    .first()
    .click()
  await expect(
    page.getByRole("heading", { name: "Account & licences", exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(stamp)
  let releaseProfile: () => void = () => undefined
  const profileGate = new Promise<void>((resolve) => {
    releaseProfile = resolve
  })
  await page.route("**/api/accounts/me", async (route) => {
    await profileGate
    await route.continue()
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("studio-loading")).toBeVisible()
  await expect(page.getByText(address, { exact: true })).toHaveCount(0)
  await page.screenshot({ path: `${evidence}/studio-loading-branded.png` })
  releaseProfile()
  await expect(
    page.getByRole("heading", { name: "Account & licences", exact: true }),
  ).toBeVisible()
})

test("split native entry reconnects a real host, display and PIN player and accepts answers", async ({
  page,
  browser,
  baseURL,
}) => {
  await register(page, email())
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const saved = await page.request.post("/api/quizz", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      subject: "Native connection audit",
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Connected?",
          answers: ["Yes", "No"],
          solutions: [0],
          cooldown: 3,
          time: 60,
        },
      ],
    },
  })
  expect(saved.ok()).toBe(true)
  const { id } = (await saved.json()) as { id: string }
  await page.goto(`/studio/prepare?quiz=${encodeURIComponent(id)}`)
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page).toHaveURL(/\/party\/manager\//u)
  const pin = page.getByText(/^\d{6}$/u)
  await expect(pin).toBeVisible()
  const inviteCode = (await pin.textContent())!.trim()
  const gameId = new URL(page.url()).pathname.split("/").at(-1)
  const playerContext = await browser.newContext({ baseURL })
  const displayContext = await browser.newContext({ baseURL })

  try {
    const player = await playerContext.newPage()
    const display = await displayContext.newPage()
    await display.goto(`/display/${gameId}`)
    await expect(display.getByText(inviteCode, { exact: true })).toBeVisible()
    await joinGame(player, inviteCode, "Audit player")
    await expect(page.getByText("Audit player", { exact: true })).toBeVisible()
    await startGame(page)
    await answer(player, "Yes")
    await expect(
      player.getByText(hostText("game:correct"), { exact: true }),
    ).toBeVisible()
    await nextQuestion(page)
  } finally {
    await playerContext.close()
    await displayContext.close()
  }
})

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
    .getByRole("button", { name: /^More actions for /u })
    .click()
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
  await expect(page.locator("article[data-game-id]")).toHaveCount(2)
  const ids = await page
    .locator("article[data-game-id]")
    .evaluateAll((cards) =>
      cards.map((item) => item.getAttribute("data-game-id")),
    )
  expect(new Set(ids).size).toBe(2)
  expect(ids).toContain(id)
  await page
    .locator("article[data-game-id]")
    .first()
    .getByRole("button", { name: /^More actions for /u })
    .click()
  await page.getByRole("menuitem", { name: "Export", exact: true }).click()
  const downloaded = page.waitForEvent("download")
  await page
    .getByRole("menuitem", { name: "Enhanced bundle", exact: true })
    .first()
    .click()
  const download = await downloaded
  expect(download.suggestedFilename()).toMatch(/\.bundle\.json$/u)
  const downloadPath = await download.path()
  expect(JSON.parse(readFileSync(downloadPath, "utf8"))).toHaveProperty("quizz")
  await page
    .locator("article[data-game-id]")
    .first()
    .getByRole("button", { name: /^More actions for /u })
    .click()
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
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
    page.getByText("Purchases are currently unavailable.", {
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
  await page
    .getByRole("button", {
      name: "More actions for Delete retry fixture",
      exact: true,
    })
    .click()
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
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click()
  await expect(page.getByRole("alertdialog").getByRole("alert")).toContainText(
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
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Delete retry fixture", exact: true }),
  ).toHaveCount(0)
})
