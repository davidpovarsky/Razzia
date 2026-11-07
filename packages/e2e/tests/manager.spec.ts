import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { loginManager } from "@razzia/e2e/utils/manager"

for (const viewport of [
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
  { name: "widescreen", width: 2560, height: 1080 },
]) {
  test(`brands the manager login as TADAZZ at ${viewport.name} size`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto("/manager")

    await expect(page).toHaveTitle("TADAZZ")
    await expect(page.getByTestId("tadazz-manager-logo")).toBeVisible()
    await expect(
      page.getByTestId("tadazz-manager-stage-background"),
    ).toBeVisible()
    await expect(page.getByText(/Razzia - v/u)).toHaveCount(0)
    await expect(
      page.getByPlaceholder(t("manager:passwordPlaceholder")),
    ).toBeVisible()

    const bounds = await page
      .getByTestId("tadazz-manager-auth-background")
      .boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBe(0)
    expect(bounds!.y).toBe(0)
    expect(Math.round(bounds!.width)).toBe(viewport.width)
    expect(Math.round(bounds!.height)).toBe(viewport.height)

    const favicon = page.locator('link[rel="icon"]')
    await expect(favicon).toHaveAttribute(
      "href",
      "/tadazz-show/v4/tadazz-brand-logo.png",
    )
    await page.screenshot({
      path: testInfo.outputPath(`manager-${viewport.name}.png`),
    })
  })
}

test("refuses a wrong manager password", async ({ page }) => {
  await page.goto("/manager")
  await page.getByPlaceholder(t("manager:passwordPlaceholder")).fill("wrong")
  await page.getByRole("button", { name: t("common:submit") }).click()

  await expect(
    page.getByText(t("errors:manager.invalidPassword")),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/manager$/u)
})

test("keeps the manager logged in after a reload", async ({ page }) => {
  await loginManager(page)
  await page.reload()

  await expect(page.getByText(t("manager:configurationsTitle"))).toBeVisible()
})

test("logs the manager out", async ({ page }) => {
  await loginManager(page)
  await page.getByRole("button", { name: t("manager:logout") }).click()

  await expect(page).toHaveURL(/\/manager$/u)
  await expect(
    page.getByPlaceholder(t("manager:passwordPlaceholder")),
  ).toBeVisible()

  await page.goto("/manager/config")

  await expect(page).toHaveURL(/\/manager$/u)
})

test("switches the language and keeps it after a reload", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("combobox", { name: t("common:changeLanguage") }).click()
  await page.getByRole("option", { name: t("common:language.fr") }).click()

  await expect(page.getByText(t("game:pinLabel", { lng: "fr" }))).toBeVisible()
  await expect(
    page.getByRole("button", { name: t("common:submit", { lng: "fr" }) }),
  ).toBeVisible()

  await page.reload()

  await expect(page.getByText(t("game:pinLabel", { lng: "fr" }))).toBeVisible()
})
