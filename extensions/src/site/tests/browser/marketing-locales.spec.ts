import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"

for (const language of ["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"]) {
  test(`${language} home headings and translated catalogue search agree`, async ({
    page,
  }) => {
    const dictionary = JSON.parse(
      readFileSync(
        new URL(`../../locales/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>
    await page.goto(`/?lng=${language}`)
    for (const key of ["Ready to play", "Make it yours", "Start fresh"]) {
      await expect(
        page
          .getByRole("heading", { name: dictionary[key], exact: true })
          .first(),
      ).toBeVisible()
    }
    await expect(page.locator("html")).toHaveAttribute("lang", language)
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      language === "he" ? "rtl" : "ltr",
    )
    await page.goto(`/?view=store&lng=${language}`)
    const search = page.getByRole("searchbox", {
      name: dictionary["Search games"],
    })
    await search.fill(dictionary["The Crowd Decides"])
    await expect(page.locator("article.game-card")).toHaveCount(1)
    await expect(
      page.getByText(dictionary["No games found"], { exact: true }),
    ).toHaveCount(0)
    await search.fill("zzzzzzzzzzzz")
    await expect(page.locator("article.game-card")).toHaveCount(0)
    await expect(
      page.getByText(dictionary["No games found"], { exact: true }),
    ).toBeVisible()
  })
}

for (const [language, key] of [
  ["tr", "The Crowd Decides"],
  ["de", "The Big Quiz"],
] as const) {
  test(`${language} search matches locale uppercase catalogue titles`, async ({
    page,
  }) => {
    const dictionary = JSON.parse(
      readFileSync(
        new URL(`../../locales/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>
    const title = dictionary[key]
    await page.goto(`/?view=store&lng=${language}`)
    const search = page.getByRole("searchbox", {
      name: dictionary["Search games"],
    })
    await search.fill(title.toLocaleUpperCase(language))
    await expect(page.locator("article.game-card")).toHaveCount(1)
    await expect(
      page
        .locator("article.game-card")
        .getByRole("heading", { name: title, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(dictionary["No games found"], { exact: true }),
    ).toHaveCount(0)
  })
}

test("site metadata follows navigation, reload and history", async ({
  page,
}) => {
  await page.goto("/?lng=en")
  await expect(page).toHaveTitle("Tadazz")
  await page.getByRole("button", { name: "Games", exact: true }).first().click()
  await expect(page).toHaveTitle("Games | Tadazz")
  await expect(
    page.locator('head meta[name="application-name"]'),
  ).toHaveAttribute("content", "Tadazz")
  await expect(page.locator('head meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Games | Tadazz",
  )
  await page.reload()
  await expect(page).toHaveTitle("Games | Tadazz")
  await page.goBack()
  await expect(page).toHaveTitle("Tadazz")
})

test("metadata follows the actual fallback view and product", async ({
  page,
}) => {
  const session = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/session") &&
      response.request().method() === "POST",
  )
  await page.goto("/?view=unknown&lng=en")
  expect((await session).ok()).toBe(true)
  await expect(
    page.getByRole("heading", { name: "Ready to play", exact: true }).first(),
  ).toBeVisible()
  await expect(page).toHaveTitle("Tadazz")
  await page.goto("/?view=product&game=unknown&lng=en")
  await expect(page).toHaveURL(/\?view=product&game=unknown&lng=en$/)
  await expect(page).toHaveTitle("The Crowd Decides | Tadazz")
  await expect(
    page.getByText("The Crowd Decides", { exact: true }).first(),
  ).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\?view=product&game=crowd$/,
  )
})
