import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

test("lobby composition imports the actual room contract and decodable QR without transport", async ({
  page,
}, info) => {
  const probes: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/api/")) probes.push(request.url())
  })
  await page.goto("/")
  const qr = page.locator("#layouts svg[data-qr-url]")
  await expect(qr).toHaveAttribute(
    "data-qr-url",
    "https://example.invalid/game?pin=246810",
  )
  await expect(qr).toHaveAccessibleName("Show QR code")
  const path = `/evidence/phase-07-catalog-qr-${info.project.name}.png`
  await qr.screenshot({ path })
  expect(
    execFileSync("zbarimg", ["--quiet", "--raw", path], {
      encoding: "utf8",
    }).trim(),
  ).toBe("https://example.invalid/game?pin=246810")
  expect(probes).toEqual([])
})

test("all typed production component families have working state examples", async ({
  page,
}) => {
  const remote: string[] = []
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4340/"))
      remote.push(request.url())
  })
  await page.goto("/")
  await expect(page.locator("[data-catalog-story]")).toHaveCount(9)
  await expect(page.getByLabel("Platform context", { exact: true })).toHaveCSS(
    "color-scheme",
    "dark",
  )
  await expect(
    page.getByRole("button", { name: "Loading", exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByLabel("Invalid field", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true")
  await expect(
    page.getByLabel("Disabled field", { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole("tab", { name: "Disabled", exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole("heading", { name: "Example saved" }),
  ).toBeVisible()
  for (const id of [
    "buttons",
    "fields",
    "surfaces",
    "navigation",
    "menus",
    "dialogs",
    "alerts",
    "tables",
    "scopes",
  ])
    await page.locator(`[data-catalog-story="${id}"]`).screenshot({
      path: `/evidence/phase-05-${id}-${test.info().project.name}.png`,
    })
  expect(remote).toEqual([])
})
for (const context of [
  "platform.marketing",
  "platform.studio",
  "platform.host",
]) {
  test(`${context}: live token edit reaches real button and modal portal`, async ({
    page,
  }) => {
    await page.goto("/")
    await page
      .getByLabel("Platform context", { exact: true })
      .selectOption(context)
    const action = page.getByTestId("catalog-primary")
    await expect(action).toHaveCSS("background-color", "rgb(231, 255, 55)")
    await action.hover()
    await expect(action).not.toHaveCSS("box-shadow", "none")
    await action.focus()
    await expect(action).toHaveCSS("outline-width", "2px")
    await page.getByRole("switch", { name: "Override action token" }).click()
    await expect(action).toHaveCSS("background-color", "rgb(183, 212, 255)")
    const trigger = page.getByRole("button", {
      name: "Open example dialog",
      exact: true,
    })
    await trigger.click()
    const dialog = page.getByRole("dialog", {
      name: "Example dialog",
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId("catalog-dialog-action")).toHaveCSS(
      "background-color",
      "rgb(183, 212, 255)",
    )
    await expect(dialog).toHaveCSS("background-color", "rgb(32, 19, 51)")
    await dialog
      .getByRole("button", { name: "Change surface token", exact: true })
      .click()
    await expect(dialog).toHaveCSS("background-color", "rgb(43, 27, 59)")
    await dialog.screenshot({
      path: `/evidence/phase-05-token-${context}-${test.info().project.name}.png`,
    })
    await page.keyboard.press("Escape")
    await expect(trigger).toBeFocused()
  })
}
test("eight existing locales drive actual component content and dialog close labels", async ({
  page,
}) => {
  await page.goto("/")
  for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]) {
    const common = JSON.parse(
      readFileSync(
        new URL(
          `../../packages/web/src/locales/${locale}/common.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    )
    await page
      .getByLabel("Content language", { exact: true })
      .selectOption(locale)
    await expect(page.getByTestId("catalog-language")).toHaveText(locale)
    await expect(page.getByTestId("catalog-primary")).toHaveText(common.confirm)
    await page
      .getByRole("button", { name: "Open example dialog", exact: true })
      .click()
    await page
      .getByRole("dialog", { name: "Example dialog", exact: true })
      .getByRole("button", { name: common.close, exact: true })
      .click()
  }
})
test("layout dialog table keeps forty safe synthetic rows and scroll inside modal", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByRole("button", { name: "Open roster template", exact: true })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Synthetic roster",
    exact: true,
  })
  await expect(dialog.getByRole("row")).toHaveCount(41)
  const table = dialog.locator(".tds-table-scroll")
  expect(
    await table.evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true)
  await table.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect(
    dialog.getByRole("cell", { name: "Example 40", exact: true }),
  ).toBeVisible()
  await dialog.screenshot({
    path: `/evidence/phase-05-table-dialog-${test.info().project.name}.png`,
  })
  await page.keyboard.press("Escape")
})
test("responsive widths, light preview, RTL, reduced motion and 200% CSS zoom", async ({
  page,
}) => {
  await page.goto("/")
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1024, 768],
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
      path: `/evidence/phase-05-${width}-${height}-${test.info().project.name}.png`,
    })
  }
  await page.getByRole("switch", { name: "RTL fixture", exact: true }).click()
  await page.getByLabel("Appearance", { exact: true }).selectOption("light")
  await expect(page.getByTestId("catalog-scope")).toHaveAttribute("dir", "rtl")
  await expect(page.getByLabel("Platform context", { exact: true })).toHaveCSS(
    "color-scheme",
    "light",
  )
  await expect(page.getByTestId("catalog-primary")).toHaveCSS(
    "background-color",
    "rgb(93, 43, 156)",
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect(page.locator(".tds-spinner").first()).toHaveCSS(
    "animation-name",
    "none",
  )
  await page.screenshot({
    path: `/evidence/phase-05-rtl-light-${test.info().project.name}.png`,
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2"
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole("button", { name: "Open example dialog", exact: true })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Example dialog",
    exact: true,
  })
  await expect(dialog).toBeVisible()
  await dialog.screenshot({
    path: `/evidence/phase-05-zoom-${test.info().project.name}.png`,
  })
})
