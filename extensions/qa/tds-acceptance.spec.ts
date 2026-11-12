import { expect, test, type Page } from "@playwright/test"
import { registerSynthetic, seedSynthetic } from "./tds-site-fixture"

async function noHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true)
}

test("historical Razzia theme keeps its own viewport while fifty participants use canonical host management", async ({
  page,
}, info) => {
  const headers = await registerSynthetic(page)
  await seedSynthetic(page, headers, {
    subject: "Razzia compatibility acceptance",
    configure: (extras) => {
      extras.defaults.showTheme = {
        id: "razzia-original",
        version: "1.0.0",
        overrides: {},
      }
    },
  })
  await page.goto("/studio/games")
  await page.getByRole("link", { name: "Prepare show", exact: true }).click()
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  const [, gameId] = /manager\/([^/?#]+)/u.exec(page.url()) ?? []
  expect(gameId).toBeTruthy()
  const replaced = await page.request.put(
    `/api/games/${gameId}/roster/participants`,
    {
      headers,
      data: {
        participants: Array.from({ length: 50 }, (_, index) => ({
          rosterPlayerId: `final-${index + 1}`,
          displayName: `Final synthetic ${index + 1}`,
          phoneE164: null,
        })),
      },
    },
  )
  expect(replaced.ok(), await replaced.text()).toBe(true)
  const viewport = page.locator('[data-theme-viewport="razzia-original"]')
  await expect(viewport).toBeVisible()
  await expect(viewport).toHaveCSS("background-image", "none")
  await page.getByTestId("host-bottom-players-btn").click()
  const modal = page.getByTestId("host-players-modal")
  await expect(modal.getByTestId("kpi-registered")).toContainText("50")
  await expect(modal.locator("tbody tr")).toHaveCount(50)
  await page.getByTestId("host-modal-search-input").fill("Final synthetic 50")
  await expect(modal.locator("tbody tr")).toHaveCount(1)
  await page.screenshot({
    path: `/evidence/phase-12-razzia-50-roster-${info.project.name}.png`,
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(modal).toHaveCount(0)
})

test("public routes, six viewport sizes and scoped title retain lazy entry and real navigation", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const start = Date.now()
  await page.goto("/")
  await expect(page.locator("[data-tadazz-site]")).toBeVisible()
  await expect(page.locator("h1").first()).toBeVisible()
  await expect(page).toHaveTitle("Tadazz")
  const readyMs = Date.now() - start
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /\.m?js(?:\?|$)/u.test(entry.name))
      .map((entry) => ({
        path: new URL(entry.name).pathname,
        decodedBytes: (entry as PerformanceResourceTiming).decodedBodySize,
      })),
  )
  expect(
    resources.some((entry) =>
      /(?:MyGames|GameCard|PackageManager)-/u.test(entry.path),
    ),
  ).toBe(false)
  await info.attach("local-entry-performance", {
    body: JSON.stringify({
      readyMs,
      resources,
      scope:
        "Single local unthrottled sample; not a physical-device or production latency benchmark",
    }),
    contentType: "application/json",
  })

  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await noHorizontalOverflow(page)
  }
  for (const route of [
    "/",
    "/?view=demo",
    "/?view=pricing",
    "/login",
    "/signup",
  ]) {
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto(route)
      await expect(page.locator("h1").first()).toBeVisible()
      await expect(page).toHaveTitle("Tadazz")
      await noHorizontalOverflow(page)

      if (width === 390) {
        await page.screenshot({
          path: `/evidence/phase-12-public-${route.replace(/\W/gu, "_")}-${info.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        })
      }
    }
  }
  expect(errors).toEqual([])
})

test("owned Studio routes, loading/error/empty recovery, legacy redirect and read-only editor keep real state", async ({
  page,
}, info) => {
  const headers = await registerSynthetic(page)
  const game = await seedSynthetic(page, headers, "Final acceptance game")
  for (const [route, heading] of [
    ["/studio", "Your shows."],
    ["/studio/games", "My Games"],
    ["/studio/explore", "Explore Games"],
    ["/studio/events", "My Events"],
    ["/studio/account", "Account & licences"],
  ]) {
    for (const [width, height] of [
      [1280, 720],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto(route)
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible()
      await expect(page).toHaveTitle("Tadazz")
      await noHorizontalOverflow(page)

      if (width === 390) {
        await page.screenshot({
          path: `/evidence/phase-12-${route.replace(/\W/gu, "_")}-${info.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        })
      }
    }
  }
  let release: (() => void) | undefined = undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let mode: "loading" | "error" | "empty" = "loading"
  await page.route("**/api/quizz", async (route) => {
    if (mode === "loading") {
      await held
    }

    await route.fulfill(
      mode === "empty"
        ? { status: 200, json: { quizz: [] } }
        : {
            status: 503,
            json: { error: "synthetic-final-acceptance-unavailable" },
          },
    )
  })
  await page.goto("/studio/games")
  await expect(
    page.getByText("Loading your games…", { exact: true }),
  ).toBeVisible()
  mode = "error"
  release!()
  await expect(page.getByRole("alert")).toContainText(
    "Could not load your games",
  )
  mode = "empty"
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Your shows start here.", exact: true }),
  ).toBeVisible()
  await page.unroute("**/api/quizz")
  await page.goto("/manager/config")
  await expect(page).toHaveURL(/\/studio\/games$/u)
  await expect(page.locator(`article[data-game-id="${game.id}"]`)).toBeVisible()
  await page.getByRole("link", { name: "Edit game", exact: true }).click()
  await expect(page.getByPlaceholder("Quizz title...")).toHaveValue(
    game.subject,
  )
  await expect(page.locator("[data-tadazz-site]")).toHaveCount(0)
  await expect(page).toHaveTitle("TADAZZ")
  await expect(page.locator(".tds-scope")).toHaveCount(0)
  await expect(
    page.locator('head meta[name="application-name"]'),
  ).toHaveAttribute("content", "TADAZZ")
})

test("touch tablet portrait/landscape, keyboard and 200% CSS zoom retain Studio controls", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  })

  try {
    const page = await context.newPage()
    const headers = await registerSynthetic(page)
    await seedSynthetic(page, headers, "Touch acceptance game")
    await page.goto("/studio/games")
    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
    ]) {
      await page.setViewportSize({ width, height })
      await expect(
        page.getByRole("heading", { name: "My Games", exact: true }),
      ).toBeVisible()
      await noHorizontalOverflow(page)
      await page.getByRole("button", { name: "List view", exact: true }).tap()
      await page
        .getByRole("button", { name: "Gallery view", exact: true })
        .tap()
    }
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2"
    })
    await noHorizontalOverflow(page)
    const action = page.getByRole("button", { name: /^More actions for /u })
    await action.focus()
    await page.keyboard.press("ArrowDown")
    await expect(
      page.getByRole("menuitem", { name: "Duplicate", exact: true }),
    ).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(action).toBeFocused()
    await page.screenshot({
      path: `/evidence/phase-12-tablet-css-zoom-${info.project.name}.png`,
      fullPage: true,
      animations: "disabled",
    })
  } finally {
    await context.close()
  }
})
