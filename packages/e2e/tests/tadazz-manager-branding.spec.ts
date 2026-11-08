import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"

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

    if (!bounds) {
      throw new Error("Manager background has no bounds")
    }

    expect(bounds.x).toBe(0)
    expect(bounds.y).toBe(0)
    expect(Math.round(bounds.width)).toBe(viewport.width)
    expect(Math.round(bounds.height)).toBe(viewport.height)

    const favicon = page.locator('link[rel="icon"]')
    await expect(favicon).toHaveAttribute(
      "href",
      "/tadazz-favicon-z-20261108.png",
    )
    await page.screenshot({
      path: testInfo.outputPath(`manager-${viewport.name}.png`),
    })
  })
}
