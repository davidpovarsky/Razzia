import { expect, test } from "@playwright/test"
import { registerSynthetic, seedSynthetic } from "./tds-site-fixture"

async function seedGames(page: Parameters<typeof registerSynthetic>[0]) {
  const headers = await registerSynthetic(page)
  for (const subject of ["Alpha motion", "Beta motion", "Gamma motion"]) {
    await seedSynthetic(page, headers, subject)
  }
  await page.goto("/studio/games")
  await expect(
    page.locator('article[data-platform-motion="layout"]'),
  ).toHaveCount(3)
}

function titles(page: Parameters<typeof registerSynthetic>[0]) {
  return page.locator("article .game-title").allTextContents()
}

async function watchLayout(page: Parameters<typeof registerSynthetic>[0]) {
  await page.locator('[aria-label="My Games"]').evaluate((grid) => {
    const win = window
    win.__tdsLayoutMutations = 0
    new MutationObserver((records) => {
      win.__tdsLayoutMutations += records.length
    }).observe(grid, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    })
  })
}

test("Studio sort, filter and gallery/list changes animate layout without stale or duplicate cards", async ({
  page,
}, testInfo) => {
  await seedGames(page)
  await expect
    .poll(() => titles(page))
    .toEqual(["Alpha motion", "Beta motion", "Gamma motion"])
  await watchLayout(page)

  const sort = page.getByLabel("Sort", { exact: true })
  await sort.selectOption("desc")
  await expect
    .poll(() => titles(page))
    .toEqual(["Gamma motion", "Beta motion", "Alpha motion"])
  await expect
    .poll(() => page.evaluate(() => window.__tdsLayoutMutations))
    .toBeGreaterThan(0)

  await sort.selectOption("asc")
  await sort.selectOption("desc")
  await sort.selectOption("asc")
  await expect
    .poll(() => titles(page))
    .toEqual(["Alpha motion", "Beta motion", "Gamma motion"])
  await expect(
    page.locator('article[data-platform-motion="layout"]'),
  ).toHaveCount(3)

  await page.getByRole("button", { name: "List view", exact: true }).click()
  await page.getByRole("button", { name: "Gallery view", exact: true }).click()
  await page.getByRole("button", { name: "List view", exact: true }).click()
  await expect(page.locator('[aria-label="My Games"]')).toHaveClass(
    /site-game-list/u,
  )
  await expect(
    page.locator('article[data-platform-motion="layout"]'),
  ).toHaveCount(3)

  const search = page.getByRole("searchbox", {
    name: "Search games",
    exact: true,
  })
  await search.fill("Beta motion")
  await expect(
    page.locator('article[data-platform-motion="layout"]'),
  ).toHaveCount(1)
  await search.fill("")
  await expect(
    page.locator('article[data-platform-motion="layout"]'),
  ).toHaveCount(3)
  await expect
    .poll(() =>
      page
        .locator('article[data-platform-motion="layout"]')
        .evaluateAll((cards) =>
          cards.every(
            (card) =>
              getComputedStyle(card).opacity === "1" &&
              getComputedStyle(card).transform === "none",
          ),
        ),
    )
    .toBe(true)
  await page.screenshot({
    path: `/evidence/phase-10-motion-studio-${testInfo.project.name}.png`,
    fullPage: true,
  })
})

test("Studio layout settles immediately when reduced motion is requested", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await seedGames(page)
  await watchLayout(page)
  await page.getByLabel("Sort", { exact: true }).selectOption("desc")
  await expect
    .poll(() => titles(page))
    .toEqual(["Gamma motion", "Beta motion", "Alpha motion"])
  await page.waitForTimeout(50)
  expect(
    await page
      .locator('article[data-platform-motion="layout"]')
      .evaluateAll((cards) =>
        cards.every(
          (card) =>
            getComputedStyle(card).transform === "none" &&
            card.getAnimations().length === 0,
        ),
      ),
  ).toBe(true)
  await page.screenshot({
    path: `/evidence/phase-10-motion-studio-reduced-${testInfo.project.name}.png`,
    fullPage: true,
  })
})
