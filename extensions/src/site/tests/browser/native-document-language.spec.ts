import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"

for (const language of ["ja", "tr"]) {
  test(`${language} native game document follows the translated title`, async ({
    page,
  }) => {
    const dictionary = JSON.parse(
      readFileSync(
        new URL(`../../locales/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>
    await page.goto(`/game?lng=${language}`)
    await expect(page).toHaveTitle(`${dictionary["Join game"]} | Tadazz`)
    await expect(page.locator("html")).toHaveAttribute("lang", language)
    expect(await page.locator("html").getAttribute("dir")).toBeNull()
  })
}
