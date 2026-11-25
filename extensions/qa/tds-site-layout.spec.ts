import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { registerSynthetic, seedSynthetic } from "./tds-site-fixture"

test("real gallery/list covers retain 16:9 and one creation CTA across responsive widths", async ({
  page,
}) => {
  const headers = await registerSynthetic(page)
  const game = await seedSynthetic(page, headers)
  await page.goto("/studio/games")
  await expect(
    page.getByRole("link", { name: "Create game", exact: true }),
  ).toHaveCount(1)
  await expect(page.locator(".new-card")).toHaveCount(0)
  const card = page.locator(`article[data-game-id="${game.id}"]`)
  await expect(card.getByText("Default cover", { exact: true })).toBeVisible()
  for (const layout of ["gallery", "list"]) {
    if (layout === "list") {
      await page.getByRole("button", { name: "List view", exact: true }).click()
    }

    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [1024, 768],
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      const image = card.locator(".site-game-cover")
      await expect(image).toBeVisible()
      const bounds = await image.boundingBox()
      expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 2)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await card.screenshot({
        path: `/evidence/phase-06-${layout}-${width}-${test.info().project.name}.png`,
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page
    .getByRole("searchbox", { name: "Search games", exact: true })
    .fill("no-matching-synthetic-game")
  await expect(
    page.getByRole("heading", { name: "No games found", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Try another search.", { exact: true }),
  ).toBeVisible()
  await expect(page.locator(".new-card")).toHaveCount(0)
})

test("all eight locale labels, compact account and real unavailable billing state remain usable", async ({
  page,
}) => {
  const headers = await registerSynthetic(page)
  const game = await seedSynthetic(page, headers)
  await page.goto("/studio/account")
  for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]) {
    const text = JSON.parse(
      readFileSync(
        new URL(`../src/site/locales/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>
    await page.getByRole("combobox").selectOption(locale)
    await expect(
      page.getByRole("heading", {
        name: text["Account & licences"],
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(text["Billing is disabled. No purchases are available."], {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.locator(".site-account-card")).toHaveCount(2)
    await page.locator('a[href="/studio/games"]').first().click()
    const card = page.locator(`article[data-game-id="${game.id}"]`)
    await expect(
      card.getByText(text["Default cover"], { exact: true }),
    ).toBeVisible()
    const label = text["More actions for {{name}}"].replace(
      "{{name}}",
      game.subject,
    )
    await card.getByRole("button", { name: label, exact: true }).click()
    await page.getByRole("menuitem", { name: text.Export, exact: true }).click()
    await expect(
      page.getByRole("menuitem", { name: text["TADAZZ JSON"], exact: true }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(page.getByTestId("package-tools-toggle")).toContainText(
      text["Advanced packages"],
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.locator('a[href="/studio/account"]').first().click()
  }
  await page.getByRole("combobox").selectOption("en")
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/evidence/phase-06-account-${width}-${test.info().project.name}.png`,
      fullPage: true,
    })
  }
})

test("marketing demo uses the native preview frame with explicit demonstration disclosure", async ({
  page,
}) => {
  await page.goto("/?view=demo&game=quiz")
  await expect(page.getByTestId("marketing-native-demo")).toBeVisible()
  await expect(
    page.getByText("Demonstration only. No audience or votes.", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.locator(".demo-choice-grid,.sample-results")).toHaveCount(0)
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/evidence/phase-06-demo-${width}-${test.info().project.name}.png`,
      fullPage: true,
    })
  }
})
